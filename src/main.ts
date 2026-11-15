import './style.css';
import type { App, Screen } from './app';
import { onUser, signOut, watchProfile, type Profile } from './api';
import { configMissing } from './firebase';
import { authScreen } from './screens/auth';
import { homeScreen } from './screens/home';
import { chickenScreen, flockScreen } from './screens/profile';
import { joinScreen, newYardScreen } from './screens/setup';
import { yardScreen } from './screens/yard';
import { esc } from './ui/dom';

const root = document.getElementById('app')!;
let uid: string | null | undefined; // undefined = still finding out
let profile: Profile | null = null;
let stopProfile: (() => void) | null = null;
let cleanup: (() => void) | void;
const profileListeners = new Set<() => void>();

const app: App = {
  get profile() { return profile!; },
  onProfile(cb) { profileListeners.add(cb); return () => profileListeners.delete(cb); },
  go(hash) { if (location.hash === hash) route(); else location.hash = hash; },
};

const ROUTES: Record<string, Screen> = {
  '': homeScreen, new: newYardScreen, join: joinScreen, yard: yardScreen, chicken: chickenScreen, flock: flockScreen,
};

function route(): void {
  cleanup?.();
  cleanup = undefined;
  profileListeners.clear();
  window.scrollTo(0, 0);

  if (configMissing) {
    root.innerHTML = `<section class="card"><h1>Chicken Yard is not connected yet</h1>
      <p>This build has no Firebase settings. Follow “Going online” in README.md, then build again.</p></section>`;
    return;
  }
  if (uid === undefined || (uid && !profile)) {
    root.innerHTML = '<p class="loading">Opening the coop…</p>';
    return;
  }
  if (!uid) { authScreen(root); return; }

  const [name = '', ...params] = location.hash.replace(/^#\/?/, '').split('/');
  const screen = ROUTES[name] ?? homeScreen;
  const tab = (key: string, label: string) =>
    `<a href="#/${key}" class="${name === key ? 'on' : ''}">${label}</a>`;
  root.innerHTML = `
    <header class="top">
      <a class="brand" href="#/"><img src="/icons/icon.svg" alt="" width="32" height="32">Chicken Yard</a>
      <nav>${tab('', 'Yards')}${tab('chicken', 'My chicken')}${tab('flock', 'Flock')}</nav>
    </header>
    <main></main>
    <footer class="foot">Signed in as <strong>${esc(profile!.username)}</strong> · <button class="link" id="sign-out" type="button">Sign out</button></footer>`;
  root.querySelector<HTMLButtonElement>('#sign-out')!.onclick = () => void signOut();
  cleanup = screen(root.querySelector('main')!, app, params);
}

onUser((next) => {
  stopProfile?.();
  stopProfile = null;
  profile = null;
  uid = next;
  if (next) {
    stopProfile = watchProfile(next, (p) => {
      const first = !profile;
      profile = p;
      if (!p) return; // account is being created; the profile arrives in a moment
      if (first) route();
      else profileListeners.forEach((cb) => cb());
    });
  }
  route();
});

window.addEventListener('hashchange', route);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
