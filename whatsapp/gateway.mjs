// WhatsApp gateway for the Family Hub.
//
// It links to a WhatsApp account (use a SPARE number, never your main one) and
// does two things:
//   1. Silently forwards group messages + photos to /api/extract, where they
//      become pending items awaiting approval on the dashboard.
//   2. Answers when addressed - any direct message, or a group message opening
//      with the trigger word - by asking /api/assistant and replying in chat.
//      The assistant can also update the family's tasks/events/grocery list.
//
// Usage:
//   cd whatsapp
//   npm install
//   npm start          (scan the QR code with the spare phone: Linked devices)
//
// Config via environment variables:
//   API_URL     default http://localhost:3000/api/extract
//   WA_GROUP    optional substring; only groups whose name matches are processed
//   WA_TRIGGER  word that addresses the bot in a group (default "בוט")
//   WA_ALLOW    optional comma-separated numbers allowed to DM the bot
//
// WARNING: This uses an unofficial library and violates WhatsApp's ToS.
// There is a small risk the number gets banned. Use a throwaway number.

import http from "http";
import fs from "fs";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import QRImage from "qrcode";
import pino from "pino";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

const API_URL = process.env.API_URL || "http://localhost:3000/api/extract";
const API_TOKEN = process.env.API_TOKEN || "";
const AUTH_DIR = process.env.AUTH_DIR || "auth";
const GROUP_FILTER = (process.env.WA_GROUP || "").trim();
// Conversational endpoint; defaults to a sibling of the extract URL.
const ASSISTANT_URL =
  process.env.ASSISTANT_URL || API_URL.replace(/\/api\/extract\/?$/, "/api/assistant");
// Word that addresses the bot inside a group. Direct messages never need it.
// Empty (e.g. an unset compose variable) falls back to the default.
const TRIGGER = (process.env.WA_TRIGGER || "בוט").trim();
// Optional allowlist for direct messages (digits, with country code).
const DM_ALLOW = (process.env.WA_ALLOW || "")
  .split(",")
  .map((s) => s.replace(/\D/g, ""))
  .filter(Boolean);
// If set (spare number, digits only incl. country code, e.g. 972501234567),
// the gateway uses pairing-code login instead of a QR - easier from cloud logs.
const WA_NUMBER = (process.env.WA_NUMBER || "").replace(/\D/g, "");
// Optional proxy so the WhatsApp connection egresses via a residential/mobile IP
// (needed because WhatsApp rejects datacenter IPs). Supports http(s):// and socks://.
const PROXY_URL = (process.env.PROXY_URL || "").trim();
const logger = pino({ level: "warn" });

function makeProxyAgent() {
  if (!PROXY_URL) return undefined;
  return PROXY_URL.startsWith("socks")
    ? new SocksProxyAgent(PROXY_URL)
    : new HttpsProxyAgent(PROXY_URL);
}

// Live connection state, exposed on a small web page so you can scan the QR
// from a browser instead of the (often mangled) cloud logs.
let latestQR = null;
let connState = "starting";
let lastClose = null; // last disconnect code/reason, shown on the page
let reconnectDelay = 3000; // grows with backoff to avoid throttling (503)

