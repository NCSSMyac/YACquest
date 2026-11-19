/**
 * YACquest program settings — the single place to tune the game.
 *
 * How these numbers were chosen (see docs/POINTS.md for the full model):
 * - ~300 participants across Duke, UNC and NC State.
 * - Points start with the first event (Nov 8, 2026) and the cycle ends May 1, 2027.
 * - This year YAC runs only ~6 more events (4 home-campus, 2 cross-campus) and posts on social
 *   media every other week (~12 digital chances), so the goal was lowered from 650 to 350 (briefly 300, now back to 350).
 * - Goal: the prize is HARD. In simulation (scripts/simulate-points.py, GOAL = 350) about 3 of 300 reach 350
 *   (mean ~3.1–3.2, median 3), the first one around early April (~83% of the season); the 5th best ends near
 *   325, so usually a spot or two stays open (fewer than 4 winners in ~63% of runs); ~43 people get past
 *   halfway (175); the median ends near 64.
 *   A "perfect" participant who does everything tops out near 800.
 * - Every automatic award is a tier value below. Manual admin additions are capped at TIER_POINTS[1].
 *   The database has its own copy in app_config (supabase/migrations/0003…, goal set in 0018) — change both together.
 *
 * Mid-year check (around Feb 1): if almost nobody is past halfway (175), lower PRIZE.goal.
 */

export type Tier = 1 | 2 | 3;

export const CYCLE = {
  name: '2026–27 Pilot',
  /** When the database cycle opens (cycles.starts_at). Points earned from here count. Not shown to players. */
  start: '2026-10-15T00:00:00-04:00',
  /** The start date players see (posters, Rules, Sign-up, Help): the first event, Nov 8, 2026. Display only. */
  displayStart: '2026-11-08T00:00:00-05:00',
  end: '2027-05-01T23:59:59-04:00',
} as const;

export const TIER_POINTS: Record<Tier, number> = {
  1: 35, // High-impact engagement
  2: 20, // Active participation
  3: 5, // Digital & community connection (screenshot proof)
};

export const TIER_LABELS: Record<Tier, string> = {
  1: 'High-Impact',
  2: 'Active',
  3: 'Digital',
};

/** The one prize: the first N people to reach `goal` win a gift card. */
export const PRIZE = {
  goal: 350,
  count: 4,
  valueUsd: 75,
  name: '$75 gift card',
  /** Claims are fulfilled after the cycle ends. */
  fulfillBy: '2027-05-15',
} as const;

/** Anti-farming limits. Enforced by the API (mock now, backend later). */
export const CAPS = {
  /** Tier-3 digital actions (all kinds combined) per participant per week. */
  digitalPerWeek: 1,
  /** Social tag posts (Tier 2) per participant per calendar month. */
  socialTagPerMonth: 2,
  /** Friends who sign up with your code and attend an event. */
  referralsPerCycle: 3,
  /** Photo uploads that earn points, per event. */
  photosPerEvent: 1,
  /** Photo uploads that earn points, per cycle (photos are Tier 1, so this keeps them from dominating). */
  photosPerCycle: 4,
} as const;

export const CAMPUSES = [
  { id: 'duke', name: 'Duke', full: 'Duke University', city: 'Durham', color: '#00539b' },
  { id: 'unc', name: 'UNC', full: 'UNC-Chapel Hill', city: 'Chapel Hill', color: '#7bafd4' },
  { id: 'ncsu', name: 'NC State', full: 'NC State University', city: 'Raleigh', color: '#cc0000' },
] as const;

export type CampusId = (typeof CAMPUSES)[number]['id'];

export const campusName = (id: CampusId) => CAMPUSES.find((c) => c.id === id)?.name ?? id;

/** Uploads are resized in the browser before sending to keep 300 users' photos cheap. */
export const UPLOAD = {
  maxBytes: 8 * 1024 * 1024,
  maxDimension: 1280,
  jpegQuality: 0.8,
  accept: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
} as const;

/**
 * Admin → Overview "Close to the goal": unclaimed participants within this many points of PRIZE.goal
 * (admin_overview() in the database uses the same 75). The weekly email has its own chair-editable
 * range, report_settings.near_goal_points (default 75).
 */
