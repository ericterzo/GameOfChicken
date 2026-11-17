// "My chicken" (the personal chicken) and "Flock" (stats and friends).
import type { App, Screen } from '../app';
import {
  addFriendByUid, CRY_SECONDS, deleteAccount, deleteCry, getCry, saveCry, getAllProfiles, getProfiles, hasPassword, removeFriend, renameUser, saveLook,
  searchPlayers, unlockedFor, withLiveYards, type Profile, type Stats,
} from '../api';
import { chickenSvg } from '../ui/chicken';
import { busy, el, esc, num, toast } from '../ui/dom';
import { t } from '../i18n';
import { forgetCry, playBlob, squawk } from '../ui/cries';
import { lookEditor } from '../ui/lookEditor';
import { statsTable } from '../ui/statsTable';

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
    <section class="card form" id="cry">
      <h2>${t('Battle cry')}</h2>
      <p class="muted small">${t('Record up to {0} seconds. It plays when you are caught eating, and whenever you tap your own chicken in a yard.', CRY_SECONDS)}</p>
      <div class="row cry-row">
        <button class="btn" id="cry-rec" type="button">🎙 ${t('Record')}</button>
        <button class="btn" id="cry-play" type="button">▶ ${t('Play')}</button>
      </div>
      <p class="muted small" id="cry-state">${t('Checking…')}</p>
      <div class="row cry-row" id="cry-draft" hidden>
        <button class="btn primary" id="cry-save" type="button">${t('Save battle cry')}</button>
        <button class="btn" id="cry-discard" type="button">${t('Discard')}</button>
      </div>
      <button class="link danger" id="cry-delete" type="button" hidden>${t('Delete my battle cry')}</button>
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
  const editor = lookEditor(p.look, unlockedFor(p), p.uid);
  root.querySelector('#editor')!.append(editor.node);
  const save = root.querySelector<HTMLButtonElement>('#save')!;
  save.onclick = () => void busy(save, async () => {
    await saveLook(p.uid, editor.get(), root.querySelector<HTMLInputElement>('#everywhere')!.checked);
    toast(t('Chicken saved.'), 'good');
  });

  wireCry(root, p.uid);

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

/** The battle-cry recorder on My chicken: record up to five seconds, listen, then keep or discard it. */
function wireCry(root: HTMLElement, uid: string): void {
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const rec = q<HTMLButtonElement>('#cry-rec');
  const play = q<HTMLButtonElement>('#cry-play');
  const state = q<HTMLElement>('#cry-state');
  const draftRow = q<HTMLElement>('#cry-draft');
  const del = q<HTMLButtonElement>('#cry-delete');
  let saved: Blob | null = null;
  let draft: Blob | null = null;
  let recorder: MediaRecorder | null = null;
  let timer = 0;

  const show = () => {
    draftRow.hidden = !draft;
    del.hidden = !saved || !!draft;
    play.disabled = !!recorder;
    state.textContent = recorder ? '' : draft ? t('Listen to it, then save it or try again.')
      : saved ? t('Your battle cry is saved.') : t('No battle cry yet: your chicken just squawks.');
  };
  void getCry(uid).then((b) => { saved = b; show(); }).catch(() => { state.textContent = ''; });

  const stop = () => { clearInterval(timer); if (recorder?.state === 'recording') recorder.stop(); };
  rec.onclick = async () => {
    if (recorder) { stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast(t('This browser cannot record sound.'), 'bad');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast(t('The microphone is blocked. Allow it for this site in your browser settings, then try again.'), 'bad');
      return;
    }
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32_000 });
    const parts: Blob[] = [];
    r.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    r.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      recorder = null;
      draft = new Blob(parts, { type: r.mimeType || type || 'audio/webm' });
      rec.classList.remove('rec');
      rec.textContent = `🎙 ${t('Record again')}`;
      show();
    };
    recorder = r;
    r.start();
    rec.classList.add('rec');
    let left = CRY_SECONDS;
    rec.textContent = `■ ${t('Stop')} · ${left}`;
    show();
    state.textContent = t('Recording… let it out!');
    timer = window.setInterval(() => {
      left -= 1;
      if (left <= 0) stop();
      else rec.textContent = `■ ${t('Stop')} · ${left}`;
    }, 1000);
  };
  play.onclick = () => {
    const b = draft ?? saved;
    if (b) void playBlob(b);
    else void squawk();
  };
  q<HTMLButtonElement>('#cry-save').onclick = (e) => void busy(e.currentTarget as HTMLButtonElement, async () => {
    if (!draft) return;
    await saveCry(uid, draft);
    forgetCry(uid);
    saved = draft;
    draft = null;
    show();
    toast(t('Battle cry saved.'), 'good');
  });
  q<HTMLButtonElement>('#cry-discard').onclick = () => { draft = null; show(); };
  del.onclick = () => void busy(del, async () => {
    await deleteCry(uid);
    forgetCry(uid);
    saved = null;
    show();
  });
}

