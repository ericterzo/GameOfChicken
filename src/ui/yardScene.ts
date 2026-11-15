// Draws the chicken yard: sky and hills, a picket fence, the coop, a packed-dirt
// yard with its props, the feed pile in the middle and whichever chickens are
// in the yard right now. Everything is deterministic, so redraws never flicker.
import type { Look } from '../game/rules.ts';
import { chickenParts } from './chicken.ts';
import { esc } from './dom.ts';

const INK = '#4a3423';

export interface SceneChicken {
  look: Look;
  name: string;
  /** 0 (chick) … 1 (as big as the yard allows) */
  size: number;
  eating: boolean;
  me: boolean;
}

export interface SceneOptions {
  /** Feed pile, 1 = full, 0 = gone. */
  pile: number;
  chickens: SceneChicken[];
  /** The viewer's clock (ms). Decides day, night, and where the sun or moon is. Defaults to now. */
  time?: number;
  /** The yard's sleep hours are on right now: coop shut, chickens inside, Zs rising. */
  asleep?: boolean;
  /** The small friendly yard on the home screen. */
  cosy?: boolean;
}

// Where the pile sits, and the standing spots around it: [x offset, y offset].
const PX = 206;
const PY = 214;
const SPOTS: [number, number][] = [
  [-96, 6], [96, 6], [-152, 30], [152, 30], [-60, 50], [60, 50],
  [-132, -24], [132, -24], [-178, 0], [178, 0], [-20, 62], [20, 62],
];