export const ADMIN_NEAR_GOAL_POINTS = 75;

/** Polling interval for the live "prizes left" counter. */
export const PRIZE_POLL_MS = 15_000;

/** YAC contacts shown in the Rules and anywhere participants need help. */
export const CONTACT_EMAILS = ['iesha.landis.yac@ncssm.edu', 'jacob.rodriguez.yac@ncssm.edu'] as const;
/**
 * 0032: the YAC Gmail that sends YACquest emails (shown on "Check your inbox" so people can add it to
 * their contacts). Set the build variable VITE_YAC_SENDER_EMAIL (GitHub → Settings → Secrets and
 * variables → Actions → Variables); empty = a generic hint.
 */
export const YAC_SENDER_EMAIL: string = String(import.meta.env.VITE_YAC_SENDER_EMAIL ?? '').trim();
export const INSTAGRAM_HANDLE = '@ncssmyoungalumni';
export const INSTAGRAM_URL = 'https://www.instagram.com/ncssmyoungalumni/';

/** Up to this many YACquest Chairs at once (the database has its own copy: app_config.max_chairs). */
export const MAX_CHAIRS = 6;

/** Where the docs live (linked from the admin Pace card). */
export const DOCS_URL = 'https://github.com/ncssmyac/YACquest/blob/main/docs';

/**
 * 0028 Pace tracker (Admin dashboard → Pace, Admin → Stats). The projection lives in src/lib/pace.ts.
 * Each player's pace = points per week since their first points this cycle (or since CYCLE.displayStart,
 * whichever is later). Conservative = keeps `dampening` × that pace until CYCLE.end; optimistic = 100%.
 */
export const PACE = {
  dampening: 0.8,
  /** Below this many weeks with any points (or this many weeks since CYCLE.displayStart), the card says "Check back after a couple of weeks of events". */
  minWeeks: 2,
  /** The mid-year check (docs/POINTS.md): from this date, "Consider lowering the goal" can show. */
  checkFrom: '2027-02-01T00:00:00-05:00',
  /** Even optimistically fewer than this many finishers → "Consider lowering the goal". */
  tooFew: 2,
  /** Even conservatively more than this many finishers → "Goal may be too easy". */
  tooMany: 8,
} as const;

/**
 * 0028 YACquest Wrapped (a tap-through story of your year, #/wrapped) + the end-of-year wrap-up.
 * The database derives the same opening time (wrapped_opens_at(): one week before the cycle's last day,
 * midnight in New York), so change both together if CYCLE.end moves.
 */
export const WRAPPED = {
  opensAt: '2027-04-24T00:00:00-04:00',
  /** The wrap-up window (Home banner, admin End-of-year card) lasts until this many days after CYCLE.end. */
  wrapUpDays: 14,
  /** Browser demo only (mock API): show Wrapped any time, for testing. Never affects the real backend. */
  mockAlwaysOpen: false,
} as const;

export type SeasonalHolidayId =
  | 'indigenous_peoples_day' | 'dia_de_muertos' | 'diwali' | 'thanksgiving' | 'heritage_month'
  // 0035 winter
  | 'hanukkah' | 'christmas' | 'kwanzaa' | 'winter_solstice' | 'new_year' | 'three_kings_day' | 'lunar_new_year';

export interface SeasonalHoliday {
  id: SeasonalHolidayId;
  name: string;
  emoji: string;
  /**
   * Inclusive [first day, last day] in America/New_York, by year. Missing year → computed with `rule` if
   * there is one, otherwise the item just doesn't come back that year.
   */
  windows: Record<number, [string, string]>;
  /** Fallback for years not listed: compute the window from a fixed rule. */
  rule?: 'second_monday_october_pm7';
  /** What the holiday's items honor (shown in Wardrobe → Seasonal → About this item). */
  about: string;
  learnMore?: { label: string; url: string };
  /** 0031: more links for the About modal (each opens in a new tab). */
  links?: { label: string; url: string }[];
  /** 0031: word used in the "New limited-time … for …" notification/toast (default 'item'). Mirrors seasonal_holidays.item_noun. */
  noun?: 'item' | 'items' | 'background';
  /** 0035: About adds "2027 is the Year of the Goat (also called Sheep or Ram)." for the window's year (zodiacFor()). */
  zodiac?: boolean;
  /** 0035: shown as "Winter 2026–27" in the Collection. */
  season?: 'winter';
  /** 0036: one short line per item (cosmetic id → text), shown under that item in the About modal. */
  itemAbout?: Record<string, string>;
}

