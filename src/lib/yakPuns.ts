/**
 * Yak puns. The app shows a "Yak of the day" (same for everyone, changes at midnight Eastern);
 * the weekly committee email and prize alerts show a "Yak of the week".
 *
 * KEEP IN SYNC with public.yak_pun() in supabase/migrations/0015_yak_puns.sql — same puns,
 * same order (src/__tests__/yakPuns.test.ts checks this). Use ’ (curly apostrophe), not '.
 */
export const YAK_PUNS: readonly string[] = [
  'Yak to the future!',
  'You’re on the right yak.',
  'Don’t yak out now, keep questing!',
  'Yakety yak, check in and come back.',
  'Let’s keep this on yak.',
  'That was yak-tually amazing.',
  'Yak-cellent work, adventurer!',
  'Stay on yak and the prize is yours.',
  'We’ve got your yak.',
  'Hit the yak, Jack.',
  'Don’t look yak, keep climbing.',
  'Yak attack: go claim those points!',
  'Fast yak to the leaderboard.',
  'Keep calm and yak on.',
  'Every yak counts.',
  'The yak is back!',
  'You’re the yak of all trades.',
  'Yak-ademic weapon, reporting for duty.',
  'Yaks to the max!',
  'Two yaks are better than one. Bring a friend!',
  'Yak-pot! Points incoming.',
  'Yak the halls with points and glory.',
  'Yak-tion speaks louder than words.',
  'Ready, set, yak!',
  'Yak-ity split, here come the points.',
  'Yak-nowledge your greatness.',
  'Fur real, you’ve got this.',
  'Big yak energy.',
  'Quest, yak, repeat.',
  'Mountains are just yak speed bumps.',
  'Aim high. Yaks live at 15,000 feet.',
  'Yak-ing it one quest at a time.',
  'Yak in business, baby!',
  'Everything’s going yak-cording to plan.',
  'Hair today, points tomorrow.',
  'Yak-tivate quest mode!',
  'Herd it here first: you’re crushing it.',
  'Yak-cept the challenge.',
  'Have a yak-tastic day!',
  'Yak-pack ready, adventure awaits.',
];

/** Same pick as SQL public.yak_pun(seed): YAK_PUNS[|seed| mod n]. */
export function yakPun(seed: number): string {
  const n = YAK_PUNS.length;
  return YAK_PUNS[Math.abs(Math.trunc(seed)) % n];
}

/** Calendar date (year, month 1-12, day) in America/New_York. */
function easternYmd(date: Date): [number, number, number] {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return [Number(parts.year), Number(parts.month), Number(parts.day)];
}

/** Pun of the day: same for everyone on the same America/New_York date, changes daily. */
export function yakPunOfTheDay(date: Date = new Date()): string {
  const [y, m, d] = easternYmd(date);
  return yakPun(Math.floor(Date.UTC(y, m - 1, d) / 86_400_000));
}

/**
 * Pun of the week, seeded by the America/New_York ISO week as YYYYWW (e.g. 202645) —
 * matches public.yak_pun_of_the_week() (to_char(..., 'IYYYIW')).
 */
export function yakPunOfTheWeek(date: Date = new Date()): string {
  const [y, m, d] = easternYmd(date);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); // Thursday of this ISO week
  const isoYear = t.getUTCFullYear(); // the Thursday's year is the ISO year
  const week = 1 + Math.floor((t.getTime() - Date.UTC(isoYear, 0, 1)) / 86_400_000 / 7);
  return yakPun(isoYear * 100 + week);
}

/** Any pun, for a little flourish in celebrations. */
export function randomYakPun(): string {
  return YAK_PUNS[Math.floor(Math.random() * YAK_PUNS.length)];
}
