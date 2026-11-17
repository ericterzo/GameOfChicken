// Everything that talks to Firebase. Game decisions are made by src/game/rules.ts;
// this file only loads a yard, applies a rule inside a transaction, and saves it.
import {
  createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, GoogleAuthProvider, onAuthStateChanged,
  reauthenticateWithCredential, reauthenticateWithPopup, signInWithEmailAndPassword, signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import {
  addDoc, arrayRemove, arrayUnion, Bytes, collection, deleteDoc, documentId, setDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query,
  runTransaction, updateDoc, where, writeBatch, type Transaction,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { track } from './analytics';
import { t } from './i18n';
import * as rules from './game/rules';
import type { Look, NewYard, Result, Tally, Yard } from './game/rules';

export type Stats = Tally;

export interface Profile {
  uid: string;
  username: string;
  look: Look;
  /** Use the personal chicken in every yard without asking. */
  lookEverywhere: boolean;
  friends: string[];
  stats: Stats;
  /** Accessories earned by playing in another language: 'eyepatch', 'hand'. */
  unlocked: string[];
  /** When this player's app last said it was open (0 once closed). */
  onlineAt: number;
}

export interface Unlocks { eyepatch: boolean; hand: boolean; crown: boolean; bigCrown: boolean }

export const BIG_CROWN_WINS = 10;

/** Which accessories this player may put on a chicken. */
export function unlockedFor(p: Profile): Unlocks {
  return {
    eyepatch: p.unlocked.includes('eyepatch'),
    hand: p.unlocked.includes('hand'),
    crown: p.stats.wins >= 1,
    bigCrown: p.stats.wins >= BIG_CROWN_WINS,
  };
}

export async function unlockGift(uid: string, gift: 'eyepatch' | 'hand'): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { unlocked: arrayUnion(gift) });
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

const EMPTY_STATS: Stats = rules.EMPTY_TALLY;

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
  if (code === 'auth/email-already-in-use') return new ApiError(t('That username is taken.'));
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(code)) {
    return new ApiError(t('Wrong username or password.'));
  }
  if (code === 'auth/weak-password') return new ApiError(t('Use a password of at least 6 characters.'));
  if (code === 'auth/network-request-failed' || code === 'unavailable') return new ApiError(t('Cannot reach the server. Check your connection.'));
  if (code === 'permission-denied') return new ApiError(t('The server refused that move.'));
  return e instanceof Error ? e : new Error(String(e));
}

// ---------- accounts ----------

export async function signUp(username: string, password: string): Promise<void> {
  username = username.trim();
  if (!USERNAME_RE.test(username)) {
    throw new ApiError(t('Usernames are 3–16 letters, numbers or underscores.'));
  }
  signingUp = true;
  try {
    // Google players can hold a username too, so check the shared register first.
    if ((await getDoc(doc(db, 'usernames', username.toLowerCase()))).exists()) {
      throw new ApiError(t('That username is taken.'));
    }
    const login = newLoginId();
    const cred = await createUserWithEmailAndPassword(auth, emailFor(login), password);
    await writeProfile(cred.user.uid, username, login);
    track('signed_up', { method: 'password' });
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
    track('signed_in', { method: 'google' });
  } catch (e) {
    const code = (e as { code?: string })?.code ?? '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    if (code === 'auth/popup-blocked') throw new ApiError(t('Your browser blocked the Google window. Allow pop-ups and try again.'));
    if (code === 'auth/operation-not-allowed') throw new ApiError(t('Google sign-in is not switched on for this game yet.'));
    throw friendly(e);
  }
}

/** A signed-in player without a profile (first Google sign-in) chooses their username. */
export async function claimUsername(uid: string, username: string): Promise<void> {
  username = username.trim();
  if (!USERNAME_RE.test(username)) {
    throw new ApiError(t('Usernames are 3–16 letters, numbers or underscores.'));
  }
  try {
    if ((await getDoc(doc(db, 'usernames', username.toLowerCase()))).exists()) {
      throw new ApiError(t('That username is taken.'));
    }
    await writeProfile(uid, username);
    track('signed_up', { method: 'google' });
  } catch (e) {
    if ((e as { code?: string })?.code === 'permission-denied') throw new ApiError(t('That username is taken.'));
    throw friendly(e);
  }
}

