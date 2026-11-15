// Small helpers shared by the screens.

export function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

export function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

export const num = (n: number) => Math.floor(n).toLocaleString();

/** "2d 3h", "5m 10s", "42s" */
export function span(ms: number): string {
  let s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  if (m) return s ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

export const clock = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const dateTime = (t: number) =>
  new Date(t).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

let toastTimer = 0;
export function toast(message: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
  let box = document.getElementById('toast');
  if (!box) {
    box = el('<div id="toast" role="status" aria-live="polite"></div>');
    document.body.append(box);
  }
  box.textContent = message;
  box.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { box!.className = ''; }, 4500);
}

/** Run an async button action with the button disabled, showing failures as a toast. */
export async function busy(button: HTMLButtonElement | null, fn: () => Promise<void>): Promise<void> {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    await fn();
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'bad');
  } finally {
    if (button) button.disabled = false;
  }
}