/** Small seeded random generator, so scattered details land in the same place every time. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f1 = (n: number) => n.toFixed(1);
// The coop is drawn at full size and then tucked into the corner, clear of the chickens.
const COOP_T = 'translate(-6 24) scale(0.84)';

const DEFS = `<defs>
  <linearGradient id="ys-sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#7ec8f2"/><stop offset="0.7" stop-color="#cfeefb"/><stop offset="1" stop-color="#fdf3d4"/>
  </linearGradient>
  <linearGradient id="ys-night" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0f1838"/><stop offset="1" stop-color="#2f4273"/>
  </linearGradient>
  <radialGradient id="ys-glow"><stop offset="0" stop-color="#fff6c2" stop-opacity="0.9"/><stop offset="1" stop-color="#fff6c2" stop-opacity="0"/></radialGradient>
  <linearGradient id="ys-hill-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b6e09c"/><stop offset="1" stop-color="#9bd183"/></linearGradient>
  <linearGradient id="ys-hill-near" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93cf78"/><stop offset="1" stop-color="#78bb5f"/></linearGradient>
  <linearGradient id="ys-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc061"/><stop offset="1" stop-color="#69ad52"/></linearGradient>
  <linearGradient id="ys-dirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6c999"/><stop offset="1" stop-color="#cfa670"/></linearGradient>
  <radialGradient id="ys-dirt-light"><stop offset="0" stop-color="#f3dfb8" stop-opacity="0.95"/><stop offset="1" stop-color="#f3dfb8" stop-opacity="0"/></radialGradient>
  <linearGradient id="ys-wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e6bd86"/><stop offset="0.55" stop-color="#d4a469"/><stop offset="1" stop-color="#b98850"/></linearGradient>
  <linearGradient id="ys-coop" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9634a"/><stop offset="1" stop-color="#b8472f"/></linearGradient>
  <linearGradient id="ys-roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5636"/><stop offset="1" stop-color="#633a22"/></linearGradient>
  <radialGradient id="ys-pile" cx="0.38" cy="0.22" r="0.95">
    <stop offset="0" stop-color="#fff0a6"/><stop offset="0.45" stop-color="#f4c94a"/><stop offset="1" stop-color="#d2931c"/>
  </radialGradient>
  <linearGradient id="ys-pile-shade" x1="0" y1="0" x2="1" y2="0.3">
    <stop offset="0.45" stop-color="#8a4f00" stop-opacity="0"/><stop offset="1" stop-color="#8a4f00" stop-opacity="0.38"/>
  </linearGradient>
  <linearGradient id="ys-hay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1d577"/><stop offset="1" stop-color="#d9b048"/></linearGradient>
  <linearGradient id="ys-metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c3d0d8"/><stop offset="1" stop-color="#8b9ca8"/></linearGradient>
  <clipPath id="ys-pile-clip"><path d="${moundPath()}"/></clipPath>
</defs>`;

function moundPath(): string {
  return 'M-78 3 C-72 -20 -54 -48 -32 -60 C-24 -73 -8 -83 8 -80 C26 -77 40 -60 50 -45 C62 -32 73 -14 78 3 C44 19 -44 19 -78 3 z';
}

// ---------- backdrop ----------

const TREES: [number, number, number][] = [[118, 80, 0.9], [134, 86, 0.7], [252, 74, 1], [356, 80, 0.8], [30, 92, 0.75]];
const FAR_HILL = 'M0 112 Q70 60 150 100 Q232 58 312 96 Q360 76 400 92';

function tree(x: number, y: number, s: number): string {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-1.5" y="0" width="3" height="9" fill="#7a5533"/>
    <circle cx="0" cy="-4" r="9" fill="#5ea552"/><circle cx="-5" cy="0" r="6" fill="#5ea552"/><circle cx="5" cy="0" r="6" fill="#55994a"/>
    <circle cx="-3" cy="-7" r="4" fill="#79bd68"/></g>`;
}

function treeOutline(x: number, y: number, s: number): string {
  return `<circle cx="${x}" cy="${f1(y - 4 * s)}" r="${f1(9.5 * s)}"/><circle cx="${f1(x - 5 * s)}" cy="${y}" r="${f1(6.5 * s)}"/><circle cx="${f1(x + 5 * s)}" cy="${y}" r="${f1(6.5 * s)}"/>`;
}

// "ys-land" is everything below the skyline: the part of the picture that goes dark at night.
const SKY_DEFS = `<defs>
  <linearGradient id="ys-dusk" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#6a4a9c" stop-opacity="0.5"/><stop offset="0.55" stop-color="#ff8f5a" stop-opacity="0.8"/><stop offset="1" stop-color="#ffd27a"/>
  </linearGradient>
  <mask id="ys-crescent"><circle r="15" fill="#fff"/><circle cx="-7" cy="-5" r="13" fill="#000"/></mask>
  <clipPath id="ys-land"><path d="${FAR_HILL} V300 H0 z"/>${TREES.map((t) => treeOutline(...t)).join('')}</clipPath>
</defs>`;

/**
 * How light it is: 0 at night, 1 in daytime. Sunrise always fades in between
 * 7 and 8 in the morning, sunset fades out between 7 and 8 in the evening.
 */
export function daylight(hour: number): number {
  const lin = hour < 7 ? 0 : hour < 8 ? hour - 7 : hour < 19 ? 1 : hour < 20 ? 20 - hour : 0;
  return lin * lin * (3 - 2 * lin);
}

/** Keeps the drifting clouds in step with the clock across redraws. Set as --scene-t on the scene's container. */
export function sceneClock(now: number): string {
  return `${((now / 1000) % 840).toFixed(2)}s`;
}

function hourOf(time: number): number {
  const d = new Date(time);
  return d.getHours() + d.getMinutes() / 60;
}

