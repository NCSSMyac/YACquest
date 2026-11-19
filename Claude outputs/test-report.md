# Brew & Quest: end-to-end test report

Run: 2026-11-18, demo/mock build (`npx vite build` + `npx vite preview --port 4173`), Playwright 1.63 Chromium, phone contexts 390×844 @2x, timezone America/New_York.

Setup notes:
- Volunteer (iesha, YACquest Chair) and students ran in separate browser contexts. The mock "server" is the browser's localStorage, so the test copies the mock database between contexts at each hand-off (that stands in for the shared backend).
- Participants: A = yak001 (Yak001), B = alum210 (Wren H.), C = alum211 (Omar T.), D = alum212 (Xavi L.), E (edge cases) = alum213 (Kira M.); staff = admin (YAC Helper, role admin). B–E are seeded NC State participants with no earlier pass.
- Time override: the mock has no built-in clock override (`now()` in src/api/mock.ts is the real clock), so step 7 uses Playwright's clock (`context.clock.install({ time: now + 31 min })`) in a separate context.
- C ran in a fresh context (never opened the pass screen before) to test the offline case realistically; reduced motion used a context with `reducedMotion: 'reduce'`.
- Final run: all checks PASS after fix commit 8100bd1. Page errors: none. Script: e2e-run.js.

