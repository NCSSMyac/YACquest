/**
 * Per-player "already celebrated" sets for badges and wardrobe unlocks (localStorage, best effort).
 * First load ever (no key yet) marks everything as seen without celebrating, so existing players aren't spammed.
 */
export type SeenKind = 'badges' | 'looks';

const key = (kind: SeenKind, userId: string) => `yacquest-seen-${kind}:${userId}`;

export function readSeen(kind: SeenKind, userId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(key(kind, userId));
    if (raw === null) return null;
    const list = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.map(String) : []);
  } catch {
    return null;
  }
}

export function writeSeen(kind: SeenKind, userId: string, ids: Iterable<string>) {
  try {
    localStorage.setItem(key(kind, userId), JSON.stringify([...new Set(ids)]));
  } catch {
    /* storage unavailable: worst case we celebrate again next time */
  }
}

/**
 * Returns the ids in `current` that are new since last time (in order) and records them as seen.
 * Returns [] on the very first call for this player.
 */
export function takeNew(kind: SeenKind, userId: string, current: string[]): string[] {
  const seen = readSeen(kind, userId);
  if (!seen) {
    writeSeen(kind, userId, current);
    return [];
  }
  const fresh = current.filter((id) => !seen.has(id));
  if (fresh.length) writeSeen(kind, userId, [...seen, ...fresh]);
  return fresh;
}