/**
 * 0028 SEASONAL WARDROBE: limited-time items, free for everyone (participants AND staff) during their
 * window, owned forever once unlocked (claimed when you open the app or the Wardrobe during the window).
 *
 * ⚠️ VERIFY THESE DATES EVERY YEAR (Diwali follows the lunar calendar; Thanksgiving is the 4th Thursday of
 * November) and keep the database copy in sync: seasonal_windows in supabase/migrations/0028_pace_wrapped_seasonal.sql
 * 0031_seasonal_november.sql, 0035_winter_seasonal.sql and 0036_winter_windows_kwanzaa.sql (add a new migration with the next year's rows). Descriptions and art should be reviewed by members of
 * these communities (e.g. campus cultural organizations) before they go live — see docs/SETUP.md.
 */
export const SEASONAL: SeasonalHoliday[] = [
  {
    id: 'indigenous_peoples_day',
    name: 'Indigenous Peoples’ Day',
    emoji: '🌲',
    // 2nd Monday of October ± 7 days (2026: Oct 12; 2027: Oct 11).
    windows: { 2026: ['2026-10-05', '2026-10-19'], 2027: ['2027-10-04', '2027-10-18'] },
    rule: 'second_monday_october_pm7',
    about:
      'Indigenous Peoples’ Day honors the Native peoples of this land, their histories, their living cultures and their sovereignty. North Carolina is home to eight state-recognized tribes, and NCSSM and our campuses sit on the ancestral lands of Indigenous nations. Learn about the tribes of North Carolina from the NC Commission of Indian Affairs.',
    learnMore: { label: 'NC Commission of Indian Affairs', url: 'https://ncadmin.nc.gov/divisions/american-indian-affairs' },
  },
  {
    id: 'dia_de_muertos',
    name: 'Día de los Muertos',
    emoji: '🌼',
    windows: { 2026: ['2026-10-25', '2026-11-09'], 2027: ['2027-10-25', '2027-11-09'] },
    about:
      'Día de los Muertos (Nov 1–2) is a joyful Mexican tradition of remembering and celebrating loved ones who have passed — not a spooky holiday or part of Halloween. Families build ofrendas decorated with cempasúchil (marigolds), whose color and scent are said to guide spirits home, and papel picado. This flower crown honors the tradition.',
  },
  {
    id: 'diwali',
    name: 'Diwali',
    emoji: '🪔',
    // 0031: all of November. Diwali 2026 = Sunday, Nov 8, 2026 (Lakshmi Puja; confirmed) → Nov 1–30.
    // Diwali 2027 = Friday, Oct 29, 2027: VERIFY before Oct 2027 (lunar calendar) → Oct 22 – Nov 30, so the
    // window covers the festival week and all of November.
    windows: { 2026: ['2026-11-01', '2026-11-30'], 2027: ['2027-10-22', '2027-11-30'] },
    about:
      'Diwali, the Festival of Lights, is celebrated by Hindus, Sikhs, Jains and some Buddhists around the world. Homes are lit with diyas (clay oil lamps) and decorated with rangoli (colorful floor designs) to celebrate the victory of light over darkness.',
  },
  {
    id: 'thanksgiving',
    name: 'Thanksgiving',
    emoji: '🍂',
    // 0031: all of November (Thanksgiving = 4th Thursday: Nov 26, 2026; Nov 25, 2027).
    windows: { 2026: ['2026-11-01', '2026-11-30'], 2027: ['2027-11-01', '2027-11-30'] },
    about:
      'Thanksgiving is a U.S. holiday about gratitude and sharing a meal with family and friends. This cozy scarf celebrates the harvest season and saying thank you.',
  },
  {
    id: 'heritage_month',
    name: 'Native American Heritage Month',
    emoji: '🌽',
    // 0031: all of November every year.
    windows: { 2026: ['2026-11-01', '2026-11-30'], 2027: ['2027-11-01', '2027-11-30'] },
    noun: 'background',
    about:
      'November is Native American Heritage Month in the United States, a time to honor the histories, cultures and continuing presence of Native peoples. Many people also mark Thanksgiving week as “Truthsgiving” — a time to learn the full history behind the holiday and center Indigenous voices. Since 1970, Native people have gathered in Plymouth, Massachusetts on Thanksgiving Day for a National Day of Mourning. The Three Sisters — corn, beans and squash planted together so each helps the others grow — are Indigenous agricultural knowledge practiced by many Native nations for generations.',
    links: [
      { label: 'Learn about North Carolina’s tribes', url: 'https://ncadmin.nc.gov/divisions/american-indian-affairs' },
      { label: 'Whose land are you on?', url: 'https://native-land.ca/' },
    ],
  },
  // ───────────── 0035 WINTER (0035_winter_seasonal.sql) ─────────────
  // ⚠️ VERIFY YEARLY (lunar / lunisolar calendars and astronomy): Hanukkah, Winter Solstice, Lunar New Year.
  {
    id: 'hanukkah',
    name: 'Hanukkah',
    emoji: '🕎',
    // 0036: Nov 30 – Dec 31 every season (covers Hanukkah 2026: sundown Dec 4 – Dec 12; and 2027: sundown
    // Dec 24, 2027 – Jan 1, 2028 — verify yearly; widen the end if a later Hanukkah runs past Dec 31).
    windows: { 2026: ['2026-11-30', '2026-12-31'], 2027: ['2027-11-30', '2027-12-31'] },
    noun: 'items',
    season: 'winter',
    about:
      'Hanukkah, the Jewish Festival of Lights, lasts eight nights. Each night another candle is lit on the hanukkiah (a nine-branched menorah — the ninth is the shamash, the helper candle used to light the others), remembering the rededication of the Temple in Jerusalem and the story of a small amount of oil lasting eight nights. Families play dreidel, a spinning-top game, and eat foods fried in oil like latkes and sufganiyot (jelly doughnuts).',
  },
  {
    id: 'christmas',
    name: 'Christmas',
    emoji: '🎄',
    // Dec 1–31 every year (Christmas = Dec 25).
    windows: { 2026: ['2026-12-01', '2026-12-31'], 2027: ['2027-12-01', '2027-12-31'] },
    noun: 'items',
    season: 'winter',
    about:
      'Christmas, on December 25, is celebrated by Christians as the birth of Jesus and by many people around the world as a time for family, giving and lights. Evergreen trees, twinkling lights and gifts are common traditions.',
  },
  {
    id: 'kwanzaa',
    name: 'Kwanzaa',
    emoji: '🕯️',
    // Kwanzaa is Dec 26 – Jan 1 every year → 0036: Dec 1 – Jan 8.
    windows: { 2026: ['2026-12-01', '2027-01-08'], 2027: ['2027-12-01', '2028-01-08'] },
    noun: 'items',
    season: 'winter',
    about:
      'Kwanzaa (December 26 – January 1) is a celebration of African American and Pan-African culture and community, created in 1966 by Dr. Maulana Karenga. Each night a candle is lit on the kinara for one of the seven principles, the Nguzo Saba: unity, self-determination, collective work and responsibility, cooperative economics, purpose, creativity and faith. Its colors are red, black and green.',
    itemAbout: {
      kikombe_cha_umoja:
        'The kikombe cha umoja, or unity cup, is shared during the Karamu feast near the end of Kwanzaa. A little is poured as a tribute to the ancestors, and family and friends drink to unity.',
      zawadi:
        'Zawadi are gifts given near the end of Kwanzaa, often handmade or educational, like a book, to encourage learning, creativity and growth.',
      kwanzaa_scarf:
        'A cozy knit scarf in the Kwanzaa colors: red for the struggle, black for the people, and green for the future and hope.',
    },
  },
  {
    id: 'winter_solstice',
    name: 'Winter Solstice',
    emoji: '✨',
    // Solstice Dec 21, 2026 and Dec 21, 2027 (evening in New York) → 0036: all of December.
    windows: { 2026: ['2026-12-01', '2026-12-31'], 2027: ['2027-12-01', '2027-12-31'] },
    noun: 'items',
    season: 'winter',
    about:
      'The winter solstice (around December 21 in the Northern Hemisphere) is the longest night of the year. After it, days start getting longer again. Many cultures around the world have marked this turning point with lights, gatherings and celebrations of the return of the sun.',
  },
  {
    id: 'new_year',
    name: 'New Year’s',
    emoji: '🎆',
    // 0036: Dec 1 – Jan 7 every season. The party hat shows the year being welcomed (newYearHatYear()).
    windows: { 2026: ['2026-12-01', '2027-01-07'], 2027: ['2027-12-01', '2028-01-07'] },
    noun: 'items',
    season: 'winter',
    about:
      'A fresh start! New Year’s Eve and Day (December 31 – January 1) are celebrated around the world with countdowns, fireworks and resolutions. Here’s to your best quest year yet.',
  },
  {
    id: 'three_kings_day',
    name: 'Three Kings Day',
    emoji: '⭐',
    // Día de Reyes = January 6 every year → 0036: Dec 1 – Jan 13. Keyed by the January's year (as in 0035).
    windows: { 2027: ['2026-12-01', '2027-01-13'], 2028: ['2027-12-01', '2028-01-13'] },
    noun: 'background',
    season: 'winter',
    about:
      'Three Kings Day (Día de Reyes), on January 6, is celebrated in Latin America, Spain, the Philippines, Puerto Rico and by many Christian communities as the Epiphany — the day the Three Wise Men, guided by a star, are said to have visited the baby Jesus. Families share a Rosca de Reyes, a ring-shaped sweet bread with a small figure hidden inside — whoever finds it often hosts the next gathering. Children may leave shoes out (and grass for the camels) the night before for gifts.',
  },
  {
    id: 'lunar_new_year',
    name: 'Lunar New Year',
    emoji: '🧧',
    // Lunar New Year = Sat Feb 6, 2027 (Year of the Goat); Wed Jan 26, 2028 (Year of the Monkey).
    // 0036: Dec 1 – Feb 20 every season (keyed by the year of the New Year). Verify yearly that Feb 20 still
    // covers the Lantern Festival (Feb 20, 2027; Feb 9, 2028).
    windows: { 2027: ['2026-12-01', '2027-02-20'], 2028: ['2027-12-01', '2028-02-20'] },
    noun: 'items',
    season: 'winter',
    zodiac: true,
    about:
      'Lunar New Year marks the start of the year on the lunar calendar and is celebrated across East and Southeast Asia and around the world — as Chinese New Year or Spring Festival, Seollal in Korea, and Tết in Vietnam, among others. Families reunite, homes are decorated in red for luck, and elders give red envelopes with money to wish good fortune.',
  },
];