export async function signIn(username: string, password: string): Promise<void> {
  try {
    const key = username.trim().toLowerCase();
    if (!key) throw new ApiError(t('Type your username.'));
    const entry = await getDoc(doc(db, 'usernames', key));
    if (!entry.exists()) throw new ApiError(t('Wrong username or password.'));
    await signInWithEmailAndPassword(auth, emailFor((entry.data().login as string | undefined) ?? key), password);
    track('signed_in', { method: 'password' });
  } catch (e) {
    throw friendly(e);
  }
}

export const signOut = () => fbSignOut(auth);

export function onUser(cb: (uid: string | null) => void): () => void {
  return onAuthStateChanged(auth, (u) => cb(u ? u.uid : null));
}

/** Records saved before losses were counted: every yard played and not won was lost. */
function readStats(saved: Partial<Stats> | undefined): Stats {
  const st = { ...EMPTY_STATS, ...saved };
  if (saved?.losses == null) st.losses = Math.max(0, st.gamesPlayed - st.wins);
  return st;
}

function toProfile(uid: string, data: Record<string, unknown>): Profile {
  return {
    uid,
    username: data.username as string,
    look: { ...DEFAULT_LOOK, ...(data.look as Look) },
    lookEverywhere: !!data.lookEverywhere,
    friends: (data.friends as string[]) ?? [],
    stats: readStats(data.stats as Partial<Stats> | undefined),
    unlocked: (data.unlocked as string[]) ?? [],
    onlineAt: typeof data.onlineAt === 'number' ? data.onlineAt : 0,
  };
}

export function watchProfile(uid: string, cb: (p: Profile | null) => void): () => void {
  return onSnapshot(doc(db, 'users', uid), (snap) => cb(snap.exists() ? toProfile(uid, snap.data()) : null));
}

// ---------- who is online ----------

/** A player counts as online for this long after their app last said so. */
export const ONLINE_MS = 3 * 60_000;
/** How often an open app says so. */
export const ONLINE_BEAT_MS = 2 * 60_000;

/** Tell friends my app is open (or closed). Best effort. */
export async function setOnline(uid: string, on: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), { onlineAt: on ? Date.now() : 0 });
  } catch {
    /* offline, or signed out meanwhile */
  }
}

/** Watch a set of players' profiles (at most 30), e.g. my friends, for the home yard. */
export function watchProfiles(uids: string[], cb: (profiles: Profile[]) => void): () => void {
  const ids = uids.slice(0, 30);
  if (!ids.length) { cb([]); return () => {}; }
  return onSnapshot(query(collection(db, 'users'), where(documentId(), 'in', ids)),
    (snap) => cb(snap.docs.map((d) => toProfile(d.id, d.data()))), () => cb([]));
}

/** Which of these players have a meal going right now, in any yard. */
export async function whoIsEating(uids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!uids.length) return out;
  const snap = await getDocs(query(collection(db, 'yards'), where('status', '==', 'active')));
  const now = Date.now();
  for (const d of snap.docs) {
    const y = rules.settle(d.data() as Yard, now);
    for (const u of uids) if (rules.mealOf(y, u)) out.add(u);
  }
  return out;
}

export async function getProfiles(uids: string[]): Promise<Profile[]> {
  const snaps = await Promise.all(uids.map((u) => getDoc(doc(db, 'users', u))));
  return snaps.filter((s) => s.exists()).map((s) => toProfile(s.id, s.data()!));
}

let everyone: { at: number; list: Promise<Profile[]> } | null = null;

