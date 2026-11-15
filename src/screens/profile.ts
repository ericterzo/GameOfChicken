// "My chicken" (the personal chicken) and "Flock" (stats and friends).
import type { Screen } from '../app';
import { addFriend, getProfiles, removeFriend, saveLook, type Profile, type Stats } from '../api';
import { chickenSvg } from '../ui/chicken';
import { busy, esc, num, toast } from '../ui/dom';
import { lookEditor } from '../ui/lookEditor';

export const chickenScreen: Screen = (root, app) => {
  const p = app.profile;
  root.innerHTML = `
    <section class="card form">
      <h1>My chicken</h1>
      <p class="muted">This is your personal chicken. It greets you on the home screen and is offered whenever you start or join a yard.</p>
      <div id="editor"></div>
      <label class="check"><input type="checkbox" id="everywhere" ${p.lookEverywhere ? 'checked' : ''}>
        <span><strong>Use this chicken in every yard</strong><small>Skip the chicken picker when starting or joining a yard.</small></span></label>
      <button class="btn primary" id="save" type="button">Save my chicken</button>
      <p class="muted small">Yards you are already in keep the chicken you chose for them.</p>
    </section>`;
  const editor = lookEditor(p.look);
  root.querySelector('#editor')!.append(editor.node);
  const save = root.querySelector<HTMLButtonElement>('#save')!;
  save.onclick = () => void busy(save, async () => {
    await saveLook(p.uid, editor.get(), root.querySelector<HTMLInputElement>('#everywhere')!.checked);
    toast('Chicken saved.', 'good');
  });
};

function statGrid(s: Stats): string {
  const cell = (label: string, value: string) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`;
  return `<div class="stats">
    ${cell('Yards won', num(s.wins))}
    ${cell('Yards played', num(s.gamesPlayed))}
    ${cell('Biggest chicken', num(s.biggestChicken))}
    ${cell('Total eaten', num(s.totalPoints))}
    ${cell('Meals stolen', num(s.mealsStolen))}
    ${cell('Meals lost', num(s.mealsLost))}
  </div>`;
}

export const flockScreen: Screen = (root, app) => {
  let alive = true;
  let loadedFor = '';
  root.innerHTML = `
    <section class="card"><h1>Your record</h1><div id="mine"></div>
      <p class="muted small">Counts closed yards that at least one other chicken joined. “Biggest chicken” is your best score in a single yard.</p></section>
    <section class="card">
      <h2>Your flock</h2>
      <form id="add" class="join">
        <input name="username" placeholder="Friend’s username" maxlength="16" autocapitalize="none" autocomplete="off" spellcheck="false" aria-label="Friend’s username">
        <button class="btn" type="submit">Add</button>
      </form>
      <div id="friends"><p class="muted">Counting chickens…</p></div>
    </section>`;
  const mine = root.querySelector<HTMLElement>('#mine')!;
  const friends = root.querySelector<HTMLElement>('#friends')!;

  const paintFriends = (list: Profile[]) => {
    if (!list.length) {
      friends.innerHTML = '<p class="muted">Nobody yet. Add a friend by their username to see how they are doing.</p>';
      return;
    }
    list.sort((a, b) => b.stats.wins - a.stats.wins || a.username.localeCompare(b.username));
    friends.innerHTML = list.map((f) => `<details class="friend">
      <summary><span class="board-chicken">${chickenSvg(f.look, { px: 44 })}</span>
        <span class="board-name">${esc(f.username)}</span>
        <span class="muted">${num(f.stats.wins)} won of ${num(f.stats.gamesPlayed)}</span></summary>
      ${statGrid(f.stats)}
      <button class="link danger" type="button" data-remove="${esc(f.uid)}">Remove from flock</button>
    </details>`).join('');
  };

  const refresh = () => {
    const p = app.profile;
    mine.innerHTML = statGrid(p.stats);
    const key = p.friends.join(',');
    if (key === loadedFor) return;
    loadedFor = key;
    void getProfiles(p.friends).then((list) => { if (alive) paintFriends(list); });
  };

  friends.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-remove]');
    if (b) void busy(b, () => removeFriend(app.profile.uid, b.dataset.remove!));
  });
  const form = root.querySelector<HTMLFormElement>('#add')!;
  form.onsubmit = (e) => {
    e.preventDefault();
    void busy(form.querySelector('button'), async () => {
      await addFriend(app.profile, form.username.value);
      form.reset();
      toast('Added to your flock.', 'good');
    });
  };

  refresh();
  const stop = app.onProfile(refresh);
  return () => { alive = false; stop(); };
};
