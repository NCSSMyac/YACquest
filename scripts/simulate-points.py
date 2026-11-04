import random, statistics, itertools
random.seed(7)
# Season: Nov 8 2026 -> May 1 2027 = 25 weeks; ~20 active (winter break + exams off)
OPP = dict(home=10, panel=4, cross=3, photo_cap=4, ref_cap=3, games=6, tag_slots=12, digital_slots=20)
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
    pts += att(OPP['digital_slots'], e * 0.8) * P[3]                   # digital 1/week
    return pts
def run(P, goal, trials=150):
    reach, fifth, first, top = [], [], [], []
    for _ in range(trials):
        s = sorted((person(random.betavariate(1.1, 4.5), P) for _ in range(300)), reverse=True)
        reach.append(sum(x >= goal for x in s)); fifth.append(s[4]); top.append(s[0])
    return statistics.mean(reach), statistics.mean(fifth), statistics.mean(top), statistics.median(reach)
print("T1 T2 T3 | reach650 (median) | 5th best | best | best reaches goal at % of season")
for P in [(40,20,5),(35,20,5),(40,15,5),(45,15,5)]:
    r, f, t, m = run({1:P[0],2:P[1],3:P[2]}, 650)
    print(P, f"| {r:4.1f} ({m:.0f}) | {f:4.0f} | {t:4.0f} | {650/t*100:3.0f}%")
perfect = {k: v for k, v in [(1,35),(2,15),(3,5)]}