/** Every player in the game. Kept for half a minute so searching and sorting do not re-read it. */
export function getAllProfiles(): Promise<Profile[]> {
  if (!everyone || Date.now() - everyone.at > 30_000) {
    const list = getDocs(query(collection(db, 'users'), limit(2000))).then((snap) => snap.docs.map((d) => toProfile(d.id, d.data())));
    everyone = { at: Date.now(), list };
    list.catch(() => { everyone = null; });
  }
  return everyone.list;
}

/** Players whose name contains `term`, whatever the capitals. */
export async function searchPlayers(term: string): Promise<Profile[]> {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];
  const all = await getAllProfiles();
  return all
    .filter((p) => p.username.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.username.toLowerCase().startsWith(needle)) - Number(a.username.toLowerCase().startsWith(needle))
      || a.username.localeCompare(b.username));
}

/**
 * The same players with their yards still running added to their records:
 * those count as played, with the feed eaten, stolen and lost so far.
 */
export async function withLiveYards(profiles: Profile[]): Promise<Profile[]> {
  let live: Record<string, Tally> = {};
  try {
    const snap = await getDocs(query(collection(db, 'yards'), where('status', '==', 'active')));
    live = rules.liveTallies(snap.docs.map((d) => d.data() as Yard), Date.now());
  } catch {
    /* offline: lifetime records only */
  }
  return profiles.map((p) => (live[p.uid] ? { ...p, stats: rules.addTally(p.stats, live[p.uid]) } : p));
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
  if (!USERNAME_RE.test(username)) throw new ApiError(t('Usernames are 3–16 letters, numbers or underscores.'));
  if (username === me.username) return;
  const oldKey = me.username.toLowerCase();
  const newKey = username.toLowerCase();
  try {
    const batch = writeBatch(db);
    if (newKey !== oldKey) {
      if ((await getDoc(doc(db, 'usernames', newKey))).exists()) throw new ApiError(t('That username is taken.'));
      // Carry the login id across so the password keeps working under the new name.
      const old = await getDoc(doc(db, 'usernames', oldKey));
      const login = (old.data()?.login as string | undefined) ?? (hasPassword() ? oldKey : undefined);
      batch.set(doc(db, 'usernames', newKey), login ? { uid: me.uid, login } : { uid: me.uid });
      batch.delete(doc(db, 'usernames', oldKey));
    }
    batch.update(doc(db, 'users', me.uid), { username });
    await batch.commit();
  } catch (e) {
    if ((e as { code?: string })?.code === 'permission-denied') throw new ApiError(t('That username is taken.'));
    throw friendly(e);
  }
  await renameInYards(me.uid, username);
  track('username_changed');
}

/**
 * Delete the account for good: profile, record, username, inbox and sign-in.
 * Past yards keep the scores (other players' results depend on them) under an
 * anonymous name. `password` is needed for username + password accounts;
 * Google accounts confirm in a Google window instead.
 */
export async function deleteAccount(me: Profile, password: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new ApiError(t('You are not signed in.'));
  try {
    // Firebase only deletes an account that has just proved who it is.
    if (hasPassword()) {
      if (!password) throw new ApiError(t('Type your password to confirm.'));
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email!, password));
    } else {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    }
  } catch (e) {
    const code = (e as { code?: string })?.code ?? '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') throw new ApiError(t('Deletion cancelled.'));
    if (code === 'auth/user-mismatch') throw new ApiError(t('That is a different Google account.'));
    if (code.startsWith('auth/') && hasPassword()) throw new ApiError(t('Wrong password.'));
    throw friendly(e);
  }
  signingUp = true; // keeps the app on its loading screen while the pieces are removed
  try {
    await renameInYards(me.uid, DEPARTED);
    const inbox = await getDocs(collection(db, 'users', me.uid, 'inbox'));
    const batch = writeBatch(db);
    inbox.docs.slice(0, 400).forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'users', me.uid));
    batch.delete(doc(db, 'cries', me.uid));
    batch.delete(doc(db, 'usernames', me.username.toLowerCase()));
    await batch.commit();
    track('account_deleted');
    await deleteUser(user);
  } catch (e) {
    throw friendly(e);
  } finally {
    signingUp = false;
  }
}

