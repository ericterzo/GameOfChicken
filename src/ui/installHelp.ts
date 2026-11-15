// "How to put this on your phone" — shown on the sign-in and home screens,
// and hidden once the game is already running as an installed app.

function installed(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true;
}

export function installHelp(): string {
  if (installed()) return '';
  return `<details class="card install">
    <summary>Put the game on your phone</summary>
    <p class="muted">Save this site to your home screen and it opens like an app, full screen, with the white chicken icon.</p>
    <h3>Android</h3>
    <ol>
      <li>Open this page in <strong>Chrome</strong>.</li>
      <li>Tap the <strong>⋮</strong> menu at the top right.</li>
      <li>Tap <strong>Add to Home screen</strong> (it may say <strong>Install app</strong>).</li>
      <li>Tap <strong>Install</strong>. The chicken appears on your home screen.</li>
    </ol>
    <p class="muted small">Samsung Internet: tap the <strong>≡</strong> menu, then <strong>Add to</strong>, then <strong>Home screen</strong>.</p>
    <h3>iPhone and iPad</h3>
    <ol>
      <li>Open this page in <strong>Safari</strong>.</li>
      <li>Tap the <strong>Share</strong> button (the square with an arrow pointing up).</li>
      <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
      <li>Tap <strong>Add</strong>. The chicken appears on your home screen.</li>
    </ol>
    <p class="muted small">Then always open the game from that icon. On iPhone the icon keeps its own sign-in, so sign in once more there.</p>
  </details>`;
}
