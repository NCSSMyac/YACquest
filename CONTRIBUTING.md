# Working on YACquest together

## First time
1. Accept the repo invite, then `git clone <repo url>` and `cd yacquest`.
2. `npm install`, then `npm run dev`.

## Every change
1. `git checkout main && git pull`
2. `git checkout -b your-name/short-description` (e.g. `iesha/settings-screen`)
3. Make the change. Commit small and often.
4. `npm run typecheck && npm test`
5. `git push -u origin your-name/short-description` and open a Pull Request.
6. The other person reviews; CI must be green; then **Squash and merge**. Merging to `main` publishes the site.

Never push straight to `main`. Turn on branch protection: **Settings → Branches → Add rule → `main` → Require a pull request + require status checks (CI)**.

## Splitting work without conflicts
- Each screen is its own file in `src/screens/`. Claim one with a GitHub Issue (assign yourself) before starting.
- `src/api.ts`, `src/types.ts` and `src/config.ts` are shared. Keep changes to them in their own small PRs and mention it in the PR title, e.g. `[api] add event RSVP`.

## House rules
- Screens get data **only** through `src/api.ts`.
- Point values, caps and dates come from `src/config.ts`. Never type a number like `35` or `350` into a screen.
- Use the theme classes (`panel`, `btn`, `chip`, `stack`, …) and components in `src/components/ui.tsx` before adding new CSS.
- Check every screen at 360px wide and in dark mode.
- Copy should be friendly and short. The yak is encouraging, never snarky.
