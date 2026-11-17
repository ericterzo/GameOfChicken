// The yard itself. Having this screen open and visible means "my chicken is in
// the yard": it interrupts anyone else eating and blocks them from starting.
import type { Screen } from '../app';
import {
  chooseSide, claimStats, drawGun, finalizeYard, getBoardLog, hasUnclaimed, leaveYard, logVisit, MAX_NOTE, postNote, startEating, startYardNow, stopEating, touchYard, watchBoard, watchYard,
  type BoardEntry, type YardDoc,
} from '../api';
import {
  allyOf, countsForRecords, duelRival, isAsleep, isOut, mealOf, meals, livePoints, maxMealSeconds, mealPoints, MIN_MEAL_S, MODE_BLURBS, MODE_NAMES, nextWake,
  othersPresent, pileFraction, PRESENCE_MS, settle, sizeFor, whyCannotEat, type Yard,
} from '../game/rules';
import { yardReport } from '../game/report';
import { chickenSvg } from '../ui/chicken';
import { reportHtml } from '../ui/gameReport';
import { busy, clock, dateTime, esc, num, span, toast } from '../ui/dom';
import { t } from '../i18n';
import { sceneClock, yardScene, type SceneChicken } from '../ui/yardScene';

const TIMERS: [string, number][] = [
  ['5s', 5], ['30s', 30], ['1m', 60], ['5m', 300], ['15m', 900], ['1h', 3600], ['4h', 14400], ['8h', 28800],
];

