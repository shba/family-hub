# Running Family Hub on the Jetson Orin Nano Super

Everything runs at home: the dashboard, the AI extraction endpoint, and the
WhatsApp gateway. No cloud host, no monthly bill, and nothing about your family
leaves the house except the photo/text you send to Gemini for extraction.

The Jetson also solves the problem that killed the cloud attempt. WhatsApp
rejected every Baileys handshake from a datacenter IP (`405 Connection
Failure`, then `401` immediately after pairing). From a residential connection
that objection disappears.

Two containers, defined in `docker-compose.yml`:

| Container  | Port | What it does                                        |
| ---------- | ---- | --------------------------------------------------- |
| `web`      | 3000 | Dashboard, inbox, API, ICS feed                      |
| `whatsapp` | 8080 | Baileys gateway; port 8080 is just the QR/link page  |

---

## 0. Rescue your Railway data first (if you still can)

The dashboard's state is a single JSON file. If the Railway project still opens
at all, grab it before you tear the project down:

```bash
railway link                       # pick the web service
railway run cat /data/family.json > family.json
```

Keep that file — step 3 puts it back. If Railway is entirely gone, skip this;
the app reseeds with your six family members and you'll re-enter the rest.

## 1. Prepare the board

```bash
cat /etc/nv_tegra_release              # which JetPack you're on
sudo apt-get update && sudo apt-get install -y git rsync curl
sudo nvpmodel -m 0                     # MAXN - it's an appliance, not a laptop
sudo jetson_clocks
```

Put the data on the NVMe, not the microSD — the SD card will wear out under
constant writes:

```bash
lsblk                                  # find nvme0n1
```

Give the Jetson a fixed address, easiest as a DHCP reservation in your router.
Everything in the house will point at this IP.

## 2. Install the stack

```bash
git clone https://github.com/shba/family-hub.git ~/family-hub
cd ~/family-hub
sudo ./jetson/setup.sh
```

The script installs Docker if needed, copies the repo to `/opt/family-hub`,
creates the data directories, and writes `/opt/family-hub/.env`. It's safe to
re-run — it keeps your `.env`, your data, and your WhatsApp login. If you'd
already installed the older standalone gateway service, it retires that unit
and carries the WhatsApp login over so you don't rescan the QR.

To keep data on the NVMe, run it as `sudo DATA_ROOT=/mnt/nvme/family-hub
./jetson/setup.sh` (using wherever the NVMe is mounted).

Now fill in the secrets:

```bash
sudo nano /opt/family-hub/.env
```

The two that matter: `GEMINI_API_KEY` (photo extraction) and `API_TOKEN` (any
long random string — how the gateway authenticates to the dashboard). Add
`GOOGLE_ICS_URL` if you want your personal calendar on the dashboard. Leave
`APP_USERNAME`/`APP_PASSWORD` empty for a LAN-only install.

## 3. Restore your data, then start

If you rescued `family.json`, drop it in before the first start:

```bash
sudo cp family.json /opt/family-hub-data/hub/family.json
```

```bash
cd /opt/family-hub && sudo docker compose up -d --build
```

The first build takes a few minutes (it compiles the Next.js app on-device).
The dashboard is then at `http://<jetson-ip>:3000`, and Docker's restart policy
brings both containers back after a reboot or a power cut.

## 4. Link WhatsApp

Open `http://<jetson-ip>:8080` and scan the QR from the spare number's phone
(**WhatsApp → Settings → Linked devices → Link a device**). The page refreshes
itself every 5 seconds.

What should be different from the cloud attempt: the QR holds still long enough
to scan, and the status stays connected rather than dropping to `logged-out`.

If it does churn, the usual cause is stale login state:

```bash
cd /opt/family-hub
sudo docker compose down
sudo rm -rf /opt/family-hub-data/wa-auth/*
sudo docker compose up -d
```

Then send a real message into the group and confirm it lands in the inbox as a
pending item. Once that works, set `WA_GROUP` to a substring of the group name
so the gateway ignores every other chat.

## 5. Reaching it from outside the house

LAN-only is the safe default and needs nothing. When you want the dashboard on
your phone away from home, **Tailscale** is the least-exposed option — it's a
private network, not a public URL, so no one can find or brute-force it:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Install Tailscale on your phone and the dashboard is at
`http://<jetson-tailscale-name>:3000` from anywhere.

You only need a genuinely public URL for one thing: letting Google Calendar
subscribe to the hub's ICS feed. That calls for a Cloudflare Tunnel plus real
credentials — set `APP_USERNAME`, `APP_PASSWORD`, and a long `CALENDAR_TOKEN`
before exposing anything. Pulling your Google calendar *into* the dashboard
needs none of this and works fine on the LAN.

## 6. Back it up

Everything lives under one directory, so a backup is a copy:

```bash
sudo tar czf ~/family-hub-$(date +%F).tar.gz -C /opt/family-hub-data .
```

Worth a weekly cron job to somewhere off the Jetson.

## 7. Optional: local LLM

Ollama's installer detects JetPack and uses the GPU:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:3b-instruct     # comfortable in 8 GB shared memory
```

Point the stack at it in `/opt/family-hub/.env`:

```
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_MODEL=qwen2.5:3b-instruct
LLM_API_KEY=ollama
```

One caveat: the extractor tries Gemini first and only falls back to this
endpoint, so a local model won't actually be used until we flip that order —
a small code change when you want it. Keep Gemini for photos regardless; a 3B
model won't read a teacher's handwritten note.

## Day-to-day

```bash
cd /opt/family-hub
sudo docker compose logs -f            # or: logs -f whatsapp
sudo docker compose restart web
sudo docker compose ps

# Update after pulling new code:
cd ~/family-hub && git pull && sudo ./jetson/setup.sh
```
