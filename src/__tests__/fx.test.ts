import { describe, expect, it } from 'vitest';
import { buildIcs, googleCalendarUrl, icsEscape, icsFileName, toCalDate } from '../lib/calendar';
import { CHECKPOINTS, checkpointsCrossed, nextCheckpoint, pointAt } from '../components/TreasureMap';
import { PRIZE } from '../config';
import { getSoundOn, setSoundOn } from '../lib/sound';

const ev = {
  id: 'ev_1',
  title: 'Trivia Night; Duke, UNC & NC State',
  location: 'Bull City Tap, Durham\nUpstairs',
  startsAt: '2026-11-08T23:00:00.000Z',
  endsAt: '2026-11-09T01:30:00.000Z',
  password: 'SECRET-PW',
};
const SITE = 'https://example.org/yacquest/';

describe('calendar', () => {
  it('formats UTC dates', () => {
    expect(toCalDate('2026-11-08T18:00:00-05:00')).toBe('20261108T230000Z');
  });

  it('builds a Google Calendar link without the password', () => {
    const url = new URL(googleCalendarUrl(ev, SITE));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe(ev.title);
    expect(url.searchParams.get('dates')).toBe('20261108T230000Z/20261109T013000Z');
    expect(url.searchParams.get('location')).toBe(ev.location);
    expect(url.searchParams.get('details')).toContain('Check-in password is announced at the event.');
    expect(url.toString()).not.toContain('SECRET');
  });

  it('escapes ICS text', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('builds a valid VEVENT with CRLF line endings', () => {
    const ics = buildIcs(ev, SITE, new Date('2026-11-01T12:00:00Z'));
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/\n|\r/);
    const unfolded = ics.replace(/\r\n /g, '');
    const lines = unfolded.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('BEGIN:VEVENT');
    expect(lines).toContain('UID:ev_1@yacquest');
    expect(lines).toContain('DTSTAMP:20261101T120000Z');
    expect(lines).toContain('DTSTART:20261108T230000Z');
    expect(lines).toContain('DTEND:20261109T013000Z');
    expect(lines).toContain('SUMMARY:Trivia Night\\; Duke\\, UNC & NC State');
    expect(lines).toContain('LOCATION:Bull City Tap\\, Durham\\nUpstairs');
    expect(unfolded).toContain('Check-in password is announced at the event.');
    expect(unfolded).toContain(SITE);
    expect(ics).not.toContain('SECRET');
    for (const l of ics.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });

  it('makes a file name', () => {
    expect(icsFileName('Trivia: Night / 2')).toBe('Trivia Night 2.ics');
    expect(icsFileName('???')).toBe('event.ics');
  });
});

describe('treasure map', () => {
  it('finds crossed checkpoints', () => {
    expect(checkpointsCrossed(0, 40)).toEqual([]);
    expect(checkpointsCrossed(90, 100).map((c) => c.label)).toEqual(['Camp']);
    expect(checkpointsCrossed(40, 260).map((c) => c.label)).toEqual(['Trailhead', 'Camp', 'Halfway', 'Summit']);
    expect(checkpointsCrossed(300, 400).map((c) => c.label)).toEqual(['Treasure']);
    expect(checkpointsCrossed(100, 100)).toEqual([]);
  });

  it('knows the next checkpoint', () => {
    expect(nextCheckpoint(20)?.label).toBe('Trailhead');
    expect(nextCheckpoint(100)?.label).toBe('Halfway');
    expect(nextCheckpoint(300)?.points).toBe(350);
    expect(nextCheckpoint(300)?.label).toBe('the treasure');
    expect(nextCheckpoint(400)).toBeUndefined();
    expect(CHECKPOINTS.map((c) => c.points)).toEqual([50, 100, 175, 250]);
    expect(CHECKPOINTS.every((c) => c.points < PRIZE.goal)).toBe(true);
  });

  it('clamps positions to the path', () => {
    expect(pointAt(-1)).toEqual(pointAt(0));
    expect(pointAt(2)).toEqual(pointAt(1));
    expect(pointAt(NaN)).toEqual(pointAt(0));
  });
});

describe('sound setting', () => {
  it('is on by default and survives missing localStorage', () => {
    expect(getSoundOn()).toBe(true);
    expect(() => setSoundOn(true)).not.toThrow();
  });
});
