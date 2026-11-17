// Generative music, synthesised live with WebAudio (no recordings to download).
// Adapted from Wildlife Polaroid's ambient player: a chill loop of soft pads
// and outdoor plucks while you eat or have the yard to yourself, and a fast,
// tense one (racing pulse, ticking, nervous stabs) during standoffs.

const PREF_KEY = 'music-on';
const BASE_GAIN = 0.15;

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Gentle D-major pads, a slow four-chord loop, and a pentatonic for the plucks.
const CHORDS: number[][] = [
  [50, 57, 61, 66], // D  A  C# F#
  [47, 54, 62, 66], // B  F# D  F#
  [43, 55, 59, 66], // G  G  B  F#
  [45, 52, 61, 64], // A  E  C# E
];
const PENTATONIC = [62, 64, 66, 69, 71, 74, 76, 78];

// Standoff: low minor chords with a tritone edge, and a minor scale for the stabs.
const TENSE_CHORDS: number[][] = [
  [38, 45, 50, 53], // D minor
  [38, 44, 50, 53], // D with a flat fifth
  [36, 43, 48, 51], // C minor
  [37, 44, 49, 52], // C# diminished-ish
];
const TENSE_SCALE = [62, 63, 65, 67, 68, 70, 72, 74];

export type MusicMode = 'off' | 'chill' | 'tense';

class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private delay: DelayNode | null = null;
  private chordTimer = 0;
  private pluckTimer = 0;
  private pulseTimer = 0;
  private tickTimer = 0;
  private chordIx = 0;
  private beat = 0;
  private lastT = 0;
  private duckUntil = 0;
  mode: MusicMode = 'off';
  on: boolean;

  constructor() {
    let saved: string | null = null;
    try { saved = localStorage.getItem(PREF_KEY); } catch { /* default on */ }
    this.on = saved !== '0';
  }

  /** Called from the player's first touch: browsers only start sound after one. */
  start(): void {
    if (this.ctx) { void this.ctx.resume().catch(() => {}); return; }
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.bus = ctx.createGain();
      const soften = ctx.createBiquadFilter();
      soften.type = 'lowpass';
      soften.frequency.value = 2600;
      this.bus.connect(this.master).connect(soften).connect(ctx.destination);
      // A touch of echo makes the plucks feel like they are outdoors.
      this.delay = ctx.createDelay(1.5);
      this.delay.delayTime.value = 0.42;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      this.delay.connect(fb).connect(this.delay);
      this.delay.connect(this.bus);
      document.addEventListener('visibilitychange', () => {
        // No music from a phone in a pocket.
        if (document.hidden) void ctx.suspend().catch(() => {});
        else void ctx.resume().catch(() => {});
      });
      this.lastT = performance.now();
      this.level();
      const tick = () => {
        requestAnimationFrame(tick);
        const now = performance.now();
        const dt = Math.min(0.25, (now - this.lastT) / 1000);
        this.lastT = now;
        if (!this.on || this.mode === 'off' || ctx.state !== 'running') return;
        this.step(dt);
      };
      tick();
    } catch {
      this.ctx = null; // no sound on this device: the game plays on in silence
    }
  }

  private step(dt: number): void {
    const tense = this.mode === 'tense';
    this.chordTimer -= dt;
    this.pluckTimer -= dt;
    this.pulseTimer -= dt;
    this.tickTimer -= dt;
    if (this.chordTimer <= 0) {
      this.chordTimer = tense ? 3.2 : 9;
      const set = tense ? TENSE_CHORDS : CHORDS;
      this.chord(set[this.chordIx % set.length], tense);
      this.chordIx += 1;
    }
    if (this.pluckTimer <= 0) {
      if (tense) {
        this.pluckTimer = 0.2 + Math.random() * 0.35;
        this.stab(TENSE_SCALE[Math.floor(Math.random() * TENSE_SCALE.length)]);
      } else {
        this.pluckTimer = 2.2 + Math.random() * 4.5;
        this.pluck(PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)]);
      }
    }
    if (tense && this.pulseTimer <= 0) {
      this.pulseTimer = 0.4; // 150 beats a minute
      this.thump(this.beat % 2 === 0);
      this.beat += 1;
    }
    if (tense && this.tickTimer <= 0) {
      this.tickTimer = 0.2;
      this.tick();
    }
  }

  private chord(notes: number[], tense: boolean): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    for (const n of notes) {
      const osc = ctx.createOscillator();
      osc.type = tense ? 'sawtooth' : Math.random() < 0.5 ? 'sine' : 'triangle';
      osc.frequency.value = midiHz(n);
      osc.detune.value = (Math.random() - 0.5) * (tense ? 22 : 10);
      const g = ctx.createGain();
      const peak = tense ? 0.022 : 0.05;
      const swell = tense ? 0.5 : 3.2;
      const tail = tense ? 3.8 : 10.5;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + swell);
      g.gain.exponentialRampToValueAtTime(0.0001, t + tail);
      osc.connect(g).connect(this.bus!);
      osc.start(t);
      osc.stop(t + tail + 0.5);
    }
  }

  private pluck(note: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = midiHz(note);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(g);
    g.connect(this.bus!);
    g.connect(this.delay!);
    osc.start(t);
    osc.stop(t + 1.7);
  }

  /** A short nervous stab: the standoff's answer to the plucks. */
  private stab(note: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = midiHz(note);
    osc.detune.value = (Math.random() - 0.5) * 14;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.035, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g);
    g.connect(this.bus!);
    g.connect(this.delay!);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  /** The racing pulse under a standoff, accented on every other beat. */
  private thump(accent: boolean): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(accent ? 62 : 52, t);
    osc.frequency.exponentialRampToValueAtTime(36, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(accent ? 0.2 : 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g).connect(this.bus!);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  /** A clock-like tick: filtered noise, very short. */
  private tick(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(hp).connect(g).connect(this.bus!);
    src.start(t);
  }

  /** Fade the music to where it should be: on or off, and quieter under a battle cry. */
  private level(): void {
    if (!this.ctx || !this.master) return;
    const playing = this.on && this.mode !== 'off';
    const ducked = performance.now() < this.duckUntil;
    const target = playing ? BASE_GAIN * (ducked ? 0.25 : 1) : 0;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, playing ? 0.6 : 0.4);
  }

  /** What the yard calls for right now. */
  setMode(mode: MusicMode): void {
    if (this.mode === mode) return;
    const was = this.mode;
    this.mode = mode;
    if (mode !== 'off') {
      // Change straight away rather than waiting out the current loop.
      this.chordTimer = 0.1;
      this.pluckTimer = mode === 'tense' ? 0.3 : 1.5;
      this.pulseTimer = 0.05;
      this.tickTimer = 0.15;
      if (was !== mode) this.chordIx = 0;
    }
    this.level();
  }

  /** Quieten the music for a moment, so a battle cry can be heard. */
  duck(ms: number): void {
    this.duckUntil = performance.now() + ms;
    this.level();
    window.setTimeout(() => this.level(), ms + 50);
  }

  setOn(on: boolean): void {
    this.on = on;
    try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch { /* for this visit only */ }
    this.level();
  }
}

export const music = new Music();

// Lets the browser tests see which music is playing.
if (import.meta.env.DEV) (window as unknown as { __music: Music }).__music = music;
