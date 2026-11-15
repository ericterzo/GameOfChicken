// The yard itself. Having this screen open and visible means "my chicken is in
// the yard": it interrupts anyone else eating and blocks them from starting.
import type { Screen } from '../app';
import { leaveYard, startEating, stopEating, touchYard, watchYard, type YardDoc } from '../api';
import {
  isAsleep, livePoints, maxMealSeconds, mealPoints, MIN_MEAL_S, MODE_BLURBS, MODE_NAMES, nextWake,
  othersPresent, pileFraction, PRESENCE_MS, settle, sizeFor, whyCannotEat, type Yard,
} from '../game/rules';
import { chickenSvg } from '../ui/chicken';
import { busy, clock, dateTime, esc, num, span, toast } from '../ui/dom';
import { yardScene, type SceneChicken } from '../ui/yardScene';

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

  root.innerHTML = `
    <section class="yard">
      <header class="yard-head"><p class="muted">Walking to the yard…</p></header>
      <div class="scene-wrap" id="scene"></div>
      <div class="card panel" id="panel"></div>
      <div class="card" id="board"></div>
    </section>`;
  const head = root.querySelector<HTMLElement>('.yard-head')!;
  const scene = root.querySelector<HTMLElement>('#scene')!;
  const panel = root.querySelector<HTMLElement>('#panel')!;
  const board = root.querySelector<HTMLElement>('#board')!;

  const iAmEating = () => yard?.eating?.uid === uid;

  // ----- presence -----

  async function enter(): Promise<void> {
    if (!alive || touching || document.hidden || !yard || yard.status === 'finished') return;
    touching = true;
    try {
      const r = await touchYard(id, uid);
      const hit = r.interrupted;
      if (hit) {
        const who = r.yard.members[hit.victimUid].username;
        toast(`You caught ${who} eating! Their ${num(hit.pointsLost)} are gone, you get ${num(hit.pointsGained)}.`, 'good');
      }
    } catch (e) {
      console.warn('touch failed', e);
    } finally {
      touching = false;
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
    const when = y.status === 'finished' ? 'Closed' : `Closes in ${span(y.endsAt - now)}`;
    const html = `<a class="back" href="#/" aria-label="Back to home">‹</a>
      <div class="yard-title"><h1>${esc(y.name)}</h1>
        <p><span class="tag-pill">${MODE_NAMES[y.mode]}</span>${y.hardcore ? '<span class="tag-pill hot">Hardcore</span>' : ''}
        <span class="muted" title="${esc(dateTime(y.endsAt))}">${when}</span></p></div>
      <button class="btn small" id="share" type="button">Invite · ${esc(y.joinCode)}</button>`;
    if (head.dataset.html === html) return;
    head.dataset.html = html;
    head.innerHTML = html;
    head.querySelector<HTMLButtonElement>('#share')!.onclick = async () => {
      const url = `${location.origin}${location.pathname}#/join/${y.joinCode}`;
      const text = `Join my chicken yard "${y.name}". Code: ${y.joinCode}`;
      try {
        if (navigator.share) await navigator.share({ title: 'Chicken Yard', text, url });
        else { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Invite copied.', 'good'); }
      } catch { /* share sheet dismissed */ }
    };
  }

  function paintScene(y: Yard, now: number): void {
    const night = y.status === 'active' && isAsleep(y.sleep, now);
    const inYard = (u: string) =>
      y.status === 'finished' || u === uid || y.eating?.uid === u || now - y.members[u].lastSeen < PRESENCE_MS;
    const chickens: SceneChicken[] = y.memberUids.filter(inYard).map((u) => ({
      look: y.members[u].look,
      name: y.members[u].username,
      size: Math.round(sizeFor(y, u, now) * 50) / 50,
      eating: y.eating?.uid === u,
      me: u === uid,
    }));
    const html = yardScene({ pile: Math.round(pileFraction(y, now) * 100) / 100, chickens, night });
    if (html === lastScene) return;
    lastScene = html;
    // Keep the pecking in step with the clock so redraws do not restart it.
    scene.style.setProperty('--peck-delay', `-${now % 900}ms`);
    scene.innerHTML = html;
  }

  function paintBoard(y: Yard, now: number): void {
    const rows = y.memberUids
      .map((u) => ({ u, m: y.members[u], pts: livePoints(y, u, now) }))
      .sort((a, b) => b.pts - a.pts || a.m.username.localeCompare(b.m.username));
    const goal = y.goal ? ` <span class="muted">of ${num(y.goal)}</span>` : '';
    const html = `<h2>Pecking order</h2><ol class="board">${rows.map(({ u, m, pts }) => {
      const px = Math.round(30 + 26 * sizeFor(y, u, now));
      const here = y.status === 'active' && (y.eating?.uid === u ? 'eating' : now - m.lastSeen < PRESENCE_MS || u === uid ? 'in the yard' : '');
      const won = y.status === 'finished' && y.winnerUids.includes(u);
      return `<li class="${u === uid ? 'me' : ''}"><span class="board-chicken">${chickenSvg(m.look, { px })}</span>
        <span class="board-name">${esc(m.username)}${won ? ' <span class="tag-pill win">Winner</span>' : ''}
          ${here ? `<small class="muted">${here}</small>` : ''}</span>
        <span class="board-pts">${num(pts)}${u === rows[0].u ? goal : ''}</span></li>`;
    }).join('')}</ol>`;
    if (html === lastBoard) return;
    lastBoard = html;
    board.innerHTML = html;
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
      const names = y.winnerUids.map((u) => (u === uid ? 'You' : y.members[u].username));
      const headline = !names.length ? 'Nobody ate. No winner.'
        : `${names.join(' & ')} ${names.length === 1 && names[0] !== 'You' ? 'wins' : 'win'} the yard`;
      set('finished', `<h2>${esc(headline)}</h2><p class="muted">You finished with ${num(mine)} points. ${MODE_BLURBS[y.mode]}</p>
        <a class="btn" href="#/">Back to your yards</a>`);
      return;
    }

    if (y.eating?.uid === uid) {
      const note = y.hardcore
        ? 'Hardcore: keep this screen on. Leaving the app stops the meal and keeps what you ate.'
        : 'You can close the app; your chicken keeps eating. Anyone who walks in takes the whole meal.';
      set('eating', `<p class="big"><span id="meal-pts"></span> <small>this meal</small></p>
        <p class="muted" id="meal-left"></p>
        <button class="btn primary" id="stop" type="button">${y.hardcore ? 'Stop feeding' : 'Stop and keep it'}</button>
        <p class="muted small">${note}</p>`, () => {
        const b = panel.querySelector<HTMLButtonElement>('#stop')!;
        b.onclick = () => void busy(b, async () => {
          const before = yard?.members[uid].points ?? 0;
          const r = await stopEating(id, uid);
          toast(`Banked ${num(r.yard.members[uid].points - before)} points.`, 'good');
        });
      });
      text('#meal-pts', `+${num(mealPoints(y, now))}`);
      text('#meal-left', y.eating.endsAt ? `Done at ${clock(y.eating.endsAt)} · ${span(y.eating.endsAt - now)} left` : 'Eating until you stop.');
      return;
    }

    if (isAsleep(y.sleep, now)) {
      const wakeAt = nextWake(y.sleep, now)!;
      set('asleep', '<h2>The chickens are asleep</h2><p class="muted" id="wake"></p>');
      text('#wake', `Nobody can eat until ${clock(wakeAt)} (${span(wakeAt - now)}).`);
      return;
    }

    const why = entered ? whyCannotEat(y, uid, now) : 'Walking in…';
    if (why) {
      const watchers = othersPresent(y, uid, now).map((u) => y.members[u].username);
      const msg = watchers.length
        ? `${watchers.join(' and ')} ${watchers.length === 1 ? 'is' : 'are'} in the yard. Nobody eats while another chicken is watching.`
        : why;
      set(`blocked:${msg}`, `<h2>${watchers.length ? 'Standoff' : 'Hold on'}</h2><p>${esc(msg)}</p>
        ${watchers.length ? '<p class="muted small">Wait them out, or leave and come back later.</p>' : ''}`);
      return;
    }

    if (y.hardcore) {
      set('ready:hardcore', `<h2>The yard is yours</h2>
        <button class="btn primary" id="start" type="button">Start feeding</button>
        <p class="muted small">Hardcore: no timer. Your chicken eats only while this screen stays on.</p>`, () => {
        const b = panel.querySelector<HTMLButtonElement>('#start')!;
        b.onclick = () => void busy(b, async () => { await startEating(id, uid, 0); });
      });
      return;
    }

    set('ready', `<h2>The yard is yours</h2>
      <div class="chips" id="timers">${TIMERS.map(([t, s]) => `<button type="button" class="chip" data-s="${s}">${t}</button>`).join('')}</div>
      <label class="inline">or <input id="custom-min" type="number" min="1" step="1" inputmode="numeric" placeholder="minutes" aria-label="Custom meal length in minutes"> minutes</label>
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
    text('#start', `Start eating for ${span(length * 1000)}`);
    text('#max-meal', max < seconds ? `Longest meal possible right now: ${span(max * 1000)}.` : 'Pick how long to eat. You can come back and stop early.');
  }

  function paint(): void {
    if (!alive || !yard) return;
    const now = Date.now();
    const y = settle(yard, now);
    paintHead(y, now);
    paintScene(y, now);
    paintPanel(y, now);
    paintBoard(y, now);
  }

  // ----- live data -----

  const stopWatching = watchYard(id, (next) => {
    if (!alive) return;
    if (!next) {
      root.innerHTML = '<section class="card"><h1>Yard not found</h1><a class="btn" href="#/">Back</a></section>';
      return;
    }
    if (!next.members[uid]) { app.go(`#/join/${next.joinCode}`); return; }
    const prev = yard;
    yard = next;
    if (prev && next.members[uid].mealsLost > prev.members[uid].mealsLost) {
      toast('Caught! Another chicken walked in and your meal is gone.', 'bad');
    }
    if (!entered) {
      // First sight of the yard: walk in (this is what interrupts an eater).
      void enter().then(() => { entered = true; paint(); });
      beat = window.setInterval(() => void enter(), next.hardcore ? 10_000 : 15_000);
    } else if (next.eating && next.eating.uid !== uid) {
      // Someone started while I am standing here (my presence had lapsed).
      void enter();
    }
    void syncWakeLock();
    paint();
  });

  const tick = window.setInterval(paint, 500);

  return () => {
    void walkOut();
    alive = false;
    stopWatching();
    clearInterval(tick);
    clearInterval(beat);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    void wake?.release();
  };
};
