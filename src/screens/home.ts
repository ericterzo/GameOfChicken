import type { Screen } from '../app';
import {
  claimStats, finalizeYard, markRead, watchInbox, watchMyYards, type InboxMessage, type YardDoc,
} from '../api';
import { countsForRecords, MODE_NAMES, settle } from '../game/rules';
import { busy, esc, num, span } from '../ui/dom';
import { installHelp } from '../ui/installHelp';
import { yardScene } from '../ui/yardScene';

export const homeScreen: Screen = (root, app) => {
  const uid = app.profile.uid;
  let yards: YardDoc[] = [];
  let loaded = false;
  const inFlight = new Set<string>();

  root.innerHTML = `
    <div id="inbox"></div>
    <section class="card cosy">
      <div id="cosy-scene"></div>
      <p class="cosy-caption"></p>
    </section>
    <section class="actions">
      <a class="btn primary" href="#/new">Start a chicken yard</a>
      <form id="join-form" class="join">
        <input name="code" placeholder="Yard code" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="Yard code">
        <button class="btn" type="submit">Join</button>
      </form>
    </section>
    <section>
      <h2>Your yards</h2>
      <div id="yards"><p class="muted">Looking for your yards…</p></div>
    </section>
    ${installHelp()}`;

  const cosy = root.querySelector<HTMLElement>('#cosy-scene')!;
  const caption = root.querySelector<HTMLElement>('.cosy-caption')!;
  const inbox = root.querySelector<HTMLElement>('#inbox')!;
  const list = root.querySelector<HTMLElement>('#yards')!;

  const paintCosy = () => {
    const p = app.profile;
    cosy.style.setProperty('--peck-delay', `-${Date.now() % 900}ms`);
    cosy.innerHTML = yardScene({
      pile: 0.55, cosy: true,
      chickens: [{ look: p.look, name: p.username, size: 0.6, eating: true, me: true }],
    });
    caption.textContent = `${p.username} is safe here. The real yards are below.`;
  };

  const paintInbox = (msgs: InboxMessage[]) => {
    if (!msgs.length) { inbox.innerHTML = ''; return; }
    inbox.innerHTML = `<section class="card alert">
      <h2>While you were away</h2>
      <ul>${msgs.map((m) => `<li><strong>${esc(m.byUsername)}</strong> caught your chicken eating in
        <strong>${esc(m.yardName)}</strong>. You lost that meal: ${num(m.pointsLost)} points.</li>`).join('')}</ul>
      <button class="btn" id="inbox-ok" type="button">Got it</button>
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
      if (y.status === 'active' && settle(y, now).status === 'finished') job = finalizeYard(y.id);
      else if (y.status === 'finished' && !y.members[uid]?.statsClaimed) job = claimStats(uid, y.id);
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
    const open = view.filter((v) => v.y.status === 'active').sort((a, b) => a.y.endsAt - b.y.endsAt);
    const closed = view.filter((v) => v.y.status === 'finished').sort((a, b) => b.y.endsAt - a.y.endsAt).slice(0, 10);
    if (!view.length) {
      list.innerHTML = '<p class="muted">You are not in any yard yet. Start one, or join a friend’s with their code.</p>';
      return;
    }
    const row = ({ id, y }: (typeof view)[number]) => {
      const mine = y.members[uid]?.points ?? 0;
      const tags = `<span class="tag-pill">${MODE_NAMES[y.mode]}</span>${y.hardcore ? '<span class="tag-pill hot">Hardcore</span>' : ''}`;
      let line: string;
      if (y.status === 'active') {
        line = `Closes in ${span(y.endsAt - now)} · you have ${num(mine)}`;
      } else if (!countsForRecords(y)) {
        line = `Closed · solo yard, not counted · you had ${num(mine)}`;
      } else if (!y.winnerUids.length) {
        line = 'Closed · nobody ate';
      } else {
        const names = y.winnerUids.map((u) => (u === uid ? 'you' : y.members[u].username)).join(' & ');
        line = `Closed · won by ${esc(names)} · you had ${num(mine)}`;
      }
      return `<a class="yard-row${y.status === 'finished' ? ' closed' : ''}" href="#/yard/${id}">
        <span class="yard-name">${esc(y.name)} ${tags}</span>
        <span class="muted">${line}</span>
        <span class="yard-go">${y.status === 'active' ? 'Enter' : 'View'}</span></a>`;
    };
    list.innerHTML =
      (open.length ? open.map(row).join('') : '<p class="muted">No open yards right now.</p>') +
      (closed.length ? `<h3>Closed</h3>${closed.map(row).join('')}` : '');
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
    watchMyYards(uid, (ys) => { yards = ys; loaded = true; housekeeping(); paintYards(); }),
  ];
  const timer = window.setInterval(() => { housekeeping(); paintYards(); }, 15_000);
  return () => { stops.forEach((s) => s()); clearInterval(timer); };
};
