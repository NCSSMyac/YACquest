/**
 * "Add to calendar" helpers: a Google Calendar link and an RFC 5545 .ics file.
 * Never include the event password — check-in passwords are announced at the event.
 */
export interface CalEvent {
  id: string;
  title: string;
  location: string;
  startsAt: string;
  endsAt: string;
}

export const CHECKIN_NOTE = 'Check-in password is announced at the event.';

/** 2026-11-08T23:00:00.000Z → 20261108T230000Z */
export function toCalDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function description(siteUrl: string): string {
  return `YACquest event. ${CHECKIN_NOTE}\nCheck in on YACquest: ${siteUrl}`;
}

export function googleCalendarUrl(e: CalEvent, siteUrl: string): string {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${toCalDate(e.startsAt)}/${toCalDate(e.endsAt)}`,
    details: description(siteUrl),
    location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Escape TEXT values per RFC 5545 §3.3.11. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (curLen + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(e: CalEvent, siteUrl: string, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NCSSM YAC//YACquest//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsEscape(e.id)}@yacquest`,
    `DTSTAMP:${toCalDate(now.toISOString())}`,
    `DTSTART:${toCalDate(e.startsAt)}`,
    `DTEND:${toCalDate(e.endsAt)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    `LOCATION:${icsEscape(e.location)}`,
    `DESCRIPTION:${icsEscape(description(siteUrl))}`,
    `URL:${siteUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Safe-ish file name from an event title. */
export function icsFileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${base || 'event'}.ics`;
}

export function downloadIcs(e: CalEvent, siteUrl: string): void {
  const blob = new Blob([buildIcs(e, siteUrl)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = icsFileName(e.title);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
