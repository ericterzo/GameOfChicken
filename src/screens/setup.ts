// Creating a yard, and joining one by code. Both end with choosing a chicken.
import type { App, Screen } from '../app';
import { createYard, findYardByCode, getProfiles, joinYard, unlockedFor, type Profile } from '../api';
import { joinHeadStart, MAX_YARD_MS, MODE_BLURBS, MODE_NAMES, settle, type Look, type Mode, type NewYard } from '../game/rules';
import { chickenSvg } from '../ui/chicken';
import { busy, dateTime, el, esc, num, span, toast } from '../ui/dom';
import { t } from '../i18n';
import { lookEditor } from '../ui/lookEditor';

const HOUR = 3600_000;
// Every hour from 1 to 23, then every day from 1 to 14 (the longest a yard may last).
const hourLengths = (): [string, number][] => Array.from({ length: 23 }, (_, i) =>
  [i ? t('{0} hours', i + 1) : t('1 hour'), (i + 1) * HOUR]);
const dayLengths = (): [string, number][] => Array.from({ length: MAX_YARD_MS / (24 * HOUR) }, (_, i) =>
  [i ? t('{0} days', i + 1) : t('1 day'), (i + 1) * 24 * HOUR]);
const DEFAULT_LENGTH = 24 * HOUR;
const lengthOptions = (list: [string, number][]) => list.map(([t, ms]) =>
  `<option value="${ms}" ${ms === DEFAULT_LENGTH ? 'selected' : ''}>${t}</option>`).join('');

