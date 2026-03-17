/**
 * NiniMath Brain Lab — Sound Engine
 * Uses Web Audio API only — zero external dependencies.
 * All sounds designed to awaken and energize the mind.
 */

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (muted) return null;
  if (typeof window === "undefined") return null;
  if (!ctx || ctx.state === "closed") {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(value: boolean) {
  muted = value;
}

export function isMuted() {
  return muted;
}

/* ─── Helpers ─────────────────────────────────── */

function osc(
  ac: AudioContext,
  freq: number,
  type: OscillatorType,
  start: number,
  duration: number,
  gainPeak: number,
  dest: AudioNode,
) {
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainPeak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(dest);

  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  o.connect(gain);
  o.start(start);
  o.stop(start + duration + 0.01);
}

function freqOf(note: string): number {
  // A4 = 440 Hz. Returns frequency for names like C5, D#4, Bb3 etc.
  const notes: Record<string, number> = {
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4,
    F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9,
    "A#": 10, Bb: 10, B: 11,
  };
  const match = note.match(/^([A-G]#?b?)(\d)$/);
  if (!match) return 440;
  const semitone = notes[match[1]] ?? 0;
  const octave = parseInt(match[2], 10);
  return 440 * Math.pow(2, (semitone - 9 + (octave - 4) * 12) / 12);
}

/* ─── Correct answer ─────────────────────────── */
// Bright ascending 3-note major chime: C5 → E5 → G5
export function playCorrect() {
  const ac = getCtx();
  if (!ac) return;

  const master = ac.createGain();
  master.gain.setValueAtTime(0.35, ac.currentTime);
  master.connect(ac.destination);

  const notes = ["C5", "E5", "G5"];
  notes.forEach((note, i) => {
    osc(ac, freqOf(note), "triangle", ac.currentTime + i * 0.06, 0.35, 0.9, master);
    // Add a shimmer overtone
    osc(ac, freqOf(note) * 2, "sine", ac.currentTime + i * 0.06, 0.18, 0.15, master);
  });
}

/* ─── Wrong answer ───────────────────────────── */
// Descending dissonant buzz: Bb3 → F#3, square wave with a thud
export function playWrong() {
  const ac = getCtx();
  if (!ac) return;

  const master = ac.createGain();
  master.gain.setValueAtTime(0.28, ac.currentTime);
  master.connect(ac.destination);

  // Low thud hit
  osc(ac, 120, "sine", ac.currentTime, 0.12, 1, master);

  // Descending buzz
  const buzz = ac.createOscillator();
  buzz.type = "square";
  buzz.frequency.setValueAtTime(freqOf("Bb3"), ac.currentTime + 0.02);
  buzz.frequency.exponentialRampToValueAtTime(freqOf("F#3"), ac.currentTime + 0.2);

  const buzzGain = ac.createGain();
  buzzGain.gain.setValueAtTime(0, ac.currentTime + 0.02);
  buzzGain.gain.linearRampToValueAtTime(0.22, ac.currentTime + 0.04);
  buzzGain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.28);

  buzz.connect(buzzGain);
  buzzGain.connect(master);
  buzz.start(ac.currentTime + 0.02);
  buzz.stop(ac.currentTime + 0.30);
}

/* ─── Score tick (single tick, call repeatedly) ─ */
// Ultra-short bright ping: very high C7 — like a cash register
export function playScoreTick() {
  const ac = getCtx();
  if (!ac) return;

  const master = ac.createGain();
  master.gain.setValueAtTime(0.18, ac.currentTime);
  master.connect(ac.destination);

  osc(ac, freqOf("C7"), "sine", ac.currentTime, 0.06, 1, master);
  osc(ac, freqOf("G6"), "triangle", ac.currentTime, 0.05, 0.4, master);
}

/* ─── Round end fanfare ──────────────────────── */
// Triumphant ascending V→I resolution: G4→B4→D5→G5
export function playRoundEnd(isHighScore: boolean) {
  const ac = getCtx();
  if (!ac) return;

  const master = ac.createGain();
  master.gain.setValueAtTime(0.3, ac.currentTime);
  master.connect(ac.destination);

  const chord = isHighScore
    ? ["C4", "E4", "G4", "C5", "E5"] // Bright major C chord fanfare
    : ["G3", "B3", "D4", "G4"];       // Standard ending chord

  chord.forEach((note, i) => {
    osc(ac, freqOf(note), "triangle", ac.currentTime + i * 0.08, 0.6 - i * 0.05, 0.8, master);
    osc(ac, freqOf(note) * 2, "sine", ac.currentTime + i * 0.08, 0.3, 0.12, master);
  });
}

/* ─── Streak milestone ───────────────────────── */
// Short upward trill for 5-streak, 10-streak etc.
export function playStreak(streakCount: number) {
  const ac = getCtx();
  if (!ac) return;
  if (streakCount < 3) return;

  const master = ac.createGain();
  master.gain.setValueAtTime(0.25, ac.currentTime);
  master.connect(ac.destination);

  // Scale up the excitement with higher notes as streak grows
  const baseFreq = Math.min(freqOf("D5") * Math.pow(1.02, streakCount), freqOf("D6"));
  osc(ac, baseFreq, "triangle", ac.currentTime, 0.15, 1, master);
  osc(ac, baseFreq * 1.5, "sine", ac.currentTime + 0.06, 0.12, 0.5, master);
}
