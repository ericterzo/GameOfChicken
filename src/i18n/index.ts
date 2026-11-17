// Languages. English text is the key: t('Save my chicken') returns the same
// sentence in the chosen language, or the English itself if none is written.
// Numbered gaps take the extra arguments: t('Closes in {0}', '2h').
import { track } from '../analytics';
import { it } from './it';
import { pirate } from './pirate';

export type Lang = 'en' | 'it' | 'pirate';

export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'it', name: 'Italiano' },
  { id: 'pirate', name: 'Pirate' },
];

const BOOKS: Record<Lang, Record<string, string>> = { en: {}, it, pirate };
const STORE_KEY = 'lang';

function saved(): Lang {
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (v === 'it' || v === 'pirate') return v;
  } catch {
    /* no storage: English */
  }
  return 'en';
}

let lang: Lang = saved();
const listeners = new Set<(l: Lang) => void>();

export const getLang = () => lang;

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(STORE_KEY, next);
  } catch {
    /* lasts until the page closes */
  }
  track('language_changed', { lang: next });
  listeners.forEach((cb) => cb(next));
}

export function onLang(cb: (l: Lang) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function translate(to: Lang, key: string, args: unknown[] = []): string {
  const text = BOOKS[to][key] ?? key;
  return args.length ? text.replace(/\{(\d)\}/g, (_, i) => String(args[Number(i)] ?? '')) : text;
}

export const t = (key: string, ...args: unknown[]) => translate(lang, key, args);

/** The accessory each language hands out the first time it is used. */
export const LANG_GIFT: Partial<Record<Lang, 'eyepatch' | 'hand'>> = { pirate: 'eyepatch', it: 'hand' };

const FLAGS: Record<Lang, string> = {
  en: `<rect width="24" height="16" fill="#1f3b8c"/><path d="M0 0 L24 16 M24 0 L0 16" stroke="#fff" stroke-width="3.2"/>
    <path d="M0 0 L24 16 M24 0 L0 16" stroke="#c8102e" stroke-width="1.2"/>
    <path d="M12 0 V16 M0 8 H24" stroke="#fff" stroke-width="5"/><path d="M12 0 V16 M0 8 H24" stroke="#c8102e" stroke-width="2.8"/>`,
  it: '<rect width="8" height="16" fill="#1f9d55"/><rect x="8" width="8" height="16" fill="#fff"/><rect x="16" width="8" height="16" fill="#d2232a"/>',
  pirate: `<rect width="24" height="16" fill="#151515"/>
    <path d="M6.5 4 L17.5 13 M17.5 4 L6.5 13" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M12 2.6 a3.9 3.7 0 0 1 3.9 3.7 c0 1.5 -0.8 2.3 -1.7 2.8 v1.5 h-4.4 v-1.5 c-0.9 -0.5 -1.7 -1.3 -1.7 -2.8 a3.9 3.7 0 0 1 3.9 -3.7 z" fill="#fff"/>
    <circle cx="10.5" cy="6.4" r="1" fill="#151515"/><circle cx="13.5" cy="6.4" r="1" fill="#151515"/>`,
};

export const flagSvg = (l: Lang) =>
  `<svg class="flag" viewBox="0 0 24 16" width="24" height="16" aria-hidden="true">${FLAGS[l]}</svg>`;

/** The language drop-down, as markup. Wire it with `wireLangMenu`. */
export function langMenu(): string {
  return `<details class="lang">
    <summary aria-label="${t('Language')}">${flagSvg(lang)}<span aria-hidden="true">▾</span></summary>
    <div class="lang-list">${LANGS.map((l) =>
      `<button type="button" data-lang="${l.id}" class="${l.id === lang ? 'on' : ''}">${flagSvg(l.id)}${l.name}</button>`).join('')}</div>
  </details>`;
}

export function wireLangMenu(root: ParentNode): void {
  const menu = root.querySelector<HTMLDetailsElement>('details.lang');
  if (!menu) return;
  menu.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-lang]');
    if (!b) return;
    menu.open = false;
    setLang(b.dataset.lang as Lang);
  });
}
