// A table of players and their records, sortable by tapping a column.
// Used by the flock table (you and your friends) and the global leaderboard.
import type { Profile, Stats } from '../api';
import { chickenSvg } from './chicken';
import { esc, num } from './dom';
import { t } from '../i18n';

export type StatCol = keyof Stats | 'username';

const COLS: [StatCol, string][] = [
  ['username', 'Chicken'], ['gamesPlayed', 'Games played'], ['wins', 'Games won'], ['losses', 'Games lost'],
  ['totalPoints', 'Feed eaten'], ['feedStolen', 'Feed stolen'], ['feedLost', 'Feed lost'],
];

export interface StatsTable {
  setRows(rows: Profile[]): void;
}

export function statsTable(host: HTMLElement, opts: {
  meUid: string;
  /** Show a position number in front of each row. */
  ranked?: boolean;
  /** Show only the best so many for the chosen column; "me" is added at the end if left out. */
  top?: number;
  /** Told whether "me" fell outside the top list after each sort. */
  onOutside?: (outside: boolean) => void;
  /** Rows can be tapped (other players only). */
  onPick?: (p: Profile) => void;
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
    const shown: [Profile, number][] = sorted.map((p, i) => [p, i + 1]);
    if (opts.top && shown.length > opts.top) {
      const me = shown.find(([p]) => p.uid === opts.meUid);
      shown.length = opts.top;
      const outside = !!me && me[1] > opts.top;
      if (outside) shown.push(me!);
      opts.onOutside?.(outside);
    } else opts.onOutside?.(false);
    const pick = (p: Profile) => (opts.onPick && p.uid !== opts.meUid ? ` data-pick="${esc(p.uid)}" tabindex="0" role="button"` : '');
    host.innerHTML = `<table class="flock-table">
      <thead><tr>${opts.ranked ? '<th scope="col" class="rank">#</th>' : ''}${COLS.map(([k, label]) => `<th scope="col" ${k === sortKey ? `aria-sort="${sortDesc ? 'descending' : 'ascending'}"` : ''}>
        <button type="button" data-sort="${k}">${t(label)}<span aria-hidden="true">${k === sortKey ? (sortDesc ? ' ▼' : ' ▲') : ''}</span></button></th>`).join('')}</tr></thead>
      <tbody>${shown.map(([p, rank]) => `<tr class="${p.uid === opts.meUid ? 'me' : ''}"${pick(p)}>
        ${opts.ranked ? `<td class="rank">${rank}</td>` : ''}
        <th scope="row"><span class="cell-chicken">${chickenSvg(p.look, { px: 34 })}</span><span>${esc(p.username)}${p.uid === opts.meUid ? ` <small>${t('(you)')}</small>` : ''}</span></th>
        ${COLS.slice(1).map(([k]) => `<td>${num(p.stats[k as keyof Stats])}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  };

  host.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-sort]');
    if (!b) {
      const row = (e.target as HTMLElement).closest<HTMLElement>('tr[data-pick]');
      const picked = row && rows.find((p) => p.uid === row.dataset.pick);
      if (picked) opts.onPick?.(picked);
      return;
    }
    const key = b.dataset.sort as StatCol;
    if (key === sortKey) sortDesc = !sortDesc;
    else { sortKey = key; sortDesc = key !== 'username'; } // numbers start biggest first, names A to Z
    paint();
  });
  host.addEventListener('keydown', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('tr[data-pick]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); }
  });

  return { setRows(next) { rows = next; paint(); } };
}
