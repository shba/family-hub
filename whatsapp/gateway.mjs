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

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";

const API_URL = process.env.API_URL || "http://localhost:3000/api/extract";
const API_TOKEN = process.env.API_TOKEN || "";
const AUTH_DIR = process.env.AUTH_DIR || "auth";
const GROUP_FILTER = (process.env.WA_GROUP || "").trim();
const logger = pino({ level: "warn" });

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
  const sock = makeWASocket({ auth: state, logger, printQRInTerminal: false });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("\nסרוק את קוד ה-QR עם הטלפון (הגדרות → מכשירים מקושרים):\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      console.log("\n✅ מחובר לוואטסאפ. מאזין להודעות בקבוצות...");
      if (GROUP_FILTER) console.log(`   (מסונן לקבוצות שמכילות: "${GROUP_FILTER}")`);
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log("החיבור נסגר.", shouldReconnect ? "מתחבר מחדש..." : "בוצע logout.");
      if (shouldReconnect) start();
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
