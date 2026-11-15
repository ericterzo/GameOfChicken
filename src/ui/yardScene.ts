// Draws the chicken yard: fence, coop, dirt, the feed pile in the middle and
// whichever chickens are in the yard right now.
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
  night?: boolean;
  /** The small friendly yard on the home screen. */
  cosy?: boolean;
}

// Standing spots around the pile: [x offset, y offset]. Left side faces right.
const SPOTS: [number, number][] = [
  [-92, 8], [92, 8], [-150, 34], [150, 34], [-58, 52], [58, 52],
  [-128, -22], [128, -22], [-176, 2], [176, 2], [-20, 66], [20, 66],
];

function fence(): string {
  let posts = '';
  for (let x = 8; x < 400; x += 36) {
    posts += `<path d="M${x} 108 V70 l6 -7 l6 7 V108 z" fill="#c99a62" stroke="${INK}" stroke-width="1.5"/>`;
  }
  return `<g><rect x="0" y="76" width="400" height="7" fill="#b98850" stroke="${INK}" stroke-width="1.5"/>
    <rect x="0" y="93" width="400" height="7" fill="#b98850" stroke="${INK}" stroke-width="1.5"/>${posts}</g>`;
}

function coop(night: boolean): string {
  return `<g transform="translate(18 34)">
    <path d="M30 78 l-18 22 h14 l14 -22 z" fill="#b98850" stroke="${INK}" stroke-width="1.5"/>
    <rect x="6" y="30" width="76" height="50" rx="3" fill="#c0563b" stroke="${INK}" stroke-width="2"/>
    <path d="M-2 32 L44 2 L90 32 z" fill="#7b4a2d" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M30 80 V58 a11 11 0 0 1 22 0 V80 z" fill="${night ? '#1a1220' : '#3b2418'}" stroke="${INK}" stroke-width="2"/>
    <rect x="60" y="42" width="14" height="12" rx="2" fill="${night ? '#ffd76a' : '#f6e7c1'}" stroke="${INK}" stroke-width="1.5"/>
    ${night ? '<text x="52" y="2" font-size="15" font-weight="700" fill="#e8ecff">z</text><text x="64" y="-10" font-size="20" font-weight="700" fill="#e8ecff">Z</text>' : ''}
  </g>`;
}

function grass(x: number, y: number, s = 1): string {
  return `<path transform="translate(${x} ${y}) scale(${s})" d="M0 0 q-3 -10 -7 -12 q5 1 7 6 q0 -9 3 -13 q1 7 0 13 q3 -6 8 -7 q-5 4 -6 13 z" fill="#6aa84f" stroke="#3f7a2e" stroke-width="1"/>`;
}

function flower(x: number, y: number, color: string): string {
  return `<g transform="translate(${x} ${y})"><path d="M0 0 V12" stroke="#3f7a2e" stroke-width="2"/>
    <circle cx="0" cy="-4" r="3.2" fill="${color}"/><circle cx="4" cy="0" r="3.2" fill="${color}"/>
    <circle cx="-4" cy="0" r="3.2" fill="${color}"/><circle cx="0" cy="4" r="3.2" fill="${color}"/>
    <circle cx="0" cy="0" r="2.4" fill="#ffd23f"/></g>`;
}

function pile(frac: number): string {
  const f = Math.max(0, Math.min(1, frac));
  const scatter = [[-88, 6], [-70, 14], [-40, 18], [-8, 20], [26, 19], [58, 15], [84, 7], [-58, 4], [66, 3], [8, 12]]
    .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="1.6" fill="#e2ad2e" stroke="${INK}" stroke-width="0.6"/>`)
    .join('');
  if (f <= 0) return `<g transform="translate(200 206)">${scatter}</g>`;
  const k = 0.22 + 0.78 * Math.sqrt(f);
  const grains = [[-30, -18], [-8, -40], [16, -26], [34, -10], [-44, -6], [2, -14], [-18, -52], [22, -48]]
    .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="1.8" fill="#c98f1c"/>`)
    .join('');
  return `<g transform="translate(200 206)">
    <ellipse cx="0" cy="6" rx="${84 * k}" ry="${11 * k}" fill="#000" fill-opacity="0.12"/>
    ${scatter}
    <g transform="scale(${k.toFixed(3)})">
      <path d="M-74 4 Q-48 -66 -4 -74 Q44 -68 74 4 Q0 20 -74 4 z" fill="#efc24a" stroke="${INK}" stroke-width="${(2 / k).toFixed(2)}" stroke-linejoin="round"/>
      <path d="M-40 -22 Q-16 -58 8 -62" fill="none" stroke="#fbe08a" stroke-width="5" stroke-linecap="round"/>
      ${grains}
    </g></g>`;
}

