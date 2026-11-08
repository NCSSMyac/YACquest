/**
 * "Report a problem": the technical details attached to a bug report. Small, readable, and with no
 * personal data — emails, login tokens and secret URL parameters are scrubbed (the database scrubs again:
 * clean_bug_context() in 0027).
 */
export interface BugContext {
  route: string;
  trying?: string;
  version: string;
  browser: string;
  screen: string;
  online: boolean;
  theme: 'light' | 'dark' | 'system';
  time: string;
  errors: string[];
}

/** Same rules as public.scrub_text() in 0027. Returns '' for empty input. */
export function scrubText(s: string | null | undefined, max = 300): string {
  return (s ?? '')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?/g, '[token]')
    .replace(/((access|refresh|provider)_token|token|code|password|apikey|key)=[^&#\s]+/gi, '$1=[hidden]')
    .replace(/[^\s@<>()"',;:/]+@[^\s@<>()"',;:/]+\.[A-Za-z]{2,}/g, '[email]')
    .slice(0, max);
}

/** "Chrome 130 · Android", "Safari 17 · iOS", "Firefox 128 · Windows" from a user agent string. */
export function shortUserAgent(ua: string): string {
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Other';
  let m: string[] | null =
    /(Edg)\/(\d+)/.exec(ua) ?? /(SamsungBrowser)\/(\d+)/.exec(ua) ?? /(OPR)\/(\d+)/.exec(ua) ?? /(Firefox|FxiOS)\/(\d+)/.exec(ua) ?? /(CriOS|Chrome)\/(\d+)/.exec(ua);
  if (!m && /Safari\//.test(ua)) {
    const v = /Version\/(\d+)/.exec(ua);
    if (v) m = ['', 'Safari', v[1]];
  }
  const names: Record<string, string> = { Edg: 'Edge', SamsungBrowser: 'Samsung Internet', OPR: 'Opera', FxiOS: 'Firefox', CriOS: 'Chrome' };
  const browser = m ? `${names[m[1]] ?? m[1]} ${m[2]}` : 'Unknown browser';
  return `${browser} · ${os}`;
}

/** The current theme preference: the saved choice, else "system". */
export function currentTheme(doc: { documentElement: { dataset: DOMStringMap } } | undefined = typeof document === 'undefined' ? undefined : document): BugContext['theme'] {
  const t = doc?.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : 'system';
}

export function buildBugContext(input: {
  route: string;
  trying?: string;
  version: string;
  userAgent: string;
  width: number;
  height: number;
  online: boolean;
  theme: BugContext['theme'];
  now: Date;
  errors: string[];
}): BugContext {
  const ctx: BugContext = {
    route: scrubText(input.route, 200) || '/',
    version: input.version.slice(0, 80),
    browser: shortUserAgent(input.userAgent),
    screen: `${Math.round(input.width)}×${Math.round(input.height)}`,
    online: input.online,
    theme: input.theme,
    time: input.now.toISOString(),
    errors: input.errors.map((e) => scrubText(e, 300)).filter(Boolean).slice(-5),
  };
  const trying = scrubText(input.trying?.trim(), 500);
  if (trying) ctx.trying = trying;
  return ctx;
}

/** Plain text version (for the email fallback when logged out, and for staff to copy). */
export function contextLines(c: Partial<BugContext>): string[] {
  const out: string[] = [];
  if (c.route) out.push(`Page: ${c.route}`);
  if (c.version) out.push(`App version: ${c.version}`);
  if (c.browser) out.push(`Browser: ${c.browser}`);
  if (c.screen) out.push(`Screen: ${c.screen}`);
  if (typeof c.online === 'boolean') out.push(`Connection: ${c.online ? 'online' : 'offline'}`);
  if (c.theme) out.push(`Theme: ${c.theme}`);
  if (c.time) out.push(`Time: ${c.time}`);
  if (c.errors?.length) out.push(`Recent errors:\n${c.errors.map((e) => `  - ${e}`).join('\n')}`);
  return out;
}
