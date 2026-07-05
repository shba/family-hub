# Deploying the Family Hub POC to Railway

This runs two services from the same repo:

1. **web** - the Next.js dashboard + API (Dockerfile at repo root)
2. **whatsapp** - the Baileys gateway (Dockerfile in `whatsapp/`)

Each gets a small persistent **Volume** so data and the WhatsApp login survive
restarts.

> Reminder: the WhatsApp gateway is unofficial (ToS risk). Use a throwaway
> number. The dashboard is protected by a password (Basic Auth) once you set
> `APP_USERNAME` / `APP_PASSWORD`.

---

## 0. Push the repo to GitHub

```powershell
cd C:\Users\shacharbar\Projects\family-hub
git init
git add .
git commit -m "Family Hub POC"
# create an empty repo on github.com, then:
git remote add origin https://github.com/<you>/family-hub.git
git branch -M main
git push -u origin main
```

Pick a strong shared token to reuse below (any long random string), e.g. run
`[guid]::NewGuid().ToString("N")` in PowerShell.

---

## 1. Web service

1. On <https://railway.app> → **New Project** → **Deploy from GitHub repo** →
   select `family-hub`. Railway detects the root `Dockerfile` and builds it.
2. Open the service → **Variables** → add:
   - `DATA_DIR` = `/data`
   - `APP_USERNAME` = your chosen username
   - `APP_PASSWORD` = your chosen password
   - `API_TOKEN` = the shared random token
   - `GEMINI_API_KEY` = your key (optional but recommended)
   - `GEMINI_MODEL` = `gemini-2.5-flash`
3. **Volumes** → add a volume, mount path `/data`.
4. **Settings** → **Networking** → **Generate Domain**. Note the URL,
   e.g. `https://family-hub-web.up.railway.app`.
5. Open the URL → browser asks for the username/password you set. 

---

## 2. WhatsApp gateway service

1. In the same project → **New** → **GitHub Repo** → same `family-hub` repo.
2. Open the new service → **Settings** → set **Root Directory** to `whatsapp`
   (Railway then builds `whatsapp/Dockerfile`).
3. **Variables** → add:
   - `API_URL` = `https://<your web domain>/api/extract`
   - `API_TOKEN` = the **same** token as the web service
   - `AUTH_DIR` = `/auth`
   - `WA_GROUP` = (optional) a group-name substring to filter
4. **Volumes** → add a volume, mount path `/auth` (persists the WhatsApp login).
5. Deploy, then open **Logs**. A QR code prints in the log output - scan it from
   the spare phone (WhatsApp → Linked devices). After it says "מחובר לוואטסאפ",
   group messages/photos flow into the dashboard.

That's it. Redeploys keep your data (web volume) and WhatsApp login (gateway
volume).

---

## Costs & notes

- Expect roughly ~$5/mo on Railway's hobby usage for two small always-on
  services with tiny volumes.
- To rotate the password, change `APP_USERNAME`/`APP_PASSWORD` and redeploy.
- If the QR is hard to scan from logs, redeploy to refresh it, or switch the
  gateway to pairing-code mode (ask and I'll wire it up).

---

## Alternative: one VPS with Docker Compose

On any VPS (e.g. Hetzner) with Docker installed:

```bash
git clone https://github.com/<you>/family-hub.git && cd family-hub
cp .env.example .env   # fill in APP_USERNAME, APP_PASSWORD, API_TOKEN, GEMINI_API_KEY
docker compose up --build -d
docker compose logs -f whatsapp   # scan the QR here
```

The dashboard is on port 3000; put it behind a reverse proxy (Caddy/nginx) for
HTTPS. Data persists in the `hubdata` / `waauth` Docker volumes.