// ---------- friends ----------

export async function addFriendByUid(me: Profile, uid: string): Promise<void> {
  if (uid === me.uid) throw new ApiError(t('That is you.'));
  if (me.friends.includes(uid)) throw new ApiError(t('Already in your flock.'));
  await updateDoc(doc(db, 'users', me.uid), { friends: arrayUnion(uid) });
  track('friend_added');
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

/**
 * A transaction on a yard. When two players' moves land at the same instant the
 * server can judge one of them against a yard it has not seen and refuse it;
 * the same move made again a moment later is fine, so try a few times.
 */
async function yardTx<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await runTransaction(db, fn);
    } catch (e) {
      if ((e as { code?: string })?.code !== 'permission-denied' || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
}

export async function createYard(me: Profile, opts: NewYard, look: Look): Promise<string> {
  try {
    const yard = rules.createYard(opts, me.uid, me.username, look, newCode(), Date.now());
    const ref = await addDoc(collection(db, 'yards'), yard);
    track('yard_created', {
      mode: opts.mode, goal: opts.goal, hardcore: opts.hardcore, sleep_hours: !!opts.sleep,
      start_later: opts.startsAt != null, invites: opts.invites?.length ?? 0,
      hours: Math.round((opts.endsAt - Date.now()) / 3600_000), ruleset: opts.ruleset ?? 'classic',
    });
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
    await yardTx(async (tx) => {
      const snap = await tx.get(yardRef(yardId));
      if (!snap.exists()) throw new ApiError(t('That yard no longer exists.'));
      const before = snap.data() as Yard;
      const now = Date.now();
      const after = rules.join(before, me.uid, me.username, look, now);
      tx.set(yardRef(yardId), after);
      logMeals(tx, yardId, me.uid, before, after, now);
    });
    track('yard_joined');
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

// ---------- battle cries ----------

/** A battle cry is at most five seconds; this leaves room for any phone's recording format. */
export const MAX_CRY_BYTES = 150_000;
export const CRY_SECONDS = 5;

/**
 * Each cry lives in its own small record, never on the profile, so it is only
 * downloaded when it is actually played.
 */
export async function saveCry(uid: string, recording: Blob): Promise<void> {
  const audio = new Uint8Array(await recording.arrayBuffer());
  if (audio.byteLength > MAX_CRY_BYTES) throw new ApiError(t('That recording is too big. Try a shorter one.'));
  try {
    await setDoc(doc(db, 'cries', uid), { audio: Bytes.fromUint8Array(audio), mime: (recording.type || 'audio/webm').slice(0, 59), at: Date.now() });
    track('battle_cry_saved', { bytes: audio.byteLength });
  } catch (e) {
    throw friendly(e);
  }
}

export async function deleteCry(uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'cries', uid));
  } catch (e) {
    throw friendly(e);
  }
}

/** A chicken's battle cry as playable audio, or null if it has none. */
export async function getCry(uid: string): Promise<Blob | null> {
  const snap = await getDoc(doc(db, 'cries', uid));
  if (!snap.exists()) return null;
  const d = snap.data() as { audio: Bytes; mime: string };
  return new Blob([d.audio.toUint8Array() as BlobPart], { type: d.mime });
}

/** I tap my own chicken: everyone in the yard hears my battle cry. */
export async function shout(yardId: string, uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'yards', yardId), { shout: { uid, at: Date.now() } });
    track('battle_cry_tapped');
  } catch {
    /* only the others miss it */
  }
}

// ---------- notice board ----------