export const yardScreen: Screen = (root, app, [id]) => {
  const uid = app.profile.uid;
  let yard: YardDoc | null = null;
  let seconds = 60;
  let entered = false;
  let touching = false;
  let alive = true;
  let panelKey = '';
  let lastScene = '';
  let lastBoard = '';
  let wake: WakeLockSentinel | null = null;
  let beat = 0;
  let claiming = false;
  let notMember = 0;
  let reported = false;
  let closing = false;

  root.innerHTML = `
    <section class="yard">
      <header class="yard-head"><p class="muted">${t('Walking to the yard…')}</p></header>
      <div class="scene-wrap" id="scene"></div>
      <div class="card panel" id="panel"></div>
      <div class="trigger-wrap" id="trigger-wrap" hidden><button class="btn trigger" id="trigger" type="button"></button></div>
      <div class="card" id="board"></div>
      <div class="card report" id="report" hidden></div>
      <div class="card notice" id="notice" hidden>
        <h2>${t('Notice board')}</h2>
        <form id="note-form" class="join">
          <input name="text" maxlength="${MAX_NOTE}" placeholder="${t('Leave a note for the flock')}" autocomplete="off" aria-label="${t('Leave a note for the flock')}">
          <button class="btn" type="submit">${t('Post')}</button>
        </form>
        <ol class="notes" id="notes"></ol>
      </div>
    </section>`;
  const head = root.querySelector<HTMLElement>('.yard-head')!;
  const scene = root.querySelector<HTMLElement>('#scene')!;
  const panel = root.querySelector<HTMLElement>('#panel')!;
  const board = root.querySelector<HTMLElement>('#board')!;

  const notice = root.querySelector<HTMLElement>('#notice')!;
  const notes = root.querySelector<HTMLElement>('#notes')!;
  let entries: BoardEntry[] = [];
  let lastNotes = '';

  const iAmEating = () => !!yard && !!mealOf(yard, uid);
  const openedAt = Date.now();
  const toasted = new Set<string>();
  let leaving = false;
  // With three or more chickens in the yard, a trigger that takes ten presses to cock.
  const COCK = 10;
  const triggerKey = `trigger:${id}:${uid}`;
  let clicks = COCK;
  try { clicks = Math.max(0, Math.min(COCK, Number(localStorage.getItem(triggerKey) ?? COCK))); } catch { /* fresh trigger */ }
  const saveClicks = () => { try { localStorage.setItem(triggerKey, String(clicks)); } catch { /* lasts until the page closes */ } };

  // ----- presence -----

  async function enter(): Promise<void> {
    if (!alive || touching || document.hidden || !yard || yard.status === 'finished') return;
    touching = true;
    try {
      void logVisit(id, app.profile); // before walking in, so it reads ahead of any catch
      const r = await touchYard(id, uid);
      for (const hit of r.interrupted) {
        const who = r.yard.members[hit.victimUid].username;
        toast(t('You caught {0} eating! Their {1} are gone, you get {2}.', who, num(hit.pointsLost), num(hit.pointsGained)), 'good');
      }
    } catch (e) {
      console.warn('touch failed', e);
    } finally {
      touching = false;
      // Left while that was on its way: it marked me present again, so walk out once more.
      if (!alive || document.hidden) void leaveYard(id, uid);
    }
  }

  /** The app is no longer in front: my chicken walks out of the yard. */
  async function walkOut(): Promise<void> {
    if (!yard || !entered) return;
    // Hardcore meals need the screen: leaving ends the meal (and banks it).
    if (yard.hardcore && iAmEating()) await stopEating(id, uid).catch(() => {});
    await leaveYard(id, uid);
  }

  const onVisibility = () => { if (document.hidden) void walkOut(); else void enter(); };
  const onPageHide = () => void walkOut();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);

  async function syncWakeLock(): Promise<void> {
    const want = !!yard?.hardcore && iAmEating() && !document.hidden;
    try {
      if (want && !wake && 'wakeLock' in navigator) {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      } else if (!want && wake) {
        await wake.release();
        wake = null;
      }
    } catch {
      /* the browser may refuse; the heartbeat still works while the screen is on */
    }
  }

  // ----- drawing -----

  function paintHead(y: Yard, now: number): void {
    const when = y.status === 'finished' ? t('Closed')
      : y.status === 'waiting' && y.startsAt != null ? t('Starts in {0} · runs for {1}', span(y.startsAt - now), span(y.endsAt - y.createdAt))
      : y.status === 'waiting' ? t('Not started · runs for {0}', span(y.endsAt - y.createdAt))
      : t('Closes in {0}', span(y.endsAt - now));
    const html = `<a class="back" href="#/" aria-label="${t('Back to home')}">‹</a>
      <div class="yard-title"><h1>${esc(y.name)}</h1>
        <p><span class="tag-pill">${t(MODE_NAMES[y.mode])}</span>${y.hardcore ? `<span class="tag-pill hot">${t('Hardcore')}</span>` : ''}
        <span class="muted" title="${esc(dateTime(y.endsAt))}">${when}</span></p></div>
      <button class="btn small" id="share" type="button">${t('Invite')} · ${esc(y.joinCode)}</button>`;
    if (head.dataset.html === html) return;
    head.dataset.html = html;
    head.innerHTML = html;
    head.querySelector<HTMLButtonElement>('#share')!.onclick = async () => {
      const url = `${location.origin}${location.pathname}#/join/${y.joinCode}`;
      const text = t('Join my chicken yard “{0}”. Code: {1}', y.name, y.joinCode);
      try {
        if (navigator.share) await navigator.share({ title: t('The Game of Chicken'), text, url });
        else { await navigator.clipboard.writeText(`${text}\n${url}`); toast(t('Invite copied.'), 'good'); }
      } catch { /* share sheet dismissed */ }
    };
  }

  function paintScene(y: Yard, now: number): void {
    const asleep = y.status === 'active' && isAsleep(y.sleep, now);
    // Before the game begins everyone who has joined is shown waiting together.
    // For a moment after a shot, the gun is out and the victim is seen keeling over.
    const bang = y.shot && now - y.shot.at < 3500 && now >= y.shot.at - 5000 ? y.shot : null;
    const inYard = (u: string) =>
      y.status === 'finished' || y.status === 'waiting' || bang?.victimUid === u || u === uid || !!mealOf(y, u) || now - y.members[u].lastSeen < PRESENCE_MS;
    const chickens: SceneChicken[] = y.memberUids.filter(inYard).map((u) => ({
      look: y.members[u].look,
      name: y.members[u].username,
      size: Math.round(sizeFor(y, u, now) * 50) / 50,
      eating: !!mealOf(y, u),
      me: u === uid,
      gun: bang?.byUid === u,
      shot: bang?.victimUid === u,
      horns: !!y.members[u].traitor,
    }));
    // The sky follows the viewer's clock; a new picture each minute is plenty.
    const time = Math.floor(now / 60000) * 60000;
    const html = yardScene({ pile: Math.round(pileFraction(y, now) * 100) / 100, chickens, asleep, time });
    if (html === lastScene) return;
    lastScene = html;
    // Keep the pecking in step with the clock so redraws do not restart it.
    scene.style.setProperty('--peck-delay', `-${now % 900}ms`);
    scene.style.setProperty('--scene-t', sceneClock(now));
    scene.innerHTML = html;
  }

  /** Who has been invited and not answered, shown under the scores. */
  function pendingLine(y: Yard): string {
    const names = (y.invitedUids ?? []).map((u) => y.invitedNames?.[u] ?? t('A chicken'));
    if (!names.length || y.status === 'finished') return '';
    return `<p class="muted small pending">${t('Invited, no answer yet: {0}', esc(names.join(', ')))}</p>`;
  }

  function paintBoard(y: Yard, now: number): void {
    const rows = y.memberUids
      .map((u) => ({ u, m: y.members[u], pts: livePoints(y, u, now) }))
      .sort((a, b) => b.pts - a.pts || a.m.username.localeCompare(b.m.username));
    const goal = y.goal ? ` <span class="muted">${t('of {0}', num(y.goal))}</span>` : '';
    const html = `<h2>${t('Pecking order')}</h2><ol class="board">${rows.map(({ u, m, pts }) => {
      const px = Math.round(30 + 26 * sizeFor(y, u, now));
      const here = y.status === 'active' && (mealOf(y, u) ? t('eating') : now - m.lastSeen < PRESENCE_MS || u === uid ? t('in the yard') : '');
      const won = y.status === 'finished' && y.winnerUids.includes(u);
      const allied = y.status === 'active' && !!allyOf(y, u);
      return `<li class="${u === uid ? 'me' : ''}"><span class="board-chicken">${chickenSvg(m.look, { px, horns: !!m.traitor })}</span>
        <span class="board-name">${esc(m.username)}${won ? ` <span class="tag-pill win">${t('Winner')}</span>` : ''}${allied ? ` <span class="tag-pill ally">${t('Allied')}</span>` : ''}
          ${here ? `<small class="muted">${here}</small>` : ''}</span>
        <span class="board-pts">${num(pts)}${u === rows[0].u ? goal : ''}</span></li>`;
    }).join('')}</ol>${pendingLine(y)}`;
    if (html === lastBoard) return;
    lastBoard = html;
    board.innerHTML = html;
  }

  /** The notice board: notes from the flock and what happened in the yard, newest first. */
  function paintNotes(y: Yard, now: number): void {
    // Names follow the yard, so a renamed chicken reads right in old lines too.
    const name = (u: string | undefined, saved: string | undefined) => esc((u && y.members[u]?.username) || saved || t('A chicken'));
    const today = new Date(now).toDateString();
    const when = (t: number) => (new Date(t).toDateString() === today ? clock(t) : dateTime(t));
    const line = (e: BoardEntry): string => {
      const who = `<strong>${name(e.uid, e.username)}</strong>`;
      if (e.kind === 'chat') return `${who}: ${esc(e.text ?? '')}`;
      if (e.kind === 'visit') return t('{0} was here.', who);
      const them = `<strong>${name(e.victimUid, e.victimName)}</strong>`;
      if (e.kind === 'shot') return e.betrayal ? t('{0} betrayed the alliance with {1} and shot them.', who, them) : t('{0} shot {1}.', who, them);
      if (e.kind === 'duel') {
        if (e.outcome === 'allied') return t('{0} and {1} formed an alliance.', who, them);
        if (e.outcome === 'fought') return t('{0} fought off {1}.', who, them);
        return t('{0} and {1} fought, and both were thrown out.', who, them);
      }
      if (e.kind === 'ate') return t('{0} finished a meal of {1} feed.', who, num(e.amount ?? 0));
      return t('{0} caught {1} eating and took {2} of their {3} feed.', who, `<strong>${name(e.victimUid, e.victimName)}</strong>`, num(e.taken ?? 0), num(e.lost ?? 0));
    };
    const html = entries.length
      ? entries.map((e) => `<li class="note ${e.kind}"><time>${esc(when(e.at))}</time><span>${line(e)}</span></li>`).join('')
      : `<li class="muted">${t('Nothing yet. Notes and yard news show up here.')}</li>`;
    if (html === lastNotes) return;
    lastNotes = html;
    notes.innerHTML = html;
  }

  /** Rebuild the action panel only when its kind changes, so taps and typing survive the clock. */
  function paintPanel(y: Yard, now: number): void {
    const set = (key: string, html: string, wire?: () => void) => {
      if (key !== panelKey) { panelKey = key; panel.innerHTML = html; wire?.(); }
    };
    const text = (sel: string, value: string) => {
      const n = panel.querySelector(sel);
      if (n && n.textContent !== value) n.textContent = value;
    };

    if (y.status === 'finished') {
      const mine = y.members[uid].points;
      const iWon = y.winnerUids.includes(uid);
      const names = y.winnerUids.map((u) => (u === uid ? t('You') : y.members[u].username)).join(' & ');
      const headline = !y.winnerUids.length ? t('Nobody ate. No winner.')
        : y.winnerUids.length > 1 ? t('{0} win the yard', names)
        : iWon ? t('You win the yard') : t('{0} wins the yard', names);
      set(`finished:${headline}`, `<h2>${esc(headline)}</h2><p class="muted">${t('You finished with {0} points.', num(mine))} ${t(MODE_BLURBS[y.mode])}</p>
        ${countsForRecords(y) ? '' : `<p class="muted small">${t('Nobody else joined, so this yard does not count towards your record.')}</p>`}
        <a class="btn" href="#/">${t('Back to your yards')}</a>`);
      return;
    }

    if (y.status === 'waiting' && y.startsAt != null) {
      const mine = y.ownerUid === uid;
      set(`countdown:${mine}:${y.memberUids.length}`, `<h2>${t('The game starts in')}</h2>
        <p class="big countdown" id="count"></p>
        <p class="muted" id="count-at"></p>
        <p>${y.memberUids.length === 1 ? t('You are the first one here.') : t('{0} chickens are waiting in the yard.', y.memberUids.length)}</p>
        ${mine ? `<button class="btn" id="start-now" type="button">${t('Start now')}</button>` : ''}`, () => {
        const b = panel.querySelector<HTMLButtonElement>('#start-now');
        if (b) b.onclick = () => void busy(b, () => startYardNow(id, uid));
      });
      text('#count', span(y.startsAt - now));
      text('#count-at', t('At {0}. Then the yard runs for {1}.', dateTime(y.startsAt), span(y.endsAt - y.createdAt)));
      return;
    }

    if (y.status === 'waiting') {
      const names = (y.invitedUids ?? []).map((u) => y.invitedNames?.[u] ?? t('A chicken'));
      const mine = y.ownerUid === uid;
      const list = esc(names.join(', '));
      set(`waiting:${names.join(',')}:${mine}`, `<h2>${t('Waiting for the flock')}</h2>
        <p>${names.length === 1 ? t('{0} still has to answer. Nobody can eat until then.', list) : t('{0} still have to answer. Nobody can eat until then.', list)}</p>
        ${mine ? `<button class="btn" id="start-now" type="button">${t('Start without them')}</button>`
          : `<p class="muted small">${t('The chicken who opened the yard can also start it early.')}</p>`}`, () => {
        const b = panel.querySelector<HTMLButtonElement>('#start-now');
        if (b) b.onclick = () => void busy(b, () => startYardNow(id, uid));
      });
      return;
    }

    const myMeal = mealOf(y, uid);
    if (myMeal) {
      const allyName = myMeal.allyUid ? esc(y.members[myMeal.allyUid]?.username ?? t('A chicken')) : '';
      const note = allyName
        ? t('Allied meal: {0} cannot catch you, but any other chicken can. When it is over you leave the yard.', allyName)
        : y.hardcore
        ? t('Hardcore: keep this screen on. Leaving the app stops the meal and keeps what you ate.')
        : t('You can close the app; your chicken keeps eating. Anyone who walks in takes the whole meal.');
      set(`eating:${allyName}`, `<p class="big"><span id="meal-pts"></span> <small>${t('this meal')}</small></p>
        <p class="muted" id="meal-left"></p>
        <button class="btn primary" id="stop" type="button">${y.hardcore ? t('Stop feeding') : t('Stop and keep it')}</button>
        <p class="muted small">${note}</p>`, () => {
        const b = panel.querySelector<HTMLButtonElement>('#stop')!;
        b.onclick = () => void busy(b, async () => {
          const before = yard?.members[uid].points ?? 0;
          const r = await stopEating(id, uid);
          toast(t('Banked {0} points.', num(r.yard.members[uid].points - before)), 'good');
        });
      });
      text('#meal-pts', `+${num(mealPoints(y, now, myMeal))}`);
      text('#meal-left', myMeal.endsAt ? t('Done at {0} · {1} left', clock(myMeal.endsAt), span(myMeal.endsAt - now)) : t('Eating until you stop.'));
      return;
    }

    if (isAsleep(y.sleep, now)) {
      const wakeAt = nextWake(y.sleep, now)!;
      set('asleep', `<h2>${t('The chickens are asleep')}</h2><p class="muted" id="wake"></p>`);
      text('#wake', t('Nobody can eat until {0} ({1}).', clock(wakeAt), span(wakeAt - now)));
      return;
    }

    // Exactly two chickens and nobody eating: each chooses, in secret, to ally or to fight.
    const rival = entered ? duelRival(y, uid, now) : null;
    if (rival) {
      const them = esc(y.members[rival].username);
      const duel = y.duel && y.duel.uids.includes(uid) && y.duel.uids.includes(rival) ? y.duel : null;
      const mine = duel?.choices[uid];
      set(`duel:${rival}:${mine ?? ''}`, `<h2>${t('Standoff with {0}', them)}</h2>
        ${mine ? `<p><strong>${mine === 'ally' ? t('You chose to ally.') : t('You chose to fight.')}</strong></p>`
          : `<p>${t('Choose in secret.')}</p>
        <div class="row duel"><button class="btn ally" id="ally" type="button">🤝 ${t('Ally')}</button>
          <button class="btn fight" id="fight" type="button">⚔️ ${t('Fight')}</button></div>`}
        <p class="muted" id="duel-state"></p>
        <ul class="duel-rules muted small">
          <li>${t('Both ally: you feed side by side, each for a secret length of time, and neither can catch the other.')}</li>
          <li>${t('One fights: the fighter keeps the yard and the other is thrown out for 7 minutes.')}</li>
          <li>${t('Both fight: both are thrown out for 12 minutes.')}</li>
        </ul>`, () => {
        for (const choice of ['ally', 'fight'] as const) {
          const b = panel.querySelector<HTMLButtonElement>(`#${choice}`);
          if (b) b.onclick = () => void busy(b, async () => { await chooseSide(id, app.profile, choice); });
        }
      });
      text('#duel-state', duel?.choices[rival] ? t('{0} has made up their mind.', y.members[rival].username)
        : mine ? t('Waiting for {0} to choose…', y.members[rival].username) : '');
      return;
    }

    const why = entered ? whyCannotEat(y, uid, now) : 'Walking in…'; // translated below
    if (why) {
      const watchers = othersPresent(y, uid, now).map((u) => y.members[u].username);
      const who = watchers.join(` ${t('and')} `);
      const msg = !watchers.length ? t(why)
        : watchers.length === 1 ? t('{0} is in the yard. Nobody eats while another chicken is watching.', who)
        : t('{0} are in the yard. Nobody eats while another chicken is watching.', who);
      set(`blocked:${msg}`, `<h2>${watchers.length ? t('Standoff') : t('Hold on')}</h2><p>${esc(msg)}</p>
        ${watchers.length ? `<p class="muted small">${t('Wait them out, or leave and come back later.')}</p>` : ''}`);
      return;
    }

    // Allied and not yet fed: the same choice of meal, safe from the ally.
    const ally = y.pact?.started.includes(uid) ? null : allyOf(y, uid);
    const allyName = ally ? esc(y.members[ally].username) : '';
    const heading = ally ? t('You are allied with {0}', allyName) : t('The yard is yours');
    const allyNote = ally
      ? `<p class="muted small">${t('Your feeding time is secret. {0} cannot catch you, but any other chicken can. When your meal is over, you leave the yard.', allyName)}</p>` : '';
    if (y.hardcore) {
      set(`ready:hardcore:${allyName}`, `<h2>${heading}</h2>${allyNote}
        <button class="btn primary" id="start" type="button">${t('Start feeding')}</button>
        <p class="muted small">${t('Hardcore: no timer. Your chicken eats only while this screen stays on.')}</p>`, () => {
        const b = panel.querySelector<HTMLButtonElement>('#start')!;
        b.onclick = () => void busy(b, async () => { await startEating(id, uid, 0); });
      });
      return;
    }

    set(`ready:${allyName}`, `<h2>${heading}</h2>${allyNote}
      <div class="chips" id="timers">${TIMERS.map(([t, s]) => `<button type="button" class="chip" data-s="${s}">${t}</button>`).join('')}</div>
      <label class="inline">${t('or')} <input id="custom-min" type="number" min="1" step="1" inputmode="numeric" placeholder="${t('minutes')}" aria-label="${t('Custom meal length in minutes')}"> ${t('minutes')}</label>
      <button class="btn primary" id="start" type="button"></button>
      <p class="muted small" id="max-meal"></p>`, () => {
      const custom = panel.querySelector<HTMLInputElement>('#custom-min')!;
      const chips = panel.querySelector<HTMLElement>('#timers')!;
      const mark = () => chips.querySelectorAll<HTMLElement>('.chip').forEach((c) =>
        c.classList.toggle('on', Number(c.dataset.s) === seconds && !custom.value));
      chips.onclick = (e) => {
        const c = (e.target as HTMLElement).closest<HTMLElement>('.chip');
        if (!c) return;
        seconds = Number(c.dataset.s);
        custom.value = '';
        mark();
      };
      custom.oninput = () => {
        const m = Number(custom.value);
        if (m > 0) seconds = Math.round(m * 60);
        mark();
      };
      mark();
      const b = panel.querySelector<HTMLButtonElement>('#start')!;
      b.onclick = () => void busy(b, async () => { await startEating(id, uid, seconds); });
    });
    const max = maxMealSeconds(y, uid, now);
    const length = Math.max(MIN_MEAL_S, Math.min(seconds, max));
    text('#start', t('Start eating for {0}', span(length * 1000)));
    text('#max-meal', max < seconds ? t('Longest meal possible right now: {0}.', span(max * 1000)) : t('Pick how long to eat. You can come back and stop early.'));
  }

  function paintTrigger(y: Yard, now: number): void {
    const wrap = root.querySelector<HTMLElement>('#trigger-wrap')!;
    const show = entered && y.status === 'active' && othersPresent(y, uid, now).length >= 2;
    if (wrap.hidden !== !show) wrap.hidden = !show;
    const label = t('Shoot') + (clicks ? '?'.repeat(clicks) : '!');
    const b = root.querySelector<HTMLButtonElement>('#trigger')!;
    if (b.textContent !== label) b.textContent = label;
    b.classList.toggle('cocked', !clicks);
  }

  function paint(): void {
    if (!alive || !yard) return;
    const now = Date.now();
    const y = settle(yard, now);
    paintTrigger(y, now);
    if (yard.pact?.meals[uid] && !mealOf(y, uid) && !leaving) {
      leaving = true;
      void touchYard(id, uid).catch(() => {}).finally(() => { window.setTimeout(() => { leaving = false; }, 5000); });
    }
    paintHead(y, now);
    paintScene(y, now);
    paintPanel(y, now);
    paintBoard(y, now);
    paintNotes(y, now);
    // The game is over: work out the report from the yard's log, once.
    // (If the clock ended it while I was watching, close it for everyone first.)
    if (y.status === 'finished' && yard.status !== 'finished' && !closing) {
      closing = true;
      void finalizeYard(id).finally(() => { window.setTimeout(() => { closing = false; }, 5000); });
    }
    if (yard.status === 'finished' && !reported) {
      reported = true;
      window.setTimeout(() => void getBoardLog(id).then((log) => {
        if (!alive || !yard) return;
        const report = yardReport(settle(yard, Date.now()), log, (at) => new Date(at).getHours());
        if (!report.hasLog) return; // a yard from before there was a log
        const box = root.querySelector<HTMLElement>('#report')!;
        box.innerHTML = reportHtml(settle(yard, Date.now()), report, uid);
        box.hidden = false;
      }).catch(() => { reported = false; }), 1500); // let the last meal reach the log first
    }
  }

  // ----- live data -----

  const stopWatching = watchYard(id, (next) => {
    if (!alive) return;
    if (!next) {
      root.innerHTML = `<section class="card"><h1>${t('Yard not found')}</h1><a class="btn" href="#/">${t('Back')}</a></section>`;
      return;
    }
    if (!next.members[uid]) {
      // Just after joining, the first picture of the yard can be an older one
      // without me in it: give the fresh one a moment before sending me to join.
      if (!notMember) notMember = window.setTimeout(() => { if (alive) app.go(`#/join/${next.joinCode}`); }, 3000);
      return;
    }
    clearTimeout(notMember);
    notMember = 0;
    // Thrown out (shot, or after a standoff): out of the yard until the wait is over (the home screen shows how long).
    const me = next.members[uid];
    if (isOut(next, uid, Date.now())) {
      const by = next.members[me.outBy ?? '']?.username ?? t('A chicken');
      const left = span(me.outUntil! - Date.now());
      toast(me.outWhy === 'beaten' ? t('{0} chose to fight and threw you out! You are out of the yard for {1}.', by, left)
        : me.outWhy === 'brawl' ? t('You both chose to fight! You and {0} are out of the yard for {1}.', by, left)
        : next.shot?.betrayal && next.shot.victimUid === uid ? t('Betrayed! Your ally {0} shot you. You are out of the yard for {1}.', by, left)
        : t('You have been shot by {0}! You are out of the yard for {1}.', by, left), 'bad');
      app.go('#/');
      return;
    }
    const prev = yard;
    yard = next;
    // My allied meal is over (eaten up, or stopped): the chicken leaves the yard.
    if (prev?.pact?.meals[uid] && !mealOf(next, uid) && me.mealsLost === prev.members[uid].mealsLost) {
      toast(t('Your allied meal is over and your chicken leaves the yard. Banked {0} points.', num(me.points - prev.members[uid].points)), 'good');
      app.go('#/');
      return;
    }
    if (!stopBoard) {
      notice.hidden = false;
      stopBoard = watchBoard(id, (list) => {
        entries = list;
        // How a standoff of mine ended, for whoever did not make the last choice.
        for (const e of list) {
          if (e.kind !== 'duel' || e.at < openedAt - 5000 || toasted.has(e.id) || (e.uid !== uid && e.victimUid !== uid)) continue;
          toasted.add(e.id);
          const other = e.uid === uid ? e.victimName : e.username;
          if (e.outcome === 'allied') toast(t('You and {0} are allies! Choose how long to feed; it stays secret.', other), 'good');
          else if (e.outcome === 'fought' && e.uid === uid) toast(t('{0} offered an alliance, but you fought them off. The yard is yours.', other), 'good');
        }
        paint();
      });
    }
    if (prev && next.members[uid].mealsLost > prev.members[uid].mealsLost) {
      toast(t('Caught! Another chicken walked in and your meal is gone.'), 'bad');
    }
    if (!entered) {
      // First sight of the yard: walk in (this is what interrupts an eater).
      void enter().then(() => { entered = true; paint(); });
      beat = window.setInterval(() => void enter(), next.hardcore ? 10_000 : 15_000);
    } else if (meals(next).some((e) => e.uid !== uid && e.allyUid !== uid)) {
      // Someone started while I am standing here (my presence had lapsed).
      void enter();
    }
    void syncWakeLock();
    // The yard is over: write everyone's result into their record straight away.
    if (hasUnclaimed(next) && !claiming) {
      claiming = true;
      void claimStats(id).finally(() => { claiming = false; });
    }
    paint();
  });

  const trigger = root.querySelector<HTMLButtonElement>('#trigger')!;
  trigger.onclick = () => {
    if (clicks > 0) {
      clicks -= 1;
      saveClicks();
      paint();
      return;
    }
    void busy(trigger, async () => {
      const shot = await drawGun(id, app.profile);
      clicks = COCK;
      saveClicks();
      if (shot?.betrayal) toast(t('Bang! You betrayed {0}. The whole yard will see your horns.', shot.victim), 'good');
      else if (shot) toast(t('Bang! You shot {0}. The yard is yours for a few minutes.', shot.victim), 'good');
      else toast(t('Nobody left to shoot.'));
      paint();
    });
  };

  let stopBoard: (() => void) | null = null;
  const noteForm = root.querySelector<HTMLFormElement>('#note-form')!;
  noteForm.onsubmit = (e) => {
    e.preventDefault();
    const input = noteForm.elements.namedItem('text') as HTMLInputElement;
    void busy(noteForm.querySelector('button'), async () => {
      const shot = await postNote(id, app.profile, input.value);
      input.value = '';
      if (shot?.betrayal) toast(t('Bang! You betrayed {0}. The whole yard will see your horns.', shot.victim), 'good');
      else if (shot) toast(t('Bang! You shot {0}. The yard is yours for a few minutes.', shot.victim), 'good');
    });
  };

  const tick = window.setInterval(paint, 500);

  return () => {
    void walkOut();
    alive = false;
    stopWatching();
    stopBoard?.();
    clearTimeout(notMember);
    clearInterval(tick);
    clearInterval(beat);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    void wake?.release();
  };
};
