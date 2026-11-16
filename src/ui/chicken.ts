// Draws a chicken as SVG markup. Pure string building (no DOM) so the icon
// script can reuse it. The chicken faces right inside a 100×100 box, feet at y=94.
import type { Look } from '../game/rules.ts';

const INK = '#4a3423';

export const BODY_COLORS = ['#ffffff', '#f6e3b4', '#e8b56a', '#c9783a', '#8a4b2a', '#3d3a39', '#9aa3ad', '#f4b8c4'];
/** The second, sillier row of feather colours. */
export const WACKY_BODY_COLORS = ['#ff5fa2', '#e23b3b', '#ff8a2f', '#ffd93b', '#a4d63c', '#2fbf8f', '#3fa7f0', '#8e5bd9'];
export const BEAK_COLORS = ['#f5a623', '#ffd23f', '#e8743b', '#6b6b6b'];
export const COMB_COLORS = [
  '#d93025', '#ff6f91', '#f28c28', '#7a3fb5', '#2f9e6b',
  '#ffd23f', '#3fa7f0', '#ff3fb4', '#ffffff', '#262626',
];
export const WATTLE_COLORS = COMB_COLORS;
export const BEAKS: Look['beak'][] = ['short', 'long', 'hooked'];
export const COMBS: Look['comb'][] = ['classic', 'spiky', 'floppy', 'none'];
export const WATTLES: NonNullable<Look['wattle']>[] = ['classic', 'long', 'double', 'round', 'none'];

function wattle(kind: Look['wattle'], color: string): string {
  const a = `fill="${color}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"`;
  switch (kind) {
    case 'none':
      return '';
    case 'long':
      return `<path ${a} d="M79 42 q6 2 4.5 16 q-6.5 2 -6.5 -10 z"/>`;
    case 'double':
      return `<path ${a} d="M74 44 q4 2 2.5 8 q-5 1 -5 -4 z"/><path ${a} d="M79 42 q5 1 4 8 q-5 2 -6 -4 z"/>`;
    case 'round':
      return `<circle ${a} cx="80" cy="47.5" r="4.8"/>`;
    default:
      return `<path ${a} d="M79 42 q5 1 4 8 q-5 2 -6 -4 z"/>`;
  }
}

const safeColor = (c: string, fallback: string) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback);

function comb(kind: Look['comb'], color: string): string {
  const a = `fill="${color}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"`;
  switch (kind) {
    case 'classic':
      return `<path ${a} d="M60 27 q-3 -10 4 -10 q3 0 4 4 q1 -8 7 -7 q5 1 4 8 q5 -3 7 1 q2 5 -5 9 z"/>`;
    case 'spiky':
      return `<path ${a} d="M60 27 l1 -14 l6 9 l4 -13 l5 12 l7 -7 l-1 14 z"/>`;
    case 'floppy':
      return `<path ${a} d="M61 27 q-1 -11 9 -12 q12 -1 16 8 q3 8 -3 12 q1 -9 -6 -9 q-7 0 -9 5 z"/>`;
    default:
      return '';
  }
}

function beak(kind: Look['beak'], color: string): string {
  const a = `fill="${color}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"`;
  switch (kind) {
    case 'long':
      return `<path ${a} d="M81 31 L99 37 L81 41 z"/>`;
    case 'hooked':
      return `<path ${a} d="M81 30 q13 0 14 12 q-6 -4 -14 -2 z"/>`;
    default:
      return `<path ${a} d="M81 31 L92 36 L81 41 z"/>`;
  }
}

function eyepatch(): string {
  const black = '#1f1a17';
  return `<path d="M62.5 22.5 L84.6 31.5" fill="none" stroke="${black}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M68 26.4 L78.4 28.4 Q79 36.4 73 37 Q67.2 35.4 68 26.4 z" fill="${black}" stroke="${black}" stroke-width="1" stroke-linejoin="round"/>`;
}

/** The pinched-fingers hand, held up in front of the chest. */
function hand(): string {
  const a = `fill="#ffcf5c" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"`;
  return `<g class="ck-hand">
    <path ${a} d="M83.4 74 L83 69.5 Q79.4 65 82 59.6 Q83 54.4 85.3 53.4 Q86.4 50.6 88 53 Q89.6 50.6 90.7 53.4 Q93 54.4 94 59.6 Q96.6 65 93 69.5 L92.6 74 z"/>
    <path d="M88 53.4 V63 M85.4 54 Q85 59 86.2 63 M90.6 54 Q91 59 89.8 63 M82.6 60.4 Q81.4 64.6 84.6 67.4" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>
    <rect x="81.6" y="73" width="12.8" height="6" rx="1.5" fill="#fff" stroke="${INK}" stroke-width="1.8"/>
  </g>`;
}

/**
 * A crown on top of the head. The big one is three times the size, with
 * pearls, a jewelled band, a velvet cap and sparkles.
 */
