/**
 * Tiny 8-bit chimes made with WebAudio (no audio files). ON by default; players choose
 * on sign-up and can change it any time in Me → Settings. The AudioContext is created lazily on the first
 * play, which always happens after a tap/click, so browsers allow it.
 */
const KEY = 'yacquest-sound';

export function getSoundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* storage blocked: sound just stays off next visit */
  }
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One square-wave note (or a soft sine for bells). `at` and `len` are seconds from now. */
function note(ac: AudioContext, freq: number, at: number, len: number, vol = 0.08, type: OscillatorType = 'square') {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + len + 0.02);
}

function play(notes: [freq: number, at: number, len: number][]) {
  if (!getSoundOn()) return;
  const ac = audio();
  if (!ac) return;
  try {
    for (const [f, at, len] of notes) note(ac, f, at, len);
  } catch {
    /* never let a sound break the app */
  }
}

/** Classic two-note coin pickup (B5 → E6). */
export function playCoin(): void {
  play([
    [988, 0, 0.08],
    [1319, 0.08, 0.28],
  ]);
}

/** Short level-up fanfare (C–E–G–C, then a held chord-ish C). */
export function playFanfare(): void {
  play([
    [523, 0, 0.1],
    [659, 0.1, 0.1],
    [784, 0.2, 0.1],
    [1047, 0.3, 0.16],
    [784, 0.48, 0.08],
    [1047, 0.56, 0.45],
  ]);
}

/** Gentle "bloop" for calm notices (two soft descending notes: G4 → D4). */
export function playBloop(): void {
  play([
    [392, 0, 0.1],
    [294, 0.11, 0.22],
  ]);
}

/**
 * 0034: a soft café "ding" (coffee reward reveal): two bell-like sine tones with a shimmer partial,
 * like the little bell on a café counter. Synthesized, no audio files; silent when sound is off.
 */
export function playDing(): void {
  if (!getSoundOn()) return;
  const ac = audio();
  if (!ac) return;
  try {
    for (const [f, at, len, vol] of [
      [1318.5, 0, 1.1, 0.07], // E6
      [2637, 0, 0.5, 0.018], // shimmer
      [1760, 0.16, 1.3, 0.06], // A6
      [3520, 0.16, 0.4, 0.012],
    ] as const) note(ac, f, at, len, vol, 'sine');
  } catch {
    /* never let a sound break the app */
  }
}
