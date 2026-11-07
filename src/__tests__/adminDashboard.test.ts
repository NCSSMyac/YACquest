import { describe, expect, it } from 'vitest';
import { GLYPHS } from '../components/PixelGlyph';
import { barPct, eventPhase, greetingFor, greetingName, needsAttention, pickNextEvent } from '../lib/adminDashboard';

describe('greetingFor', () => {
  it('picks the greeting by local hour', () => {
    expect(greetingFor(5)).toBe('Good morning');
    expect(greetingFor(11)).toBe('Good morning');
    expect(greetingFor(12)).toBe('Good afternoon');
    expect(greetingFor(16)).toBe('Good afternoon');
    expect(greetingFor(17)).toBe('Good evening');
    expect(greetingFor(21)).toBe('Good evening');
    expect(greetingFor(22)).toBe('Hello, night owl');
    expect(greetingFor(0)).toBe('Hello, night owl');
    expect(greetingFor(4)).toBe('Hello, night owl');
  });
});

describe('greetingName', () => {
  it('uses the first name', () => {
    expect(greetingName('Iesha L.')).toBe('Iesha');
    expect(greetingName('  Jacob   Rodriguez ')).toBe('Jacob');
    expect(greetingName('Sam')).toBe('Sam');
  });
  it('keeps the whole name when the first word is a short all-caps tag', () => {
    expect(greetingName('YAC Helper')).toBe('YAC Helper');
    expect(greetingName('AJ')).toBe('AJ');
  });
  it('falls back when there is no name', () => {
    expect(greetingName('')).toBe('adventurer');
    expect(greetingName(undefined)).toBe('adventurer');
  });
});

describe('needsAttention', () => {
  it('is empty when everything is handled', () => {
    expect(needsAttention({ isChair: true, pendingReviews: 0, newFeedback: 0, prizesToDeliver: 0, hasHero: true })).toEqual([]);
    expect(needsAttention({ isChair: false })).toEqual([]);
  });
  it('lists reviews then feedback, with counts, links and plurals', () => {
    const t = needsAttention({ isChair: false, pendingReviews: 3, newFeedback: 1 });
    expect(t.map((x) => [x.id, x.count, x.to])).toEqual([
      ['review', 3, '/admin/review'],
      ['feedback', 1, '/admin/feedback'],
    ]);
    expect(t[0].text).toBe('proofs to review');
    expect(t[1].text).toBe('new feedback note');
    expect(needsAttention({ isChair: false, pendingReviews: 1 })[0].text).toBe('proof to review');
  });
  it('never shows chair-only rows to plain admins', () => {
    const t = needsAttention({ isChair: false, pendingReviews: 1, prizesToDeliver: 2, hasHero: false });
    expect(t.map((x) => x.id)).toEqual(['review']);
  });
  it('shows chairs prizes to deliver and a crown nudge when there is no hero', () => {
    const t = needsAttention({ isChair: true, prizesToDeliver: 2, hasHero: false });
    expect(t.map((x) => [x.id, x.to])).toEqual([
      ['prizes', '/admin/prizes'],
      ['hero', '/admin/heroes'],
    ]);
    expect(t[0].text).toBe('prizes ready to deliver');
    // Unknown hero state (still loading) → no nudge yet.
    expect(needsAttention({ isChair: true, hasHero: undefined })).toEqual([]);
  });
  it('uses real glyphs', () => {
    for (const t of needsAttention({ isChair: true, pendingReviews: 1, newFeedback: 1, prizesToDeliver: 1, hasHero: false })) expect(GLYPHS[t.glyph]).toBeDefined();
  });
});

describe('events on the dashboard', () => {
  const H = 3_600_000;
  const now = Date.UTC(2026, 10, 6, 18);
  const ev = (id: string, startH: number, lenH = 2, grace = 60) => ({
    id,
    startsAt: new Date(now + startH * H).toISOString(),
    endsAt: new Date(now + (startH + lenH) * H).toISOString(),
    checkInGraceMinutes: grace,
  });
  it('knows the phase, counting the check-in grace as live', () => {
    expect(eventPhase(ev('a', 1), now)).toBe('Upcoming');
    expect(eventPhase(ev('a', -1), now)).toBe('LIVE');
    expect(eventPhase(ev('a', -2.5, 2, 60), now)).toBe('LIVE');
    expect(eventPhase(ev('a', -3.5, 2, 60), now)).toBe('Past');
  });
  it('features the earliest live event, counting the others', () => {
    const r = pickNextEvent([ev('later', 24), ev('live2', -0.5), ev('live1', -1), ev('past', -48)], now);
    expect(r?.event.id).toBe('live1');
    expect(r?.live).toBe(true);
    expect(r?.othersLive).toBe(1);
  });
  it('otherwise features the soonest upcoming event', () => {
    const r = pickNextEvent([ev('far', 72), ev('soon', 5), ev('past', -48)], now);
    expect(r).toEqual({ event: expect.objectContaining({ id: 'soon' }), live: false, othersLive: 0 });
  });
  it('returns null with nothing upcoming', () => {
    expect(pickNextEvent([ev('past', -48)], now)).toBeNull();
    expect(pickNextEvent(null, now)).toBeNull();
  });
});

describe('barPct', () => {
  it('scales to the max with a small visible minimum', () => {
    expect(barPct(50, 100)).toBe(50);
    expect(barPct(100, 100)).toBe(100);
    expect(barPct(1, 1000)).toBe(4);
    expect(barPct(0, 100)).toBe(0);
    expect(barPct(5, 0)).toBe(0);
    expect(barPct(500, 350)).toBe(100);
  });
});

describe('pixel glyphs', () => {
  it('are at most 16x16 and only use # and +', () => {
    for (const [name, rows] of Object.entries(GLYPHS)) {
      expect(rows.length, name).toBeLessThanOrEqual(16);
      for (const r of rows) expect(r, name).toMatch(/^[ #+]{0,16}$/);
    }
  });
});