function chicken(c: SceneChicken, spot: [number, number]): string {
  const [dx, dy] = spot;
  const k = 0.42 + 0.72 * Math.max(0, Math.min(1, c.size));
  const flip = dx > 0 ? -1 : 1;
  const top = -94 * k - 6;
  return `<g transform="translate(${200 + dx} ${206 + dy})">
    <ellipse cx="0" cy="0" rx="${26 * k}" ry="${4 * k}" fill="#000" fill-opacity="0.13"/>
    <g transform="scale(${(flip * k).toFixed(3)} ${k.toFixed(3)}) translate(-48 -94)">
      <g class="${c.eating ? 'pecking' : ''}">${chickenParts(c.look)}</g>
    </g>
    <text x="0" y="${top.toFixed(0)}" text-anchor="middle" class="tag${c.me ? ' me' : ''}">${esc(c.name)}</text>
  </g>`;
}

export function yardScene(o: SceneOptions): string {
  const night = !!o.night;
  const placed = o.chickens.slice(0, SPOTS.length).map((c, i) => ({ c, spot: SPOTS[i] }));
  placed.sort((a, b) => a.spot[1] - b.spot[1]);
  const sky = night
    ? `<rect width="400" height="110" fill="#1d2847"/><circle cx="330" cy="34" r="16" fill="#f4f1d6"/><circle cx="323" cy="30" r="14" fill="#1d2847"/>
       ${[[40, 20], [120, 40], [180, 16], [250, 46], [290, 14], [370, 60], [90, 12]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#fff"/>`).join('')}`
    : `<rect width="400" height="110" fill="#c5e9f6"/><circle cx="338" cy="32" r="18" fill="#ffd95a"/>
       <path d="M150 110 Q230 48 320 110 z M-20 110 Q60 60 150 110 z M280 110 Q360 66 430 110 z" fill="#9fd08a"/>`;
  const extras = o.cosy
    ? flower(52, 262, '#ff7aa2') + flower(346, 250, '#ffffff') + flower(322, 276, '#b48cff') + flower(84, 282, '#ffffff') + grass(300, 150, 1.1)
    : '';
  return `<svg class="scene${night ? ' night' : ''}" viewBox="${o.cosy ? '0 44 400 250' : '0 0 400 300'}" role="img" aria-label="The chicken yard">
    ${sky}
    ${fence()}
    <rect x="0" y="104" width="400" height="196" fill="#dcbb8c"/>
    <ellipse cx="200" cy="214" rx="150" ry="52" fill="#cfa877"/>
    <ellipse cx="80" cy="160" rx="46" ry="12" fill="#d3ae7e"/><ellipse cx="330" cy="268" rx="56" ry="14" fill="#d3ae7e"/>
    ${grass(14, 122)}${grass(120, 118, 0.8)}${grass(240, 120)}${grass(382, 126, 1.2)}${grass(24, 290, 1.3)}${grass(374, 292, 1.2)}${grass(150, 296)}
    ${extras}
    ${coop(night)}
    ${pile(o.pile)}
    ${night ? '' : placed.map((p) => chicken(p.c, p.spot)).join('')}
    ${night ? '<rect width="400" height="300" fill="#0b1030" fill-opacity="0.45"/>' : ''}
  </svg>`;
}
