import type { Screen } from '../app';
import {
  claimStats, declineInvite, finalizeYard, hasUnclaimed, joinYard, markRead, watchInbox, watchMyInvites, watchMyYards,
  type InboxMessage, type YardDoc,
} from '../api';
import { countsForRecords, isOut, MODE_NAMES, settle, type Member } from '../game/rules';
import { busy, esc, num, span, toast } from '../ui/dom';
import { t } from '../i18n';
import { installHelp } from '../ui/installHelp';
import { sceneClock, yardScene } from '../ui/yardScene';

/** Why I am out of a yard, and for how long. */
export function outLine(m: Member, by: string, left: string): string {
  if (m.outWhy === 'beaten') return t('{0} fought you off. You can go back in {1}.', by, left);
  if (m.outWhy === 'brawl') return t('You and {0} fought and were both thrown out. You can go back in {1}.', by, left);
  return t('You have been shot by {0}. You can go back in {1}.', by, left);
}

export const homeScreen: Screen = (root, app) => {
  const uid = app.profile.uid;
  let yards: YardDoc[] = [];
  let loaded = false;
  const inFlight = new Set<string>();

  root.innerHTML = `
    <div id="inbox"></div>
    <div id="invites"></div>
    <section class="card cosy">
      <div id="cosy-scene"></div>
      <p class="cosy-caption"></p>
    </section>
    <section class="actions">
      <a class="btn primary" href="#/new">${t('Start a chicken yard')}</a>
      <form id="join-form" class="join">
        <input name="code" placeholder="${t('Yard code')}" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="${t('Yard code')}">
        <button class="btn" type="submit">${t('Join')}</button>
      </form>
    </section>
    <section>
      <h2>${t('Your yards')}</h2>
      <div id="yards"><p class="muted">${t('Looking for your yards…')}</p></div>
    </section>
    ${installHelp()}
    <section class="credits">
      <img src="/credits/verdant-outpost-games.webp" alt="Verdant Outpost Games" width="96" height="96" loading="lazy">
      <dl>
        <div><dt>${t('Creator')}</dt><dd>Eric Serra</dd></div>
        <div><dt>${t('Game studio')}</dt><dd>Verdant Outpost Games</dd></div>
      </dl>
    </section>`;

  const cosy = root.querySelector<HTMLElement>('#cosy-scene')!;
  const caption = root.querySelector<HTMLElement>('.cosy-caption')!;
  const inbox = root.querySelector<HTMLElement>('#inbox')!;
  const list = root.querySelector<HTMLElement>('#yards')!;
  const invitesBox = root.querySelector<HTMLElement>('#invites')!;
  let invites: YardDoc[] = [];

  const paintInvites = () => {
    if (!invites.length) { invitesBox.innerHTML = ''; return; }
    invitesBox.innerHTML = `<section class="card invites">
      <h2>${t('You are invited')}</h2>
      ${invites.map((y) => `<div class="invite">
        <p>${t('<strong>{0}</strong> invited you to <strong>{1}</strong>', esc(y.members[y.ownerUid]?.username ?? t('A friend')), esc(y.name))}
          <span class="tag-pill">${t(MODE_NAMES[y.mode])}</span>${y.hardcore ? `<span class="tag-pill hot">${t('Hardcore')}</span>` : ''}<br>
          <span class="muted small">${y.status === 'waiting'
            ? y.startsAt != null ? t('Starts in {0}, then runs for {1}.', span(y.startsAt - Date.now()), span(y.endsAt - y.createdAt))
              : t('Starts when everyone has answered, then runs for {0}.', span(y.endsAt - y.createdAt))
            : t('Already running. Closes in {0}.', span(y.endsAt - Date.now()))}</span></p>
        <div class="row"><button class="btn" type="button" data-accept="${y.id}">${t('Accept')}</button>
          <button class="btn quiet" type="button" data-decline="${y.id}">${t('Decline')}</button></div>
      </div>`).join('')}
    </section>`;
  };

  invitesBox.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-accept],button[data-decline]');
    if (!b) return;
    const y = invites.find((v) => v.id === (b.dataset.accept ?? b.dataset.decline));
    if (!y) return;
    void busy(b, async () => {
      if (b.dataset.decline) { await declineInvite(y.id, uid); return; }
      // With a personal chicken set for every yard there is nothing to choose: join right here.
      if (!app.profile.lookEverywhere) { app.go(`#/join/${y.joinCode}`); return; }
      await joinYard(app.profile, y.id, app.profile.look);
      toast(t('You joined {0}.', y.name), 'good');
    });
  });

  let lastCosy = '';
  const paintCosy = () => {
    const p = app.profile;
    const now = Date.now();
    const html = yardScene({
      pile: 0.55, cosy: true, time: Math.floor(now / 60000) * 60000,
      chickens: [{ look: p.look, name: p.username, size: 0.6, eating: true, me: true }],
    });
    if (html !== lastCosy) {
      lastCosy = html;
      cosy.style.setProperty('--peck-delay', `-${now % 900}ms`);
      cosy.style.setProperty('--scene-t', sceneClock(now));
      cosy.innerHTML = html;
    }
    caption.textContent = t('{0} is safe here. The real yards are below.', p.username);
  };

  const paintInbox = (msgs: InboxMessage[]) => {
    if (!msgs.length) { inbox.innerHTML = ''; return; }
    inbox.innerHTML = `<section class="card alert">
      <h2>${t('While you were away')}</h2>
      <ul>${msgs.map((m) => `<li>${t('<strong>{0}</strong> caught your chicken eating in <strong>{1}</strong>. You lost that meal: {2} points.', esc(m.byUsername), esc(m.yardName), num(m.pointsLost))}</li>`).join('')}</ul>
      <button class="btn" id="inbox-ok" type="button">${t('Got it')}</button>
    </section>`;
    const ok = inbox.querySelector<HTMLButtonElement>('#inbox-ok')!;
    ok.onclick = () => void busy(ok, () => markRead(uid, msgs.map((m) => m.id)));
  };

  // Close yards whose time is up and collect my stats, without entering them.
  const housekeeping = () => {
    const now = Date.now();
    for (const y of yards) {
      if (inFlight.has(y.id)) continue;
      let job: Promise<void> | null = null;
      if (y.status !== 'finished' && settle(y, now).status !== y.status) job = finalizeYard(y.id);
      else if (hasUnclaimed(y)) job = claimStats(y.id);
      if (job) {
        inFlight.add(y.id);
        void job.finally(() => inFlight.delete(y.id));
      }
    }
  };

  const paintYards = () => {
    if (!loaded) return;
    const now = Date.now();
    const view = yards.map((y) => ({ id: y.id, y: settle(y, now) }));
    const open = view.filter((v) => v.y.status !== 'finished').sort((a, b) => a.y.endsAt - b.y.endsAt);
    const closed = view.filter((v) => v.y.status === 'finished').sort((a, b) => b.y.endsAt - a.y.endsAt).slice(0, 10);
    if (!view.length) {
      list.innerHTML = `<p class="muted">${t('You are not in any yard yet. Start one, or join a friend’s with their code.')}</p>`;
      return;
    }
    const row = ({ id, y }: (typeof view)[number]) => {
      const mine = y.members[uid]?.points ?? 0;
      const tags = `<span class="tag-pill">${t(MODE_NAMES[y.mode])}</span>${y.hardcore ? `<span class="tag-pill hot">${t('Hardcore')}</span>` : ''}`;
      let line: string;
      const shot = y.status === 'active' && isOut(y, uid, now);
      if (shot) {
        line = `<strong class="shot">${outLine(y.members[uid], esc(y.members[y.members[uid].outBy ?? '']?.username ?? t('A chicken')), span(y.members[uid].outUntil! - now))}</strong>`;
      } else if (y.status === 'waiting') {
        const left = (y.invitedUids ?? []).length;
        line = y.startsAt != null ? t('Starts in {0}', span(y.startsAt - now))
          : left === 1 ? t('Not started · waiting for 1 invited chicken') : t('Not started · waiting for {0} invited chickens', left);
      } else if (y.status === 'active') {
        line = t('Closes in {0} · you have {1}', span(y.endsAt - now), num(mine));
      } else if (!countsForRecords(y)) {
        line = t('Closed · solo yard, not counted · you had {0}', num(mine));
      } else if (!y.winnerUids.length) {
        line = t('Closed · nobody ate');
      } else {
        const names = y.winnerUids.map((u) => (u === uid ? t('you') : y.members[u].username)).join(' & ');
        line = t('Closed · won by {0} · you had {1}', esc(names), num(mine));
      }
      return `<a class="yard-row${y.status === 'finished' ? ' closed' : ''}" href="#/yard/${id}">
        <span class="yard-name">${esc(y.name)} ${tags}</span>
        <span class="muted">${line}</span>
        <span class="yard-go">${shot ? '' : y.status === 'finished' ? t('View') : t('Enter')}</span></a>`;
    };
    list.innerHTML =
      (open.length ? open.map(row).join('') : `<p class="muted">${t('No open yards right now.')}</p>`) +
      (closed.length ? `<h3>${t('Closed')}</h3>${closed.map(row).join('')}` : '');
  };

  root.querySelector<HTMLFormElement>('#join-form')!.onsubmit = (e) => {
    e.preventDefault();
    const code = (e.target as HTMLFormElement).code.value.trim().toUpperCase();
    if (code) app.go(`#/join/${encodeURIComponent(code)}`);
  };

  paintCosy();
  const stops = [
    app.onProfile(paintCosy),
    watchInbox(uid, paintInbox),
    watchMyInvites(uid, (ys) => { invites = ys; paintInvites(); }),
    watchMyYards(uid, (ys) => { yards = ys; loaded = true; housekeeping(); paintYards(); }),
  ];
  const timer = window.setInterval(() => { housekeeping(); paintYards(); paintCosy(); }, 15_000);
  // While I am shot out of a yard, its wait counts down second by second.
  const shotTimer = window.setInterval(() => {
    const now = Date.now();
    if (yards.some((y) => (y.members[uid]?.outUntil ?? 0) > now - 2000)) paintYards();
  }, 1000);
  return () => { stops.forEach((s) => s()); clearInterval(timer); clearInterval(shotTimer); };
};
