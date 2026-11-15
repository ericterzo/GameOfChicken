// Everything that talks to Firebase. Game decisions are made by src/game/rules.ts;
// this file only loads a yard, applies a rule inside a transaction, and saves it.
import {
  createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, GoogleAuthProvider, onAuthStateChanged,
  reauthenticateWithCredential, reauthenticateWithPopup, signInWithEmailAndPassword, signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import {
  addDoc, arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query,
  runTransaction, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import * as rules from './game/rules';
import type { Look, NewYard, Result, Yard } from './game/rules';

export interface Stats {
  gamesPlayed: number;
  wins: number;
  biggestChicken: number;
  totalPoints: number;
  mealsLost: number;
  mealsStolen: number;
}

export interface Profile {
  uid: string;
  username: string;
  look: Look;
  /** Use the personal chicken in every yard without asking. */
  lookEverywhere: boolean;
  friends: string[];
  stats: Stats;
}

export interface InboxMessage {
  id: string;
  yardId: string;
  yardName: string;
  byUid: string;
  byUsername: string;
  pointsLost: number;
  at: number;
  read: boolean;
}

export type YardDoc = Yard & { id: string };

export const DEFAULT_LOOK: Look = {
  body: '#ffffff', beak: 'short', beakColor: '#f5a623', comb: 'classic', combColor: '#d93025',
};

const EMPTY_STATS: Stats = {
  gamesPlayed: 0, wins: 0, biggestChicken: 0, totalPoints: 0, mealsLost: 0, mealsStolen: 0,
};

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
// Sign-in uses Firebase email/password; players only ever see a username.
// The address is built from a "login id" that never changes, so a player can
// rename themselves freely. The username register maps each name to its login
// id; accounts made before renaming existed have none, and their login id is
// simply the name they signed up with.
const emailFor = (login: string) => `${login.toLowerCase()}@chickenyard.example.com`;
const newLoginId = () => `u${Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
const DEPARTED = 'Departed chicken';

export class ApiError extends Error {}

function friendly(e: unknown): Error {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'auth/email-already-in-use') return new ApiError('That username is taken.');
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(code)) {
    return new ApiError('Wrong username or password.');
  }
  if (code === 'auth/weak-password') return new ApiError('Use a password of at least 6 characters.');
  if (code === 'auth/network-request-failed' || code === 'unavailable') return new ApiError('Cannot reach the server. Check your connection.');
  if (code === 'permission-denied') return new ApiError('The server refused that move.');
  return e instanceof Error ? e : new Error(String(e));
}

// ---------- accounts ----------

export async function signUp(username: string, password: string): Promise<void> {
  username = username.trim();
  if (!USERNAME_RE.test(username)) {
    throw new ApiError('Usernames are 3–16 letters, numbers or underscores.');
  }
  signingUp = true;
  try {
    // Google players can hold a username too, so check the shared register first.
    if ((await getDoc(doc(db, 'usernames', username.toLowerCase()))).exists()) {
      throw new ApiError('That username is taken.');
    }
    const login = newLoginId();
    const cred = await createUserWithEmailAndPassword(auth, emailFor(login), password);
    await writeProfile(cred.user.uid, username, login);
  } catch (e) {
    throw friendly(e);
  } finally {
    signingUp = false;
  }
}

let signingUp = false;
/** True while a username + password account is half made (signed in, profile not yet saved). */
export const isSigningUp = () => signingUp;

async function writeProfile(uid: string, username: string, login?: string): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, 'usernames', username.toLowerCase()), login ? { uid, login } : { uid });
  batch.set(doc(db, 'users', uid), {
    username, look: DEFAULT_LOOK, lookEverywhere: false, friends: [], stats: EMPTY_STATS,
  });
  await batch.commit();
}

/** Sign in with a Google account. New players then pick a username (see claimUsername). */
export async function signInWithGoogle(): Promise<void> {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    const code = (e as { code?: string })?.code ?? '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    if (code === 'auth/popup-blocked') throw new ApiError('Your browser blocked the Google window. Allow pop-ups and try again.');
    if (code === 'auth/operation-not-allowed') throw new ApiError('Google sign-in is not switched on for this game yet.');
    throw friendly(e);
  }
}

/** A signed-in player without a profile (first Google sign-in) chooses their username. */
export async function claimUsername(uid: string, username: string): Promise<void> {
  username = username.trim();
  if (!USERNAME_RE.test(username)) {
    throw new ApiError('Usernames are 3–16 letters, numbers or underscores.');
  }
  try {
    if ((await getDoc(doc(db, 'usernames', username.toLowerCase()))).exists()) {
      throw new ApiError('That username is taken.');
    }
    await writeProfile(uid, username);
  } catch (e) {
    if ((e as { code?: string })?.code === 'permission-denied') throw new ApiError('That username is taken.');
    throw friendly(e);
  }
}

export async function signIn(username: string, password: string): Promise<void> {
  try {
    const key = username.trim().toLowerCase();
    if (!key) throw new ApiError('Type your username.');
    const entry = await getDoc(doc(db, 'usernames', key));
    if (!entry.exists()) throw new ApiError('Wrong username or password.');
    await signInWithEmailAndPassword(auth, emailFor((entry.data().login as string | undefined) ?? key), password);
  } catch (e) {
    throw friendly(e);
  }
}

export const signOut = () => fbSignOut(auth);

export function onUser(cb: (uid: string | null) => void): () => void {
  return onAuthStateChanged(auth, (u) => cb(u ? u.uid : null));
}

function toProfile(uid: string, data: Record<string, unknown>): Profile {
  return {
    uid,
    username: data.username as string,
    look: { ...DEFAULT_LOOK, ...(data.look as Look) },
    lookEverywhere: !!data.lookEverywhere,
    friends: (data.friends as string[]) ?? [],
    stats: { ...EMPTY_STATS, ...(data.stats as Stats) },
  };
}

export function watchProfile(uid: string, cb: (p: Profile | null) => void): () => void {
  return onSnapshot(doc(db, 'users', uid), (snap) => cb(snap.exists() ? toProfile(uid, snap.data()) : null));
}

export async function getProfiles(uids: string[]): Promise<Profile[]> {
  const snaps = await Promise.all(uids.map((u) => getDoc(doc(db, 'users', u))));
  return snaps.filter((s) => s.exists()).map((s) => toProfile(s.id, s.data()!));
}

/** The top players by one column of their record (or by name), for the global leaderboard. */
export async function getLeaderboard(key: keyof Stats | 'username', desc: boolean, count: number): Promise<Profile[]> {
  const field = key === 'username' ? 'username' : `stats.${key}`;
  const snap = await getDocs(query(collection(db, 'users'), orderBy(field, desc ? 'desc' : 'asc'), limit(count)));
  return snap.docs.map((d) => toProfile(d.id, d.data()));
}

export async function saveLook(uid: string, look: Look, lookEverywhere: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { look, lookEverywhere });
}

// ---------- renaming and deleting the account ----------

/** True if this player signs in with a username and password (rather than Google). */
export function hasPassword(): boolean {
  return !!auth.currentUser?.providerData.some((p) => p.providerId === 'password');
}

/** Rewrite the name shown for me in the yards I belong to. Best effort. */
async function renameInYards(uid: string, username: string): Promise<void> {
  try {
    const snap = await getDocs(query(collection(db, 'yards'), where('memberUids', 'array-contains', uid)));
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { [`members.${uid}.username`]: username }).catch(() => {})));
  } catch {
    /* old yards keep the old name */
  }
}

export async function renameUser(me: Profile, wanted: string): Promise<void> {
  const username = wanted.trim();
  if (!USERNAME_RE.test(username)) throw new ApiError('Usernames are 3–16 letters, numbers or underscores.');
  if (username === me.username) return;
  const oldKey = me.username.toLowerCase();
  const newKey = username.toLowerCase();
  try {
    const batch = writeBatch(db);
    if (newKey !== oldKey) {
      if ((await getDoc(doc(db, 'usernames', newKey))).exists()) throw new ApiError('That username is taken.');
      // Carry the login id across so the password keeps working under the new name.
      const old = await getDoc(doc(db, 'usernames', oldKey));
      const login = (old.data()?.login as string | undefined) ?? (hasPassword() ? oldKey : undefined);
      batch.set(doc(db, 'usernames', newKey), login ? { uid: me.uid, login } : { uid: me.uid });
      batch.delete(doc(db, 'usernames', oldKey));
    }
    batch.update(doc(db, 'users', me.uid), { username });
    await batch.commit();
  } catch (e) {
    if ((e as { code?: string })?.code === 'permission-denied') throw new ApiError('That username is taken.');
    throw friendly(e);
  }
  await renameInYards(me.uid, username);
}

/**
 * Delete the account for good: profile, record, username, inbox and sign-in.
 * Past yards keep the scores (other players' results depend on them) under an
 * anonymous name. `password` is needed for username + password accounts;
 * Google accounts confirm in a Google window instead.
 */
export async function deleteAccount(me: Profile, password: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new ApiError('You are not signed in.');
  try {
    // Firebase only deletes an account that has just proved who it is.
    if (hasPassword()) {
      if (!password) throw new ApiError('Type your password to confirm.');
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email!, password));
    } else {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    }
  } catch (e) {
    const code = (e as { code?: string })?.code ?? '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') throw new ApiError('Deletion cancelled.');
    if (code === 'auth/user-mismatch') throw new ApiError('That is a different Google account.');
    if (code.startsWith('auth/') && hasPassword()) throw new ApiError('Wrong password.');
    throw friendly(e);
  }
  signingUp = true; // keeps the app on its loading screen while the pieces are removed
  try {
    await renameInYards(me.uid, DEPARTED);
    const inbox = await getDocs(collection(db, 'users', me.uid, 'inbox'));
    const batch = writeBatch(db);
    inbox.docs.slice(0, 400).forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'users', me.uid));
    batch.delete(doc(db, 'usernames', me.username.toLowerCase()));
    await batch.commit();
    await deleteUser(user);
  } catch (e) {
    throw friendly(e);
  } finally {
    signingUp = false;
  }
}

// ---------- friends ----------

export async function addFriend(me: Profile, username: string): Promise<void> {
  const name = username.trim().toLowerCase();
  if (!name) throw new ApiError('Type a username.');
  const snap = await getDoc(doc(db, 'usernames', name));
  if (!snap.exists()) throw new ApiError(`No chicken is called "${username.trim()}".`);
  const uid = snap.data().uid as string;
  if (uid === me.uid) throw new ApiError('That is you.');
  if (me.friends.includes(uid)) throw new ApiError('Already in your flock.');
  await updateDoc(doc(db, 'users', me.uid), { friends: arrayUnion(uid) });
}

export async function removeFriend(myUid: string, friendUid: string): Promise<void> {
  await updateDoc(doc(db, 'users', myUid), { friends: arrayRemove(friendUid) });
}

// ---------- inbox ----------

export function watchInbox(uid: string, cb: (msgs: InboxMessage[]) => void): () => void {
  const q = query(collection(db, 'users', uid, 'inbox'), where('read', '==', false));
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InboxMessage, 'id'>) }));
    cb(msgs.sort((a, b) => b.at - a.at));
  });
}

export async function markRead(uid: string, ids: string[]): Promise<void> {
  const batch = writeBatch(db);
  ids.forEach((id) => batch.update(doc(db, 'users', uid, 'inbox', id), { read: true }));
  await batch.commit();
}

// ---------- yards ----------

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

const yardRef = (id: string) => doc(db, 'yards', id);

export async function createYard(me: Profile, opts: NewYard, look: Look): Promise<string> {
  try {
    const yard = rules.createYard(opts, me.uid, me.username, look, newCode(), Date.now());
    const ref = await addDoc(collection(db, 'yards'), yard);
    return ref.id;
  } catch (e) {
    throw friendly(e);
  }
}

export async function findYardByCode(code: string): Promise<YardDoc | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  const snap = await getDocs(query(collection(db, 'yards'), where('joinCode', '==', clean), limit(1)));
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...(snap.docs[0].data() as Yard) };
}

export async function joinYard(me: Profile, yardId: string, look: Look): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(yardRef(yardId));
      if (!snap.exists()) throw new ApiError('That yard no longer exists.');
      tx.set(yardRef(yardId), rules.join(snap.data() as Yard, me.uid, me.username, look, Date.now()));
    });
  } catch (e) {
    throw friendly(e);
  }
}

export function watchYard(id: string, cb: (y: YardDoc | null) => void): () => void {
  return onSnapshot(yardRef(id), (snap) => cb(snap.exists() ? { id, ...(snap.data() as Yard) } : null));
}

export function watchMyYards(uid: string, cb: (yards: YardDoc[]) => void): () => void {
  const q = query(collection(db, 'yards'), where('memberUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Yard) })));
  });
}

/** Open invitations for me: yards I was invited to and have not answered. */
export function watchMyInvites(uid: string, cb: (yards: YardDoc[]) => void): () => void {
  const q = query(collection(db, 'yards'), where('invitedUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const now = Date.now();
    cb(snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Yard) }))
      .filter((y) => y.status === 'waiting' || (y.status === 'active' && y.endsAt > now)));
  });
}

/** Apply a rule that changes the yard without anyone walking in. */
async function change(yardId: string, fn: (y: Yard, now: number) => Yard): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(yardRef(yardId));
      if (!snap.exists()) throw new ApiError('That yard no longer exists.');
      tx.set(yardRef(yardId), fn(snap.data() as Yard, Date.now()));
    });
  } catch (e) {
    throw friendly(e);
  }
}

export const declineInvite = (id: string, uid: string) => change(id, (y, now) => rules.declineInvite(y, uid, now));

/** The owner stops waiting for invited chickens and starts the game. */
export const startYardNow = (id: string, uid: string) => change(id, (y, now) => rules.startNow(y, uid, now));

/** Load the yard, apply one rule to it, save it, and tell any victim. */
async function act(yardId: string, uid: string, fn: (y: Yard, now: number) => Result): Promise<Result> {
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(yardRef(yardId));
      if (!snap.exists()) throw new ApiError('That yard no longer exists.');
      const before = snap.data() as Yard;
      const now = Date.now();
      const result = fn(before, now);
      tx.set(yardRef(yardId), result.yard);
      const hit = result.interrupted;
      if (hit) {
        tx.set(doc(collection(db, 'users', hit.victimUid, 'inbox')), {
          yardId, yardName: before.name, byUid: uid, byUsername: before.members[uid].username,
          pointsLost: hit.pointsLost, at: now, read: false,
        });
      }
      return result;
    });
  } catch (e) {
    throw friendly(e);
  }
}

/** I am in the yard: interrupts anyone else eating, keeps my presence fresh. */
export const touchYard = (id: string, uid: string) => act(id, uid, (y, now) => rules.touch(y, uid, now));

export const startEating = (id: string, uid: string, seconds: number) =>
  act(id, uid, (y, now) => rules.startEating(y, uid, now, seconds));

export const stopEating = (id: string, uid: string) => act(id, uid, (y, now) => rules.stopEating(y, uid, now));

/** Closing the yard screen: best effort, the 30 s presence window covers failures. */
export async function leaveYard(id: string, uid: string): Promise<void> {
  try {
    await updateDoc(yardRef(id), { [`members.${uid}.lastSeen`]: 0 });
  } catch {
    /* offline or yard gone: presence simply times out */
  }
}

/**
 * Close a yard whose end has passed without disturbing anyone (used from the
 * home screen, where looking at the list must not count as entering).
 */
export async function finalizeYard(id: string): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(yardRef(id));
      if (!snap.exists()) return;
      const before = snap.data() as Yard;
      if (before.status === 'finished') return;
      const after = rules.settle(before, Date.now());
      if (after.status === 'finished') tx.set(yardRef(id), after);
    });
  } catch {
    /* someone else will do it */
  }
}

/** Add a finished yard's result to my own lifetime stats, exactly once. */
export async function claimStats(uid: string, yardId: string): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const ySnap = await tx.get(yardRef(yardId));
      const uSnap = await tx.get(doc(db, 'users', uid));
      if (!ySnap.exists() || !uSnap.exists()) return;
      const yard = ySnap.data() as Yard;
      const m = yard.members[uid];
      if (yard.status !== 'finished' || !m || m.statsClaimed) return;
      if (!rules.countsForRecords(yard)) {
        // A yard played alone is marked as dealt with but adds nothing to the record.
        tx.update(yardRef(yardId), { [`members.${uid}.statsClaimed`]: true });
        return;
      }
      const s: Stats = { ...EMPTY_STATS, ...(uSnap.data().stats as Stats) };
      tx.update(doc(db, 'users', uid), {
        stats: {
          gamesPlayed: s.gamesPlayed + 1,
          wins: s.wins + (yard.winnerUids.includes(uid) ? 1 : 0),
          biggestChicken: Math.max(s.biggestChicken, m.points),
          totalPoints: s.totalPoints + m.points,
          mealsLost: s.mealsLost + m.mealsLost,
          mealsStolen: s.mealsStolen + m.mealsStolen,
        },
      });
      tx.update(yardRef(yardId), { [`members.${uid}.statsClaimed`]: true });
    });
  } catch {
    /* try again next time the app opens */
  }
}
