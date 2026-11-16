// All game rules live here as pure functions: no Firebase, no DOM, no clocks.
// Every function takes the current time `now` (ms since epoch) and returns a
// new yard; the caller is responsible for saving it.

export type Mode = 'lastGrain' | 'sundown' | 'fatHen';

export interface Look {
  body: string;
  beak: 'short' | 'long' | 'hooked';
  beakColor: string;
  comb: 'classic' | 'spiky' | 'floppy' | 'none';
  combColor: string;
  /** The wattle under the beak. Older chickens have none saved: classic, in the comb's colour. */
  wattle?: 'classic' | 'long' | 'double' | 'round' | 'none';
  wattleColor?: string;
}

export interface Member {
  username: string;
  look: Look;
  points: number;
  lastSeen: number;
  mealsLost: number;
  mealsStolen: number;
  statsClaimed: boolean;
}

export interface Eating {
  uid: string;
  startedAt: number;
  /** Planned end of the meal. null in hardcore yards (no timers). */
  endsAt: number | null;
  /** Last heartbeat from the eater's phone. Only meaningful in hardcore yards. */
  lastBeat: number;
}

export interface Sleep {
  /** Minutes after local midnight when the chickens go to sleep. */
  startMin: number;
  /** Minutes after local midnight when they wake up. */
  endMin: number;
  /** The yard creator's offset from UTC in minutes (east positive). */
  offsetMin: number;
}

export interface Yard {
  name: string;
  joinCode: string;
  ownerUid: string;
  createdAt: number;
  endsAt: number;
  mode: Mode;
  /** lastGrain: total feed in the pile. fatHen: target points. sundown: null. */
  goal: number | null;
  hardcore: boolean;
  sleep: Sleep | null;
  /** 'waiting': invited chickens have not all answered yet, nobody can eat. */
  status: 'waiting' | 'active' | 'finished';
  winnerUids: string[];
  eating: Eating | null;
  members: Record<string, Member>;
  memberUids: string[];
  /** Invited players who have not answered yet. Absent on yards made before invites existed. */
  invitedUids?: string[];
  /** Username of everyone ever invited, for display. */
  invitedNames?: Record<string, string>;
  declinedUids?: string[];
}

export interface InterruptEvent {
  victimUid: string;
  byUid: string;
  pointsLost: number;
  pointsGained: number;
}

export interface Result {
  yard: Yard;
  interrupted: InterruptEvent | null;
}

export const MIN_MEAL_S = 5;
export const MAX_YARD_MS = 14 * 24 * 3600 * 1000;
export const PRESENCE_MS = 30_000;
export const HARDCORE_GRACE_MS = 25_000;
export const STEAL_DIVISOR = 3;
export const MAX_MEMBERS = 12;

export class RuleError extends Error {}

const DAY_MIN = 1440;

