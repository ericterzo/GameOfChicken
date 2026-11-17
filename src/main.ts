import './style.css';
import type { App, Screen } from './app';
import { isSigningUp, ONLINE_BEAT_MS, onUser, setOnline, signOut, unlockGift, watchProfile, type Profile } from './api';
import { configMissing } from './firebase';
import { authScreen, usernameScreen } from './screens/auth';
import { helpScreen } from './screens/help';
import { homeScreen } from './screens/home';
import { chickenScreen, flockScreen, leaderboardScreen } from './screens/profile';
import { joinScreen, newYardScreen } from './screens/setup';
import { yardScreen } from './screens/yard';
import { getLang, LANG_GIFT, langMenu, onLang, t, wireLangMenu } from './i18n';
import { identify, pageview, startAnalytics } from './analytics';
import { playCry, unlockAudio } from './ui/cries';
import { music } from './ui/music';
import { esc, toast } from './ui/dom';

const root = document.getElementById('app')!;
let uid: string | null | undefined; // undefined = still finding out
let profile: Profile | null = null;
let profileLoaded = false;
let stopProfile: (() => void) | null = null;
let cleanup: (() => void) | void;
const profileListeners = new Set<() => void>();

const app: App = {
  get profile() { return profile!; },
  onProfile(cb) { profileListeners.add(cb); return () => profileListeners.delete(cb); },
  go(hash) { if (location.hash === hash) route(); else location.hash = hash; },
};

const ROUTES: Record<string, Screen> = {
  '': homeScreen, new: newYardScreen, join: joinScreen, yard: yardScreen, chicken: chickenScreen, flock: flockScreen, leaderboard: leaderboardScreen, help: helpScreen,
};

