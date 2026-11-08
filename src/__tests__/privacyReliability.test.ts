import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/mock';
import { describeAction } from '../lib/actionText';
import { buildBugContext, contextLines, currentTheme, scrubText, shortUserAgent } from '../lib/bugContext';
import { clearErrors, lastError, recentErrors, recordError } from '../lib/errorBuffer';
import {
  __resetOnline, isNetworkErrorMessage, isOnline, reportNetworkFailure, reportNetworkSuccess, setBrowserOnline, subscribeOnline,
} from '../lib/online';
import { builtDate, fetchDeployedVersion, isNewerBuild, parseVersion, versionLabel, versionTag, type AppVersion } from '../lib/version';

const { load, setSession } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);
const userBy = (handle: string) => load().users.find((u) => u.handle === handle);
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);
const NOW = Date.parse('2026-11-07T15:00:00Z');

// ───────────────────────────── app version ─────────────────────────────

describe('app version', () => {
  const v: AppVersion = { version: '0.1.0', sha: 'abc1234', builtAt: '2026-11-07T18:00:00Z' };
  it('labels', () => {
    expect(versionTag(v)).toBe('0.1.0+abc1234');
    expect(builtDate(v)).toBe('Nov 7, 2026');
    expect(versionLabel(v)).toBe('App version 0.1.0+abc1234 (built Nov 7, 2026)');
    expect(versionLabel({ ...v, builtAt: '' })).toBe('App version 0.1.0+abc1234');
  });
  it('newer build detection', () => {
    const later = { version: '0.1.0', sha: 'def5678', builtAt: '2026-11-08T10:00:00Z' };
    expect(isNewerBuild(later, v)).toBe(true);
    expect(isNewerBuild(v, v)).toBe(false);
    expect(isNewerBuild({ ...v, builtAt: '2026-11-06T00:00:00Z', sha: 'old0000' }, v)).toBe(false);
    expect(isNewerBuild(null, v)).toBe(false);
    expect(isNewerBuild(later, { ...v, sha: 'dev' })).toBe(false); // dev builds never nag
  });
  it('parses version.json defensively and fetches without cache', async () => {
    expect(parseVersion({ version: '1', sha: 'a', builtAt: 'b' })).toEqual({ version: '1', sha: 'a', builtAt: 'b' });
    expect(parseVersion({ version: 1 })).toBeNull();
    expect(parseVersion(null)).toBeNull();
    const calls: [string, RequestInit | undefined][] = [];
    const ok = (async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return { ok: true, json: async () => v } as Response;
    }) as unknown as typeof fetch;
    expect(await fetchDeployedVersion(ok)).toEqual(v);
    expect(calls[0][0]).toMatch(/^\.\/version\.json\?t=\d+$/);
    expect(calls[0][1]?.cache).toBe('no-store');
    expect(await fetchDeployedVersion((async () => ({ ok: false }) as Response) as unknown as typeof fetch)).toBeNull();
    expect(await fetchDeployedVersion((async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch)).toBeNull();
  });
});

// ───────────────────────────── offline helper ─────────────────────────────

