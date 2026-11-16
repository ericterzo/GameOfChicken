// "My chicken" (the personal chicken) and "Flock" (stats and friends).
import type { Screen } from '../app';
import {
  addFriend, deleteAccount, getLeaderboard, getProfiles, hasPassword, removeFriend, renameUser, saveLook, unlockedFor,
  type Profile, type Stats,
} from '../api';
import { chickenSvg } from '../ui/chicken';
import { busy, esc, num, toast } from '../ui/dom';
import { t } from '../i18n';
import { lookEditor } from '../ui/lookEditor';
import { statsTable, type StatCol } from '../ui/statsTable';

export const chickenScreen: Screen = (root, app) => {
  const p = app.profile;
  root.innerHTML = `
    <section class="card form">
      <h1>${t('My chicken')}</h1>
      <p class="muted">${t('This is your personal chicken. It greets you on the home screen and is offered whenever you start or join a yard.')}</p>
      <div id="editor"></div>
      <label class="check"><input type="checkbox" id="everywhere" ${p.lookEverywhere ? 'checked' : ''}>
        <span><strong>${t('Use this chicken in every yard')}</strong><small>${t('Skip the chicken picker when starting or joining a yard.')}</small></span></label>
      <button class="btn primary" id="save" type="button">${t('Save my chicken')}</button>
      <p class="muted small">${t('Yards you are already in keep the chicken you chose for them.')}</p>
    </section>
    <section class="card form">
      <h2>${t('Account')}</h2>
      <form id="rename">
        <label>${t('Username')}<input name="username" required minlength="3" maxlength="16" value="${esc(p.username)}" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
        <button class="btn" type="submit">${t('Change username')}</button>
      </form>
      <p class="muted small">${t('Your record, flock and yards come with you.')} ${hasPassword() ? `${t('You sign in with the new name and the same password.')} ` : ''}${t('The old name becomes free for someone else.')}</p>
      <details class="danger-zone">
        <summary class="link danger">${t('Delete my account')}</summary>
        <p>${t('This removes your chicken, your record, your username and your sign-in for good. It cannot be undone. Yards you played in keep your scores under the name “Departed chicken”.')}</p>
        <form id="delete">
          ${hasPassword()
            ? `<label>${t('Password, to confirm')}<input name="password" type="password" required autocomplete="current-password"></label>`
            : `<p class="muted small">${t('Google will ask you to confirm it is you.')}</p>`}
          <button class="btn danger" type="submit">${t('Delete my account forever')}</button>
        </form>
      </details>
    </section>`;
  const editor = lookEditor(p.look, unlockedFor(p));
  root.querySelector('#editor')!.append(editor.node);
  const save = root.querySelector<HTMLButtonElement>('#save')!;
  save.onclick = () => void busy(save, async () => {
    await saveLook(p.uid, editor.get(), root.querySelector<HTMLInputElement>('#everywhere')!.checked);
    toast(t('Chicken saved.'), 'good');
  });

  const rename = root.querySelector<HTMLFormElement>('#rename')!;
  rename.onsubmit = (e) => {
    e.preventDefault();
    void busy(rename.querySelector('button'), async () => {
      const wanted = rename.username.value.trim();
      if (wanted === app.profile.username) return;
      await renameUser(app.profile, wanted);
      toast(t('You are now {0}.', wanted), 'good');
    });
  };
  const del = root.querySelector<HTMLFormElement>('#delete')!;
  del.onsubmit = (e) => {
    e.preventDefault();
    if (!confirm(t('Delete your account for good? This cannot be undone.'))) return;
    const password = (del.elements.namedItem('password') as HTMLInputElement | null)?.value ?? '';
    void busy(del.querySelector('button'), async () => {
      await deleteAccount(app.profile, password);
      toast(t('Your account is deleted. Goodbye!'), 'info');
    });
  };
};

