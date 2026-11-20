/** Home only advertises Brew & Quest / limited reward events at the person's own campus. */
import { describe, expect, it } from 'vitest';
import { homePass, isMyCampusEvent, myCampusEvents, passValidUntil, rewardBanners } from '../lib/rewardEvents';
import { homeTeaser, startsLabel } from '../lib/promo';
import type { CoffeePass, YacEvent } from '../types';

const reward = { itemLabel: 'free coffee', limit: 10, venue: 'Cup of Joe', outfitSet: 'latte_night_scholar', message: 'First quest: meet us at {venue}!', emoji: '☕' };
const mk = (id: string, campus: YacEvent['campus'], startsAt: string, endsAt: string, extra: object = {}) => ({ id, title: `Brew & Quest @ ${id}`, campus, startsAt, endsAt, reward, ...extra });
const evs = [
  mk('ncsu', 'ncsu', '2026-12-02T19:00:00Z', '2026-12-02T21:00:00Z'),
  mk('unc', 'unc', '2026-12-03T19:00:00Z', '2026-12-03T21:00:00Z'),
  mk('duke', 'duke', '2026-12-05T19:00:00Z', '2026-12-05T21:00:00Z'),
];
const now = Date.parse('2026-12-01T12:00:00Z');

describe('isMyCampusEvent / myCampusEvents', () => {
  it('own campus and all-campus events match; other campuses do not', () => {
    expect(isMyCampusEvent({ campus: 'duke' }, 'duke')).toBe(true);
    expect(isMyCampusEvent({ campus: 'all' }, 'duke')).toBe(true);
    expect(isMyCampusEvent({ campus: 'ncsu' }, 'duke')).toBe(false);
    expect(isMyCampusEvent({ campus: 'unc' }, 'ncsu')).toBe(false);
  });
  it('an event with no campus is for everyone', () => {
    expect(isMyCampusEvent({}, 'unc')).toBe(true);
    expect(isMyCampusEvent({ campus: null }, 'unc')).toBe(true);
  });
  it('no campus set (or an unknown one) → show every event', () => {
    expect(isMyCampusEvent({ campus: 'ncsu' }, undefined)).toBe(true);
    expect(isMyCampusEvent({ campus: 'ncsu' }, null)).toBe(true);
    expect(isMyCampusEvent({ campus: 'ncsu' }, '')).toBe(true);
    expect(isMyCampusEvent({ campus: 'ncsu' }, 'mars' as never)).toBe(true);
    expect(myCampusEvents(evs, undefined).map((e) => e.id)).toEqual(['ncsu', 'unc', 'duke']);
    expect(myCampusEvents(null, 'duke')).toEqual([]);
  });
});

describe('Home countdown / live banners', () => {
  it('a Duke person never sees the NC State or UNC banner', () => {
    expect(rewardBanners(evs, 'duke', now).map((e) => e.id)).toEqual(['duke']);
    expect(rewardBanners(evs, 'unc', now).map((e) => e.id)).toEqual(['unc']);
  });
  it('all-campus events show for everyone, live first', () => {
    const list = [...evs, mk('all-live', 'all', '2026-12-01T11:00:00Z', '2026-12-01T14:00:00Z')];
    expect(rewardBanners(list, 'duke', now).map((e) => e.id)).toEqual(['all-live', 'duke']);
    expect(rewardBanners(list, 'ncsu', now).map((e) => e.id)).toEqual(['all-live', 'ncsu']);
  });
  it('no campus → every campus (fallback)', () => {
    expect(rewardBanners(evs, undefined, now).map((e) => e.id)).toEqual(['ncsu', 'unc', 'duke']);
  });
  it('a live event at another campus is not shown either', () => {
    const at = Date.parse('2026-12-02T19:30:00Z');
    expect(rewardBanners(evs, 'unc', at).map((e) => e.id)).toEqual(['unc']);
  });
});

describe('Home mystery teaser', () => {
  it('names my campus event, not the soonest one elsewhere', () => {
    const t = homeTeaser(evs, [], 'unc', now)!;
    expect(t.rsvp?.id).toBe('unc');
    expect(t.startsAt).toBe('2026-12-03T19:00:00Z');
    expect(startsLabel(t.rsvp!.startsAt, Date.parse('2026-12-02T15:00:00Z'))).toBe('starts tomorrow');
    expect(homeTeaser(evs, [], 'duke', now)!.rsvp?.id).toBe('duke');
  });
  it('hidden when only other campuses have a series', () => {
    expect(homeTeaser(evs.slice(0, 2), [], 'duke', now)).toBeNull();
  });
  it('all-campus series is teased to everyone; no campus → soonest anywhere', () => {
    expect(homeTeaser([mk('all', 'all', '2026-12-04T19:00:00Z', '2026-12-04T21:00:00Z')], [], 'duke', now)?.rsvp?.id).toBe('all');
    expect(homeTeaser(evs, [], undefined, now)?.rsvp?.id).toBe('ncsu');
  });
});

describe('earned passes are never filtered by campus', () => {
  it('a Duke person who checked in at NC State still gets their Coffee Pass on Home', () => {
    const pass: CoffeePass = { eventId: 'ncsu', eventTitle: 'Brew & Quest @ Cup of Joe', campus: 'ncsu', passNo: 3, limit: 10, venue: 'Cup of Joe', item: 'free coffee', checkedInAt: '2026-12-02T19:15:00Z', validUntil: passValidUntil('2026-12-02T19:15:00Z') };
    expect(homePass([pass], Date.parse('2026-12-02T19:20:00Z'))?.eventId).toBe('ncsu');
  });
});