export interface BoardEntry {
  id: string;
  kind: 'chat' | 'visit' | 'ate' | 'caught' | 'shot' | 'duel' | 'fox';
  at: number;
  /** Who the line is about: the writer, the visitor, the eater or the catcher. */
  uid: string;
  username: string;
  text?: string;
  amount?: number;
  victimUid?: string;
  victimName?: string;
  lost?: number;
  taken?: number;
  /** A shot at one's own ally. */
  betrayal?: boolean;
  /** How a standoff ended: uid and victimUid allied, uid fought victimUid off, or both brawled. */
  outcome?: 'allied' | 'fought' | 'brawl';
  /** The fox: who it caught (names), whom it killed (brutal rules), and the feed lost. */
  victims?: string[];
  killed?: string | null;
  victimUids?: string[];
  killedUid?: string | null;
}

const boardCol = (yardId: string) => collection(db, 'yards', yardId, 'board');

/** Inside a yard transaction: note any meal that was banked or stolen by it. */
function logMeals(tx: Transaction, yardId: string, by: string, before: Yard, after: Yard, now: number, caught: rules.InterruptEvent[] = []): void {
  // The fox came by while this was being worked out: note what it did.
  const fox = after.fox;
  if (fox && fox.at !== before.fox?.at && after.members[by]) {
    tx.set(doc(boardCol(yardId)), {
      kind: 'fox', at: fox.at, by, uid: by, username: after.members[by].username,
      victims: fox.victims.map((u) => after.members[u]?.username ?? '?'), killed: fox.killed ? after.members[fox.killed]?.username ?? '?' : null,
      lost: fox.lost, victimUids: fox.victims, killedUid: fox.killed,
    });
  }
  for (const ev of rules.mealEvents(before, after, now, caught)) {
    const username = after.members[ev.uid].username;
    tx.set(doc(boardCol(yardId)), ev.kind === 'ate'
      ? { kind: 'ate', at: ev.at, by, uid: ev.uid, username, amount: ev.amount }
      : {
        kind: 'caught', at: ev.at, by, uid: ev.uid, username, victimUid: ev.victimUid,
        victimName: after.members[ev.victimUid].username, lost: ev.lost, taken: ev.taken,
      });
  }
}

export function watchBoard(yardId: string, cb: (entries: BoardEntry[]) => void): () => void {
  const q = query(boardCol(yardId), orderBy('at', 'desc'), limit(100));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BoardEntry, 'id'>) }))), () => cb([]));
}

/** The yard's whole log, oldest first, for the end-of-game report. */
export async function getBoardLog(yardId: string): Promise<BoardEntry[]> {
  const snap = await getDocs(query(boardCol(yardId), orderBy('at'), limit(5000)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BoardEntry, 'id'>) }));
}

export const MAX_NOTE = 300;

/**
 * In a standoff, the word "gun" is not a note: the first chicken to say it
 * shoots another one out of the yard. Returns the victim's name, or null when
 * there was no standoff (the word is then posted like any other note).
 */
export interface GunShot { victim: string; betrayal: boolean }

/** The trigger: shoot a random other chicken, if three or more are still in the yard. */
export async function drawGun(yardId: string, me: Profile, minOthers = 2): Promise<GunShot | null> {
  return yardTx(async (tx) => {
    const snap = await tx.get(yardRef(yardId));
    if (!snap.exists()) return null;
    const before = snap.data() as Yard;
    const now = Date.now();
    let shot: rules.ShotResult;
    try {
      const span = rules.SHOT_MAX_MS - rules.SHOT_MIN_MS;
      shot = rules.shoot(before, me.uid, now, Math.random(), rules.SHOT_MIN_MS + Math.random() * span, minOthers);
    } catch {
      return null;
    }
    if (!shot.victimUid) return null;
    const victimName = shot.yard.members[shot.victimUid].username;
    tx.set(yardRef(yardId), shot.yard);
    tx.set(doc(boardCol(yardId)), {
      kind: 'shot', at: now, by: me.uid, uid: me.uid, username: shot.yard.members[me.uid].username,
      victimUid: shot.victimUid, victimName,
      ...(shot.betrayal ? { betrayal: true, lost: shot.lost } : {}),
    });
    return { victim: victimName, betrayal: shot.betrayal };
  }).then((shot) => {
    if (shot) track('shot', { betrayal: shot.betrayal });
    return shot;
  });
}

