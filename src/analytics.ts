// Product analytics with PostHog (EU cloud).
//
// Privacy, by design:
// - Nothing is stored on the phone (memory-only persistence): no cookies, no
//   local storage, so no consent banner is needed. A visitor looks new on each
//   visit until they sign in.
// - Signed-in players are linked by their account ID only, never by name.
// - No automatic click capture (it would record names shown on screen), no
//   session recordings, no surveys; page views carry the screen's name only,
//   not yard IDs or codes.
// - Only the published site reports anything: local development and tests stay silent.
// - The library is fetched after the game has started, so it never slows the first screen.
import type { PostHog } from 'posthog-js';

/** PostHog project API key. It is public by design (it can only send events), so it lives in the code. */
const KEY = 'phc_PASTE_PROJECT_KEY_HERE';
const HOST = 'https://eu.i.posthog.com';

let ph: PostHog | null = null;
let waiting: ((p: PostHog) => void)[] | null = null; // calls made before the library arrived

/** Run `fn` with PostHog once it is loaded; drop it if analytics is off. */
function withPostHog(fn: (p: PostHog) => void): void {
  try {
    if (ph) fn(ph);
    else if (waiting && waiting.length < 200) waiting.push(fn);
  } catch { /* analytics must never break the game */ }
}

export function startAnalytics(): void {
  if (!import.meta.env.PROD || !KEY.startsWith('phc_') || KEY.includes('PASTE')) return;
  waiting = [];
  void import('posthog-js').then(({ default: posthog }) => {
    posthog.init(KEY, {
      api_host: HOST,
      persistence: 'memory',
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      rageclick: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      disable_web_experiments: true,
      disable_external_dependency_loading: true,
      ip: false,
      advanced_disable_flags: true, // no feature flags in this game: one request fewer
      // Addresses carry the screen's name only, never a yard's ID or invite code.
      before_send: (event) => {
        if (event?.properties) {
          for (const k of ['$current_url', '$referrer', '$initial_current_url']) {
            const v = event.properties[k];
            if (typeof v === 'string') event.properties[k] = v.replace(/(#\/[^/?#]*)[^]*$/, '$1');
          }
        }
        return event;
      },
      // Automated test browsers look like bots; only a test build counts them.
      opt_out_useragent_filter: import.meta.env.VITE_ANALYTICS_TEST === '1',
    });
    ph = posthog;
    const queued = waiting ?? [];
    waiting = null;
    queued.forEach((fn) => withPostHog(fn));
  }).catch(() => { waiting = null; /* blocked or offline: play on without it */ });
}

/** Tie this visit to a signed-in account (by its anonymous ID), or forget it on signing out. */
export function identify(uid: string | null): void {
  withPostHog((p) => { if (uid) p.identify(uid); else p.reset(); });
}

/** A screen was opened. Only its name is sent, e.g. "yard" or "flock". */
export function pageview(screen: string): void {
  withPostHog((p) => { p.capture('$pageview', { $current_url: `${location.origin}/#/${screen}`, screen }); });
}

/** Something happened in the game. Keep properties free of names and free text. */
export function track(event: string, props: Record<string, string | number | boolean | null> = {}): void {
  withPostHog((p) => { p.capture(event, props); });
}
