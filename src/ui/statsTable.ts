// A table of players and their records, sortable by tapping a column.
// Used by the flock table (you and your friends) and the global leaderboard.
import type { Profile, Stats } from '../api';
import { chickenSvg } from './chicken';
import { esc, num } from './dom';
import { t } from '../i18n';

export type StatCol = keyof Stats | 'username';

const COLS: [StatCol, string][] = [
  ['username', 'Chicken'], ['wins', 'Won'], ['gamesPlayed', 'Played'], ['biggestChicken', 'Biggest'],
  ['totalPoints', 'Eaten'], ['mealsStolen', 'Stolen'], ['mealsLost', 'Lost'],
];

export interface StatsTable {
  setRows(rows: Profile[]): void;
}

export function statsTable(host: HTMLElement, opts: {
  meUid: string;
  /** Show a position number in front of each row. */
  ranked?: boolean;
  /** Called when the player picks a new sort, e.g. to fetch a different top list. */
  onSort?: (key: StatCol, desc: boolean) => void;
}): StatsTable {
  let rows: Profile[] = [];
  let sortKey: StatCol = 'wins';
  let sortDesc = true;

  const paint = () => {
    const value = (p: Profile) => (sortKey === 'username' ? p.username.toLowerCase() : p.stats[sortKey]);
    const sorted = [...rows].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      if (x === y) return a.username.localeCompare(b.username);
      return (x < y ? -1 : 1) * (sortDesc ? -1 : 1);
    });
    host.innerHTML = `<table class="flock-table">
      <thead><tr>${opts.ranked ? '<th scope="col" class="rank">#</th>' : ''}${COLS.map(([k, label]) => `<th scope="col" ${k === sortKey ? `aria-sort="${sortDesc ? 'descending' : 'ascending'}"` : ''}>
        <button type="button" data-sort="${k}">${t(label)}<span aria-hidden="true">${k === sortKey ? (sortDesc ? ' ▼' : ' ▲') : ''}</span></button></th>`).join('')}</tr></thead>
      <tbody>${sorted.map((p, i) => `<tr class="${p.uid === opts.meUid ? 'me' : ''}">
        ${opts.ranked ? `<td class="rank">${i + 1}</td>` : ''}
        <th scope="row"><span class="cell-chicken">${chickenSvg(p.look, { px: 34 })}</span><span>${esc(p.username)}${p.uid === opts.meUid ? ` <small>${t('(you)')}</small>` : ''}</span></th>
        ${COLS.slice(1).map(([k]) => `<td>${num(p.stats[k as keyof Stats])}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  };

  host.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-sort]');
    if (!b) return;
    const key = b.dataset.sort as StatCol;
    if (key === sortKey) sortDesc = !sortDesc;
    else { sortKey = key; sortDesc = key !== 'username'; } // numbers start biggest first, names A to Z
    paint();
    opts.onSort?.(sortKey, sortDesc);
  });

  return { setRows(next) { rows = next; paint(); } };
}