function crown(kind: 'small' | 'big'): string {
  const big = kind === 'big';
  const w = big ? 0.7 : 1.6; // line width, so the big crown's outline is not three times as heavy
  const gold = `fill="#ffd23f" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"`;
  const gem = (x: number, y: number, r: number, c: string) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="${INK}" stroke-width="${w * 0.6}"/>`;
  const spark = (x: number, y: number, k: number) =>
    `<path class="ck-spark" d="M${x} ${y - 2.4 * k} L${x + 0.6 * k} ${y - 0.6 * k} L${x + 2.4 * k} ${y} L${x + 0.6 * k} ${y + 0.6 * k} L${x} ${y + 2.4 * k} L${x - 0.6 * k} ${y + 0.6 * k} L${x - 2.4 * k} ${y} L${x - 0.6 * k} ${y - 0.6 * k} z" fill="#fff8c9" stroke="#e0a400" stroke-width="0.25"/>`;
  const points = 'M-10 0 L-11.5 -10.5 L-5.5 -5 L0 -12.5 L5.5 -5 L11.5 -10.5 L10 0 z';
  const plain = `<path ${gold} d="${points}"/>${gem(0, -3.2, 1.5, '#d93025')}`;
  const bling = `<path d="M-9.4 -1 L-10.6 -9 L-5.5 -4.2 L0 -11 L5.5 -4.2 L10.6 -9 L9.4 -1 z" fill="#b3202c"/>
    <path ${gold} fill-rule="evenodd" d="${points} M-8 -3.6 L-8.7 -7.4 L-5.6 -4.4 z M8 -3.6 L8.7 -7.4 L5.6 -4.4 z M-3.4 -4.4 L0 -9.2 L3.4 -4.4 z"/>
    <path d="M-10.2 -3.4 H10.2" stroke="${INK}" stroke-width="${w}"/>
    <path d="M-10 -1.7 H10" stroke="#fff3b0" stroke-width="0.6"/>
    ${gem(-11.5, -10.9, 1.2, '#ffffff')}${gem(11.5, -10.9, 1.2, '#ffffff')}${gem(0, -13.2, 1.5, '#ffffff')}
    ${gem(-6.6, -1.7, 1, '#3fa7f0')}${gem(-3.3, -1.7, 1, '#2f9e6b')}${gem(0, -1.7, 1.2, '#d93025')}${gem(3.3, -1.7, 1, '#2f9e6b')}${gem(6.6, -1.7, 1, '#3fa7f0')}
    ${gem(0, -6.2, 1.1, '#7a3fb5')}
    ${spark(-13.5, -4.5, 1)}${spark(14, -7.5, 0.8)}${spark(6.5, -14.5, 0.7)}${spark(-7, -13, 0.55)}`;
  return `<g class="ck-crown" transform="translate(72.5 ${big ? 21 : 19.6}) rotate(6) scale(${big ? 3 : 1})">${big ? bling : plain}</g>`;
}

/** Inner SVG markup for one chicken, to be placed inside any <svg> or <g>. */
export function chickenParts(look: Look, opts: { asleep?: boolean } = {}): string {
  const body = safeColor(look.body, '#ffffff');
  const beakC = safeColor(look.beakColor, '#f5a623');
  const combC = safeColor(look.combColor, '#d93025');
  const s = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;
  const eye = opts.asleep
    ? `<path d="M70 32 q3 3 6 0" fill="none" ${s}/>`
    : `<circle cx="73" cy="31" r="2.4" fill="${INK}"/><circle cx="73.8" cy="30.2" r="0.8" fill="#fff"/>`;
  return `
    <g class="ck-legs" fill="none" stroke="${beakC}" stroke-width="3" stroke-linecap="round">
      <path d="M40 76 V92 M34 93 H46"/><path d="M54 76 V92 M48 93 H60"/>
    </g>
    <path d="M24 58 Q6 50 8 32 Q16 40 22 42 Q18 30 24 24 Q30 38 36 46 z" fill="${body}" ${s}/>
    <path d="M22 60 Q22 40 46 42 Q58 43 62 30 Q64 20 72 20 Q84 21 84 34 Q84 44 76 50 Q76 80 50 80 Q24 80 22 60 z" fill="${body}" ${s}/>
    <path d="M30 60 Q36 48 52 54 Q60 60 52 68 Q40 74 30 60 z" fill="#000" fill-opacity="0.09" ${s}/>
    <g transform="translate(0 -5)">${comb(look.comb, combC)}</g>
    ${beak(look.beak, beakC)}
    ${wattle(look.wattle, safeColor(look.wattleColor ?? combC, combC))}
    ${eye}
    ${look.eyepatch ? eyepatch() : ''}
    ${look.crown === 'small' || look.crown === 'big' ? crown(look.crown) : ''}
    ${look.hand ? hand() : ''}`;
}

/** A standalone chicken picture. */
export function chickenSvg(look: Look, opts: { px?: number; pecking?: boolean; asleep?: boolean } = {}): string {
  const px = opts.px ?? 96;
  return `<svg class="chicken" overflow="visible" viewBox="0 0 100 100" width="${px}" height="${px}" aria-hidden="true">
    <g class="${opts.pecking ? 'pecking' : ''}">${chickenParts(look, opts)}</g></svg>`;
}

/** The app icon: a white chicken on a warm background. `pad` shrinks it for maskable icons. */
export function iconSvg(pad = 0.12): string {
  const white: Look = { body: '#ffffff', beak: 'short', beakColor: '#f5a623', comb: 'classic', combColor: '#d93025' };
  const scale = (1 - pad * 2) * 5.12;
  const offset = 512 * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" fill="#8ccb6e"/>
    <ellipse cx="256" cy="${offset + 95 * scale}" rx="${34 * scale}" ry="${4 * scale}" fill="#000" fill-opacity="0.15"/>
    <g transform="translate(${offset + 2 * scale} ${offset}) scale(${scale})">${chickenParts(white)}</g>
  </svg>`;
}
