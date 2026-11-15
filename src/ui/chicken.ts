// Draws a chicken as SVG markup. Pure string building (no DOM) so the icon
// script can reuse it. The chicken faces right inside a 100×100 box, feet at y=94.
import type { Look } from '../game/rules.ts';

const INK = '#4a3423';

export const BODY_COLORS = ['#ffffff', '#f6e3b4', '#e8b56a', '#c9783a', '#8a4b2a', '#3d3a39', '#9aa3ad', '#f4b8c4'];
export const BEAK_COLORS = ['#f5a623', '#ffd23f', '#e8743b', '#6b6b6b'];
export const COMB_COLORS = ['#d93025', '#ff6f91', '#f28c28', '#7a3fb5', '#2f9e6b'];
export const BEAKS: Look['beak'][] = ['short', 'long', 'hooked'];
export const COMBS: Look['comb'][] = ['classic', 'spiky', 'floppy', 'none'];

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
    <path d="M79 42 q5 1 4 8 q-5 2 -6 -4 z" fill="${combC}" ${s}/>
    ${eye}`;
}

/** A standalone chicken picture. */
export function chickenSvg(look: Look, opts: { px?: number; pecking?: boolean; asleep?: boolean } = {}): string {
  const px = opts.px ?? 96;
  return `<svg class="chicken" viewBox="0 0 100 100" width="${px}" height="${px}" aria-hidden="true">
    <g class="${opts.pecking ? 'pecking' : ''}">${chickenParts(look, opts)}</g></svg>`;
}

/** The app icon: a white chicken on a warm background. `pad` shrinks it for maskable icons. */
export function iconSvg(pad = 0.12): string {
  const white: Look = { body: '#ffffff', beak: 'short', beakColor: '#f5a623', comb: 'classic', combColor: '#d93025' };
  const scale = (1 - pad * 2) * 5.12;
  const offset = 512 * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" fill="#f2a03d"/>
    <ellipse cx="256" cy="${offset + 95 * scale}" rx="${34 * scale}" ry="${4 * scale}" fill="#000" fill-opacity="0.15"/>
    <g transform="translate(${offset + 2 * scale} ${offset}) scale(${scale})">${chickenParts(white)}</g>
  </svg>`;
}
