import type { Look } from '../game/rules';
import { BEAK_COLORS, BEAKS, BODY_COLORS, chickenSvg, COMB_COLORS, COMBS } from './chicken';
import { el } from './dom';

const BEAK_LABELS: Record<Look['beak'], string> = { short: 'Short', long: 'Long', hooked: 'Hooked' };
const COMB_LABELS: Record<Look['comb'], string> = { classic: 'Classic', spiky: 'Spiky', floppy: 'Floppy', none: 'None' };

function swatches(key: keyof Look, colors: string[]): string {
  return `<div class="swatches">${colors.map((c) =>
    `<button type="button" class="swatch" data-k="${key}" data-v="${c}" style="background:${c}" aria-label="${key} colour ${c}"></button>`,
  ).join('')}</div>`;
}

function choices(key: keyof Look, values: string[], labels: Record<string, string>): string {
  return `<div class="chips">${values.map((v) =>
    `<button type="button" class="chip" data-k="${key}" data-v="${v}">${labels[v]}</button>`,
  ).join('')}</div>`;
}

/** A chicken customiser. Call `get()` on the result for the current look. */
export function lookEditor(initial: Look): { node: HTMLElement; get: () => Look } {
  const look: Look = { ...initial };
  const node = el(`<div class="editor">
    <div class="editor-preview"></div>
    <div class="editor-controls">
      <div class="field"><span class="label">Feathers</span>${swatches('body', BODY_COLORS)}</div>
      <div class="field"><span class="label">Beak</span>${choices('beak', BEAKS, BEAK_LABELS)}${swatches('beakColor', BEAK_COLORS)}</div>
      <div class="field"><span class="label">Comb</span>${choices('comb', COMBS, COMB_LABELS)}${swatches('combColor', COMB_COLORS)}</div>
    </div>
  </div>`);
  const preview = node.querySelector('.editor-preview')!;
  const paint = () => {
    preview.innerHTML = chickenSvg(look, { px: 150 });
    node.querySelectorAll<HTMLButtonElement>('button[data-k]').forEach((b) => {
      const on = look[b.dataset.k as keyof Look] === b.dataset.v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  node.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-k]');
    if (!b) return;
    (look as unknown as Record<string, string>)[b.dataset.k!] = b.dataset.v!;
    paint();
  });
  paint();
  return { node, get: () => ({ ...look }) };
}
