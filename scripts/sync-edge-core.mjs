#!/usr/bin/env node
/**
 * Copies supabase/functions/_shared/emailCore.ts into both Edge Functions, between the
 * "BEGIN emailCore" / "END emailCore" marker lines. Supabase's dashboard editor deploys ONE pasted
 * file per function, so each index.ts must be self-contained. Run after editing emailCore.ts:
 *
 *   node scripts/sync-edge-core.mjs          # rewrite the copies
 *   node scripts/sync-edge-core.mjs --check  # exit 1 if a copy is out of date (vitest checks this too)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const core = readFileSync(resolve(root, 'supabase/functions/_shared/emailCore.ts'), 'utf8').trimEnd();
const BEGIN = '// ════ BEGIN emailCore (copied from supabase/functions/_shared/emailCore.ts — edit it there, then run node scripts/sync-edge-core.mjs) ════';
const END = '// ════ END emailCore ════';
const targets = ['supabase/functions/send-emails/index.ts', 'supabase/functions/email-track/index.ts'];
const check = process.argv.includes('--check');
let stale = 0;

for (const rel of targets) {
  const file = resolve(root, rel);
  const src = readFileSync(file, 'utf8');
  const a = src.indexOf(BEGIN);
  const b = src.indexOf(END);
  if (a < 0 || b < a) throw new Error(`${rel}: emailCore markers not found`);
  const next = src.slice(0, a + BEGIN.length) + '\n' + core + '\n' + src.slice(b);
  if (next !== src) {
    stale++;
    if (!check) writeFileSync(file, next);
    console.log(`${check ? 'out of date' : 'updated'}: ${rel}`);
  }
}
if (check && stale) process.exit(1);
