import random, statistics
random.seed(7)
# Season: Nov 8 2026 -> May 1 2027. YAC now plans only ~6 more events (4 home-campus,
# 2 cross-campus) and posts on social media every other week (~12 digital chances).
GOAL = 350
OPP = dict(home=4, panel=0, cross=2, photo_cap=4, ref_cap=3, games=6, tag_slots=8, digital_slots=12)
def person(e, P):
    att = lambda n, p=e: sum(random.random() < p for _ in range(n))
    home, panel, cross = att(OPP['home']), att(OPP['panel']), att(OPP['cross'])
    ev = home + panel + cross
    pts = (home + panel) * P[2] + cross * P[1]
    pts += min(OPP['photo_cap'], att(ev, e * 0.6)) * P[1]
    pts += P[1] if random.random() < e * 0.5 else 0                    # annual fund
    pts += min(OPP['ref_cap'], att(4, e * 0.25)) * P[1]                # referrer bonus
    pts += P[1] if random.random() < 0.15 else 0                       # was referred (new: both get points)
    pts += att(ev, e * 0.15) * P[2]                                    # game wins
    pts += att(OPP['tag_slots'], e * 0.7) * P[2]                       # social tags (2/month cap)
    pts += att(OPP['digital_slots'], e * 0.8) * P[3]                   # digital 1/week (posts every other week)
    return pts
def run(P, goal, trials=150):
    reach, fifth, top, half, med = [], [], [], [], []
    for _ in range(trials):
        s = sorted((person(random.betavariate(1.1, 4.5), P) for _ in range(300)), reverse=True)
        reach.append(sum(x >= goal for x in s)); fifth.append(s[4]); top.append(s[0])
        half.append(sum(x >= goal / 2 for x in s)); med.append(statistics.median(s))
    return dict(reach=statistics.mean(reach), reach_med=statistics.median(reach), fifth=statistics.mean(fifth),
                top=statistics.mean(top), half=statistics.mean(half), median=statistics.mean(med))
def perfect(P):
    ev = OPP['home'] + OPP['panel'] + OPP['cross']
    return ((OPP['home'] + OPP['panel']) * P[2] + OPP['cross'] * P[1] + min(OPP['photo_cap'], ev) * P[1]
            + P[1] + OPP['ref_cap'] * P[1] + P[1] + ev * P[2] + OPP['tag_slots'] * P[2] + OPP['digital_slots'] * P[3])

print(f"Goal {GOAL} | OPP {OPP}")
print(f"T1 T2 T3 | reach{GOAL} (median) | 5th best | best | best reaches goal at % of season")
for T in [(40, 20, 5), (35, 20, 5), (40, 15, 5), (45, 15, 5)]:
    P = {1: T[0], 2: T[1], 3: T[2]}
    r = run(P, GOAL)
    print(T, f"| {r['reach']:4.1f} ({r['reach_med']:.0f}) | {r['fifth']:4.0f} | {r['top']:4.0f} | {GOAL / r['top'] * 100:3.0f}%")

P = {1: 35, 2: 20, 3: 5}
r = run(P, GOAL)
print(f"\n35/20/5, goal {GOAL}: ~{r['half']:.0f} people past halfway ({GOAL // 2}), median ends near {r['median']:.0f}, "
      f"5th best ~{r['fifth']:.0f}, perfect participant {perfect(P)}")

print("\nGoal sweep (35/20/5): goal | reach (median) | P(fewer than 4 winners)")
for g in range(300, 451, 25):
    reach = []
    for _ in range(150):
        s = (person(random.betavariate(1.1, 4.5), P) for _ in range(300))
        reach.append(sum(x >= g for x in s))
    print(f"{g:4d} | {statistics.mean(reach):4.1f} ({statistics.median(reach):.0f}) | {sum(x < 4 for x in reach) / len(reach):4.0%}")
