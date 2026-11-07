/** Splits text into plain parts and http(s) links (for notification bodies like the 0026 survey link). Pure. */
export type TextPart = { text: string; href?: string };

const URL_RE = /https?:\/\/[^\s<>"]+/gi;

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
    out.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