function clone(yard: Yard): Yard {
  return structuredClone(yard);
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

// ---------- sleep ----------

function localMinutes(sleep: Sleep, t: number): number {
  return mod(t / 60000 + sleep.offsetMin, DAY_MIN);
}

export function isAsleep(sleep: Sleep | null, t: number): boolean {
  if (!sleep || sleep.startMin === sleep.endMin) return false;
  const m = localMinutes(sleep, t);
  return sleep.startMin < sleep.endMin
    ? m >= sleep.startMin && m < sleep.endMin
    : m >= sleep.startMin || m < sleep.endMin;
}

/** The next moment at or after `t` when the local clock reads `minuteOfDay`. */
function nextClockTime(sleep: Sleep, t: number, minuteOfDay: number): number {
  const delta = mod(minuteOfDay - localMinutes(sleep, t), DAY_MIN);
  return t + delta * 60000;
}

export function nextSleepStart(sleep: Sleep | null, t: number): number | null {
  if (!sleep || sleep.startMin === sleep.endMin) return null;
  return nextClockTime(sleep, t, sleep.startMin);
}

export function nextWake(sleep: Sleep | null, t: number): number | null {
  if (!sleep || sleep.startMin === sleep.endMin) return null;
  return nextClockTime(sleep, t, sleep.endMin);
}

// ---------- scoring helpers ----------

export function totalPoints(yard: Yard): number {
  return Object.values(yard.members).reduce((s, m) => s + m.points, 0);
}

export function leaderPoints(yard: Yard): number {
  return Object.values(yard.members).reduce((s, m) => Math.max(s, m.points), 0);
}

/** How many more points `uid` can bank before the yard's goal stops them. */
export function roomLeft(yard: Yard, uid: string): number {
  if (yard.goal == null) return Infinity;
  if (yard.mode === 'lastGrain') return Math.max(0, yard.goal - totalPoints(yard));
  if (yard.mode === 'fatHen') return Math.max(0, yard.goal - (yard.members[uid]?.points ?? 0));
  return Infinity;
}

/**
 * The moment the current meal stops earning, whatever the reason: its timer,
 * the yard ending, the goal being reached, or (hardcore) a lost heartbeat.
 * Returns Infinity for a hardcore meal that is still being kept alive.
 */
export function mealEnd(yard: Yard, now: number): number {
  const e = yard.eating;
  if (!e) return -Infinity;
  let end = yard.endsAt;
  const room = roomLeft(yard, e.uid);
  if (room !== Infinity) end = Math.min(end, e.startedAt + room * 1000);
  if (e.endsAt != null) return Math.min(end, e.endsAt);
  if (now - e.lastBeat > HARDCORE_GRACE_MS) return Math.min(end, Math.max(e.lastBeat, e.startedAt));
  return end;
}

/** Points the current meal has earned so far (not yet banked). */
export function mealPoints(yard: Yard, now: number): number {
  const e = yard.eating;
  if (!e) return 0;
  const until = Math.min(now, mealEnd(yard, now));
  return Math.max(0, Math.floor((until - e.startedAt) / 1000));
}

function finishIfOver(yard: Yard, now: number): void {
  if (yard.status !== 'active') return;
  let over = now >= yard.endsAt;
  if (yard.goal != null) {
    if (yard.mode === 'fatHen' && leaderPoints(yard) >= yard.goal) over = true;
    if (yard.mode === 'lastGrain' && totalPoints(yard) >= yard.goal) over = true;
  }
  if (!over) return;
  // Anything still on the plate when the yard closes is banked.
  if (yard.eating) {
    yard.members[yard.eating.uid].points += mealPoints(yard, now);
    yard.eating = null;
  }
  const best = leaderPoints(yard);
  yard.status = 'finished';
  yard.winnerUids = best > 0
    ? Object.keys(yard.members).filter((u) => yard.members[u].points === best).sort()
    : [];
}

/** Bank a meal that has run its course, and close the yard if it is over. */
function settleInPlace(yard: Yard, now: number): void {
  if (yard.status !== 'active') return;
  if (yard.eating && mealEnd(yard, now) <= now) {
    yard.members[yard.eating.uid].points += mealPoints(yard, now);
    yard.eating = null;
  }
  finishIfOver(yard, now);
}

// ---------- actions ----------

/** Natural passage of time only: nobody enters, nobody is interrupted. */
export function settle(yard: Yard, now: number): Yard {
  const y = clone(yard);
  settleInPlace(y, now);
  return y;
}

/**
 * `uid` is in the yard right now (just entered, or still has it open).
 * Any other chicken caught eating loses its meal; `uid` takes a third of it.
 * The eater's own visits keep a hardcore meal alive.
 */
export function touch(yard: Yard, uid: string, now: number): Result {
  const y = clone(yard);
  if (!y.members[uid]) throw new RuleError('You are not in this yard.');
  settleInPlace(y, now);
  let interrupted: InterruptEvent | null = null;
  if (y.status === 'active') {
    const e = y.eating;
    if (e && e.uid !== uid) {
      const lost = mealPoints(y, now);
      const gained = Math.min(Math.floor(lost / STEAL_DIVISOR), roomLeft(y, uid));
      y.members[uid].points += gained;
      y.members[uid].mealsStolen += 1;
      y.members[e.uid].mealsLost += 1;
      y.eating = null;
      interrupted = { victimUid: e.uid, byUid: uid, pointsLost: lost, pointsGained: gained };
      finishIfOver(y, now);
    } else if (e && e.uid === uid && y.hardcore) {
      e.lastBeat = now;
    }
  }
  y.members[uid].lastSeen = now;
  return { yard: y, interrupted };
}

/** Other members who currently have the yard open. */
export function othersPresent(yard: Yard, uid: string, now: number): string[] {
  return Object.keys(yard.members).filter(
    (u) => u !== uid && now - yard.members[u].lastSeen < PRESENCE_MS,
  );
}

/** Why `uid` cannot start eating right now, or null if they can. */
export function whyCannotEat(yard: Yard, uid: string, now: number): string | null {
  if (yard.status === 'finished') return 'This yard is closed.';
  if (yard.status === 'waiting') return 'Waiting for the invited chickens to answer.';
  if (isAsleep(yard.sleep, now)) return 'The chickens are asleep.';
  if (yard.eating) {
    return yard.eating.uid === uid ? 'You are already eating.' : 'Another chicken is eating.';
  }
  if (othersPresent(yard, uid, now).length) return 'Another chicken is watching. Wait them out.';
  if (roomLeft(yard, uid) <= 0) return 'There is nothing left to eat.';
  return null;
}

/** The longest meal (seconds) `uid` could start right now. */
export function maxMealSeconds(yard: Yard, uid: string, now: number): number {
  let end = yard.endsAt;
  const sleepAt = nextSleepStart(yard.sleep, now);
  if (sleepAt != null) end = Math.min(end, sleepAt);
  const byClock = Math.floor((end - now) / 1000);
  return Math.max(0, Math.min(byClock, roomLeft(yard, uid)));
}

/**
 * Start a meal. `seconds` is the timer the player picked (ignored in
 * hardcore yards, which have no timers).
 */
export function startEating(yard: Yard, uid: string, now: number, seconds: number): Result {
  const r = touch(yard, uid, now);
  const y = r.yard;
  const why = whyCannotEat(y, uid, now);
  if (why) throw new RuleError(why);
  if (y.hardcore) {
    y.eating = { uid, startedAt: now, endsAt: null, lastBeat: now };
  } else {
    if (!Number.isFinite(seconds) || seconds < MIN_MEAL_S) {
      throw new RuleError(`A meal lasts at least ${MIN_MEAL_S} seconds.`);
    }
    const length = Math.min(Math.floor(seconds), maxMealSeconds(y, uid, now));
    if (length <= 0) throw new RuleError('There is no time left to eat.');
    y.eating = { uid, startedAt: now, endsAt: now + length * 1000, lastBeat: now };
  }
  return r;
}

/** The eater stops early and keeps what they have eaten so far. */
export function stopEating(yard: Yard, uid: string, now: number): Result {
  const r = touch(yard, uid, now);
  const y = r.yard;
  if (y.eating && y.eating.uid === uid) {
    y.members[uid].points += mealPoints(y, now);
    y.eating = null;
    finishIfOver(y, now);
  }
  return r;
}

/** `uid` closes the yard screen: they are no longer present. */
export function leave(yard: Yard, uid: string): Yard {
  const y = clone(yard);
  if (y.members[uid]) y.members[uid].lastSeen = 0;
  return y;
}

export function join(yard: Yard, uid: string, username: string, look: Look, now: number): Yard {
  const y = settle(yard, now);
  if (y.members[uid]) return y;
  if (y.status === 'finished') throw new RuleError('This yard is closed.');
  if (y.memberUids.length >= MAX_MEMBERS) throw new RuleError('This yard is full.');
  y.members[uid] = {
    username, look, points: 0, lastSeen: 0, mealsLost: 0, mealsStolen: 0, statsClaimed: false,
  };
  y.memberUids.push(uid);
  if (y.invitedUids?.includes(uid)) y.invitedUids = y.invitedUids.filter((u) => u !== uid);
  startIfEveryoneAnswered(y, now);
  return y;
}

// ---------- invitations ----------

/** The game begins: the yard keeps its full length, counted from now. */
function start(yard: Yard, now: number): void {
  const length = yard.endsAt - yard.createdAt;
  yard.createdAt = now;
  yard.endsAt = now + length;
  yard.status = 'active';
}

function startIfEveryoneAnswered(yard: Yard, now: number): void {
  if (yard.status === 'waiting' && !(yard.invitedUids ?? []).length) start(yard, now);
}

/** An invited player says no. Accepting is simply `join`. */
export function declineInvite(yard: Yard, uid: string, now: number): Yard {
  const y = clone(yard);
  if (!y.invitedUids?.includes(uid)) throw new RuleError('That invitation is no longer open.');
  y.invitedUids = y.invitedUids.filter((u) => u !== uid);
  y.declinedUids = [...(y.declinedUids ?? []), uid];
  startIfEveryoneAnswered(y, now);
  return y;
}

/** The yard's owner stops waiting for answers. */
export function startNow(yard: Yard, uid: string, now: number): Yard {
  const y = clone(yard);
  if (y.ownerUid !== uid) throw new RuleError('Only the chicken who opened the yard can start it early.');
  if (y.status === 'waiting') start(y, now);
  return y;
}

export interface NewYard {
  name: string;
  mode: Mode;
  goal: number | null;
  endsAt: number;
  hardcore: boolean;
  sleep: Sleep | null;
  /** Friends to invite straight away. */
  invites?: { uid: string; username: string }[];
  /** Hold the game until every invited chicken has joined or declined. */
  waitForInvites?: boolean;
}

export function createYard(
  opts: NewYard, uid: string, username: string, look: Look, joinCode: string, now: number,
): Yard {
  const name = opts.name.trim();
  if (!name || name.length > 30) throw new RuleError('Give the yard a name of up to 30 characters.');
  if (opts.endsAt <= now + 60_000) throw new RuleError('The yard must stay open for at least a minute.');
  if (opts.endsAt > now + MAX_YARD_MS) throw new RuleError('A yard can stay open for at most a fortnight.');
  let goal: number | null = null;
  if (opts.mode !== 'sundown') {
    goal = Math.floor(opts.goal ?? 0);
    if (!(goal >= 10)) throw new RuleError('The goal must be at least 10.');
  }
  const hardcore = !!opts.hardcore;
  const invites = (opts.invites ?? []).filter((i) => i.uid !== uid).slice(0, MAX_MEMBERS - 1);
  return {
    name, joinCode, ownerUid: uid, createdAt: now, endsAt: opts.endsAt,
    mode: opts.mode, goal, hardcore,
    sleep: hardcore ? null : opts.sleep,
    status: opts.waitForInvites && invites.length ? 'waiting' : 'active',
    winnerUids: [], eating: null,
    members: {
      [uid]: { username, look, points: 0, lastSeen: 0, mealsLost: 0, mealsStolen: 0, statsClaimed: false },
    },
    memberUids: [uid],
    invitedUids: invites.map((i) => i.uid),
    invitedNames: Object.fromEntries(invites.map((i) => [i.uid, i.username])),
    declinedUids: [],
  };
}

// ---------- notice board ----------

/** Something worth writing on the yard's notice board. */
export type BoardEvent =
  | { kind: 'ate'; uid: string; amount: number; at: number }
  | { kind: 'caught'; uid: string; victimUid: string; lost: number; taken: number; at: number };

/**
 * What happened to the meal that was on the table in `before`, judged by
 * comparing it with the yard after any rule was applied at `now`: the eater
 * was caught, or the meal ended and was banked.
 */
export function mealEvents(before: Yard, after: Yard, now: number): BoardEvent[] {
  const e = before.eating;
  if (!e || (after.eating && after.eating.startedAt === e.startedAt)) return [];
  const was = before.members[e.uid];
  const is = after.members[e.uid];
  if (!was || !is) return [];
  if (is.mealsLost > was.mealsLost) {
    const thief = Object.keys(after.members).find(
      (u) => after.members[u].mealsStolen > (before.members[u]?.mealsStolen ?? 0),
    );
    if (!thief) return [];
    const taken = after.members[thief].points - (before.members[thief]?.points ?? 0);
    return [{ kind: 'caught', uid: thief, victimUid: e.uid, lost: mealPoints(before, now), taken, at: now }];
  }
  const amount = is.points - was.points;
  if (amount <= 0) return [];
  return [{ kind: 'ate', uid: e.uid, amount, at: Math.min(now, mealEnd(before, now)) }];
}

/** A yard only counts towards lifetime records if at least two chickens joined it. */
export function countsForRecords(yard: Yard): boolean {
  return yard.memberUids.length >= 2;
}

// ---------- display helpers ----------

/** Points to show for a chicken right now, including the meal in progress. */
export function livePoints(yard: Yard, uid: string, now: number): number {
  const banked = yard.members[uid]?.points ?? 0;
  return yard.eating?.uid === uid ? banked + mealPoints(yard, now) : banked;
}

/** Chicken size from 0 (chick) to 1 (as big as this yard allows). */
export function sizeFor(yard: Yard, uid: string, now: number): number {
  const pts = livePoints(yard, uid, now);
  let max: number;
  if (yard.goal != null) max = yard.goal;
  else max = Math.max(...Object.keys(yard.members).map((u) => livePoints(yard, u, now)));
  if (!(max > 0)) return 0;
  return Math.max(0, Math.min(1, pts / max));
}

/** How full the feed pile looks, from 1 (full) to 0 (gone). */
export function pileFraction(yard: Yard, now: number): number {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const live = (u: string) => livePoints(yard, u, now);
  const uids = Object.keys(yard.members);
  if (yard.mode === 'lastGrain' && yard.goal) {
    return clamp(1 - uids.reduce((s, u) => s + live(u), 0) / yard.goal);
  }
  if (yard.mode === 'fatHen' && yard.goal) {
    return clamp(1 - Math.max(0, ...uids.map(live)) / yard.goal);
  }
  if (yard.status === 'finished') return 0;
  if (yard.status === 'waiting') return 1;
  return clamp((yard.endsAt - now) / (yard.endsAt - yard.createdAt));
}

export const MODE_NAMES: Record<Mode, string> = {
  lastGrain: 'Last Grain',
  sundown: 'Sundown',
  fatHen: 'Fat Hen',
};

export const MODE_BLURBS: Record<Mode, string> = {
  lastGrain: 'A fixed pile of feed. When it is gone, whoever ate the most wins.',
  sundown: 'Eat until the end date. Most points when time runs out wins.',
  fatHen: 'First chicken to grow to the target size wins.',
};
