/**
 * 0032 personalization: fill-ins, greeting, campus puns (TS ↔ SQL), per-recipient rendering + escaping,
 * unknown-token detection. Fixed dates. The database side is tested in supabase/tests/tests.sql (section 0032)
 * with the same expected values.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAMPUS_PUNS, campusPun, punSeed } from '../lib/campusPuns';
import {
  FILL_INS, fillValues, firstName, greetingLine, nextEventFill, nextStopFill, renderFillIns, unknownFillIns, usedFillIns,
} from '../lib/emailFill';
import { announcementEmail, emailLayout, linkifyEscaped, renderForRecipient } from '../lib/emailRender';
import { announcementError } from '../lib/validate';

const SQL = readFileSync(resolve(__dirname, '../../supabase/migrations/0032_email_personalization_tracking.sql'), 'utf8');

/** The text[] literal for one campus inside public.campus_puns() in 0032, unescaped ('' → '). */
function sqlPuns(campus: string): string[] {
  const fn = SQL.slice(SQL.indexOf('create or replace function public.campus_puns(p_campus text)'));
  const m = fn.match(new RegExp(`when '${campus}' then array\\[([\\s\\S]*?)\\]::text\\[\\]`));
  if (!m) throw new Error(`campus_puns(${campus}) not found`);
  return [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"));
}

describe('campus puns', () => {
  it('TS list and SQL list (0032) are identical, same order, 4 per campus', () => {
    for (const c of ['duke', 'unc', 'ncsu'] as const) {
      expect(sqlPuns(c)).toEqual([...CAMPUS_PUNS[c]]);
      expect(CAMPUS_PUNS[c]).toHaveLength(4);
      expect(new Set(CAMPUS_PUNS[c]).size).toBe(4);
      for (const p of CAMPUS_PUNS[c]) expect(p.length).toBeLessThanOrEqual(60);
    }
    expect(CAMPUS_PUNS.duke[0]).toBe("Bet they don't teach you that at Duke 😈");
    expect(CAMPUS_PUNS.unc).toContain('Heel yeah, see you there!');
    expect(CAMPUS_PUNS.ncsu).toContain('Howl about joining us?');
  });

  it('is deterministic per send key, with the same numbers as the database test', () => {
    expect(punSeed('abc')).toBe(294); // SQL: email_seed('abc') = 294
    expect(campusPun('unc', 'abc')).toBe('Carolina blue skies ahead 💙');
    expect(campusPun('duke', 0)).toBe("Bet they don't teach you that at Duke 😈");
    expect(campusPun('ncsu', 5)).toBe('Howl about joining us?');
    expect(campusPun('unc', 'announcement:1')).toBe(campusPun('unc', 'announcement:1'));
    expect(campusPun('mars', 1)).toBe('See you at the next YAC event!');
    // it rotates between sends
    const lines = new Set(['announcement:a', 'announcement:b', 'announcement:c', 'announcement:d'].map((k) => campusPun('duke', k)));
    expect(lines.size).toBeGreaterThan(1);
  });
});

describe('fill-ins', () => {
  it('first name = first word of the display name; greeting falls back to "Hi there,"', () => {
    expect(firstName('  Alice   A. ')).toBe('Alice');
    expect(firstName('   ')).toBeNull();
    expect(greetingLine('Ava B.')).toBe('Hi Ava,');
    expect(greetingLine('')).toBe('Hi there,');
    expect(greetingLine(undefined)).toBe('Hi there,');
  });

  it('next map stop and next event match the SQL helpers', () => {
    expect(nextStopFill(0, 350)).toBe('Trailhead (50 pts)');
    expect(nextStopFill(120, 350)).toBe('Halfway (175 pts)');
    expect(nextStopFill(250, 350)).toBe('the treasure (350 pts)');
    expect(nextStopFill(400, 350)).toBe('the treasure (you made it!)');
    const events = [
      { title: 'Pickleball Social', campus: 'all' as const, startsAt: '2035-01-04T23:00:00Z' },
      { title: 'UNC Only', campus: 'unc' as const, startsAt: '2035-01-02T23:00:00Z' },
      { title: 'Past', campus: 'all' as const, startsAt: '2030-01-01T00:00:00Z' },
    ];
    const now = new Date('2035-01-01T17:00:00Z');
    expect(nextEventFill(events, 'duke', now)).toBe('Pickleball Social (Thu, Jan 4)'); // same as the DB test
    expect(nextEventFill(events, 'unc', now)).toBe('UNC Only (Tue, Jan 2)');
    expect(nextEventFill(events, 'duke', new Date('2040-01-01T00:00:00Z'))).toBe('the next YAC event');
  });

  it('fills every token, escapes values only in HTML, leaves unknown tokens as typed', () => {
    const v = fillValues({ displayName: 'Ali&<b>', campus: 'duke', points: 120, friendCode: 'YAC-AB12' }, { goal: 350, seedKey: 'k', events: [] });
    expect(v).toMatchObject({ first_name: 'Ali&<b>', name: 'Ali&<b>', campus: 'Duke', points: '120', points_to_goal: '230', next_stop: 'Halfway (175 pts)', next_event: 'the next YAC event', friend_code: 'YAC-AB12' });
    expect(v.campus_pun).toBe(campusPun('duke', 'k'));
    expect(renderFillIns('Hi {first_name}! {nope} {campus}', v, { html: true })).toBe('Hi Ali&amp;&lt;b&gt;! {nope} Duke'); // same as the DB test
    expect(renderFillIns('Hi {first_name}!', v)).toBe('Hi Ali&<b>!');
    expect(fillValues({}, { goal: 350 })).toMatchObject({ first_name: 'friend', campus: 'your campus', points_to_goal: '350' });
    expect(fillValues({ points: 500 }, { goal: 350 }).points_to_goal).toBe('0');
  });

  it('flags unknown tokens (typos + template leftovers) and lists the fill-ins in the Insert menu', () => {
    expect(unknownFillIns('{first_name} {event} {frist_name} {event} {points}')).toEqual(['event', 'frist_name']);
    expect(unknownFillIns('No tokens {} { x } here')).toEqual([]);
    expect(usedFillIns('{points} and {first_name} {points}')).toEqual(['points', 'first_name']);
    expect(FILL_INS.map((f) => f.token)).toEqual(['first_name', 'name', 'campus', 'campus_pun', 'points', 'points_to_goal', 'next_stop', 'next_event', 'friend_code']);
    // same token list as the database
    const sqlTokens = SQL.match(/email_fill_tokens\(\)\s*returns text\[\][\s\S]*?array\[([^\]]*)\]/)![1].match(/'([a-z_]+)'/g)!.map((x) => x.slice(1, -1));
    expect(sqlTokens).toEqual(FILL_INS.map((f) => f.token));
  });

  it('announcements with unknown tokens are refused before sending (code fill_in, same as the server)', () => {
    expect(announcementError({ title: 'Hello {event}', body: 'Hi {first_name}', audience: 'all', sendEmail: true })).toMatchObject({ code: 'fill_in' });
    expect(announcementError({ title: 'Hello {first_name}', body: 'You have {points} points. {campus_pun}', audience: 'all', sendEmail: true })).toBeNull();
  });
});

