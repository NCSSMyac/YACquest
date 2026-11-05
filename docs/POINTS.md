# How the points work (and why)

**Goal:** the $75 gift card should be **hard** to win. Only the most dedicated few should make it, near the end of the year. The first 4 people to reach the goal win. If fewer than 4 make it, the leftover budget is saved.

## The three tiers (from the YAC proposal)

| Tier | Points | What counts | Limits |
|---|---|---|---|
| **High-Impact Engagement** | **35** | Annual fund gift · bringing a new alum (you **and** your friend each get 35 when they attend their first event) · official cross-campus events · event photos | Annual fund once · 3 friends · photos 1 per event, 4 per year |
| **Active Participation** | **20** | Home-campus events · panels & mentorship circles · winning a game (admin awards) · tagging YAC in a post | Tags 2 per month |
| **Digital Connection** | **5** | Surveys · following @ncssmyoungalumni (once) · reposts · polls · story games | 1 digital action per week |
| **Prize goal** | **350** | First 4 people to reach it win a $75 gift card ($300 of the $350 budget) | |

**Every award uses one of these three numbers.** Check-ins, approved screenshots, game wins and friend codes all pull from the tier value automatically. Manual admin additions are capped at **+35 per entry**, the size of one High-Impact action, so no one can be pushed to the prize with a single click. Removals can go up to −350 (the goal) to fix mistakes or cheating.

## This year: 6 events, posts every other week → goal 350

The goal was 650 when YAC planned ~17 events. YAC will now run only **about 6 more events** (4 home-campus, 2 cross-campus) and post on social media **every other week** (~12 digital chances), so the goal is **350**. Tier points, the 4 spots and the $75 value did not change.

## What the simulation says (`python3 scripts/simulate-points.py`)

The model has 300 people, Nov 8 to May 1, with `OPP = home 4, panel 0, cross 2, photos ≤4, friends ≤3, tags 8 slots (2/month), digital 12 slots`, and engagement where most people are light and a few are superfans.

| Points (T1/T2/T3) | Reach 350 by May 1 | 5th best ends at |
|---|---|---|
| 40 / 20 / 5 | ~4 | ~345 |
| **35 / 20 / 5** ✅ | **~3** | **~325** |
| 40 / 15 / 5 | ~2–3 | ~315 |

Goal sweep with 35/20/5 (the script prints this):

| Goal | People who reach it | Chance fewer than 4 win |
|---|---|---|
| 300 | ~7 | 8% |
| 325 | ~5 | 31% |
| **350** ✅ | **~3** | **63%** |
| 375 | ~2 | 84% |
| 400 | ~1 | 95% |
| 450 | ~0 | 100% |

At 350: about 40 people get past halfway (175), the median participant ends near 65, the first winner arrives around early April, and usually a spot or two stays open (that money is saved). Doing literally everything earns about **800** (805 in the model).

## Ways to reach 350
Limits used: photos 1 per event and 4 per year · tags 2 per month · digital 1 per week · up to 3 friends (you **and** each friend get 35) · annual fund once. Events: home-campus 20, cross-campus 35.

| Player | How | Points |
|---|---|---|
| **Event regular** | all 6 events (4 home 80 + 2 cross 70 = 150) + 4 event photos (140) + annual fund (35) + brings 1 friend (35) | **360** |
| **Connector** | 5 events (3 home 60 + 2 cross 70 = 130) + brings 3 friends (105) + annual fund (35) + 4 tagged posts (80) | **350** |
| **Steady** | 4 events (2 home 40 + 2 cross 70 = 110) + 3 event photos (105) + 3 tagged posts (60) + 10 digital actions incl. the IG follow (50) + signed up with a friend's code (35) | **360** |

Nobody gets there from events alone (all 6 = 150): every path needs photos, friends, the annual fund or steady posting too.

## Check-ins during the year
- **Feb 1:** if almost nobody is past 150, lower the goal again and announce it. The goal, number of spots and gift card value live in `src/config.ts` (`PRIZE`) **and** the database (`app_config.prize_goal`, `prize_count`, `prize_value_usd`; see `supabase/migrations/0014_goal_350.sql` for how to change it).
- If YAC plans more or fewer events, edit `OPP` (and `GOAL`) in the script and rerun it.
- **Revoked prizes:** if points are removed and a winner drops below 350, their spot goes to the next person who qualified.