/**
 * My secret choice in a standoff. Resolves to how it ended once both have
 * chosen, or null while the other chicken is still making up their mind.
 */
export async function chooseSide(yardId: string, me: Profile, choice: rules.Choice): Promise<rules.DuelOutcome | null> {
  try {
    return await yardTx(async (tx) => {
      const snap = await tx.get(yardRef(yardId));
      if (!snap.exists()) throw new ApiError(t('That yard no longer exists.'));
      const now = Date.now();
      const { yard, outcome } = rules.choose(snap.data() as Yard, me.uid, now, choice);
      tx.set(yardRef(yardId), yard);
      if (outcome) {
        const [a, b] = outcome.kind === 'fought' ? [outcome.winnerUid, outcome.loserUid] : outcome.uids;
        tx.set(doc(boardCol(yardId)), {
          kind: 'duel', outcome: outcome.kind, at: now, by: me.uid, uid: a, username: yard.members[a].username,
          victimUid: b, victimName: yard.members[b].username,
        });
      }
      return outcome;
    }).then((outcome) => {
      track('standoff_choice', { choice, outcome: outcome?.kind ?? null });
      return outcome;
    });
  } catch (e) {
    throw friendly(e);
  }
}

/** Post a note on the yard's notice board. */
export async function postNote(yardId: string, me: Profile, text: string): Promise<null> {
  const clean = text.trim().slice(0, MAX_NOTE);
  if (!clean) return null;
  try {
    await addDoc(boardCol(yardId), { kind: 'chat', at: Date.now(), by: me.uid, uid: me.uid, username: me.username, text: clean });
    track('note_posted', { length: clean.length });
    return null;
  } catch (e) {
    throw friendly(e);
  }
}

const VISIT_GAP_MS = 5 * 60 * 1000;

const lastSeenHere = new Map<string, number>();

/**
 * Note that I came by. Called on every presence beat: staying in the yard, or
 * coming back within a few minutes, counts as the same visit.
 */
export async function logVisit(yardId: string, me: Profile): Promise<void> {
  const key = `visit:${yardId}:${me.uid}`;
  const now = Date.now();
  let last = lastSeenHere.get(key) ?? 0;
  try {
    last = Math.max(last, Number(localStorage.getItem(key) ?? 0));
    localStorage.setItem(key, String(now));
  } catch {
    /* no storage (private window): this tab's memory will do */
  }
  lastSeenHere.set(key, now);
  if (now - last < VISIT_GAP_MS) return;
  try {
    await addDoc(boardCol(yardId), { kind: 'visit', at: now, by: me.uid, uid: me.uid, username: me.username });
  } catch {
    /* the board is a nicety; the visit itself still counts */
  }
}

