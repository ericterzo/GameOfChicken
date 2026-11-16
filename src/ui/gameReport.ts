// The end-of-game report card shown in a closed yard.
import type { AwardKind, Dealings, PlayerReport, YardReport } from '../game/report';
import type { Yard } from '../game/rules';
import { t } from '../i18n';
import { chickenSvg } from './chicken';
import { esc, num, span } from './dom';

const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });
const hourRange = (h: number) => `${hourLabel(h)}–${hourLabel((h + 1) % 24)}`;

function awardText(kind: AwardKind, value: number): [string, string] {
  switch (kind) {
    case 'thief': return [t('Biggest thief'), `${t('Feed stolen')}: ${num(value)}`];
    case 'robbed': return [t('Most robbed'), `${t('Feed lost')}: ${num(value)}`];
    case 'longestMeal': return [t('Longest meal'), span(value * 1000)];
    case 'glutton': return [t('Most time at the pile'), span(value)];
    case 'nosiest': return [t('Nosiest chicken'), `${t('Visits')}: ${num(value)}`];
    case 'escape': return [t('Narrowest escapes'), t('Close shaves: {0}', num(value))];
    case 'sharpshooter': return [t('Sharpshooter'), t('Shots fired: {0}', num(value))];
    default: return [t('Chatterbox'), t('Notes posted: {0}', num(value))];
  }
}

/** Activity by hour of the day: one thin bar per hour, the reader's own clock. */
function hoursChart(hours: number[]): string {
  const top = Math.max(1, ...hours);
  return `<div class="hours" role="img" aria-label="${t('Activity by hour of the day')}">
    ${hours.map((n, h) => `<span class="hour" title="${esc(hourRange(h))}: ${num(n)}"><i style="height:${n ? Math.max(8, Math.round((n / top) * 100)) : 0}%"></i></span>`).join('')}
  </div>
  <div class="hours-axis" aria-hidden="true">${[0, 6, 12, 18].map((h) => `<span>${esc(hourLabel(h))}</span>`).join('')}</div>`;
}

export function reportHtml(yard: Yard, r: YardReport, meUid: string): string {
  const name = (uid: string) => esc(yard.members[uid]?.username ?? t('A chicken'));
  const cell = (label: string, value: string) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`;
  const share = r.lengthMs ? Math.round((r.idleMs / r.lengthMs) * 100) : 0;
  const dealings = (book: Record<string, Dealings>) => Object.entries(book)
    .sort((a, b) => b[1].feed - a[1].feed)
    .map(([uid, d]) => t('{0} {1}× ({2} feed)', name(uid), num(d.times), num(d.feed))).join(', ');

  const player = (p: PlayerReport) => {
    const m = yard.members[p.uid];
    const lines = [
      p.steals ? t('Stole from: {0}', dealings(p.stolenFrom)) : '',
      p.timesCaught ? t('Caught by: {0}', dealings(p.caughtBy)) : '',
      p.biggestHeist ? t('Biggest single heist: {0} feed', num(p.biggestHeist)) : '',
      p.nearMisses ? t('Near misses: {0}, and {1} feed got away', num(p.nearMisses), num(p.nearMissFeed)) : '',
      p.closeShaves ? t('Close shaves: {0}', num(p.closeShaves)) : '',
      p.busiestHour != null ? t('Most active around {0}', esc(hourRange(p.busiestHour))) : '',
      p.shotsFired ? t('Shots fired: {0}', num(p.shotsFired)) : '',
      p.timesShot ? t('Times shot: {0}', num(p.timesShot)) : '',
      p.notes ? t('Notes posted: {0}', num(p.notes)) : '',
    ].filter(Boolean);
    return `<details class="friend report-player" ${p.uid === meUid ? 'open' : ''}>
      <summary><span class="board-chicken">${chickenSvg(m.look, { px: 44 })}</span>
        <span class="board-name">${name(p.uid)}</span>
        <span class="muted">${num(m.points)}</span></summary>
      <div class="stats">
        ${cell(t('Visits'), num(p.visits))}
        ${cell(t('Meals kept'), num(p.meals))}
        ${cell(t('Time feeding'), span(p.feedingMs))}
        ${cell(t('Longest meal'), span(p.longestMeal * 1000))}
        ${cell(t('Feed stolen'), num(p.feedStolen))}
        ${cell(t('Feed lost'), num(p.feedLost))}
      </div>
      ${lines.length ? `<ul class="report-lines">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
    </details>`;
  };

  const order = [...yard.memberUids].sort((a, b) => yard.members[b].points - yard.members[a].points);
  return `<h2>${t('Game report')}</h2>
    <div class="stats">
      ${cell(t('Game length'), span(r.lengthMs))}
      ${cell(t('Feed eaten'), num(r.totalEaten))}
      ${cell(t('Catches'), num(r.catches))}
      ${cell(t('Feed stolen'), num(r.totalStolen))}
      ${cell(t('Pile left alone'), `${span(r.idleMs)} <small>${share}%</small>`)}
      ${cell(t('Longest quiet spell'), span(r.longestIdleMs))}
    </div>
    ${r.awards.length ? `<h3>${t('Awards')}</h3><ul class="awards">${r.awards.map((a) => {
      const [title, detail] = awardText(a.kind, a.value);
      return `<li><span class="award-title">${title}</span><strong>${name(a.uid)}</strong><small>${detail}</small></li>`;
    }).join('')}</ul>` : ''}
    ${r.busiestHour != null ? `<h3>${t('Busiest times')}</h3>${hoursChart(r.hours)}
      <p class="muted small">${t('Visits and meals by hour of the day, on your clock. The busiest hour was {0}.', esc(hourRange(r.busiestHour)))}</p>` : ''}
    <h3>${t('Chicken by chicken')}</h3>
    ${order.map((u) => player(r.players[u])).join('')}
    <p class="muted small">${t('A near miss is walking in within five minutes after another chicken finished a meal; for them it was a close shave. Visits a few minutes apart count as one.')}</p>`;
}
