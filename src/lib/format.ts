/** Date-only strings ("2027-05-15") are calendar days, not UTC midnight — read them as local so they don't show a day early. */
export const toDate = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);
export const fmtDate = (iso: string) => toDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const fmtLongDate = (iso: string) => toDate(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** 'YYYY-MM' → 'November' (calendar month name; no time-zone shifts). */
export const monthName = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
};
export const fmtPts = (n: number) => `${n > 0 ? '+' : ''}${n}`;
export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