| Step | Expected | Result | Notes | Evidence | Fix commit |
|---|---|---|---|---|---|
| 1 | Preset NC State (limit 10), live times, edit limit → 3; Door mode shows QR, secret word, "Free coffees left: 3 / 3" | PASS | title="Brew & Quest @ Cup of Joe", preset limit=10, campus=ncsu, edited limit=3, QR imgs=1, secret=TOFFEE-23 shown=true, counter="FREE COFFEES LEFT 3 / 3 Staff" | 01–04 |  |
| 2a | Home: live countdown banner "First quest: meet us at Cup of Joe! The first 3 people…", no remaining count | PASS | banner="☕ First quest: meet us at Cup of Joe! The first 3 people to meet us get coffee on us ● LIVE 1:59:15 left NC STATE 📍 Cup of Joe Check in ▶" | 05 |  |
| 2b | QR deep link → reveal: gift box → spinning character → name banner w/ Continue countdown | PASS | gift=true, turn style="transform: scaleX(-0.456);", continue="CONTINUE (7)", lines="Brew & Quest @ Cup of Joe · checked in ✓ Tap to spin! LIMITED EDITION · Brew & Quest 2026 LATTE NIGHT SCHOLAR ★ Limited NEW OUTFIT +20 points · new outfit (3 pieces) + Early Bird ☕ badge WEAR IT NOW CONTINUE (7)" | 06–08 |  |
| 2c | Auto-continue → Coffee Pass #1 of 3, secret word = Door mode, live clock ticks, Valid until +30 min | PASS | auto-continued after 6.4s; pass="#1 of 3", secret TOFFEE-23 shown=true, clock 19:50:56 → 19:50:58, expected "Valid until 8:20 PM" found=true | 09–10 |  |
| 2d | Slide to mark used → pass greys out | PASS | wrap class="cp-wrap used", text has "Used ✓ 7:51 PM", filter=grayscale(1) \| none | 11 |  |
| 3a | B (alum210) password check-in → reveal + Coffee Pass #2 | PASS | reveal ok, pass="#2 of 3" | 12–15 |  |
| 3b | C (alum211) password check-in → reveal + Coffee Pass #3 (offline right after check-in) | PASS | FAIL on first run: went offline during the reveal → Continue opened the lazy Coffee Pass route, its chunk could not load → "Oops, a glitch!" error screen. pass visible offline=true; text="YACquest Coffee Pass NCSSM Young Alumni Council FREE COFFEE #3 of 3 Omar T. 📍 Cup of Joe TODAY’S SECRET WORD TOFFEE-23 19:51:35 Valid until 8:21 PM Slide to ma" | 16 | 8100bd1 |
| 4 | D (alum212) → reveal, NO pass, no "sold out" text; Home NEW outfit alert + Prize-tab NEW dot | PASS | reveal lines="+20 points · new outfit (3 pieces)", after continue url=#/, sold-out text=false, alert="🎁 Your Latte Night Scholar outfit is here — try it on! NEW", Prize NEW dots=1, passes issued=3 | 17–20 |  |
| 5 | Staff (admin) → outfit + points, no pass, counter unchanged | PASS | role=admin, outfit pieces=3, points=+20, passes still 3, after continue → #/ | 21–23 |  |
| 6 | Door mode: 0 / 3 left; list A (used), B, C with times; CSV download contents | PASS | counter="FREE COFFEES LEFT 0 / 3 Staff", rows=["#1 Yak001 7:50 PM USED ✓ : PASS 1, YAK001. TAP TO UNDO","#2 Wren H. 7:51 PM NOT YET : PASS 2, WREN H.. TAP TO MARK USED","#3 Omar T. 7:51 PM NOT YET : PASS 3, OMAR T.. TAP TO MARK USED"], CSV coffee-passes-brew-quest-cup-of-joe-2026-11-18.csv (3 rows): pass_no,name,handle,campus,checked_in,valid_until,used,used_at,marked_by | 24 + coffee-passes.csv |  |
| 7 | Jump +31 min → B's Coffee Pass shows "Pass expired" | PASS | wrap class="cp-wrap expired", secret hidden=true, text="Pass expired" | 25 |  |
| 8 | A checks in at UNC preset event → reveal, owned outfit handled gracefully, NO second pass | PASS | Passed the rules on first run, but the reveal said "NEW OUTFIT · new outfit (3 pieces)" for an outfit A already owned (misleading). reveal text="Brew & Quest @ Epilogue · checked in ✓ Tap to spin! LIMITED EDITION · Brew & Quest 2026 LATTE NIGHT SCHOLAR ★ Limited IN YOUR WARDROBE +20 points · outfit already in your wardrobe WEAR IT NOW CONTINUE", A passes total=1, unlock rows=3, points 125→145, after continue → #/ | 26–28 | 8100bd1 |
| 9a | Wardrobe → Limited tab: 3 pieces, "LIMITED EDITION · Brew & Quest 2026"; equip | PASS | tiles=3, lock glyphs=0, saved look={"hat":"cozy_beanie","accessory":"latte_aplus","background":"moonlit_nook"} | 29–30 |  |
| 9b | Badges: Early Bird under Special badges (A has it, D doesn't) | PASS | A earned=true, D earned=false | 31–32 |  |
| 10 | A and D +20 (Brew & Quest is Tier 2); staff not on leaderboard | PASS | A +20 (NC State) +20 (UNC), D +20, staff "YAC Helper" on Ranks=false | 33 |  |
| 11a | Wrong password → friendly error | PASS | "Wrong password. Ask a YAC organizer for the event code." | 34 |  |
| 11b | Check in twice → friendly "already checked in", no second reveal/pass | PASS | "You already checked in to this event.", reveal shown=false | 35 |  |
| 11c | Reduced motion → static reveal (no gift box / spin / confetti), Continue countdown still runs | PASS | gift=0, .still=1, confetti=0, transform none → none, "CONTINUE (7)" | 36 |  |
| 11d | Offline right after check-in → Coffee Pass still visible | PASS | FAIL on first run (same bug as 3b). went offline during reveal; Coffee Pass visible=true; re-opened from Home while offline=true | 16 | 8100bd1 |

## Bugs found and fixed (commit 8100bd1)

1. **Offline right after check-in crashed the Coffee Pass.** `CoffeePassPage` is a lazy route. If the connection dropped during the reveal, Continue tried to download the route's chunk and showed the error screen instead of the pass, even though the pass itself was saved on the device. Fix: `RewardCheckIn` preloads the pass screen as soon as check-in returns a pass, and Home's Coffee Pass chip does the same while a pass is live. Re-tested: the pass shows offline, including after going Home and back.
2. **A second Brew & Quest event said "NEW OUTFIT" for an outfit the person already had.** `grant_event_reward` (SQL), the mock and live.ts now return `alreadyOwned`. When it's true, the reveal shows "IN YOUR WARDROBE" and "+20 points · outfit already in your wardrobe", and the device-side NEW alert isn't set again. There's still no second pass and no Early Bird line. Unit tests, pgTAP-style SQL tests and docs/BACKEND.md are updated.

After the fixes: `tsc --noEmit` clean, `vitest run` 23 files / 342 tests pass, `vite build` OK.

## Observations (not bugs, no change)
- At check-in the seeded Diwali / Thanksgiving / Heritage Month toasts stack over the top of Home for a few seconds. They cover part of the first banner in screenshot 05.
- A's Home shows three banners (own-campus Duke live event first, then the live NC State event, then tomorrow's seeded NC State event). This matches the rule "own campus first".
- The Door mode chip reads "Staff only · 1 used". The CSV marks `used` as yes/no.

## Files
- Screenshots 01–36 (dsf 2), `coffee-passes.csv` (Door mode download), `walkthrough.mp4` (18.8 s, flow A: banner → QR link → reveal → auto-continue → Coffee Pass ticking → slide to mark used), `e2e-run.js`.
