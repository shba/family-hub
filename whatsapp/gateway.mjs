// Optional read-only WhatsApp gateway for the Family Hub POC.
//
// It links to a WhatsApp account (use a SPARE number, never your main one),
// listens to incoming group messages, and forwards text + photos to the
// family-hub extractor endpoint (/api/extract). It NEVER sends messages.
//
// Usage:
//   cd whatsapp
//   npm install
//   npm start          (scan the QR code with the spare phone: Linked devices)
//
// Config via environment variables:
//   API_URL     default http://localhost:3000/api/extract
//   WA_GROUP    optional substring; only groups whose name matches are processed
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

const API_URL = process.env.API_URL || "http://localhost:3000/api/extract";
const API_TOKEN = process.env.API_TOKEN || "";
const AUTH_DIR = process.env.AUTH_DIR || "auth";
const GROUP_FILTER = (process.env.WA_GROUP || "").trim();
// If set (spare number, digits only incl. country code, e.g. 972501234567),
// the gateway uses pairing-code login instead of a QR - easier from cloud logs.
const WA_NUMBER = (process.env.WA_NUMBER || "").replace(/\D/g, "");
const logger = pino({ level: "warn" });

// Live connection state, exposed on a small web page so you can scan the QR
// from a browser instead of the (often mangled) cloud logs.
let latestQR = null;
let connState = "starting";
let lastClose = null; // last disconnect code/reason, shown on the page

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
      data?.extraction?.title || data?.error || "ok"
    );
  } catch (err) {
    console.error("Failed to forward to API:", err.message);
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
  const sock = makeWASocket({
    version,
    browser: Browsers.ubuntu("Chrome"),
    auth: state,
    logger,
    printQRInTerminal: false,
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
        setTimeout(start, 2000);
      } else {
        setTimeout(start, 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      const jid = msg.key.remoteJid || "";
      if (!jid.endsWith("@g.us")) continue; // groups only
      if (msg.key.fromMe) continue;

      // Resolve group name for filtering / logging.
      let groupName = jid;
      try {
        const meta = await sock.groupMetadata(jid);
        groupName = meta.subject || jid;
      } catch {
        /* ignore */
      }
      if (GROUP_FILTER && !groupName.includes(GROUP_FILTER)) continue;

      const text = extractText(msg);
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
        await forward({ text, imageBase64, mime, sender: groupName });
      }
    }
  });
}

start().catch((err) => console.error("Fatal:", err));