describe('per-recipient rendering (mirror of email_expand_outbox)', () => {
  const ann = announcementEmail('Points check, {first_name}', 'You have {points} points. {campus_pun} RSVP: https://example.com/rsvp?x=1&y=2.', 'Iesha L.');
  const person = { displayName: 'Ali&<b>', campus: 'duke' as const, points: 120, friendCode: 'YAC-AB12' };

  it('greets by first name, fills tokens, escapes the name in HTML, adds the unsubscribe footer', () => {
    const r = renderForRecipient({ kind: 'announcement', ...ann, campaignId: 'announcement:1' }, person, { unsubToken: 'a'.repeat(32), goal: 350 });
    expect(r.subject).toBe('YACquest: Points check, Ali&<b>');
    expect(r.text.startsWith('Hi Ali&<b>,\n\nYou have 120 points. ')).toBe(true);
    expect(r.text).toContain(campusPun('duke', 'announcement:1'));
    expect(r.text).toContain("You're getting this because you have YACquest emails on.\nUnsubscribe in one click: https://ncssmyac.github.io/YACquest/#/unsubscribe?t=" + 'a'.repeat(32));
    expect(r.html).toContain('<p style="margin:0 0 12px;font-size:16px;">Hi Ali&amp;&lt;b&gt;,</p>');
    expect(r.html).not.toContain('Ali&<b>');
    expect(r.html).not.toMatch(/\{[a-z_]+\}/);
    expect(r.html).toContain(`href="https://ncssmyac.github.io/YACquest/#/unsubscribe?t=${'a'.repeat(32)}" style="color:#0b2a5b;">Unsubscribe in one click</a> · Manage in the app (Me → Settings)<br>YACquest · NCSSM Young Alumni Council`);
    expect(r.html).toContain('<a href="https://example.com/rsvp?x=1&amp;y=2" style="color:#0b2a5b;">https://example.com/rsvp?x=1&amp;y=2</a>.');
    expect(r.html).not.toContain('<!--yac:');
  });

  it('staff emails: no greeting, "Manage these in Admin → System", no unsubscribe link', () => {
    const r = renderForRecipient({ kind: 'weekly_report', subject: 'YACquest weekly report', text: 'Report', html: emailLayout('Weekly', '<p>r</p>'), campaignId: 'weekly_report:x' }, null);
    expect(r.text).toBe('Report\n\n—\nYACquest · NCSSM Young Alumni Council. Manage these in Admin → System.');
    expect(r.html).toContain('Manage these in Admin → System.');
    expect(r.html).not.toContain('Unsubscribe');
    expect(r.html).not.toContain('Hi ');
  });

  it('the event thank-you signs off with a campus pun; old footers are replaced', () => {
    const html = emailLayout('Thanks for coming to Old Thing!', '<p>Thanks!</p><p style="font-size:12px;color:#4a5672;margin:0">You get this because you have email updates on in YACquest (turn them off in Me → Settings).</p>');
    const r = renderForRecipient({ kind: 'event_followup', subject: 'Thanks for coming to Old Thing!', text: 'Thanks!\n\nYou get this because you have email updates on in YACquest (turn them off in Me → Settings).', html, campaignId: 'event_followup:e3' }, person, { unsubToken: 'b'.repeat(32) });
    expect(r.html).toContain(`<p style="margin:14px 0 0;color:#4a5672;font-style:italic;">${campusPun('duke', 'event_followup:e3').replace(/'/g, '&#39;')}</p>`);
    expect(r.text).not.toContain('You get this because');
    expect(r.html).not.toContain('You get this because');
    expect(r.text.startsWith('Hi Ali&<b>,')).toBe(true);
  });

  it('linkify leaves trailing punctuation outside the link', () => {
    expect(linkifyEscaped('See https://a.example/x, then https://b.example).')).toBe(
      'See <a href="https://a.example/x" style="color:#0b2a5b;">https://a.example/x</a>, then <a href="https://b.example" style="color:#0b2a5b;">https://b.example</a>).',
    );
  });

  it('the TS layout has the same markers and footer text as public.email_layout', () => {
    for (const m of ['<!--yac:greeting-->', '<!--yac:signoff-->', '<!--yac:footer-->', '<!--/yac:footer-->']) {
      expect(emailLayout('t', 'x')).toContain(m);
      expect(SQL).toContain(m);
    }
    expect(SQL).toContain("You''re getting this because you have YACquest emails on.");
    expect(SQL).toContain('Manage in the app (Me → Settings)<br>YACquest · NCSSM Young Alumni Council');
  });
});

describe('Supabase Auth email templates (docs/email-templates)', () => {
  const dir = resolve(__dirname, '../../docs/email-templates');
  it('plain subjects without emoji, one button + the plain link, the "why you got this" line', () => {
    for (const f of ['confirm-signup.html', 'reset-password.html', 'magic-link.html', 'change-email.html']) {
      const html = readFileSync(resolve(dir, f), 'utf8');
      const subject = html.match(/Subject: ([^>]*?) -->/)![1];
      expect(subject, f).toMatch(/^[ -~]+$/); // plain ASCII: no emoji
      expect(subject).toContain('YACquest');
      expect(html.match(/\{\{ \.ConfirmationURL \}\}/g)!.length).toBeGreaterThanOrEqual(3); // button + link text + href
      expect(html).toMatch(/You're getting this because (you signed up for|you have|someone asked)/);
      expect(html).toContain('YACquest · NCSSM Young Alumni Council');
    }
    expect(readFileSync(resolve(dir, 'confirm-signup.html'), 'utf8')).toContain("You're getting this because you signed up for YACquest, the NCSSM Young Alumni Council app.");
  });
});
