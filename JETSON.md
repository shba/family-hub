# Jetson Orin Nano Super — bring-up guide

The Jetson unlocks the one thing the cloud could not do: a **residential IP**.
WhatsApp rejected every Baileys handshake from Railway's datacenter IPs
(`405 Connection Failure`, then `401` right after pairing). From your home
network that restriction disappears, so the gateway belongs on the Jetson.

Recommended split for now:

| Piece                  | Where          | Why                                            |
| ---------------------- | -------------- | ---------------------------------------------- |
| WhatsApp gateway       | Jetson         | Residential IP; needs to stay logged in 24/7   |
| Dashboard + AI extract | Railway        | Already working, reachable from anywhere        |
| Local LLM (optional)   | Jetson         | Cuts cloud API cost/latency for text extraction |

Once the gateway is proven you can move the dashboard onto the Jetson too
(step 5) — but do it as a separate change, not at the same time.

---

## 1. Verify the board

```bash
# Which JetPack / L4T is on there
cat /etc/nv_tegra_release
sudo apt-get update && sudo apt-get install -y python3-pip curl rsync
sudo pip3 install -U jetson-stats   # then log out/in
jtop                                # GPU, RAM, temps, power mode
```

Put it in max power mode and keep it there (it's a always-on appliance):

```bash
sudo nvpmodel -m 0      # MAXN on Orin Nano Super
sudo jetson_clocks
```

If you have the NVMe installed, confirm it's mounted and is where the data
lives — the microSD will wear out under a database:

```bash
lsblk                   # look for nvme0n1
df -h /
```

If root is still on the SD card, that's fine for the gateway (it writes only a
few KB of auth state). Move to NVMe before running Postgres in step 5.

Give the Jetson a fixed address so services keep finding it — either a DHCP
reservation in your router (easiest) or a static IP on the Jetson itself.

## 2. Get the code onto the Jetson

```bash
sudo apt-get install -y git
git clone <your-repo-url> ~/family-hub
cd ~/family-hub
```

## 3. Install the WhatsApp gateway as a service

```bash
sudo ./jetson/setup.sh
```

The script installs Node 22 if needed, copies the repo to `/opt/family-hub`,
installs the gateway's dependencies, drops an env template at
`/etc/family-hub/whatsapp.env`, and registers a systemd unit that restarts on
failure and on boot.

Then fill in the two values that matter:

```bash
sudo nano /etc/family-hub/whatsapp.env
```

- `API_URL` — `https://<your-web-app>.up.railway.app/api/extract`
- `API_TOKEN` — the same value as `API_TOKEN` on the Railway web service

Start it and watch:

```bash
sudo systemctl start family-hub-whatsapp
journalctl -u family-hub-whatsapp -f
```

## 4. Link WhatsApp and verify end to end

Open `http://<jetson-ip>:8080` from any device on your LAN. The page
self-refreshes every 5 seconds and shows the QR code; scan it from the spare
number's phone under **WhatsApp → Settings → Linked devices → Link a device**.

What you should see this time, and did not on Railway:

- The QR stays stable long enough to scan (no 2-second churn).
- Status goes to `✅ מחובר לוואטסאפ` and **stays** there.
- No `405` / `401` in the logs.

If it still churns, wipe the stale login state once and restart:

```bash
sudo rm -rf /var/lib/family-hub/auth
sudo systemctl restart family-hub-whatsapp
```

Then send a real message into the test group, e.g.
`מאור צריך להביא מחר חולצה לבנה לטקס`, and confirm it lands in the dashboard's
inbox as a pending item you can review and confirm.

Leave `WA_GROUP` empty until this works; then set it to a substring of the
group name so the gateway ignores everything else.

## 5. Optional next steps

Each of these is independent — do them one at a time.

**Local LLM.** Ollama's installer detects JetPack and uses the GPU:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:3b-instruct     # comfortable in 8 GB
ollama serve                        # exposes an OpenAI-compatible /v1 API
```

The extractor already speaks OpenAI-compatible, so pointing it at the Jetson is
just config (`LLM_BASE_URL=http://<jetson-ip>:11434/v1`, `LLM_MODEL=qwen2.5:3b-instruct`,
`LLM_API_KEY=ollama`). Note the current provider order prefers Gemini and only
falls back to the OpenAI-compatible endpoint, so a local model won't be used
until we flip that order — a small code change when you want local-first. Keep
Gemini for photos regardless; a 3B model won't read a teacher's handwritten
note.

**Self-host the dashboard.** `docker compose up -d` on the Jetson runs the web
app; then the WhatsApp gateway can post to `http://127.0.0.1:3000/api/extract`
and nothing family-related leaves the house. This is also when to migrate the
JSON store to Postgres on the NVMe.

**The 27" screen.** Point a browser at the dashboard in kiosk mode and disable
screen blanking. You don't need the Jetson to drive the panel — any spare
device on the LAN works, and that keeps the Jetson headless.
