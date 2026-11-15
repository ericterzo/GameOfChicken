import { claimUsername, DEFAULT_LOOK, signIn, signInWithGoogle, signOut, signUp } from '../api';
import { chickenSvg } from '../ui/chicken';
import { busy } from '../ui/dom';
import { installHelp } from '../ui/installHelp';

/** First Google sign-in: the player has an account but no username yet. */
export function usernameScreen(root: HTMLElement, uid: string): void {
  root.innerHTML = `
    <section class="auth card">
      <div class="auth-hero">${chickenSvg(DEFAULT_LOOK, { px: 130 })}</div>
      <h1>Name your chicken</h1>
      <p class="muted">Pick a username. It is how friends find you and what other chickens see in the yard.</p>
      <form id="name-form">
        <label>Username<input name="username" required minlength="3" maxlength="16" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
        <button class="btn primary" type="submit">Start playing</button>
      </form>
      <button class="link" id="name-out" type="button">Use a different account</button>
    </section>`;
  const form = root.querySelector<HTMLFormElement>('#name-form')!;
  form.onsubmit = (e) => {
    e.preventDefault();
    void busy(form.querySelector('button'), () => claimUsername(uid, form.username.value));
  };
  root.querySelector<HTMLButtonElement>('#name-out')!.onclick = () => void signOut();
}

export function authScreen(root: HTMLElement): void {
  let creating = false;
  root.innerHTML = `
    <section class="auth card">
      <div class="auth-hero">${chickenSvg(DEFAULT_LOOK, { px: 130, pecking: true })}</div>
      <h1>The Game of Chicken</h1>
      <p class="muted">Eat while nobody is looking. Get caught and you lose the meal.</p>
      <form id="auth-form" autocomplete="on">
        <label>Username<input name="username" required minlength="3" maxlength="16" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
        <label>Password<input name="password" type="password" required minlength="6" autocomplete="current-password"></label>
        <button class="btn primary" type="submit">Sign in</button>
      </form>
      <button class="link" id="auth-switch" type="button">New here? Create a chicken</button>
      <p class="or"><span>or</span></p>
      <button class="btn google" id="auth-google" type="button">
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.6 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.500-4.800 7.200l7.700 6c4.500-4.200 7-10.300 7-17.700z"/><path fill="#FBBC05" d="M10.500 28.600c-.5-1.500-.8-3-.8-4.600s.3-3.100.8-4.600l-7.900-6.200C1 16.500 0 20.100 0 24s1 7.500 2.600 10.800l7.900-6.200z"/><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.700-6c-2.200 1.500-5 2.300-8.200 2.300-6.300 0-11.600-4.200-13.500-9.900l-7.900 6.200C6.500 42.600 14.600 48 24 48z"/></svg>
        Continue with Google</button>
      <p class="auth-help"><a class="link" href="#/help">How does the game work?</a></p>
    </section>
    ${installHelp()}`;
  const google = root.querySelector<HTMLButtonElement>('#auth-google')!;
  google.onclick = () => void busy(google, signInWithGoogle);
  const form = root.querySelector<HTMLFormElement>('#auth-form')!;
  const submit = form.querySelector<HTMLButtonElement>('button')!;
  const flip = root.querySelector<HTMLButtonElement>('#auth-switch')!;
  flip.onclick = () => {
    creating = !creating;
    submit.textContent = creating ? 'Create account' : 'Sign in';
    flip.textContent = creating ? 'Already have a chicken? Sign in' : 'New here? Create a chicken';
    form.password.autocomplete = creating ? 'new-password' : 'current-password';
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    void busy(submit, () =>
      (creating ? signUp : signIn)(form.username.value, form.password.value));
  };
}