function route(): void {
  cleanup?.();
  cleanup = undefined;
  music.setMode('off'); // only a yard plays music
  profileListeners.clear();
  window.scrollTo(0, 0);

  if (configMissing) {
    root.innerHTML = `<section class="card"><h1>The Game of Chicken is not connected yet</h1>
      <p>This build has no Firebase settings. Follow “Going online” in README.md, then build again.</p></section>`;
    return;
  }
  document.documentElement.lang = getLang() === 'it' ? 'it' : 'en';
  /** Screens shown before the game proper still get the language menu, top right. */
  const bare = (): HTMLElement => {
    root.innerHTML = `<header class="top bare">${langMenu()}</header><div></div>`;
    wireLangMenu(root);
    return root.lastElementChild as HTMLElement;
  };
  // Signed in but no profile: a first Google sign-in still needs a username.
  if (uid && !profile && profileLoaded && !isSigningUp()) { usernameScreen(bare(), uid); return; }
  if (uid === undefined || (uid && !profile)) {
    root.innerHTML = `<p class="loading">${t('Opening the coop…')}</p>`;
    return;
  }
  const [name = '', ...params] = location.hash.replace(/^#\/?/, '').split('/');
  // The rules can be read before signing in.
  if (!uid && name === 'help') { pageview('help'); helpScreen(bare()); return; }
  if (!uid) { pageview('sign-in'); authScreen(bare()); return; }

  const screen = ROUTES[name] ?? homeScreen;
  pageview(ROUTES[name] ? name || 'home' : 'home');
  const tab = (key: string, label: string) =>
    `<a href="#/${key}" class="${name === key ? 'on' : ''}">${label}</a>`;
  root.innerHTML = `
    <header class="top">
      <a class="brand" href="#/"><img src="/icons/icon.svg" alt="" width="32" height="32">${t('The Game of Chicken')}</a>
      ${langMenu()}
      <nav>${tab('', t('Yards'))}${tab('chicken', t('My chicken'))}${tab('flock', t('Flock'))}${tab('leaderboard', t('Leaderboard'))}${tab('help', t('How to play'))}</nav>
    </header>
    <main></main>
    <footer class="foot">${t('Signed in as {0}', `<strong>${esc(profile!.username)}</strong>`)} · <button class="link" id="sign-out" type="button">${t('Sign out')}</button></footer>`;
  wireLangMenu(root);
  root.querySelector<HTMLButtonElement>('#sign-out')!.onclick = () => void setOnline(uid as string, false).finally(() => void signOut());
  cleanup = screen(root.querySelector('main')!, app, params);
}

startAnalytics();

// Friends see who has the game open: say so while it is in front, and stop when it is not.
let onlineBeat = 0;
function syncOnline(): void {
  clearInterval(onlineBeat);
  if (!uid || document.hidden) { if (uid) void setOnline(uid, false); return; }
  void setOnline(uid, true);
  onlineBeat = window.setInterval(() => { if (uid && !document.hidden) void setOnline(uid, true); }, ONLINE_BEAT_MS);
}
document.addEventListener('visibilitychange', syncOnline);
window.addEventListener('pagehide', () => { if (uid) void setOnline(uid, false); });

onUser((next) => {
  identify(next);
  if (!next) clearInterval(onlineBeat);
  stopProfile?.();
  stopProfile = null;
  profile = null;
  profileLoaded = false;
  uid = next;
  if (next) {
    stopProfile = watchProfile(next, (p) => {
      const first = !profile;
      profile = p;
      profileLoaded = true;
      if (!p) { route(); return; } // no profile yet: being created, or needs a username
      claimGift(p);
      if (first) { route(); syncOnline(); }
      else {
        const shown = root.querySelector('.foot strong');
        if (shown) shown.textContent = p.username; // a rename shows at once
        profileListeners.forEach((cb) => cb());
      }
    });
  }
  route();
});

/** Playing in Pirate or Italian hands out that language's accessory, once and for good. */
function claimGift(p: Profile): void {
  const gift = LANG_GIFT[getLang()];
  if (!gift || p.unlocked.includes(gift)) return;
  p.unlocked.push(gift); // so the next snapshot does not ask twice
  void unlockGift(p.uid, gift).then(() => toast(
    gift === 'eyepatch' ? t('Unlocked: an eyepatch! Find it under My chicken.') : t('Unlocked: the hand! Find it under My chicken.'), 'good',
  )).catch(() => {});
}

onLang(() => {
  route();
  if (profile) claimGift(profile);
});

window.addEventListener('hashchange', route);

// Tap a chicken to hear its battle cry, wherever it is marked with data-cry (pecking
// order, game report, the chicken designer; not the leaderboard or the flock list).
document.addEventListener('click', (e) => {
  const el = (e.target as Element | null)?.closest?.('[data-cry]');
  const who = el?.getAttribute('data-cry');
  if (!who) return;
  if (el!.closest('summary')) e.preventDefault(); // hear the cry without folding the row open or shut
  void playCry(who);
});

// Phones only allow sound after a touch: the first one unlocks battle cries.
const unlock = () => { unlockAudio(); music.start(); window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
window.addEventListener('pointerdown', unlock, true);
window.addEventListener('keydown', unlock, true);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}

// A phone can keep the app open for days. Whenever it comes back to the front
// (and at most once a minute), check whether a newer version has been published
// and, if so, reload into it, so everyone plays by the same rules.
if (import.meta.env.PROD) {
  const mine = document.querySelector<HTMLScriptElement>('script[type=module][src]')?.getAttribute('src') ?? '';
  let lastCheck = Date.now();
  const checkForUpdate = async () => {
    if (!mine || document.hidden || Date.now() - lastCheck < 60_000) return;
    lastCheck = Date.now();
    try {
      const page = await (await fetch('/index.html', { cache: 'no-store' })).text();
      const latest = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(page)?.[1];
      if (latest && latest !== mine) location.reload();
    } catch {
      /* offline: try again later */
    }
  };
  document.addEventListener('visibilitychange', () => void checkForUpdate());
  window.addEventListener('hashchange', () => void checkForUpdate());
}
