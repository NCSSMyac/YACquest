/**
 * Splits text into plain parts and links (for notification bodies like the 0026 survey link). Pure.
 *  - http(s) links → `href` (open in a new tab)
 *  - 0030: in-app survey links `#/survey/<event id>` → `to` (a router path, shown as a button)
 */
export type TextPart = { text: string; href?: string; to?: string };

const URL_RE = /https?:\/\/[^\s<>"]+|#\/survey\/[A-Za-z0-9_-]+/gi;

export function linkParts(text: string): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    // A sentence ending right after the link isn't part of it.
    const trail = /[.,!?;:)\]’”]+$/.exec(url)?.[0] ?? '';
    if (trail) url = url.slice(0, -trail.length);
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push(url.startsWith('#/') ? { text: url, to: url.slice(1) } : { text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
