# YACquest 🐂

The year-round engagement app for the **NCSSM Young Alumni Council (YAC)**: part fast-food rewards app, part ClassDojo, styled like an old-school pixel treasure quest.

Alumni at **Duke, UNC-Chapel Hill and NC State** earn points for showing up and staying connected. The **first 5 people to reach 650 points** each win a **$50 gift card**. The cycle ends **May 1, 2027**.

> **Status:** front end in progress. Data comes from a **mock API in the browser** (`src/api.ts`) seeded with ~300 fake participants. The backend team replaces that one file with real requests.

## Try it

```bash
npm install
npm run dev        # http://localhost:5173
```

| Log in as | Role | What you can do |
|---|---|---|
| `yak001` | Participant (Duke) | Check in, submit quests, race for the prize |
| `admin` | Admin ("YAC Helper") | Review screenshots, award points, run events, **for all campuses** |
| `iesha`, `jacob` | YAC Chair (max 2) | Everything an admin does, plus prizes and fulfillment, Team (grant/remove admin, hand over chair seat), Sheets sync, CSV export, cycle reset |

Any password works in the demo. Live demo events have passwords `BLUEDEVIL` (Duke), `PANEL` (UNC), `WOLFPACK` (NC State), `TRIANGLE` (all campuses). Admins can see passwords under **Admin → Events**. **Me → Reset demo data** starts over (demo mode only).

**Live mode** (real accounts and data) needs a Supabase project: see `docs/SETUP.md` (being written).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server with hot reload |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm test` | Rule tests for the API (check-in, caps, permissions, prize race) |

## Where things live

```
src/
  config.ts          ← ALL tunable numbers: tier points, prize goal, caps, cycle dates
  types.ts           ← data shapes (match the Data Model & API Contract doc)
  api.ts             ← the ONLY data layer. Mock today; swap bodies for fetch() later
  lib/activities.ts  ← the ways to earn points (from the proposal)
  components/        ← shared UI: Panel, ProgressBar, Modal, toasts, Sprite, Layout
  screens/           ← one file per participant screen
  screens/admin/     ← admin + chair screens
  styles/theme.css   ← NCSSM navy/gold pixel theme (colors are CSS variables)
docs/POINTS.md       ← why the numbers are what they are
scripts/simulate-points.py ← rerun the points model if YAC changes plans
```

## Features

**Participants:** sign up (campus, character, friend code, rules accepted before account creation) · log in / forgot password · dashboard (points, progress to the prize, overall and campus rank, days left, recent activity, friend code) · Quest Board (event check-in with password, screenshot/photo quests with in-browser image shrinking, submission status) · Treasure Vault (live "N of 5 left" counter, spot grid, Winners' Circle, claim form with reference number) · leaderboards (top 10, top 3 per campus, per-capita Campus Cup) · notifications · rules · profile, theme, prize suggestions.

**Admins (all campuses):** overview · review queue (approve / reject with reason) · player search, quick "+20 game win", manual adjustments with required reason · create/edit events and passwords.

**Chair:** everything above · team management (grant/remove admin, hand over the chair seat) · revoked prize spots refill automatically when points are removed · prize claims and fulfillment · prize suggestions · Google Sheets sync status · ledger CSV export · weekly report preview · end-of-cycle reset with archive.

## Hooking up the backend

1. Keep every exported function name and return type in `src/api.ts`.
2. Replace each body with a `fetch` to the matching endpoint in the API contract doc.
3. Anything marked **SERVER RULE** must be enforced by the backend. The front-end checks only produce friendly messages.
4. The prize race must be a single database transaction with a unique `(cycle, spot)` constraint, so two people crossing the goal at the same moment can't both take the last spot.

## Publishing

Every push to `main` deploys to **GitHub Pages** through `.github/workflows/deploy.yml`. One-time setup: **Settings → Pages → Source: GitHub Actions**. Pull requests run typecheck, tests and build (`ci.yml`).

See [CONTRIBUTING.md](CONTRIBUTING.md) for how we work together.