/** The "which chicken?" block: personal chicken by default, editable per yard. */
function chickenPicker(app: App): { node: HTMLElement; get: () => Look } {
  const p = app.profile;
  const editor = lookEditor(p.look, unlockedFor(p), p.uid);
  if (!p.lookEverywhere) {
    const node = el(`<div class="field"><span class="label">${t('Your chicken for this yard')}</span></div>`);
    node.append(editor.node);
    return { node, get: editor.get };
  }
  let custom = false;
  const node = el(`<div class="field">
    <span class="label">${t('Your chicken')}</span>
    <div class="own-chicken"><span data-cry="${esc(p.uid)}">${chickenSvg(p.look, { px: 72 })}</span>
      <span>${t('Playing as your personal chicken.')}</span>
      <button type="button" class="link">${t('Change for this yard')}</button></div>
  </div>`);
  node.querySelector('button')!.onclick = () => {
    custom = true;
    node.querySelector('.own-chicken')!.replaceWith(editor.node);
  };
  return { node, get: () => (custom ? editor.get() : p.look) };
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const newYardScreen: Screen = (root, app) => {
  root.innerHTML = `
    <form class="card form" id="new-form">
      <h1>${t('Start a chicken yard')}</h1>
      <label>${t('Yard name')}<input name="yardName" required maxlength="30" placeholder="${t('The back garden')}"></label>

      <div class="field"><span class="label">${t('Game')}</span>
        <div class="modes">${(Object.keys(MODE_NAMES) as Mode[]).map((m, i) => `
          <label class="mode"><input type="radio" name="mode" value="${m}" ${i === 1 ? 'checked' : ''}>
            <span><strong>${t(MODE_NAMES[m])}</strong><small>${t(MODE_BLURBS[m])}</small></span></label>`).join('')}
        </div>
      </div>

      <label id="goal-row" hidden><span id="goal-label"></span>
        <input name="goal" type="number" min="10" step="1" value="3600" inputmode="numeric">
        <small class="muted">${t('One point is one second of eating. 3,600 is an hour’s worth.')}</small></label>

      <label>${t('Yard stays open for')}
        <select name="duration">
          <optgroup label="${t('Hours')}">${lengthOptions(hourLengths())}</optgroup>
          <optgroup label="${t('Days')}">${lengthOptions(dayLengths())}</optgroup>
          <option value="custom">${t('Until a date I pick…')}</option></select></label>
      <label id="until-row" hidden>${t('Closes at')}<input name="until" type="datetime-local">
        <small class="muted">${t('At most a fortnight from now.')}</small></label>

      <label class="check"><input type="checkbox" name="later">
        <span><strong>${t('Start later')}</strong><small>${t('The game begins after a wait you choose. Chickens who join early wait in the yard and see the countdown.')}</small></span></label>
      <div class="row" id="later-times" hidden>
        <label>${t('Hours')}<input name="laterHours" type="number" min="0" max="336" step="1" value="0" inputmode="numeric"></label>
        <label>${t('Minutes')}<input name="laterMinutes" type="number" min="0" max="59" step="1" value="30" inputmode="numeric"></label>
      </div>

      <label class="check"><input type="checkbox" name="hardcore">
        <span><strong>${t('Hardcore')}</strong><small>${t('No timers. Your chicken only eats while this app is open with the screen on.')}</small></span></label>

      <div id="sleep-block">
        <label class="check"><input type="checkbox" name="sleep">
          <span><strong>${t('Sleep hours')}</strong><small>${t('Every night the chickens sleep and nobody can eat.')}</small></span></label>
        <div class="row" id="sleep-times" hidden>
          <label>${t('Asleep from')}<input name="sleepFrom" type="time" value="22:00"></label>
          <label>${t('Awake at')}<input name="sleepTo" type="time" value="07:00"></label>
        </div>
      </div>

      <div id="invite-block"></div>

      <div id="picker"></div>
      <button class="btn primary" type="submit">${t('Open the yard')}</button>
      <a class="link" href="#/">${t('Cancel')}</a>
    </form>`;

  const form = root.querySelector<HTMLFormElement>('#new-form')!;
  const picker = chickenPicker(app);
  form.querySelector('#picker')!.append(picker.node);
  const q = <T extends HTMLElement>(sel: string) => form.querySelector<T>(sel)!;

  // Friends can be invited straight away; they answer from their home screen.
  let friends: Profile[] = [];
  const inviteBlock = q('#invite-block');
  if (!app.profile.friends.length) {
    inviteBlock.innerHTML = `<p class="invite-hint">${t('Add friends under Flock and you can invite them from here.')}</p>`;
  } else {
    inviteBlock.innerHTML = `<div class="field"><span class="label">${t('Invite your flock')}</span>
      <div id="invite-list"><p class="muted small">${t('Calling the flock…')}</p></div>
      <label class="check"><input type="checkbox" name="waitForInvites">
        <span><strong>${t('Wait for everyone')}</strong><small>${t('The game only starts once every invited chicken has joined or declined. You can still start it yourself.')}</small></span></label>
    </div>`;
    void getProfiles(app.profile.friends).then((list) => {
      friends = list.sort((a, b) => a.username.localeCompare(b.username));
      q('#invite-list').innerHTML = friends.map((f) => `<label class="check invitee">
        <input type="checkbox" name="invite" value="${esc(f.uid)}">
        <span class="board-chicken">${chickenSvg(f.look, { px: 36 })}</span><span><strong>${esc(f.username)}</strong></span></label>`).join('');
    });
  }

  const toLocalInput = (t: number) => {
    const d = new Date(t - new Date(t).getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  };
  const sync = () => {
    const mode = form.mode.value as Mode;
    q('#goal-row').hidden = mode === 'sundown';
    q('#goal-label').textContent = mode === 'lastGrain' ? t('Feed in the pile') : t('Target size (points)');
    q('#until-row').hidden = form.duration.value !== 'custom';
    const hardcore = form.hardcore.checked;
    q('#sleep-block').hidden = hardcore;
    q('#sleep-times').hidden = !form.sleep.checked;
    q('#later-times').hidden = !form.later.checked;
    // A set start time decides when the game begins, so there is nothing to wait for.
    const wait = form.querySelector<HTMLInputElement>('input[name=waitForInvites]');
    if (wait) (wait.closest('label') as HTMLElement).hidden = form.later.checked;
    const until = form.until as HTMLInputElement;
    until.min = toLocalInput(Date.now() + 5 * 60000);
    until.max = toLocalInput(Date.now() + MAX_YARD_MS);
    if (!until.value) until.value = toLocalInput(Date.now() + 24 * HOUR);
  };
  form.addEventListener('change', sync);
  sync();

  form.onsubmit = (e) => {
    e.preventDefault();
    void busy(form.querySelector<HTMLButtonElement>('button[type=submit]'), async () => {
      const now = Date.now();
      const mode = form.mode.value as Mode;
      const hardcore = form.hardcore.checked as boolean;
      const custom = form.duration.value === 'custom';
      // "2 weeks" must not tip over the limit while the request travels.
      const delay = form.later.checked
        ? (Math.max(0, Math.floor(Number(form.laterHours.value) || 0)) * 60 + Math.max(0, Math.floor(Number(form.laterMinutes.value) || 0))) * 60_000
        : 0;
      if (form.later.checked && delay < 60_000) throw new Error('The start must be at least a minute away.');
      // The yard keeps its full length from the start; a closing date picked by hand stays as picked.
      const endsAt = custom ? new Date(form.until.value).getTime() - delay : now + Number(form.duration.value) - 5000;
      if (!Number.isFinite(endsAt)) throw new Error(t('Pick when the yard closes.'));
      const opts: NewYard = {
        name: form.yardName.value,
        mode,
        goal: mode === 'sundown' ? null : Number(form.goal.value),
        endsAt,
        hardcore,
        sleep: !hardcore && form.sleep.checked
          ? { startMin: minutes(form.sleepFrom.value), endMin: minutes(form.sleepTo.value), offsetMin: -new Date().getTimezoneOffset() }
          : null,
        startsAt: delay ? now + delay : null,
      };
      const picked = new Set(Array.from(form.querySelectorAll<HTMLInputElement>('input[name=invite]:checked'), (i) => i.value));
      opts.invites = friends.filter((f) => picked.has(f.uid)).map((f) => ({ uid: f.uid, username: f.username }));
      opts.waitForInvites = !delay && !!form.waitForInvites?.checked;
      const id = await createYard(app.profile, opts, picker.get());
      toast(opts.invites.length ? t('Yard open. Your flock has been invited.') : t('Yard open. Share the code with your flock.'), 'good');
      app.go(`#/yard/${id}`);
    });
  };
};

export const joinScreen: Screen = (root, app, [rawCode]) => {
  const code = decodeURIComponent(rawCode ?? '').toUpperCase();
  let alive = true;
  root.innerHTML = `<section class="card"><p class="muted">${t('Looking for that yard…')}</p></section>`;
  const card = root.querySelector<HTMLElement>('.card')!;

  void findYardByCode(code).then((yard) => {
    if (!alive) return;
    if (!yard) {
      card.innerHTML = `<h1>${t('No such yard')}</h1><p>${t('No yard has the code <strong>{0}</strong>. Check it with whoever invited you.', esc(code))}</p>
        <a class="btn" href="#/">${t('Back')}</a>`;
      return;
    }
    if (yard.members[app.profile.uid]) { app.go(`#/yard/${yard.id}`); return; }
    if (yard.status === 'finished' || (yard.status === 'active' && yard.endsAt <= Date.now())) {
      card.innerHTML = `<h1>${esc(yard.name)}</h1><p>${t('This yard has already closed.')}</p><a class="btn" href="#/">${t('Back')}</a>`;
      return;
    }
    const names = yard.memberUids.map((u) => esc(yard.members[u].username)).join(', ');
    const headStart = joinHeadStart(settle(yard, Date.now()));
    card.innerHTML = `<h1>${t('Join {0}', esc(yard.name))}</h1>
      <p><span class="tag-pill">${t(MODE_NAMES[yard.mode])}</span>${yard.hardcore ? `<span class="tag-pill hot">${t('Hardcore')}</span>` : ''}</p>
      <p class="muted">${t(MODE_BLURBS[yard.mode])} ${yard.status === 'waiting' && yard.startsAt != null
        ? t('Starts {0}, then runs for {1}.', dateTime(yard.startsAt), span(yard.endsAt - yard.createdAt))
        : yard.status === 'waiting'
        ? t('Starts once every invited chicken has answered, then runs for {0}.', span(yard.endsAt - yard.createdAt))
        : t('Closes {0}.', dateTime(yard.endsAt))}<br>${t('In the yard: {0}.', names)}</p>
      ${headStart ? `<p class="callout">${t('The game is already under way: you start with {0} points, the average of the chickens already in it.', num(headStart))}</p>` : ''}
      <div id="picker"></div>
      <button class="btn primary" id="join-go" type="button">${t('Join this yard')}</button>
      <a class="link" href="#/">${t('Cancel')}</a>`;
    const picker = chickenPicker(app);
    card.querySelector('#picker')!.append(picker.node);
    const go = card.querySelector<HTMLButtonElement>('#join-go')!;
    go.onclick = () => void busy(go, async () => {
      await joinYard(app.profile, yard.id, picker.get());
      app.go(`#/yard/${yard.id}`);
    });
  }).catch((e) => { if (alive) card.innerHTML = `<p>${esc(t((e as Error).message))}</p><a class="btn" href="#/">${t('Back')}</a>`; });

  return () => { alive = false; };
};