/**
 * 0034 QUICK START: new accounts play right away; the app confirms the email itself (#/verify?t=…).
 * The database has its own copies: email_verify_days() = linkDays, app_config.verify_resends_per_hour.
 */
export const VERIFY = {
  /** The confirmation link works this long. */
  linkDays: 7,
  /** "Resend" on Home, per person per hour. */
  resendsPerHour: 3,
} as const;

/** 0034: seasonal quests (New York dates, inclusive). Keep in sync with quest_windows in 0034_quickstart_promo_collection.sql. */
export const QUEST_WINDOWS: Record<string, [string, string][]> = {
  finals_study_break: [
    ['2026-12-01', '2026-12-18'],
    ['2027-04-20', '2027-05-01'],
  ],
};

/** 0034 promo: mystery teaser (days before a special series), live campus scoreboard window + refresh. */
export const PROMO = {
  teaserDays: 14,
  scoreboardDaysBefore: 3,
  scoreboardDaysAfter: 1,
  scoreboardPollMs: 30_000,
} as const;

/** 0034 recap card: "Thank you, Tar Heels!" */
export const CAMPUS_THANKS: Record<CampusId | 'all', string> = {
  duke: 'Thank you, Blue Devils!',
  unc: 'Thank you, Tar Heels!',
  ncsu: 'Thank you, Wolfpack!',
  all: 'Thank you, Triangle!',
};
