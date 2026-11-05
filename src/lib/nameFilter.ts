/**
 * Keeps usernames and display names friendly.
 *
 * The SAME lists and rules live in the database (name_is_clean() in
 * supabase/migrations/0010_name_filter.sql), which is the real gatekeeper.
 * Change both together. Admins can also rename anyone (Admin → Players) if something slips through.
 *
 * How it works:
 *  1. Lower-case and undo common look-alikes (0→o, 1/!→i, 3→e, 4/@→a, 5/$→s, 7→t, 8→b).
 *  2. BLOCK_ANYWHERE: blocked if found anywhere after removing spaces/punctuation ("f.u.c.k", "xXshitXx").
 *     Only words that don't appear inside normal words go here.
 *  3. BLOCK_WORDS: blocked only as a whole word ("ass" blocks "big ass" but not "class" or "Cassie").
 */
export const BLOCK_ANYWHERE = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fagg', 'retard', 'whore', 'slut', 'pussy', 'porn', 'penis',
  'vagina', 'dildo', 'twat', 'wank', 'bastard', 'asshole', 'motherf', 'hitler', 'nazi', 'kkk', 'chink',
  'tranny', 'molest', 'jizz', 'blowjob', 'boner', 'clit', 'cocksuck', 'dumbass', 'jackass', 'bollock',
] as const;

export const BLOCK_WORDS = [
  'ass', 'arse', 'tit', 'tits', 'boob', 'boobs', 'dick', 'dicks', 'cock', 'cum', 'fag', 'fags', 'rape', 'raped',
  'rapist', 'spic', 'kike', 'pedo', 'horny', 'sex', 'sexy', 'nude', 'nudes', 'naked', 'piss', 'damnit', 'hoe', 'hoes',
] as const;

const LOOKALIKES: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', $: 's', '7': 't', '8': 'b' };

const normalize = (text: string) => text.toLowerCase().replace(/[0-9!@$]/g, (c) => LOOKALIKES[c] ?? c);

/** True if the name is OK to show to everyone. */
export function nameIsClean(text: string): boolean {
  const n = normalize(text);
  const squashed = n.replace(/[^a-z]/g, '');
  if (BLOCK_ANYWHERE.some((w) => squashed.includes(w))) return false;
  const words = n.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => (BLOCK_WORDS as readonly string[]).includes(w))) return false;
  return !(BLOCK_WORDS as readonly string[]).includes(squashed);
}

export const NAME_NOT_ALLOWED = 'Please pick a different name — keep it friendly for everyone.';
