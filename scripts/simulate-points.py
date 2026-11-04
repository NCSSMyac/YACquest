import random, statistics
# Opportunities Oct 15 -> May 1 (~28 calendar weeks, ~22 active after breaks)
OPP = dict(home=10, panel=4, cross=4, photo_cap=4, fund=1, ref_cap=3, games=6, tag_slots=13, digital_slots=22)
P = {1:40, 2:20, 3:5}
def person(e):  # e in 0..1 engagement
    pts = 0
    att = lambda n: sum(random.random() < e for _ in range(n))
    home = att(OPP['home']); panel = att(OPP['panel']); cross = att(int(OPP['cross']))
    pts += (home+panel)*P[2] + cross*P[1]
    events = home+panel+cross
    pts += min(OPP['photo_cap'], sum(random.random() < e*0.6 for _ in range(events)))*P[1]
    pts += P[1] if random.random() < e*0.5 else 0
    pts += min(OPP['ref_cap'], sum(random.random() < e*0.25 for _ in range(4)))*P[1]
    pts += sum(random.random() < e*0.15 for _ in range(events))*P[2]   # game wins
    pts += att(OPP['tag_slots'])*P[2] if random.random()< e else 0
    pts += sum(random.random() < e*0.8 for _ in range(OPP['digital_slots']))*P[3]
    return pts
res = {}
for goal in (450, 500, 550, 600, 650):
    winners=[]; fifth=[]; med=[]
    for trial in range(200):
        # engagement: most light, some superfans
        scores = sorted((person(random.betavariate(1.1, 4.5)) for _ in range(300)), reverse=True)
        winners.append(sum(s >= goal for s in scores)); fifth.append(scores[4]); med.append(scores[150])
    res[goal]=(statistics.mean(winners), statistics.mean(fifth), statistics.mean(med))
for g,(w,f,m) in res.items(): print(f"goal {g}: avg people reaching {w:.1f}  5th-best {f:.0f}  median {m:.0f}")
print("perfect participant ~", person(1.0))