function statGrid(s: Stats): string {
  const cell = (label: string, value: string) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`;
  return `<div class="stats">
    ${cell(t('Games played'), num(s.gamesPlayed))}
    ${cell(t('Games won'), num(s.wins))}
    ${cell(t('Games lost'), num(s.losses))}
    ${cell(t('Feed eaten'), num(s.totalPoints))}
    ${cell(t('Feed stolen'), num(s.feedStolen))}
    ${cell(t('Feed lost'), num(s.feedLost))}
  </div>`;
}

export const flockScreen: Screen = (root, app) => {
  let alive = true;
  let loadedFor = '';
  root.innerHTML = `
    <section class="card"><h1>${t('Your record')}</h1><div id="mine"></div>
      <p class="muted small">${t('Counts yards that at least one other chicken joined. A yard still running counts as played, with the feed so far.')}</p></section>
    <section class="card">
      <h2>${t('Flock table')}</h2>
      <p class="muted small">${t('You and your friends side by side. Tap a column to sort by it; tap again to reverse.')}</p>
      <div id="table" class="table-wrap"></div>
    </section>
    <section class="card">
      <h2>${t('Your flock')}</h2>
      <form id="add" class="join search">
        <input name="username" type="search" placeholder="${t('Search for a chicken')}" maxlength="16" autocapitalize="none" autocomplete="off" spellcheck="false" aria-label="${t('Search for a chicken')}">
      </form>
      <div id="found"></div>
      <div id="friends"><p class="muted">${t('Counting chickens…')}</p></div>
    </section>`;
  const mine = root.querySelector<HTMLElement>('#mine')!;
  const friends = root.querySelector<HTMLElement>('#friends')!;

  const table = statsTable(root.querySelector<HTMLElement>('#table')!, { meUid: app.profile.uid });
  let friendProfiles: Profile[] = [];
  let live: Profile[] = []; // me and my friends, with yards still running counted in
  const paintTable = () => {
    const rows = [app.profile, ...friendProfiles];
    table.setRows(rows.map((p) => live.find((l) => l.uid === p.uid) ?? p));
    mine.innerHTML = statGrid((live.find((l) => l.uid === app.profile.uid) ?? app.profile).stats);
    void withLiveYards(rows).then((next) => {
      if (!alive || next.map((p) => JSON.stringify(p.stats)).join() === live.map((p) => JSON.stringify(p.stats)).join()) return;
      live = next;
      paintTable();
    });
  };

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
  // Search by any part of a name; results appear as you type.
  const form = root.querySelector<HTMLFormElement>('#add')!;
  const found = root.querySelector<HTMLElement>('#found')!;
  let results: Profile[] = [];
  let searchTimer = 0;
  let searchNo = 0;
  const paintFound = () => {
    const term = (form.username.value as string).trim();
    if (!term) { found.innerHTML = ''; return; }
    found.innerHTML = results.length ? `<ul class="found">${results.slice(0, 20).map((p) => `<li>
        <span class="board-chicken">${chickenSvg(p.look, { px: 40 })}</span><span class="board-name">${esc(p.username)}</span>
        ${p.uid === app.profile.uid ? `<span class="muted small">${t('That is you.')}</span>`
          : app.profile.friends.includes(p.uid) ? `<span class="muted small">${t('In your flock')}</span>`
          : `<button class="btn small" type="button" data-add="${esc(p.uid)}">${t('Add')}</button>`}</li>`).join('')}</ul>`
      : `<p class="muted small">${t('No chicken has a name like that.')}</p>`;
  };
  const search = () => {
    const no = ++searchNo;
    void searchPlayers(form.username.value).then((list) => { if (alive && no === searchNo) { results = list; paintFound(); } })
      .catch(() => { if (alive && no === searchNo) toast(t('Cannot reach the server. Check your connection.'), 'bad'); });
  };
  form.username.oninput = () => { clearTimeout(searchTimer); searchTimer = window.setTimeout(search, 200); };
  form.onsubmit = (e) => { e.preventDefault(); clearTimeout(searchTimer); search(); };
  found.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-add]');
    if (b) void busy(b, async () => {
      await addFriendByUid(app.profile, b.dataset.add!);
      toast(t('Added to your flock.'), 'good');
    });
  });

  refresh();
  const stop = app.onProfile(() => { refresh(); paintFound(); });
  return () => { alive = false; stop(); };
};

const TOP = 100;

/** A small card about one player, with the choice to add them to (or drop them from) the flock. */
function playerCard(app: App, p: Profile): void {
  const box = el<HTMLDialogElement>(`<dialog class="player-card">
    <div class="player-chicken">${chickenSvg(p.look, { px: 120 })}</div>
    <h2>${esc(p.username)}</h2>
    ${statGrid(p.stats)}
    <div class="row"><button class="btn primary" type="button" data-act></button>
      <button class="btn" type="button" data-close>${t('Close')}</button></div>
  </dialog>`);
  const act = box.querySelector<HTMLButtonElement>('[data-act]')!;
  const label = () => { act.textContent = app.profile.friends.includes(p.uid) ? t('Remove from flock') : t('Add to my flock'); };
  label();
  act.onclick = () => void busy(act, async () => {
    if (app.profile.friends.includes(p.uid)) {
      await removeFriend(app.profile.uid, p.uid);
      app.profile.friends.splice(app.profile.friends.indexOf(p.uid), 1);
    } else {
      await addFriendByUid(app.profile, p.uid);
      app.profile.friends.push(p.uid);
      toast(t('Added to your flock.'), 'good');
    }
    label();
  });
  box.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => box.close();
  box.addEventListener('click', (e) => { if (e.target === box) box.close(); }); // a tap outside the card
  box.addEventListener('close', () => box.remove());
  document.body.append(box);
  box.showModal();
}

export const leaderboardScreen: Screen = (root, app) => {
  let alive = true;
  root.innerHTML = `
    <section class="card">
      <h1>${t('Leaderboard')}</h1>
      <p class="muted small">${t('Every chicken in the game, yards still running included. Tap a column to rank by it, or a chicken to add it to your flock. Shows the top {0}.', TOP)}</p>
      <div id="table" class="table-wrap"><p class="muted">${t('Counting every chicken…')}</p></div>
      <p class="muted small" id="board-note"></p>
    </section>`;
  const note = root.querySelector<HTMLElement>('#board-note')!;
  const table = statsTable(root.querySelector<HTMLElement>('#table')!, {
    meUid: app.profile.uid, ranked: true, top: TOP, onPick: (p) => playerCard(app, p),
    onOutside: (outside) => {
      note.textContent = outside ? t('You are outside the top {0} for this column; your row is added at the end.', TOP) : '';
    },
  });
  void getAllProfiles().then(withLiveYards).then((rows) => {
    if (!alive) return;
    table.setRows(rows.some((p) => p.uid === app.profile.uid) ? rows : [...rows, app.profile]);
  }).catch(() => { if (alive) note.textContent = t('Could not load the leaderboard. Check your connection.'); });
  return () => { alive = false; document.querySelectorAll('dialog.player-card').forEach((d) => d.remove()); };
};
