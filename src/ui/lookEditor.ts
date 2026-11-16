import type { Unlocks } from '../api';
import type { Look } from '../game/rules';
import {
  BEAK_COLORS, BEAKS, BODY_COLORS, chickenSvg, COMB_COLORS, COMBS, WACKY_BODY_COLORS, WATTLE_COLORS, WATTLES,
} from './chicken';
import { el } from './dom';
import { t } from '../i18n';

const BEAK_LABELS: Record<Look['beak'], string> = { short: 'Short', long: 'Long', hooked: 'Hooked' };
const COMB_LABELS: Record<Look['comb'], string> = { classic: 'Classic', spiky: 'Spiky', floppy: 'Floppy', none: 'None' };
const WATTLE_LABELS: Record<string, string> = { classic: 'Classic', long: 'Long', double: 'Double', round: 'Round', none: 'None' };

function swatches(key: keyof Look, colors: string[]): string {
  return `<div class="swatches">${colors.map((c) =>
    `<button type="button" class="swatch" data-k="${key}" data-v="${c}" style="background:${c}" aria-label="${key} colour ${c}"></button>`,
  ).join('')}</div>`;
}

function choices(key: keyof Look, values: string[], labels: Record<string, string>): string {
  return `<div class="chips">${values.map((v) =>
    `<button type="button" class="chip" data-k="${key}" data-v="${v}">${t(labels[v])}</button>`,
  ).join('')}</div>`;
}

type Accessory = keyof Unlocks;
const ACCESSORIES: [Accessory, string][] = [
  ['eyepatch', 'Eyepatch'], ['hand', 'Hand 🤌'], ['crown', 'Crown'], ['bigCrown', 'Grand crown'],
];

function accessories(unlocks: Unlocks): string {
  const mine = ACCESSORIES.filter(([k]) => unlocks[k]);
  const hints = [
    unlocks.crown ? '' : t('Win a yard to earn a crown.'),
    unlocks.crown && !unlocks.bigCrown ? t('Win 10 yards for a grand crown.') : '',
    unlocks.eyepatch && unlocks.hand ? '' : t('Other languages hide more.'),
  ].filter(Boolean).join(' ');
  return `<div class="field"><span class="label">${t('Accessories')}</span>
    ${mine.length ? `<div class="chips">${mine.map(([k, label]) =>
      `<button type="button" class="chip" data-acc="${k}">${t(label)}</button>`).join('')}</div>` : ''}
    ${hints ? `<small>${mine.length ? '' : `${t('None yet.')} `}${hints}</small>` : ''}</div>`;
}

const NO_UNLOCKS: Unlocks = { eyepatch: false, hand: false, crown: false, bigCrown: false };

/**
 * A chicken customiser. Call `get()` on the result for the current look.
 * `unlocks` says which accessories this player has earned.
 */
export function lookEditor(initial: Look, unlocks: Unlocks = NO_UNLOCKS): { node: HTMLElement; get: () => Look } {
  // Chickens saved before wattles were editable get the look they always had.
  const look: Look = { wattle: 'classic', wattleColor: initial.combColor, ...initial };
  // Only what has been earned, and nothing left undefined (the database refuses that).
  if (!look.eyepatch || !unlocks.eyepatch) delete look.eyepatch;
  if (!look.hand || !unlocks.hand) delete look.hand;
  if (!(look.crown === 'small' && unlocks.crown) && !(look.crown === 'big' && unlocks.bigCrown)) delete look.crown;
  const wears = (k: Accessory) =>
    (k === 'crown' ? look.crown === 'small' : k === 'bigCrown' ? look.crown === 'big' : !!look[k]);
  const node = el(`<div class="editor">
    <div class="editor-preview"></div>
    <div class="editor-controls">
      <div class="field"><span class="label">${t('Feathers')}</span>${swatches('body', BODY_COLORS)}${swatches('body', WACKY_BODY_COLORS)}</div>
      <div class="field"><span class="label">${t('Beak')}</span>${choices('beak', BEAKS, BEAK_LABELS)}${swatches('beakColor', BEAK_COLORS)}</div>
      <div class="field"><span class="label">${t('Comb')}</span>${choices('comb', COMBS, COMB_LABELS)}${swatches('combColor', COMB_COLORS)}</div>
      <div class="field"><span class="label">${t('Wattle')} <small>${t('under the beak')}</small></span>${choices('wattle', WATTLES, WATTLE_LABELS)}${swatches('wattleColor', WATTLE_COLORS)}</div>
      ${accessories(unlocks)}
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
    node.querySelectorAll<HTMLButtonElement>('button[data-acc]').forEach((b) => {
      const on = wears(b.dataset.acc as Accessory);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  node.addEventListener('click', (e) => {
    const acc = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-acc]');
    if (acc) {
      const k = acc.dataset.acc as Accessory;
      const on = !wears(k);
      if (k === 'crown' || k === 'bigCrown') {
        if (on) look.crown = k === 'crown' ? 'small' : 'big'; else delete look.crown;
      } else if (on) look[k] = true;
      else delete look[k];
      paint();
      return;
    }
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-k]');
    if (!b) return;
    (look as unknown as Record<string, string>)[b.dataset.k!] = b.dataset.v!;
    paint();
  });
  paint();
  return { node, get: () => ({ ...look }) };
}