function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const k = Math.max(0, Math.min(1, t));
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * k).toString(16).padStart(2, '0')).join('')}`;
}

/** A point on the arc the sun and moon follow: 0 rising on the left, 1 setting on the right. */
function arc(p: number): [number, number] {
  return [20 + 360 * p, 118 - Math.sin(Math.PI * p) * 96];
}

const CLOUD_SECONDS = [140, 210, 280, 420];

function cloud(i: number, x: number, y: number, s: number, light: number): string {
  // Each cloud drifts from off the left edge to off the right, at its own pace.
  const style = `--from:${-(x + 60)}px;--to:${460 - x}px;animation-duration:${CLOUD_SECONDS[i % 4]}s;animation-delay:calc(var(--scene-t, 0s) * -1 - ${i * 53}s)`;
  return `<g class="cloud" style="${style}"><g transform="translate(${x} ${y}) scale(${s})" fill="${mix('#55638f', '#ffffff', light)}" fill-opacity="${(0.6 + 0.32 * light).toFixed(2)}">
    <ellipse cx="0" cy="0" rx="22" ry="8"/><ellipse cx="-9" cy="-6" rx="11" ry="8"/><ellipse cx="7" cy="-8" rx="13" ry="10"/></g></g>`;
}

function sky(hour: number, light: number): string {
  const r = rng(7);
  let stars = '';
  for (let i = 0; i < 34; i++) {
    stars += `<circle cx="${f1(r() * 400)}" cy="${f1(r() * 96)}" r="${f1(0.5 + r() * 1.1)}" fill="#fff" fill-opacity="${f1(0.5 + r() * 0.5)}"/>`;
  }
  const glow = 4 * light * (1 - light); // strongest halfway through sunrise or sunset
  let sun = '';
  if (hour >= 7 && hour <= 20) {
    const p = (hour - 7) / 13;
    const [x, y] = arc(p);
    const low = Math.pow(1 - Math.sin(Math.PI * p), 3); // 1 on the horizon, 0 overhead
    sun = `<g transform="translate(${f1(x)} ${f1(y)})"><circle r="${f1(40 + 14 * low)}" fill="url(#ys-glow)"/>
      <circle r="17" fill="${mix('#ffe27a', '#ff9440', low)}"/><circle r="13" fill="${mix('#fff0a6', '#ffbf63', low)}"/></g>`;
  }
  let moon = '';
  const mp = ((hour - 19.5 + 24) % 24) / 12; // rises 19:30, sets 07:30
  if (mp <= 1 && light < 0.99) {
    const [x, y] = arc(mp);
    moon = `<g transform="translate(${f1(x)} ${f1(y)})" opacity="${(1 - light).toFixed(2)}">
      <circle r="42" fill="url(#ys-glow)" opacity="0.5"/><circle r="15" fill="#f6f2d8" mask="url(#ys-crescent)"/></g>`;
  }
  return `<rect width="400" height="150" fill="url(#ys-night)"/>
    <g opacity="${(1 - light).toFixed(2)}">${stars}</g>
    <rect width="400" height="150" fill="url(#ys-sky)" opacity="${light.toFixed(3)}"/>
    <rect width="400" height="150" fill="url(#ys-dusk)" opacity="${glow.toFixed(3)}"/>
    ${sun}${moon}
    ${cloud(0, 72, 40, 1, light)}${cloud(1, 214, 26, 0.75, light)}${cloud(2, 268, 64, 0.55, light)}${cloud(3, 150, 52, 0.65, light)}`;
}

function hills(): string {
  return `<path d="${FAR_HILL} V134 H0 z" fill="url(#ys-hill-far)"/>
    ${TREES.map((t) => tree(...t)).join('')}
    <path d="M0 124 Q92 88 192 118 Q292 94 400 116 V140 H0 z" fill="url(#ys-hill-near)"/>`;
}

function fence(): string {
  let pickets = '';
  for (let x = 4; x < 400; x += 22) {
    pickets += `<g transform="translate(${x} 0)">
      <path d="M0 142 V106 l5.5 -8 l5.5 8 V142 z" fill="url(#ys-wood)" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M2.5 108 V140" stroke="#f4d9ad" stroke-width="1" stroke-linecap="round" opacity="0.8"/>
      <circle cx="5.5" cy="113" r="0.9" fill="${INK}" opacity="0.55"/><circle cx="5.5" cy="131" r="0.9" fill="${INK}" opacity="0.55"/></g>`;
  }
  return `<g>
    <rect x="0" y="110" width="400" height="6" fill="#b3824a" stroke="${INK}" stroke-width="1.2"/>
    <rect x="0" y="128" width="400" height="6" fill="#b3824a" stroke="${INK}" stroke-width="1.2"/>
    ${pickets}
    <rect x="0" y="141" width="400" height="5" fill="#2f5a22" opacity="0.18"/></g>`;
}

function tuft(x: number, y: number, s = 1, dark = false): string {
  const a = dark ? '#4f9a3f' : '#6db556';
  const b = dark ? '#3f8433' : '#57a045';
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-7 0 Q-9 -9 -12 -13 Q-5 -10 -3 0 z" fill="${b}"/><path d="M-2 0 Q-2 -13 1 -18 Q4 -11 3 0 z" fill="${a}"/>
    <path d="M3 0 Q6 -9 11 -12 Q8 -6 8 0 z" fill="${b}"/><path d="M-4 0 Q-6 -7 -6 -11 Q-2 -7 -1 0 z" fill="${a}"/></g>`;
}

