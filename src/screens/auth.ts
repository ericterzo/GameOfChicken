import { DEFAULT_LOOK, signIn, signUp } from '../api';
import { chickenSvg } from '../ui/chicken';
import { busy } from '../ui/dom';

export function authScreen(root: HTMLElement): void {
  let creating = false;
  root.innerHTML = `
    <section class="auth card">
      <div class="auth-hero">${chickenSvg(DEFAULT_LOOK, { px: 130, pecking: true })}</div>
      <h1>Chicken Yard</h1>
      <p class="muted">Eat while nobody is looking. Get caught and you lose the meal.</p>
      <form id="auth-form" autocomplete="on">
        <label>Username<input name="username" required minlength="3" maxlength="16" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
        <label>Password<input name="password" type="password" required minlength="6" autocomplete="current-password"></label>
        <button class="btn primary" type="submit">Sign in</button>
      </form>
      <button class="link" id="auth-switch" type="button">New here? Create a chicken</button>
    </section>`;
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