function statGrid(s: Stats): string {
  const cell = (label: string, value: string) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`;
  return `<div class="stats">
    ${cell(t('Yards won'), num(s.wins))}
    ${cell(t('Yards played'), num(s.gamesPlayed))}
    ${cell(t('Biggest chicken'), num(s.biggestChicken))}
    ${cell(t('Total eaten'), num(s.totalPoints))}
    ${cell(t('Meals stolen'), num(s.mealsStolen))}
    ${cell(t('Meals lost'), num(s.mealsLost))}
  </div>`;
}

export const flockScreen: Screen = (root, app) => {
  let alive = true;
  let loadedFor = '';
  root.innerHTML = `
    <section class="card"><h1>${t('Your record')}</h1><div id="mine"></div>
      <p class="muted small">${t('Counts closed yards that at least one other chicken joined. “Biggest chicken” is your best score in a single yard.')}</p></section>
    <section class="card">
      <h2>${t('Flock table')}</h2>
      <p class="muted small">${t('You and your friends side by side. Tap a column to sort by it; tap again to reverse.')}</p>
      <div id="table" class="table-wrap"></div>
    </section>
    <section class="card">
      <h2>${t('Your flock')}</h2>
      <form id="add" class="join">
        <input name="username" placeholder="${t('Friend’s username')}" maxlength="16" autocapitalize="none" autocomplete="off" spellcheck="false" aria-label="${t('Friend’s username')}">
        <button class="btn" type="submit">${t('Add')}</button>
      </form>
      <div id="friends"><p class="muted">${t('Counting chickens…')}</p></div>
    </section>`;
  const mine = root.querySelector<HTMLElement>('#mine')!;
  const friends = root.querySelector<HTMLElement>('#friends')!;

  const table = statsTable(root.querySelector<HTMLElement>('#table')!, { meUid: app.profile.uid });
  let friendProfiles: Profile[] = [];
  const paintTable = () => table.setRows([app.profile, ...friendProfiles]);

  const paintFriends = (list: Profile[]) => {
    friendProfiles = list;
    paintTable();
    if (!list.length) {
      friends.innerHTML = `<p class="muted">${t('Nobody yet. Add a friend by their username to see how they are doing.')}</p>`;
      return;
    }
    list.sort((a, b) => b.stats.wins - a.stats.wins || a.username.localeCompare(b.username));
    friends.innerHTML = list.map((f) => `<details class="friend">
      <summary><span class="board-chicken">${chickenSvg(f.look, { px: 44 })}</span>
        <span class="board-name">${esc(f.username)}</span>
        <span class="muted">${t('{0} won of {1}', num(f.stats.wins), num(f.stats.gamesPlayed))}</span></summary>
      ${statGrid(f.stats)}
      <button class="link danger" type="button" data-remove="${esc(f.uid)}">${t('Remove from flock')}</button>
    </details>`).join('');
  };

  const refresh = () => {
    const p = app.profile;
    mine.innerHTML = statGrid(p.stats);
    paintTable();
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
      toast(t('Added to your flock.'), 'good');
    });
  };

  refresh();
  const stop = app.onProfile(refresh);
  return () => { alive = false; stop(); };
};

const TOP = 100;

export const leaderboardScreen: Screen = (root, app) => {
  let alive = true;
  let request = 0;
  root.innerHTML = `
    <section class="card">
      <h1>${t('Leaderboard')}</h1>
      <p class="muted small">${t('Every chicken that has joined the game. Tap a column to rank by it; tap again to reverse. Shows the top {0}.', TOP)}</p>
      <div id="table" class="table-wrap"><p class="muted">${t('Counting every chicken…')}</p></div>
      <p class="muted small" id="board-note"></p>
    </section>`;
  const note = root.querySelector<HTMLElement>('#board-note')!;

  const load = (key: StatCol, desc: boolean) => {
    const mine = ++request;
    void getLeaderboard(key, desc, TOP).then((rows) => {
      if (!alive || mine !== request) return;
      // Always show the player themselves, even from outside the top list.
      const outside = !rows.some((p) => p.uid === app.profile.uid);
      table.setRows(outside ? [...rows, app.profile] : rows);
      note.textContent = outside ? t('You are outside the top {0} for this column; your row is added at the end.', TOP) : '';
    }).catch(() => { if (alive && mine === request) note.textContent = t('Could not load the leaderboard. Check your connection.'); });
  };

  const table = statsTable(root.querySelector<HTMLElement>('#table')!, { meUid: app.profile.uid, ranked: true, onSort: load });
  load('wins', true);
  return () => { alive = false; };
};
