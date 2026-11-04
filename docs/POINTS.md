# How the points work (and why)

**Goal:** the $75 gift card should be **hard** to win. Only the most dedicated few should make it, near the end of the year. The first 4 people to reach the goal win. If fewer than 4 make it, the leftover budget is saved.

## The three tiers (from the YAC proposal)

| Tier | Points | What counts | Limits |
|---|---|---|---|
| **High-Impact Engagement** | **35** | Annual fund gift · bringing a new alum (you **and** your friend each get 35 when they attend their first event) · official cross-campus events · event photos | Annual fund once · 3 friends · photos 1 per event, 4 per year |
| **Active Participation** | **20** | Home-campus events · panels & mentorship circles · winning a game (admin awards) · tagging YAC in a post | Tags 2 per month |
| **Digital Connection** | **5** | Surveys · following @ncssmyoungalumni (once) · reposts · polls · story games | 1 digital action per week |
| **Prize goal** | **650** | First 4 people to reach it win a $75 gift card ($300 of the $350 budget) | |

**Every award uses one of these three numbers.** Check-ins, approved screenshots, game wins and friend codes all pull from the tier value automatically. Manual admin additions are capped at **+35 per entry**, the size of one High-Impact action, so no one can be pushed to the prize with a single click. Removals can go up to −650 to fix mistakes or cheating.

## What the simulation says (`python3 scripts/simulate-points.py`)

The model has 300 people, events from Nov 8 to May 1 (about 10 home events, 4 panels and 3 cross-campus events), and engagement where most people are light and a few are superfans.

| Points (T1/T2/T3) | Reach 650 by May 1 | 1st winner around |
|---|---|---|
| 40 / 20 / 5 | ~4 | early April |
| **35 / 20 / 5** ✅ | **~3** | **mid-April** |
| 40 / 15 / 5 | ~1 | last week (too risky) |

With 35/20/5: about 40 people get past halfway (325), the median participant ends near 120, and doing literally everything earns about 1,160.

## Check-ins during the year
- **Feb 1:** if almost nobody is past 250, lower the goal and announce it. The goal, number of spots and gift card value live in `src/config.ts` (`PRIZE`) **and** the database (`app_config.prize_goal`, `prize_count`, `prize_value_usd`).
- If YAC plans more or fewer events, edit `OPP` in the script and rerun it.
- **Revoked prizes:** if points are removed and a winner drops below 650, their spot goes to the next person who qualified.