function flower(x: number, y: number, color: string, s = 1): string {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 Q1 6 0 13" stroke="#3f8433" stroke-width="1.8" fill="none"/>
    <path d="M0 8 q5 -3 7 0 q-4 3 -7 0" fill="#57a045"/>
    ${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-4" rx="2.6" ry="3.6" fill="${color}" transform="rotate(${a})"/>`).join('')}
    <circle r="2.3" fill="#ffd23f"/></g>`;
}

function sunflower(x: number, y: number, s: number): string {
  let petals = '';
  for (let a = 0; a < 360; a += 30) petals += `<ellipse cx="0" cy="-8" rx="2.4" ry="5" fill="#ffd23f" stroke="#d99b12" stroke-width="0.5" transform="rotate(${a})"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M0 0 Q2 -18 0 -36" stroke="#3f8433" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M0 -12 q-10 -6 -13 2 q8 4 13 -2 z M1 -22 q9 -7 13 0 q-7 5 -13 0 z" fill="#57a045"/>
    <g transform="translate(0 -40)">${petals}<circle r="5" fill="#6b4423"/><circle r="3" fill="#855a31"/></g></g>`;
}

function ground(): string {
  const r = rng(21);
  let bits = '';
  for (let i = 0; i < 46; i++) {
    const x = r() * 400;
    const y = 160 + r() * 136;
    bits += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(1 + r() * 2.2)}" ry="${f1(0.5 + r() * 0.9)}" fill="#b98f5c" opacity="${f1(0.25 + r() * 0.3)}"/>`;
  }
  for (let i = 0; i < 12; i++) {
    const x = 20 + r() * 360;
    const y = 166 + r() * 124;
    const w = 2.5 + r() * 2.5;
    bits += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(w)}" ry="${f1(w * 0.62)}" fill="#a9a195" stroke="#7d756a" stroke-width="0.6"/>
      <ellipse cx="${f1(x - w * 0.25)}" cy="${f1(y - w * 0.2)}" rx="${f1(w * 0.4)}" ry="${f1(w * 0.2)}" fill="#d2ccc2"/>`;
  }
  // Chicken tracks wandering towards the pile.
  const track = (x: number, y: number, rot: number) =>
    `<path transform="translate(${x} ${y}) rotate(${rot}) scale(0.9)" d="M0 0 V-6 M0 -2 L-3 -6 M0 -2 L3 -6" stroke="#b08a59" stroke-width="1.1" fill="none" stroke-linecap="round" opacity="0.7"/>`;
  bits += track(92, 262, 40) + track(104, 252, 30) + track(118, 244, 46) + track(300, 256, -50) + track(288, 246, -38) + track(312, 270, -44);
  return `<rect x="0" y="134" width="400" height="30" fill="url(#ys-grass)"/>
    <path d="M0 158 Q50 146 110 152 Q170 143 230 150 Q300 142 350 150 Q380 146 400 154 V300 H0 z" fill="url(#ys-dirt)"/>
    <path d="M0 158 Q50 146 110 152 Q170 143 230 150 Q300 142 350 150 Q380 146 400 154" fill="none" stroke="#b9925f" stroke-width="1.5" opacity="0.6"/>
    <ellipse cx="${PX}" cy="${PY + 6}" rx="178" ry="66" fill="url(#ys-dirt-light)"/>
    ${bits}`;
}

function coop(dark: boolean, asleep: boolean): string {
  let planks = '';
  for (let y = 109; y < 162; y += 10) planks += `<path d="M21 ${y} H103" stroke="#9c3a26" stroke-width="1" opacity="0.55"/>`;
  let shingles = '';
  for (let i = 1; i <= 3; i++) {
    const y = 62 + i * 9.5;
    const half = i * 12.3;
    shingles += `<path d="M${f1(62 - half)} ${f1(y)} H${f1(62 + half)}" stroke="#4d2c18" stroke-width="1" opacity="0.6"/>`;
  }
  const glass = asleep ? '#3a416c' : dark ? '#ffd76a' : '#cfeaf7';
  // Asleep: the door is shut. Otherwise it stands open on the dark inside.
  const door = asleep
    ? `<path d="M51 164 V137 a9 9 0 0 1 18 0 V164 z" fill="url(#ys-wood)"/>
       <path d="M55.5 131 V164 M60 128 V164 M64.5 131 V164" stroke="${INK}" stroke-width="0.9" opacity="0.5"/>
       <path d="M51 142 H69 M51 157 H69" stroke="#8a5a2e" stroke-width="2"/><circle cx="65.5" cy="150" r="1.5" fill="${INK}"/>`
    : `<path d="M51 164 V137 a9 9 0 0 1 18 0 V164 z" fill="${dark ? '#1c1220' : '#3a2218'}"/>`;
  return `<g transform="${COOP_T}">
    <ellipse cx="64" cy="170" rx="60" ry="7" fill="#000" fill-opacity="0.16"/>
    <rect x="26" y="160" width="6" height="10" fill="#7a5533" stroke="${INK}" stroke-width="1.2"/><rect x="92" y="160" width="6" height="10" fill="#7a5533" stroke="${INK}" stroke-width="1.2"/>
    <rect x="20" y="98" width="84" height="66" rx="3" fill="url(#ys-coop)" stroke="${INK}" stroke-width="2"/>
    ${planks}
    <rect x="20" y="98" width="6" height="66" fill="#f6ecd9" stroke="${INK}" stroke-width="1.2"/><rect x="98" y="98" width="6" height="66" fill="#f6ecd9" stroke="${INK}" stroke-width="1.2"/>
    <path d="M8 102 L62 60 L116 102 L108 104 L62 70 L16 104 z" fill="#f6ecd9" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M14 100 L62 63 L110 100 z" fill="url(#ys-roof)" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    ${shingles}
    <path d="M47 164 V136 a13 13 0 0 1 26 0 V164 z" fill="#f6ecd9" stroke="${INK}" stroke-width="1.6"/>
    ${door}
    <path d="M50 164 H72 L94 192 H66 z" fill="url(#ys-wood)" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M56 170 H78 M61 177 H83 M66 184 H88" stroke="${INK}" stroke-width="1.4" opacity="0.7"/>
    <circle cx="88" cy="119" r="8.5" fill="#f6ecd9" stroke="${INK}" stroke-width="1.6"/>
    <circle cx="88" cy="119" r="6" fill="${glass}"/><path d="M88 113 V125 M82 119 H94" stroke="${INK}" stroke-width="1.2"/>
    <path d="M56 80 a6 6 0 0 1 12 0 q0 5 -6 9 q-6 -4 -6 -9 z" fill="#f6ecd9" stroke="${INK}" stroke-width="1.2"/>
  </g>`;
}

function props(): string {
  // Hay bale, water trough and sunflowers give the yard some life.
  let strands = '';
  const r = rng(5);
  for (let i = 0; i < 12; i++) {
    const y = 150 + r() * 22;
    const x = 330 + r() * 34;
    strands += `<path d="M${f1(x)} ${f1(y)} h${f1(5 + r() * 9)}" stroke="#b98d2c" stroke-width="0.8" opacity="0.7"/>`;
  }
  return `<g>
    ${sunflower(296, 152, 0.8)}${sunflower(309, 153, 0.62)}
    <ellipse cx="352" cy="176" rx="34" ry="5" fill="#000" fill-opacity="0.14"/>
    <rect x="326" y="146" width="52" height="29" rx="4" fill="url(#ys-hay)" stroke="${INK}" stroke-width="1.8"/>
    ${strands}
    <path d="M341 146 V175 M363 146 V175" stroke="#a5672a" stroke-width="2.2"/>
    <path d="M322 176 l-5 -4 M320 178 l-7 0 M381 176 l5 -3" stroke="#d9b048" stroke-width="1.3" stroke-linecap="round"/>
  </g>`;
}

/** The water trough sits in the near corner, in front of any chicken standing there. */
function trough(): string {
  return `<g transform="translate(-262 34)">
    <ellipse cx="318" cy="252" rx="30" ry="6" fill="#000" fill-opacity="0.14"/>
    <path d="M292 236 Q292 252 300 252 H336 Q344 252 344 236 z" fill="url(#ys-metal)" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <ellipse cx="318" cy="236" rx="26" ry="6" fill="#aeb9c2" stroke="${INK}" stroke-width="1.8"/>
    <ellipse cx="318" cy="236.5" rx="22" ry="4.2" fill="#6fc0ea"/><path d="M304 235 q8 -2 14 0" stroke="#d8f1fc" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  </g>`;
}

// ---------- the feed pile ----------

const GRAIN_COLORS = ['#fff3b0', '#f7d766', '#e7b436', '#c98f1c', '#b97f12'];

function pile(frac: number): string {
  const f = Math.max(0, Math.min(1, frac));
  const r = rng(99);
  // Grain that has rolled off the pile; it stays even when the pile is gone.
  let spilled = '';
  for (let i = 0; i < 30; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.55 + r() * 0.6;
    const x = Math.cos(a) * 96 * d;
    const y = 4 + Math.sin(a) * 15 * d + r() * 4;
    spilled += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="2.3" ry="1.3" fill="${GRAIN_COLORS[1 + Math.floor(r() * 3)]}" stroke="#9a6a10" stroke-width="0.4" transform="rotate(${f1(r() * 180)} ${f1(x)} ${f1(y)})"/>`;
  }
  if (f <= 0) {
    return `<g transform="translate(${PX} ${PY})">
      <ellipse cx="0" cy="5" rx="70" ry="12" fill="#c49a66" opacity="0.5"/>${spilled}</g>`;
  }
  // The pile sinks faster than it narrows, like a real heap being eaten.
  const w = 0.44 + 0.56 * Math.sqrt(f);
  const h = 0.2 + 0.8 * Math.pow(f, 0.8);
  let grains = '';
  for (let i = 0; i < 90; i++) {
    const x = -74 + r() * 148;
    const y = -78 + r() * 92;
    grains += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="2.8" ry="1.5" fill="${GRAIN_COLORS[Math.floor(r() * GRAIN_COLORS.length)]}" opacity="${f1(0.55 + r() * 0.45)}" transform="rotate(${f1(r() * 180)} ${f1(x)} ${f1(y)})"/>`;
  }
  const d = moundPath();
  return `<g transform="translate(${PX} ${PY})">
    <ellipse cx="4" cy="7" rx="${f1(92 * w)}" ry="${f1(6 + 7 * w)}" fill="#000" fill-opacity="0.16"/>
    ${spilled}
    <g transform="scale(${w.toFixed(3)} ${h.toFixed(3)})">
      <path d="${d}" fill="url(#ys-pile)"/>
      <g clip-path="url(#ys-pile-clip)">${grains}
        <path d="${d}" fill="url(#ys-pile-shade)"/>
        <path d="M-52 -28 C-40 -50 -22 -66 0 -70" fill="none" stroke="#fffbe0" stroke-width="7" stroke-linecap="round" opacity="0.55"/>
        <ellipse cx="0" cy="6" rx="80" ry="12" fill="#9a6408" opacity="0.22"/>
      </g>
      <path d="${d}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </g></g>`;
}

// ---------- chickens ----------

function chicken(c: SceneChicken, spot: [number, number]): string {
  const [dx, dy] = spot;
  const k = 0.42 + 0.72 * Math.max(0, Math.min(1, c.size));
  const flip = dx > 0 ? -1 : 1;
  const top = -94 * k - 6;
  return `<g transform="translate(${PX + dx} ${PY + dy})">
    <ellipse cx="0" cy="0" rx="${f1(27 * k)}" ry="${f1(4.5 * k)}" fill="#000" fill-opacity="0.16"/>
    <g transform="scale(${(flip * k).toFixed(3)} ${k.toFixed(3)}) translate(-48 -94)">
      <g class="${c.eating ? 'pecking' : ''}">${chickenParts(c.look)}</g>
    </g>
    <text x="0" y="${top.toFixed(0)}" text-anchor="middle" class="tag${c.me ? ' me' : ''}">${esc(c.name)}</text>
  </g>`;
}

/** Drawn last: dusk and darkness over the land, the lit window, and the sleeping coop's Zs. */
function lights(light: number, asleep: boolean): string {
  const dark = 1 - light;
  const glow = 4 * light * (1 - light);
  let out = '';
  if (glow > 0.01) out += `<rect width="400" height="300" fill="#ff8a3c" fill-opacity="${(0.16 * glow).toFixed(3)}" clip-path="url(#ys-land)"/>`;
  if (dark > 0.01) out += `<rect width="400" height="300" fill="#0b1238" fill-opacity="${(0.46 * dark).toFixed(3)}" clip-path="url(#ys-land)"/>`;
  if (dark > 0.01 && !asleep) {
    out += `<g transform="${COOP_T}" opacity="${dark.toFixed(2)}">
      <circle cx="88" cy="119" r="26" fill="url(#ys-glow)" opacity="0.8"/><circle cx="88" cy="119" r="6" fill="#ffe08a"/>
      <path d="M88 113 V125 M82 119 H94" stroke="${INK}" stroke-width="1.2"/></g>`;
  }
  if (asleep) {
    const ink = light > 0.5 ? '#44539a' : '#e8ecff';
    out += `<g class="zzz" transform="${COOP_T}" fill="${ink}" stroke="${light > 0.5 ? '#ffffff' : 'none'}" stroke-width="0.6" paint-order="stroke" font-weight="800">
      <text x="98" y="68" font-size="13">z</text><text x="109" y="53" font-size="18">Z</text><text x="124" y="35" font-size="24">Z</text></g>`;
  }
  return out;
}

export function yardScene(o: SceneOptions): string {
  const asleep = !!o.asleep;
  const hour = hourOf(o.time ?? Date.now());
  const light = daylight(hour);
  const placed = o.chickens.slice(0, SPOTS.length).map((c, i) => ({ c, spot: SPOTS[i] }));
  placed.sort((a, b) => a.spot[1] - b.spot[1]);
  const behind = placed.filter((p) => p.spot[1] < 0);
  const front = placed.filter((p) => p.spot[1] >= 0);
  const cosy = o.cosy
    ? flower(40, 272, '#ff7aa2') + flower(56, 284, '#ffffff', 0.9) + flower(250, 286, '#b48cff') + flower(372, 222, '#ffffff', 0.9)
      + flower(384, 236, '#ff9f5a') + flower(152, 280, '#ffe066', 0.85)
    : '';
  return `<svg class="scene" viewBox="${o.cosy ? '0 44 400 250' : '0 0 400 300'}" role="img" aria-label="The chicken yard">
    ${DEFS}${SKY_DEFS}
    ${sky(hour, light)}
    ${hills()}
    ${ground()}
    ${fence()}
    ${tuft(10, 160, 1.1, true)}${tuft(118, 156, 0.8)}${tuft(190, 154, 0.9, true)}${tuft(262, 155, 0.8)}${tuft(392, 160, 1.2, true)}
    ${coop(light < 0.5, asleep)}
    ${props()}
    ${asleep ? '' : behind.map((p) => chicken(p.c, p.spot)).join('')}
    ${pile(o.pile)}
    ${asleep ? '' : front.map((p) => chicken(p.c, p.spot)).join('')}
    ${trough()}
    ${tuft(12, 300, 1.5, true)}${tuft(96, 301, 1.2)}${tuft(380, 300, 1.7, true)}${tuft(354, 301, 1.1)}${tuft(206, 302, 1)}
    ${cosy}
    ${lights(light, asleep)}
  </svg>`;
}
