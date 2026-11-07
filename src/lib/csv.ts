/**
 * CSV exports for staff (Who came, Who's going, participants, Stats tables). Built in the browser and
 * downloaded with a Blob, so nothing extra is stored anywhere.
 *
 * Safety: a text cell that starts with = + - @ (or a tab / carriage return) is prefixed with ' so
 * Excel / Sheets show it as text instead of running it as a formula (CSV formula injection).
 * Numbers are written as numbers (−5 stays −5).
 */

export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell: formula-safe, quoted when it holds a quote, comma or line break. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  let v = String(value);
  if (FORMULA_START.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Header row + data rows → CSV text (CRLF line ends, as spreadsheets expect). */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** "Stats Mixer!" + "who-came" → "who-came-stats-mixer-2026-11-06.csv" */
export function csvFilename(what: string, label?: string, day: Date = new Date()): string {
  const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  return [slug(what), label ? slug(label) : '', date].filter(Boolean).join('-') + '.csv';
}

/** Starts a download of `csv` (UTF-8 with a BOM so Excel keeps emoji and accents). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before freeing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "2026-11-06 18:32" in the viewer's time zone (sorts correctly in a spreadsheet). '' for empty input. */
export function csvDateTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
