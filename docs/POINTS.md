# How the points work (and why)

**Goal:** the $75 gift card should be **hard** to win. Only the most dedicated few should make it, near the end of the year. The first 4 people to reach the goal win. If fewer than 4 make it, the leftover budget is saved.

## The three tiers (from the YAC proposal)

| Tier | Points | What counts | Limits |
|---|---|---|---|
| **High-Impact Engagement** | **35** | Annual fund gift · bringing a new alum (you **and** your friend each get 35 when they attend their first event) · official cross-campus events · event photos | Annual fund once · 3 friends · photos 1 per event, 4 per year |
| **Active Participation** | **20** | Home-campus events · panels & mentorship circles · winning a game (admin awards) · tagging YAC in a post | Tags 2 per month |
| **Digital Connection** | **5** | Surveys · following @ncssmyoungalumni (once) · reposts · polls · story games | 1 digital action per week |
| **Prize goal** | **350** | First 4 people to reach it win a $75 gift card ($300 of the $350 budget) | |

**In-app event feedback survey (0030):** +5 (Tier 3) once per event you checked in to, up to 14 days after it ends, awarded automatically and **not** counted toward the 1-per-week digital limit (it's tied to attendance).

**Every award uses one of these three numbers.** Check-ins, approved screenshots, game wins and friend codes all pull from the tier value automatically. Manual admin additions are capped at **+35 per entry**, the size of one High-Impact action, so no one can be pushed to the prize with a single click. Removals can go up to −350 (the goal) to fix mistakes or cheating.

## This year: 6 events, posts every other week → goal 350

The goal was 650 when YAC planned ~17 events. YAC will now run only **about 6 more events** (4 home-campus, 2 cross-campus) and post on social media **every other week** (~12 digital chances), so the goal dropped to **350** (0014). It was briefly lowered to 300 (0016), but YAC decided to keep the prize harder, so it is **350** again (0018). Tier points, the 4 spots and the $75 value did not change.

## What the simulation says (`python3 scripts/simulate-points.py`)

The model has 300 people, Nov 8 to May 1, with `OPP = home 4, panel 0, cross 2, photos ≤4, friends ≤3, tags 8 slots (2/month), digital 12 slots`, and engagement where most people are light and a few are superfans.

| Points (T1/T2/T3) | Reach 350 by May 1 | 5th best ends at |
|---|---|---|
| 40 / 20 / 5 | ~4 | ~345 |
| **35 / 20 / 5** ✅ | **~3** | **~325** |
| 40 / 15 / 5 | ~3 | ~315 |

Goal sweep with 35/20/5 (the script prints this):

| Goal | People who reach it | Chance fewer than 4 win |
|---|---|---|
| 275 | ~11 | 1% |
| 300 | ~7 | 6% |
| 325 | ~5 | 20% |
| **350** ✅ | **~3** | **63%** |
| 375 | ~2 | 87% |
| 400 | ~1 | 95% |
| 425 | ~0.6 | 100% |

At 350: about 3 people reach it (mean ~3.1–3.2, median 3), so usually a spot or two stays open and the leftover budget is saved (fewer than 4 winners in ~63% of runs). About 43 people get past halfway (175), the median participant ends near 64, and the first winner arrives around early April (the best player hits 350 at ~83% of the season). Doing literally everything earns about **800** (805 in the model).

## Treasure map checkpoints
Trailhead **50** · Camp **100** · Halfway **175** (half the goal) · Summit **250** (¾ of the goal, rounded down to a multiple of 25) · Treasure **350**. Halfway and Summit are computed from `PRIZE.goal` in `src/components/TreasureMap.tsx`. Point unlocks in the Wardrobe: Starry Night 200 · Gold Chain 250 · Sparkle Aura 300.

## Ways to reach 350
Limits used: photos 1 per event and 4 per year · tags 2 per month · digital 1 per week (~12 chances, incl. the one-time IG follow) · up to 3 friends (you **and** each friend get 35 when the friend attends) · annual fund once · game wins 20 (at events). Events: home-campus 20, cross-campus 35.

| Player | How | Points |
|---|---|---|
| **Event regular** | all 6 events (4 home 80 + 2 cross 70 = 150) + 4 event photos (140) + annual fund (35) + brings 1 friend (35) | **360** |
| **Connector** | 5 events (3 home 60 + 2 cross 70 = 130) + brings 3 friends (105) + annual fund (35) + 4 tagged posts (80) | **350** |
| **Steady** | 4 events (2 home 40 + 2 cross 70 = 110) + 3 event photos (105) + 3 tagged posts (60) + 10 digital actions incl. the IG follow (50) + signed up with a friend's code (35, once they attend) | **360** |

Nobody gets there from events alone (all 6 = 150, short of halfway at 175): every path needs photos, friends, the annual fund or steady posting too.

## Check-ins during the year
- **Feb 1:** if almost nobody is past halfway (175), lower the goal and announce it. The goal, number of spots and gift card value live in `src/config.ts` (`PRIZE`) **and** the database (`app_config.prize_goal`, `prize_count`, `prize_value_usd`; to change it, copy the goal section of `supabase/migrations/0018_goal_350_again.sql` into a new migration).
- **Pace tracker** (0028, Admin dashboard → Pace, Admin → Stats): projects how many people reach the goal by May 1 at their current pace and, from Feb 1, suggests lowering the goal if even the optimistic projection is under 2 finishers (or flags "Goal may be too easy" above 8). It's a guide; the decision stays with the YACquest Chairs.
- If YAC plans more or fewer events, edit `OPP` (and `GOAL`) in the script and rerun it.
- **Revoked prizes:** if points are removed and a winner drops below 350, their spot goes to the next person who qualified.

## Badges (16, just for fun)
Badges never award points, so they can't change the prize race. Participants can collect **16** (Prize → Badges; the server's list is `badges_for()` in `supabase/migrations/0022_rsvp_streaks.sql`, names in `src/lib/badges.ts`): First Steps, Regular (5 check-ins), Veteran (10), Campus Explorer (Duke + UNC + NC State), Big Moment (a High-Impact event), All Seasons (check-ins in 3 different months), Digital Native (3 digital quests), Shutterbug, Recruiter, Giver, Champion, Voice of the Herd, Halfway There (175), Quest Legend (350), Adventurer of the Month, and **Hot Streak** (new in 0022).

**Hot Streak** = check in at events **3 calendar months in a row** (America/New_York, this cycle). Progress is your best streak this cycle (e.g. 2/3). With only ~6 events this year, YAC needs an event in each of 3 consecutive months for anyone to earn it, so it's a nice reason to space events out. The Rainbow background still unlocks at 6 badges (Hot Streak counts like any other).

**Monthly streak** (shown on Home and Me): consecutive months with at least one check-in. It counts back from this month; if you haven't checked in yet this month it still counts through last month and Home says "Check in this month to keep your streak!". Missing a whole month resets it. RSVPs ("I'm going") don't count and earn no points; only check-ins do.

## Seasonal wardrobe and Wrapped (0028): no points
Seasonal wardrobe items (Día de los Muertos, Diwali, Thanksgiving, Native American Heritage Month, Indigenous Peoples' Day) are **cosmetic only**: they're free during their window, never cost or award points, and don't count toward badges (they're not badges) or the prize. YACquest Wrapped and the end-of-year checklist only *read* points; nothing in them changes the ledger.
