import type { Profile } from './api';

/** What every screen gets from the shell. */
export interface App {
  /** The signed-in player's profile, always current. */
  readonly profile: Profile;
  /** Be told when the profile changes. Returns an unsubscribe function. */
  onProfile(cb: () => void): () => void;
  go(hash: string): void;
}

/** A screen fills `root` and may return a cleanup function. */
export type Screen = (root: HTMLElement, app: App, params: string[]) => (() => void) | void;
