// Playing battle cries. One shared player, so a cry keeps going when the
// screen changes (a caught chicken is sent home mid-cry), and cries never
// talk over each other. Chickens without a recording squawk instead.
import { CRY_SECONDS, getCry } from '../api';

let player: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let queue: Promise<void> = Promise.resolve();
const cache = new Map<string, { blob: Blob | null; at: number }>();
const KEEP_MS = 10 * 60_000;

/**
 * Phones only allow sound after the player has touched the page. Called on the
 * first touch, so cries can play later without one.
 */
export function unlockAudio(): void {
  try {
    if (!player) {
      player = new Audio();
      player.preload = 'auto';
      // A silent moment, played inside the touch, wins permission for later sounds.
      player.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
      void player.play().catch(() => {});
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!audioCtx && Ctx) audioCtx = new Ctx();
    void audioCtx?.resume().catch(() => {});
  } catch {
    /* no sound on this device */
  }
}

/** Play a recording through the shared player; resolves when it ends (at most a few seconds). */
export function playBlob(blob: Blob): Promise<void> {
  return new Promise((done) => {
    const p = player ?? (player = new Audio());
    const url = URL.createObjectURL(blob);
    const finish = () => { clearTimeout(timer); p.onended = null; p.onerror = null; URL.revokeObjectURL(url); done(); };
    const timer = window.setTimeout(finish, (CRY_SECONDS + 1) * 1000);
    p.onended = finish;
    p.onerror = finish;
    p.src = url;
    p.play().catch(finish);
  });
}

/** A plain "bawk-bawk" for chickens without a battle cry of their own. */
export function squawk(): Promise<void> {
  const ctx = audioCtx;
  if (!ctx) return Promise.resolve();
  const t0 = ctx.currentTime + 0.02;
  const note = (at: number, from: number, to: number, len: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + len);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + len + 0.02);
  };
  note(t0, 620, 900, 0.12);
  note(t0 + 0.14, 900, 480, 0.22);
  note(t0 + 0.45, 650, 950, 0.12);
  note(t0 + 0.59, 950, 420, 0.3);
  return new Promise((done) => window.setTimeout(done, 950));
}

async function cryOf(uid: string): Promise<Blob | null> {
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.blob;
  const blob = await getCry(uid).catch(() => null);
  cache.set(uid, { blob, at: Date.now() });
  return blob;
}

/** Forget a cached cry (after recording a new one). */
export function forgetCry(uid: string): void {
  cache.delete(uid);
}

/**
 * Let `uid`'s chicken cry out. Cries wait their turn. `onStart` is told when
 * this one actually starts, with roughly how long it lasts.
 */
export function playCry(uid: string, onStart?: (ms: number) => void): Promise<void> {
  const fetching = cryOf(uid);
  queue = queue.then(async () => {
    const blob = await fetching;
    onStart?.(blob ? CRY_SECONDS * 1000 : 1000);
    await (blob ? playBlob(blob) : squawk());
  }).catch(() => {});
  return queue;
}
