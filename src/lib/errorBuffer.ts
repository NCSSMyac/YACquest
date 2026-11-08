/**
 * Keeps the last few error messages in memory (never stored, never sent unless someone
 * presses "Report a problem"). window.onerror + unhandledrejection feed it.
 */
import { scrubText } from './bugContext';

const MAX = 5;
const buffer: string[] = [];

export function recordError(e: unknown) {
  const raw =
    e instanceof Error ? `${e.name}: ${e.message}` : typeof e === 'string' ? e : e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  const msg = scrubText(raw, 300);
  if (!msg) return;
  buffer.push(msg);
  while (buffer.length > MAX) buffer.shift();
}

/** Oldest first, at most 5. */
export const recentErrors = (): string[] => [...buffer];
export const lastError = (): string | undefined => buffer[buffer.length - 1];
export const clearErrors = () => void buffer.splice(0);

let installed = false;
export function installErrorBuffer() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (ev) => recordError(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => recordError(ev.reason));
}
