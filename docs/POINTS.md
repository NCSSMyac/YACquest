# How the points were tuned

**Targets:** about 300 participants, a cycle that ends **May 1, 2027**, and about **5 winners**, so the race should stay open nearly all year.

## Settings (`src/config.ts`)

| | Points | Examples |
|---|---|---|
| Tier 1, High-Impact | **40** | Annual fund gift (once), bringing a new alum (max 3), official cross-campus events, event photos (1 per event, 4 per cycle) |
| Tier 2, Active | **20** | Campus events (home or visiting), panels/mentorship circles, game wins (lead-awarded), tagging YAC (2 per month) |
| Tier 3, Digital | **5** | Surveys, following Instagram (once), reposts, polls, story games. All digital combined: 1 per week |
| **Prize goal** | **650** | First 5 to reach it win a $50 gift card ($250 total) |

The proposal's original values were 50/25/10. They're lowered so that a single tier can't carry anyone to the goal, and Tier 3 is kept small because it's the easiest to repeat.

## The model (`scripts/simulate-points.py`)

The model assumes these opportunities over the cycle: about 10 campus events, 4 panels, 4 cross-campus events, 6 game-win chances, 13 social-tag slots and 22 weeks of digital quests. Engagement follows a Beta(1.1, 4.5) curve: most people are light, a few are superfans. The model runs 200 times with 300 people each.

| Goal | People reaching it by May 1 | Median participant |
|---|---|---|
| 500 | ~16 | ~105 |
| 600 | ~8 | ~105 |
| **650** | **~5–6** | ~105 |

Doing every single thing earns about 1,080 points, so 650 is hard but doesn't need perfection.

## Check-ins during the year
- **Feb 1:** if almost nobody is past 300, lower the goal (a one-line change in `config.ts`) and announce it.
- If YAC plans more or fewer events than assumed, edit `OPP` in the script and rerun `python3 scripts/simulate-points.py`.
- **Open question for YAC:** does someone keep their spot if points are removed after they qualify? Right now they do.