describe('online / offline', () => {
  afterEach(() => __resetOnline());
  it('a network failure goes offline; a success or the browser coming back goes online again', () => {
    __resetOnline();
    const seen: boolean[] = [];
    subscribeOnline((on) => seen.push(on));
    expect(isOnline()).toBe(true);
    reportNetworkFailure();
    reportNetworkFailure(); // no duplicate event
    expect(isOnline()).toBe(false);
    reportNetworkSuccess();
    expect(isOnline()).toBe(true);
    setBrowserOnline(false);
    reportNetworkSuccess(); // the browser still says offline
    expect(isOnline()).toBe(false);
    reportNetworkFailure();
    setBrowserOnline(true); // back: also clears the failed-call flag
    expect(isOnline()).toBe(true);
    expect(seen).toEqual([false, true, false, true]);
  });
  it('recognizes network error messages from every browser', () => {
    for (const m of ['TypeError: Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'fetch failed', 'The Internet connection appears to be offline.'])
      expect(isNetworkErrorMessage(m), m).toBe(true);
    expect(isNetworkErrorMessage('forbidden: nope')).toBe(false);
  });
});

// ───────────────────────────── report a problem context ─────────────────────────────

describe('bug report context', () => {
  it('scrubs emails, tokens and secret URL parameters', () => {
    expect(scrubText('mail me at zed@example.edu please')).toBe('mail me at [email] please');
    expect(scrubText('/reset?code=abc123&x=1#access_token=eyJa.eyJb.c')).toBe('/reset?code=[hidden]&x=1#access_token=[hidden]');
    expect(scrubText('Bearer eyJhbGciOi.eyJzdWIi.sig')).toBe('Bearer [token]');
    expect(scrubText('a'.repeat(400), 300)).toHaveLength(300);
    expect(scrubText(undefined)).toBe('');
  });
  it('short browser + system names', () => {
    expect(shortUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36')).toBe('Chrome 130 · Android');
    expect(shortUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe('Safari 17 · iOS');
    expect(shortUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0')).toBe('Edge 130 · Windows');
    expect(shortUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:128.0) Gecko/20100101 Firefox/128.0')).toBe('Firefox 128 · macOS');
    expect(shortUserAgent('')).toBe('Unknown browser · Other');
  });
  it('builds the context (route, version, browser, screen, online, theme, time, last 5 errors)', () => {
    const c = buildBugContext({
      route: '/prize?token=secret', trying: '  send info to me@x.org ', version: '0.1.0+abc1234 (Nov 7, 2026)',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile Safari/604.1',
      width: 390, height: 844.4, online: false, theme: 'dark', now: new Date(NOW), errors: ['e1', '', 'e2', 'e3', 'e4', 'e5', 'e6 a@b.co'],
    });
    expect(c).toEqual({
      route: '/prize?token=[hidden]', trying: 'send info to [email]', version: '0.1.0+abc1234 (Nov 7, 2026)', browser: 'Safari 17 · iOS',
      screen: '390×844', online: false, theme: 'dark', time: '2026-11-07T15:00:00.000Z', errors: ['e2', 'e3', 'e4', 'e5', 'e6 [email]'],
    });
    expect(contextLines(c)).toContain('Connection: offline');
    expect(contextLines(c).join('\n')).not.toMatch(/@/);
    expect(currentTheme({ documentElement: { dataset: { theme: 'dark' } } })).toBe('dark');
    expect(currentTheme({ documentElement: { dataset: {} } })).toBe('system');
  });
  it('the error buffer keeps the last 5 messages, scrubbed', () => {
    clearErrors();
    for (let i = 1; i <= 7; i++) recordError(new Error(`boom ${i}`));
    recordError('token=abc for a@b.co');
    expect(recentErrors()).toEqual(['Error: boom 4', 'Error: boom 5', 'Error: boom 6', 'Error: boom 7', 'token=[hidden] for [email]']);
    expect(lastError()).toBe('token=[hidden] for [email]');
    clearErrors();
    expect(recentErrors()).toEqual([]);
  });
});

// ───────────────────────────── mock API: bug reports + delete my account ─────────────────────────────

describe('mock: report a problem', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    await api.resetDemoData();
  });
  afterEach(() => vi.useRealTimers());
  it('stored as a bug with scrubbed context, visible to staff only', async () => {
    asUser('yak001');
    expect(await code(api.submitBugReport('x', {} as never))).toBe('message');
    await api.submitBugReport('Prize page froze', {
      route: '/prize', version: '0.1.0+dev', browser: 'Chrome 130 · Android', screen: '390×844', online: true, theme: 'light',
      time: '2026-11-07T15:00:00Z', errors: ['TypeError at a@b.co', '', 'x'], trying: 'send my info', email: 'yak@x.org',
    } as never);
    expect(await code(api.listFeedback())).toBe('forbidden');
    asUser('admin');
    const item = (await api.listFeedback()).find((f) => f.message === 'Prize page froze')!;
    expect(item.category).toBe('bug');
    expect(item.context).toMatchObject({ route: '/prize', trying: 'send my info', errors: ['TypeError at [email]', 'x'] });
    expect(item.context).not.toHaveProperty('email');
    expect(item.displayName).toBe('Yak001');
  });
});

describe('mock: delete my account', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    await api.resetDemoData();
  });
  afterEach(() => vi.useRealTimers());

  it('wrong username → confirm', async () => {
    asUser('yak001');
    expect(await code(api.deleteMyAccount('yak002'))).toBe('confirm');
    expect(userBy('yak001')).toBeTruthy();
  });

  it('the last YACquest Chair is blocked', async () => {
    load().users.find((u) => u.handle === 'jacob')!.role = 'admin';
    asUser('iesha');
    expect(await code(api.deleteMyAccount('iesha'))).toBe('last_chair');
    expect(userBy('iesha')).toBeTruthy();
    // with a second chair it works
    load().users.find((u) => u.handle === 'jacob')!.role = 'chair';
    await api.deleteMyAccount('iesha');
    expect(userBy('iesha')).toBeUndefined();
  });

  it('a prize on its way blocks; a delivered one stays as an anonymous row', async () => {
    const me = userBy('yak001')!;
    load().claims.push({ spot: 4, userId: me.id, displayName: me.displayName, campus: me.campus, qualifiedAt: new Date(NOW).toISOString(), status: 'info_submitted', reference: 'YAC-1',
      contact: { fullName: 'Yak One', email: 'yak001@example.edu', phone: '919-555-0100', address: '1 Main St' } });
    asUser('yak001');
    expect(await code(api.deleteMyAccount('yak001'))).toBe('prize_pending');
    load().claims.find((c) => c.userId === me.id)!.status = 'fulfilled';
    await api.deleteMyAccount('@YAK001 ');
    const c = load().claims.find((x) => x.spot === 4 && x.status === 'fulfilled')!;
    expect(c).toMatchObject({ userId: '', displayName: 'Deleted account' });
    expect(c.contact).toBeUndefined();
    expect(c.reference).toBeUndefined();
  });

  it('success removes everything that belongs to the account and logs one anonymous line', async () => {
    const me = userBy('yak001')!;
    asUser('admin');
    await api.adjustPoints(me.id, 5, 'Helper bonus');
    asUser('yak001');
    await api.submitFeedback('idea', 'More events please');
    const d = load();
    expect(d.ledger.some((l) => l.userId === me.id)).toBe(true);
    expect(d.actions.some((a) => a.targetName === 'Yak001')).toBe(true);
    await api.deleteMyAccount('yak001');
    const after = load();
    expect(after.users.some((u) => u.id === me.id)).toBe(false);
    for (const k of ['ledger', 'submissions', 'notifications', 'suggestions', 'feedback', 'rsvps'] as const)
      expect((after[k] as { userId: string }[]).some((x) => x.userId === me.id), k).toBe(false);
    expect(after.outbox.some((r) => r.toEmails.includes('yak001@example.edu'))).toBe(false);
    expect(after.actions.some((a) => a.targetName === 'Yak001' || a.actorName === 'Yak001')).toBe(false);
    const last = after.actions[after.actions.length - 1];
    expect(last).toMatchObject({ action: 'account_deleted', targetName: undefined, details: {} });
    expect(describeAction(last)).toBe('An account was deleted');
    expect(await code(api.myLedger())).toBe('unauthenticated'); // signed out
    expect((await api.leaderboard(500)).some((r) => r.userId === me.id)).toBe(false);
  });
});
