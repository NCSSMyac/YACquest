/**
 * The app's build version (vite.config.ts injects __APP_VERSION__; dist/version.json has the same data)
 * and the "New version available" check.
 */
export interface AppVersion {
  version: string;
  sha: string;
  builtAt: string;
}

export const APP_VERSION: AppVersion =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : { version: '0.0.0', sha: 'dev', builtAt: '' };

/** "0.1.0+abc1234" (or "0.1.0+dev"). */
export const versionTag = (v: AppVersion = APP_VERSION) => `${v.version}+${v.sha}`;

/** Build date as "Nov 7, 2026" (Eastern time), or '' when unknown. */
export function builtDate(v: AppVersion = APP_VERSION): string {
  const t = Date.parse(v.builtAt);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
}

/** "App version 0.1.0+abc1234 (built Nov 7, 2026)". */
export function versionLabel(v: AppVersion = APP_VERSION): string {
  const d = builtDate(v);
  return `App version ${versionTag(v)}${d ? ` (built ${d})` : ''}`;
}

/** Validates what came back from version.json. */
export function parseVersion(x: unknown): AppVersion | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.version !== 'string' || typeof o.sha !== 'string' || typeof o.builtAt !== 'string') return null;
  return { version: o.version, sha: o.sha, builtAt: o.builtAt };
}

/**
 * True when the deployed build is a different, newer build than the one running.
 * Dev builds never nag. Same commit + same build time = same build.
 */
export function isNewerBuild(deployed: AppVersion | null, running: AppVersion = APP_VERSION): boolean {
  if (!deployed || running.sha === 'dev' || !running.builtAt) return false;
  if (deployed.sha === running.sha && deployed.builtAt === running.builtAt) return false;
  const a = Date.parse(deployed.builtAt);
  const b = Date.parse(running.builtAt);
  return Number.isFinite(a) && Number.isFinite(b) && a > b;
}

/** How often to look for a new deploy (on focus / when the tab becomes visible). */
export const VERSION_CHECK_MS = 30 * 60_000;

export async function fetchDeployedVersion(fetcher: typeof fetch = fetch): Promise<AppVersion | null> {
  try {
    const res = await fetcher(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return parseVersion(await res.json());
  } catch {
    return null;
  }
}