/** Apply a rule that changes the yard without anyone walking in. */
async function change(yardId: string, fn: (y: Yard, now: number) => Yard): Promise<void> {
  try {
    await yardTx(async (tx) => {
      const snap = await tx.get(yardRef(yardId));
      if (!snap.exists()) throw new ApiError(t('That yard no longer exists.'));
      const before = snap.data() as Yard;
      const now = Date.now();
      const after = fn(before, now);
      tx.set(yardRef(yardId), after);
      const by = auth.currentUser?.uid;
      if (by && after.members[by]) logMeals(tx, yardId, by, before, after, now);
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
    return await yardTx(async (tx) => {
      const snap = await tx.get(yardRef(yardId));
      if (!snap.exists()) throw new ApiError(t('That yard no longer exists.'));
      const before = snap.data() as Yard;
      const now = Date.now();
      const result = fn(before, now);
      tx.set(yardRef(yardId), result.yard);
      logMeals(tx, yardId, uid, before, result.yard, now, result.interrupted);
      for (const hit of result.interrupted) {
        tx.set(doc(collection(db, 'users', hit.victimUid, 'inbox')), {
          yardId, yardName: before.name, byUid: uid, byUsername: before.members[uid].username,
          pointsLost: hit.pointsLost, at: now, read: false,
        });
      }
      return result;
    }).then((result) => {
      if (result.interrupted.length) track('caught_someone', { meals: result.interrupted.length });
      return result;
    });
  } catch (e) {
    throw friendly(e);
  }
}

/** I am in the yard: interrupts anyone else eating, keeps my presence fresh. */
export const touchYard = (id: string, uid: string) => act(id, uid, (y, now) => rules.touch(y, uid, now));

export async function startEating(id: string, uid: string, seconds: number): Promise<Result> {
  const r = await act(id, uid, (y, now) => rules.startEating(y, uid, now, seconds));
  const y = r.yard;
  track('meal_started', { seconds: y.hardcore ? null : seconds, hardcore: y.hardcore, allied: !!y.pact?.meals[uid], mode: y.mode });
  return r;
}

export const stopEating = (id: string, uid: string) => act(id, uid, (y, now) => rules.stopEating(y, uid, now));

/** Closing the yard screen: best effort, the 30 s presence window covers failures. */
export async function leaveYard(id: string, uid: string): Promise<void> {
  try {
    await updateDoc(yardRef(id), { [`members.${uid}.lastSeen`]: 0, [`members.${uid}.lurkingAt`]: 0 });
  } catch {
    /* offline or yard gone: presence simply times out */
  }
}

/**
 * Start a yard whose start time has come, or close one whose end has passed, without disturbing anyone (used from the
 * home screen, where looking at the list must not count as entering).
 */
export async function finalizeYard(id: string): Promise<void> {
  try {
    await yardTx(async (tx) => {
      const snap = await tx.get(yardRef(id));
      if (!snap.exists()) return;
      const before = snap.data() as Yard;
      if (before.status === 'finished') return;
      const now = Date.now();
      const after = rules.settle(before, now);
      if (after.status === before.status) return; // nothing has begun or ended
      tx.set(yardRef(id), after);
      const by = auth.currentUser?.uid;
      if (by && after.members[by]) logMeals(tx, id, by, before, after, now);
    });
  } catch {
    /* someone else will do it */
  }
}

/** True if some member of this finished yard still has to have it added to their record. */
export function hasUnclaimed(yard: Yard): boolean {
  const done = yard.claimedUids ?? [];
  return yard.status === 'finished' && yard.memberUids.some((u) => !yard.members[u].statsClaimed && !done.includes(u));
}

/**
 * Add a finished yard's result to the lifetime record of every member, each
 * exactly once. Whoever opens the game first does it for the whole yard, so
 * nobody's record waits for them to come back.
 */
export async function claimStats(yardId: string): Promise<void> {
  try {
    await yardTx(async (tx) => {
      const ySnap = await tx.get(yardRef(yardId));
      if (!ySnap.exists()) return;
      const yard = ySnap.data() as Yard;
      if (!hasUnclaimed(yard)) return;
      const done = yard.claimedUids ?? [];
      const pending = yard.memberUids.filter((u) => !yard.members[u].statsClaimed && !done.includes(u));
      const users = await Promise.all(pending.map((u) => tx.get(doc(db, 'users', u))));
      users.forEach((uSnap) => {
        // A yard played alone adds nothing; a deleted account has no record to add to.
        if (!uSnap.exists() || !rules.countsForRecords(yard)) return;
        const stats = rules.addTally(readStats(uSnap.data().stats as Partial<Stats>), rules.yardTally(yard, uSnap.id, yard.endsAt));
        tx.update(uSnap.ref, { stats, claimedYard: yardId });
      });
      tx.update(yardRef(yardId), { claimedUids: [...done, ...pending] });
    });
    everyone = null;
  } catch {
    /* try again next time the app opens */
  }
}