const HTTP_PORT = process.env.PORT || 8080;
http
  .createServer(async (req, res) => {
    try {
      if (req.url && req.url.startsWith("/qr.png")) {
        if (!latestQR) {
          res.writeHead(404);
          res.end("no qr");
          return;
        }
        const dataUrl = await QRImage.toDataURL(latestQR, { width: 400, margin: 2 });
        const png = Buffer.from(dataUrl.split(",")[1], "base64");
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
        res.end(png);
        return;
      }

      const body =
        connState === "open"
          ? "<h2>✅ מחובר לוואטסאפ</h2><p>אפשר לסגור את החלון.</p>"
          : latestQR
          ? `<h2>סריקת QR</h2><img src="/qr.png?ts=${Date.now()}" width="340" height="340" style="background:#fff;padding:12px;border-radius:12px"/><p>בטלפון: וואטסאפ → הגדרות → מכשירים מקושרים → קישור מכשיר</p>`
          : "<h2>ממתין לקוד QR...</h2><p>הדף מתרענן אוטומטית כל 5 שניות.</p>";

      const closeLine = lastClose
        ? `<p style="color:#f87171;margin-top:8px">קוד חיבור אחרון: ${lastClose}</p>`
        : "";
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>WhatsApp Link</title></head><body style="font-family:sans-serif;text-align:center;background:#0b1120;color:#e5e7eb;padding:40px">${body}<p style="color:#64748b;margin-top:20px">סטטוס: ${connState}</p>${closeLine}</body></html>`
      );
    } catch (err) {
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
  })
  .listen(HTTP_PORT, () => console.log(`QR web page listening on :${HTTP_PORT}`));

async function forward({ text, imageBase64, mime, sender }) {
  try {
    const body = {};
    if (text) body.text = text;
    if (imageBase64) body.image = `data:${mime};base64,${imageBase64}`;
    if (!body.text && !body.image) return;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_TOKEN ? { "x-api-token": API_TOKEN } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    console.log(
      `→ forwarded from "${sender}":`,
      data?.error || `${data?.count ?? 0} פריטים ממתינים לאישור`
    );
  } catch (err) {
    console.error("Failed to forward to API:", err.message);
  }
}

// In a group the bot stays quiet unless the message opens with the trigger
// word; a direct message is always meant for it.
function isAddressed(text) {
  if (!TRIGGER || !text) return false;
  return text.trim().toLowerCase().startsWith(TRIGGER.toLowerCase());
}

function stripTrigger(text) {
  const t = (text || "").trim();
  return isAddressed(t) ? t.slice(TRIGGER.length).replace(/^[\s,:\-–]+/, "").trim() : t;
}

async function askAssistant(text, sender) {
  try {
    const res = await fetch(ASSISTANT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_TOKEN ? { "x-api-token": API_TOKEN } : {}),
      },
      body: JSON.stringify({ text, sender }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.reply) {
      console.error(`assistant HTTP ${res.status}:`, data?.error || "no reply");
      return "אירעה שגיאה אצל העוזר המשפחתי, נסו שוב בעוד רגע.";
    }
    console.log(`💬 "${text}" מ-${sender} → ${data.applied?.length ?? 0} עדכונים`);
    return data.reply;
  } catch (err) {
    console.error("assistant call failed:", err.message);
    return "לא הצלחתי להתחבר לשרת המשפחה.";
  }
}

function extractText(msg) {
  const m = msg.message;
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.documentMessage?.caption ||
    ""
  );
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  // Fetch the current WhatsApp Web version so the handshake isn't rejected as
  // "client outdated" (a common cause of the 405 Connection Failure).
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`WhatsApp Web version ${version.join(".")} (isLatest=${isLatest})`);
  const agent = makeProxyAgent();
  if (agent) console.log(`Using proxy: ${PROXY_URL.replace(/:[^:@/]+@/, ":****@")}`);
  const sock = makeWASocket({
    version,
    browser: Browsers.ubuntu("Chrome"),
    auth: state,
    logger,
    printQRInTerminal: false,
    ...(agent ? { agent, fetchAgent: agent } : {}),
  });

  sock.ev.on("creds.update", saveCreds);

  // Pairing-code login: request a code a few seconds after connecting.
  if (WA_NUMBER && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(WA_NUMBER);
        console.log(
          `\n🔑 קוד התאמה: ${code}\n   בטלפון: וואטסאפ → הגדרות → מכשירים מקושרים → קישור מכשיר → "קשר עם מספר טלפון" → הזן את הקוד\n`
        );
      } catch (err) {
        console.error("Failed to request pairing code:", err?.message || err);
      }
    }, 3000);
  }

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      latestQR = qr; // shown on the web page
      connState = "waiting-for-scan";
      if (!WA_NUMBER) {
        console.log("\nסרוק את קוד ה-QR (או פתח את דף ה-QR בדפדפן):\n");
        qrcode.generate(qr, { small: true });
      }
    }
    if (connection === "open") {
      connState = "open";
      latestQR = null;
      reconnectDelay = 3000; // reset backoff on success
      console.log("\n✅ מחובר לוואטסאפ. מאזין להודעות בקבוצות...");
      if (GROUP_FILTER) console.log(`   (מסונן לקבוצות שמכילות: "${GROUP_FILTER}")`);
    }
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || "";
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      connState = loggedOut ? "logged-out" : "reconnecting";
      lastClose = `code=${statusCode ?? "?"}${reason ? ", " + reason : ""}`;
      console.log(
        `החיבור נסגר (code=${statusCode ?? "?"}${reason ? ", " + reason : ""}).`,
        loggedOut ? "בוצע logout - מנקה מצב ומתחיל מחדש..." : "מתחבר מחדש..."
      );
      if (loggedOut) {
        // 401/logged-out during pairing usually means stale auth state.
        // Wipe it so a clean session + fresh QR is produced.
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        } catch (e) {
          console.error("auth cleanup failed:", e?.message || e);
        }
        connState = "reconnecting";
        reconnectDelay = 3000;
        setTimeout(start, 3000);
      } else {
        // Back off to avoid WhatsApp throttling (503 Stream Errored).
        console.log(`ניסיון חיבור מחדש בעוד ${Math.round(reconnectDelay / 1000)} שניות...`);
        setTimeout(start, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 60000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      const jid = msg.key.remoteJid || "";
      if (msg.key.fromMe) continue;
      if (jid === "status@broadcast") continue;

      const isGroup = jid.endsWith("@g.us");
      let chatName = jid;

      if (isGroup) {
        try {
          const meta = await sock.groupMetadata(jid);
          chatName = meta.subject || jid;
        } catch {
          /* ignore */
        }
        if (GROUP_FILTER && !chatName.includes(GROUP_FILTER)) continue;
      } else {
        chatName = msg.pushName || jid.split("@")[0];
        if (DM_ALLOW.length && !DM_ALLOW.some((n) => jid.startsWith(n))) {
          console.log(`✋ מתעלם מהודעה פרטית מ-${jid}`);
          continue;
        }
      }

      const text = extractText(msg);

      // Conversation: any DM, or a group message that opens with the trigger.
      if (text && (!isGroup || isAddressed(text))) {
        const question = isGroup ? stripTrigger(text) : text;
        if (question) {
          // The typing indicator is cosmetic - never let it cost us a reply.
          try {
            await sock.sendPresenceUpdate("composing", jid);
          } catch {
            /* ignore */
          }
          const reply = await askAssistant(question, chatName);
          try {
            await sock.sendMessage(jid, { text: reply }, { quoted: msg });
          } catch (err) {
            console.error("failed to send reply:", err?.message || err);
          }
          continue;
        }
      }

      let imageBase64 = null;
      let mime = null;
      if (msg.message?.imageMessage) {
        try {
          const buffer = await downloadMediaMessage(
            msg,
            "buffer",
            {},
            { logger, reuploadRequest: sock.updateMediaMessage }
          );
          imageBase64 = buffer.toString("base64");
          mime = msg.message.imageMessage.mimetype || "image/jpeg";
        } catch (err) {
          console.error("Failed to download image:", err.message);
        }
      }

      if (text || imageBase64) {
        await forward({ text, imageBase64, mime, sender: chatName });
      }
    }
  });
}

start().catch((err) => console.error("Fatal:", err));
