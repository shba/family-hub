# Family Hub - POC

A **Hebrew / RTL family dashboard** with an AI extractor that turns WhatsApp
messages and teacher photos into tasks. This is **Phase 0 (POC)** of the Family
AI Agent plan - it runs entirely on your current PC, **no Jetson / no extra
hardware required**.

- **Dashboard** (`/`): per-child meals (breakfast/lunch/dinner), chores
  checklist, "bring to school today", weekly classes, a shared grocery list, a
  teacher-photo inbox, and a "needs confirmation" panel.
- **Inbox sandbox** (`/inbox`): paste a WhatsApp message or upload a photo ->
  Gemini 2.5 Flash extracts a structured task -> it shows up on the dashboard
  under "needs confirmation".
- **Optional WhatsApp gateway** (`whatsapp/`): link a spare number and feed a
  real test group into the extractor.

Everything is a single Next.js process backed by a local **JSON file**
(`data/family.json`) - no database engine or native modules to compile. It
auto-seeds with a realistic mock family on first run.

---

## Requirements

- **Node.js 18+** and npm (`node --version` to check). Works on Node 24.
- (Optional but recommended) a free **Google Gemini API key** from
  <https://aistudio.google.com/apikey>. Without a key the extractor falls back to
  a simple offline parser, so the app still runs.

---

## Run it (PowerShell)

```powershell
cd C:\Users\shacharbar\Projects\family-hub

# 1. install dependencies
npm install

# 2. add your Gemini key (optional)
Copy-Item .env.example .env
notepad .env          # paste your key into GEMINI_API_KEY=

# 3. start
npm run dev
```

Then open <http://localhost:3000>.

To view it on the 27" screen / another device on your LAN, run
`npm run dev -- -H 0.0.0.0` and browse to `http://<your-pc-ip>:3000` from the
other device.

> Windows note: if PowerShell blocks npm with "running scripts is disabled",
> run once: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`
> (or use `npm.cmd` / cmd.exe). No compiler / build tools are needed - the app
> has no native dependencies.

---

## Optional: connect a real WhatsApp test group

Uses **Baileys** (unofficial). Use a **spare/throwaway number** - there is a
small risk of a ban, and this violates WhatsApp's Terms of Service.

```powershell
cd C:\Users\shacharbar\Projects\family-hub\whatsapp
npm install
npm start
```

Scan the QR code shown in the terminal from the spare phone
(WhatsApp -> Linked devices). Incoming **group** messages (text + photos) are
forwarded to `http://localhost:3000/api/extract` and appear on the dashboard.

Filter to one group:

```powershell
$env:WA_GROUP = "כיתת מאיה"; npm start
```

---

## Project layout

```
family-hub/
  src/
    app/
      page.tsx            # dashboard route
      inbox/page.tsx      # extraction sandbox
      api/                # state, tasks, grocery, extract (SQLite-backed)
    components/Dashboard.tsx
    lib/
      store.ts            # JSON file store (load/save/seed)
      seed.ts             # Hebrew mock family
      queries.ts          # data access + dashboard state
      gemini.ts           # Gemini 2.5 Flash extractor (+ offline fallback)
      types.ts, date.ts, colors.ts
  whatsapp/               # optional Baileys gateway (separate install)
  data/                   # family.json (auto-created, gitignored)
```

To reset the mock data, stop the app and delete the `data/` folder; it re-seeds
on next start.

---

## Try these in the inbox to test extraction

- `הזכורת להורי כיתת מאיה: מחר יש להביא בגדי התעמלות ו-20 שקל לקנטינה`
- `ביום שישי יש יום תחפושות, נא להכין תחפושת`
- `נגמר לנו החלב והביצים, לקנות בסופר`
- Upload a photo of a note / form from a teacher.

---

## POC evaluation - feature wishlist

Use the app for a few days, then fill this in to decide what Phase 1 (the Jetson
build) should prioritize. Go / no-go on buying the hardware.

- [ ] Is the dashboard layout clear on the 27" screen from across the room?
- [ ] Extraction quality on real Hebrew teacher messages (1-5): ___
- [ ] Extraction quality on photos of notes/forms (1-5): ___
- [ ] Missing family members / roles to add: ___
- [ ] Missing tile types (e.g. weekly meal planner, allergies, budget): ___
- [ ] Should groceries auto-generate from the weekly meal plan? y/n
- [ ] Reminders wanted (morning summary, "bring X tomorrow") - where? (screen /
      WhatsApp / phone push): ___
- [ ] Multi-user editing from phones needed? y/n
- [ ] Privacy: which data must stay fully local vs. OK to send to cloud: ___
- [ ] Decision: proceed to Jetson Phase 1? y/n

---

## What's next (Phase 1 - see the plan file)

Move the "brain" to a hybrid local/cloud router on the **Jetson Orin Nano
Super** (local Qwen model built for SM_87 + cloud Gemini for Hebrew photo
vision), swap SQLite for Postgres, add a scheduler for reminders, and run the
dashboard fullscreen (kiosk) on the LAN screen. The POC code (dashboard, data
model, extractor, WhatsApp gateway) carries straight over.
