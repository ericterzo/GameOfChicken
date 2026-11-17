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
  /** Accessories, each unlocked in its own way (see unlockedFor in api.ts). */
  eyepatch?: boolean;
  hand?: boolean;
  crown?: 'small' | 'big';
}

export interface Member {
  username: string;
  look: Look;
  points: number;
  lastSeen: number;
  /** When this chicken last walked into the yard (after being away). */
  arrivedAt?: number;
  /** Points given on joining a game already under way: not eaten from the pile. */
  headStart?: number;
  mealsLost: number;
  mealsStolen: number;
  /** Feed taken from others by catching them, and feed lost by being caught. Absent on older yards. */
  feedStolen?: number;
  feedLost?: number;
  /** Thrown out of the yard until this moment, by whom, and how (see OutReason). */
  outUntil?: number;
  /** While thrown out, the last moment this chicken was watching the yard from the edge. */
  lurkingAt?: number;
  outBy?: string;
  outWhy?: OutReason;
  /** Shot an ally: wears red horns in this yard until the game ends. */
  traitor?: boolean;
  /** Killed by the fox (brutal rules): keeps its score, may watch, never eats again. */
  dead?: boolean;
  statsClaimed: boolean;
}

export interface Eating {
  uid: string;
  startedAt: number;
  /** Planned end of the meal. null in hardcore yards (no timers). */
  endsAt: number | null;
  /** Last heartbeat from the eater's phone. Only meaningful in hardcore yards. */
  lastBeat: number;
  /** An allied meal: this chicken's ally cannot catch it. Anyone else still can. */
  allyUid?: string;
  /** The most feed this meal may take, fixed when it starts (allied meals share the pile). */
  cap?: number;
}

/** How a chicken came to be thrown out: shot, fought off after offering an alliance, or a brawl. */
export type OutReason = 'shot' | 'beaten' | 'brawl' | 'fox';

/**
 * How a yard is played. Classic: one chicken eats at a time and anyone walking
 * in catches it. Cooperative: chickens eat side by side, but if the whole flock
 * is in the yard at once, everyone eating is caught; and a fox visits now and
 * then. Brutal: as cooperative, but the fox also kills one chicken it finds eating.
 */
export type Ruleset = 'classic' | 'coop' | 'brutal';
export const RULESETS: Ruleset[] = ['classic', 'coop', 'brutal'];

/** The choice two chickens in a standoff make, each in secret. */
export type Choice = 'ally' | 'fight';

/** A standoff between two chickens, while one of them has chosen and the other has not. */
export interface Duel {
  uids: string[];
  choices: Record<string, Choice>;
  at: number;
}

/**
 * Two chickens who both chose to ally. Each picks a secret meal length; the
 * alliance lasts until the longer of the two runs out. Until then they can
 * eat side by side and cannot catch each other, and an ally who has finished
 * may come back and eat again. When an allied meal is over, its chicken leaves.
 */
export interface Pact {
  uids: string[];
  at: number;
  /** Who has chosen their meal length (or left without choosing, which counts as zero). */
  started: string[];
  /** When each ally's chosen meal runs out. null while a hardcore meal (no length) is still going. */
  ends: Record<string, number | null>;
  /** The allied meals still running. */
  meals: Record<string, Eating>;
  /** Set when one ally shoots the other, or another chicken walks in: the alliance is over. */
  broken?: boolean;
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
  /** When set, the game begins at this moment (the yard waits until then). */
  startsAt?: number | null;
  /** 'waiting': not begun yet (a set start time, or invited chickens still to answer); nobody can eat. */
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
  /** Members whose result has been added to their lifetime record (see claimStats in api.ts). */
  claimedUids?: string[];
  /** The latest shot fired in a standoff (see `shoot`), for the yard to act out. */
  shot?: { byUid: string; victimUid: string; at: number; betrayal?: boolean } | null;
  /** The latest catch, for the yard to act out: the victims let out their battle cries and leave. */
  caught?: { victims: string[]; byUid: string; at: number } | null;
  /** The latest battle cry a chicken let out by tapping itself. */
  shout?: { uid: string; at: number } | null;
  /** Classic when absent. */
  ruleset?: Ruleset;
  /** Cooperative rules: the meals eaten side by side. */
  feast?: Record<string, Eating>;
  /** The fox's latest visit already dealt with (cooperative rules), and what it did. */
  foxSeen?: number;
  fox?: { at: number; victims: string[]; killed: string | null; lost: number } | null;
  /** A standoff waiting for its second choice, and an alliance in force. */
  duel?: Duel | null;
  pact?: Pact | null;
}

export interface InterruptEvent {
  victimUid: string;
  byUid: string;
  pointsLost: number;
  pointsGained: number;
}

export interface Result {
  yard: Yard;
  /** Meals caught by walking in: none, one, or both of two allies. */
  interrupted: InterruptEvent[];
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

/** Feed actually eaten from the pile, by everyone (head starts are not part of it). */
export function totalPoints(yard: Yard): number {
  return Object.values(yard.members).reduce((s, m) => s + m.points - (m.headStart ?? 0), 0);
}

export function leaderPoints(yard: Yard): number {
  return Object.values(yard.members).reduce((s, m) => Math.max(s, m.points), 0);
}

/** Every meal in progress: the ordinary one, allied ones, and cooperative ones. */
export function meals(yard: Yard): Eating[] {
  return [
    ...(yard.eating ? [yard.eating] : []),
    ...Object.values(yard.pact?.meals ?? {}),
    ...Object.values(yard.feast ?? {}),
  ];
}

export const isCoop = (yard: Yard) => yard.ruleset === 'coop' || yard.ruleset === 'brutal';

/** The meal `uid` is eating right now, if any. */
export function mealOf(yard: Yard, uid: string): Eating | null {
  return meals(yard).find((e) => e.uid === uid) ?? null;
}

function dropMeal(yard: Yard, uid: string): void {
  if (yard.eating?.uid === uid) yard.eating = null;
  if (yard.pact?.meals[uid]) delete yard.pact.meals[uid];
  if (yard.feast?.[uid]) delete yard.feast[uid];
}

/**
 * How many more points `uid` can bank before the yard's goal stops them. In
 * Last Grain the feed other chickens' meals have claimed is not available.
 */
export function roomLeft(yard: Yard, uid: string): number {
  if (yard.goal == null) return Infinity;
  if (yard.mode === 'lastGrain') {
    const claimed = meals(yard).filter((e) => e.uid !== uid).reduce((n, e) => n + (e.cap ?? 0), 0);
    return Math.max(0, yard.goal - totalPoints(yard) - claimed);
  }
  if (yard.mode === 'fatHen') return Math.max(0, yard.goal - (yard.members[uid]?.points ?? 0));
  return Infinity;
}

/**
 * The moment a meal stops earning, whatever the reason: its timer, the yard
 * ending, the goal being reached, or (hardcore) a lost heartbeat. Returns
 * Infinity for a hardcore meal that is still being kept alive.
 */
export function mealEnd(yard: Yard, now: number, e: Eating | null = yard.eating): number {
  if (!e) return -Infinity;
  let end = yard.endsAt;
  const room = roomLeft(yard, e.uid);
  if (room !== Infinity) end = Math.min(end, e.startedAt + room * 1000);
  if (e.cap != null) end = Math.min(end, e.startedAt + e.cap * 1000);
  if (e.endsAt != null) return Math.min(end, e.endsAt);
  if (now - e.lastBeat > HARDCORE_GRACE_MS) return Math.min(end, Math.max(e.lastBeat, e.startedAt));
  return end;
}

/** Points a meal has earned so far (not yet banked). */
export function mealPoints(yard: Yard, now: number, e: Eating | null = yard.eating): number {
  if (!e) return 0;
  const until = Math.min(now, mealEnd(yard, now, e));
  return Math.max(0, Math.floor((until - e.startedAt) / 1000));
}

/** Bank a meal's points as they stand at `at`. */
function bankMeal(yard: Yard, e: Eating, at: number): void {
  const allied = !!yard.pact?.meals[e.uid];
  if (allied && yard.pact!.ends?.[e.uid] === null) yard.pact!.ends[e.uid] = Math.max(at, e.startedAt);
  yard.members[e.uid].points += mealPoints(yard, at, e);
  dropMeal(yard, e.uid);
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
  for (const e of meals(yard)) yard.members[e.uid].points += mealPoints(yard, now, e);
  yard.eating = null;
  yard.pact = null;
  yard.duel = null;
  if (yard.feast) yard.feast = {};
  const best = leaderPoints(yard);
  yard.status = 'finished';
  yard.winnerUids = best > 0
    ? Object.keys(yard.members).filter((u) => yard.members[u].points === best).sort()
    : [];
}

const present = (yard: Yard, uid: string, now: number) => now - (yard.members[uid]?.lastSeen ?? 0) < PRESENCE_MS;

/**
 * True while an alliance protects its two chickens from each other: until the
 * longer of the two agreed meal lengths runs out. An ally who has not chosen
 * yet keeps it going while they are in the yard; while they are away, their
 * length counts as zero, so an alliance nobody uses ends by itself. Coming
 * back in time and choosing makes their length the agreed one.
 */
export function pactInForce(yard: Yard, now: number): boolean {
  const p = yard.pact;
  if (!p || p.broken) return false;
  let end = p.at;
  for (const u of p.uids) {
    if (!p.started.includes(u)) {
      if (present(yard, u, now)) return true; // still making up their mind
      continue; // away without choosing: zero
    }
    const e = p.ends?.[u];
    if (e === undefined || e === null) return true; // a hardcore meal still going
    end = Math.max(end, e);
  }
  return now < end;
}

/**
 * When the alliance will be over, once that is settled: null while an ally has
 * yet to choose (and is here to do so), or a hardcore meal is still going.
 */
export function pactEnd(yard: Yard, now: number): number | null {
  const p = yard.pact;
  if (!p || p.broken) return null;
  let end = p.at;
  for (const u of p.uids) {
    if (!p.started.includes(u)) {
      if (present(yard, u, now)) return null;
      continue;
    }
    const e = p.ends?.[u];
    if (e === undefined || e === null) return null;
    end = Math.max(end, e);
  }
  return end;
}

/** Once the alliance is over and its meals are done, it is forgotten. */
function tidyPact(yard: Yard, now: number): void {
  const p = yard.pact;
  if (!p) return;
  p.ends ??= {};
  if (!pactInForce(yard, now) && !Object.keys(p.meals).length) yard.pact = null;
}

/** A half-made choice lapses when the standoff it was about is over. */
function tidyDuel(yard: Yard, now: number): void {
  const d = yard.duel;
  if (d && !d.uids.every((u) => duelRival(yard, u, now) === d.uids.find((v) => v !== u))) yard.duel = null;
}

// ---------- the fox (cooperative rules) ----------

export const FOX_MIN_MS = 60 * 60_000;
export const FOX_MAX_MS = 5 * 60 * 60_000;
export const FOX_OUT_MS = 20 * 60_000;

/** A number from 0 to 1 that every phone works out the same for this yard (its code) and `n`. */
function yardRandom(yard: Yard, n: number): number {
  let h = 2166136261 ^ n;
  for (const ch of `${yard.joinCode}:${n}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The fox's next visit not yet dealt with: every 1 to 5 hours from the start, at random. */
export function nextFox(yard: Yard): number | null {
  if (!isCoop(yard) || yard.status !== 'active') return null;
  const seen = yard.foxSeen ?? yard.createdAt;
  let t = yard.createdAt;
  for (let n = 0; n < 400; n += 1) {
    t += FOX_MIN_MS + yardRandom(yard, n) * (FOX_MAX_MS - FOX_MIN_MS);
    if (t > seen) return t;
  }
  return null;
}

/**
 * The fox bursts in at `at`: every chicken in the yard then, eating or watching,
 * is caught. Meals in progress are lost, and the chickens are out for 20 minutes.
 * Under brutal rules it also kills one of the chickens it found eating.
 */
function foxVisits(yard: Yard, at: number): void {
  yard.foxSeen = at;
  const eating = meals(yard).filter((e) => e.startedAt <= at);
  const there = new Set(eating.map((e) => e.uid));
  for (const u of yard.memberUids) {
    const m = yard.members[u];
    if (!m.dead && !isOut(yard, u, at) && at - m.lastSeen >= 0 && at - m.lastSeen < PRESENCE_MS) there.add(u);
  }
  if (!there.size) return;
  let lost = 0;
  for (const e of eating) {
    const p = mealPoints(yard, at, e);
    lost += p;
    dropMeal(yard, e.uid);
    yard.members[e.uid].mealsLost += 1;
    yard.members[e.uid].feedLost = (yard.members[e.uid].feedLost ?? 0) + p;
  }
  let killed: string | null = null;
  if (yard.ruleset === 'brutal' && eating.length) {
    const list = eating.map((e) => e.uid).sort();
    killed = list[Math.floor(yardRandom(yard, Math.floor(at / 1000)) * list.length)];
    yard.members[killed].dead = true;
  }
  for (const u of there) throwOut(yard, u, 'fox', at, FOX_OUT_MS, 'fox');
  yard.fox = { at, victims: [...there].sort(), killed, lost };
}

// ---------- cooperative catches ----------

/** Chickens that count towards "the whole flock": alive and not kept out. */
export function flock(yard: Yard, now: number): string[] {
  return yard.memberUids.filter((u) => !yard.members[u].dead && !isOut(yard, u, now));
}

/** In the yard right now: watching, or eating (phone or not). */
const inYardNow = (yard: Yard, u: string, now: number) => present(yard, u, now) || !!mealOf(yard, u);

/** How many of the flock are in the yard, and how many there are. */
export function flockCount(yard: Yard, now: number): { here: number; of: number } {
  const all = flock(yard, now);
  return { here: all.filter((u) => inYardNow(yard, u, now)).length, of: all.length };
}

/** Bank the meals that have run their course, in the order they ended, and close the yard if it is over. */
function settleInPlace(yard: Yard, now: number): void {
  // A yard with a set start time begins then, whoever is the first to notice.
  if (yard.status === 'waiting' && yard.startsAt != null && now >= yard.startsAt) start(yard, yard.startsAt);
  if (yard.status !== 'active') return;
  for (;;) {
    const due = meals(yard)
      .map((e) => ({ e, end: mealEnd(yard, now, e) }))
      .filter((m) => m.end <= now)
      .sort((a, b) => a.end - b.end)[0];
    const fox = nextFox(yard);
    if (fox != null && fox <= now && fox < yard.endsAt && (!due || fox <= due.end)) {
      foxVisits(yard, fox);
      continue;
    }
    if (!due) break;
    bankMeal(yard, due.e, due.end);
    finishIfOver(yard, due.end);
    if (yard.status !== 'active') return;
  }
  finishIfOver(yard, now);
  tidyPact(yard, now);
  tidyDuel(yard, now);
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
 * Any other chicken caught eating loses its meal and `uid` takes a third of
 * it, except an ally's protected meal. The eater's own visits keep a hardcore
 * meal alive.
 */
export function touch(yard: Yard, uid: string, now: number): Result {
  const y = clone(yard);
  if (!y.members[uid]) throw new RuleError('You are not in this yard.');
  if (isOut(y, uid, now)) {
    // Thrown out: may watch from the edge of the yard, but is not in it. Catches nobody, blocks nobody.
    settleInPlace(y, now);
    y.members[uid].lurkingAt = now;
    return { yard: y, interrupted: [] };
  }
  settleInPlace(y, now);
  const interrupted: InterruptEvent[] = [];
  if (y.status === 'active' && isCoop(y)) {
    // Cooperative: walking in catches nobody, unless it makes the whole flock be here at once.
    // Then everyone eating is caught, and I take 1/N of all I ruined (N = how many I caught).
    for (const e of meals(y)) if (e.uid === uid && y.hardcore) e.lastBeat = now;
    const all = flock(y, now);
    const victims = meals(y).filter((e) => e.uid !== uid);
    if (all.length >= 2 && all.every((u) => u === uid || inYardNow(y, u, now)) && victims.length) {
      const share = victims.length;
      for (const e of victims) {
        const lost = mealPoints(y, now, e);
        dropMeal(y, e.uid);
        const gained = Math.min(Math.floor(lost / share), roomLeft(y, uid));
        y.members[uid].points += gained;
        y.members[uid].mealsStolen += 1;
        y.members[uid].feedStolen = (y.members[uid].feedStolen ?? 0) + gained;
        y.members[e.uid].mealsLost += 1;
        y.members[e.uid].feedLost = (y.members[e.uid].feedLost ?? 0) + lost;
        interrupted.push({ victimUid: e.uid, byUid: uid, pointsLost: lost, pointsGained: gained });
      }
      y.caught = { victims: interrupted.map((i) => i.victimUid), byUid: uid, at: now };
      finishIfOver(y, now);
    }
  } else if (y.status === 'active') {
    // Any other chicken walking in breaks an alliance: it is a standoff again.
    if (y.pact && !y.pact.uids.includes(uid) && pactInForce(y, now)) y.pact.broken = true;
    const ally = allyOf(y, uid, now);
    for (const e of meals(y)) {
      if (e.uid === uid) {
        if (y.hardcore) e.lastBeat = now;
        continue;
      }
      if (ally && e.uid === ally) continue; // an ally's meal is safe from me while the alliance holds
      const lost = mealPoints(y, now, e);
      dropMeal(y, e.uid);
      const gained = Math.min(Math.floor(lost / STEAL_DIVISOR), roomLeft(y, uid));
      y.members[uid].points += gained;
      y.members[uid].mealsStolen += 1;
      y.members[uid].feedStolen = (y.members[uid].feedStolen ?? 0) + gained;
      y.members[e.uid].mealsLost += 1;
      y.members[e.uid].feedLost = (y.members[e.uid].feedLost ?? 0) + lost;
      interrupted.push({ victimUid: e.uid, byUid: uid, pointsLost: lost, pointsGained: gained });
      // A caught chicken lets out its battle cry; if it was watching, it stays for the standoff.
    }
    if (interrupted.length) {
      y.caught = { victims: interrupted.map((i) => i.victimUid), byUid: uid, at: now };
      finishIfOver(y, now);
    }
  }
  if (now - y.members[uid].lastSeen >= PRESENCE_MS) y.members[uid].arrivedAt = now;
  y.members[uid].lastSeen = now;
  tidyPact(y, now);
  tidyDuel(y, now);
  return { yard: y, interrupted };
}

/** True while `uid` is kept out of the yard (shot, or thrown out after a standoff). */
export function isOut(yard: Yard, uid: string, now: number): boolean {
  const m = yard.members[uid];
  return !!m && (!!m.dead || (m.outUntil ?? 0) > now);
}

/** True while `uid` is thrown out but watching the yard from its edge. */
export function isLurking(yard: Yard, uid: string, now: number): boolean {
  const m = yard.members[uid];
  return !!m && isOut(yard, uid, now) && now - (m.lurkingAt ?? 0) < PRESENCE_MS;
}

function throwOut(yard: Yard, uid: string, by: string, now: number, ms: number, why: OutReason): void {
  const m = yard.members[uid];
  m.lastSeen = 0;
  m.lurkingAt = now; // watching from the edge straight away
  m.outUntil = now + ms;
  m.outBy = by;
  m.outWhy = why;
}

export const SHOT_MIN_MS = 2 * 60_000;
export const SHOT_MAX_MS = 4 * 60_000;
export const FOUGHT_OFF_MS = 7 * 60_000;
export const BRAWL_MS = 12 * 60_000;

/** `uid`'s ally, while their alliance holds. */
export function allyOf(yard: Yard, uid: string, now: number): string | null {
  const p = yard.pact;
  if (!p || !p.uids.includes(uid) || !pactInForce(yard, now)) return null;
  return p.uids.find((u) => u !== uid) ?? null;
}

/**
 * The chicken `uid` is facing in a standoff that can be settled with Ally or
 * Fight: exactly one other chicken watching, nobody eating, no alliance in force.
 */
export function duelRival(yard: Yard, uid: string, now: number): string | null {
  // There is nobody to ally against in a yard only two chickens ever joined.
  if (yard.memberUids.length < 3 || isCoop(yard)) return null;
  if (yard.status !== 'active' || isAsleep(yard.sleep, now) || meals(yard).length || yard.pact) return null;
  if (!yard.members[uid] || isOut(yard, uid, now) || !present(yard, uid, now)) return null;
  const others = othersPresent(yard, uid, now);
  return others.length === 1 ? others[0] : null;
}

export type DuelOutcome =
  | { kind: 'allied'; uids: [string, string] }
  | { kind: 'fought'; winnerUid: string; loserUid: string }
  | { kind: 'brawl'; uids: [string, string] };

/**
 * `uid` makes their secret choice in a standoff. Once both have chosen:
 * both ally, and they may feed side by side; one fights, and the other is
 * thrown out for 7 minutes; both fight, and both are out for 12.
 */
export function choose(yard: Yard, uid: string, now: number, choice: Choice): { yard: Yard; outcome: DuelOutcome | null } {
  const r = touch(yard, uid, now);
  const y = r.yard;
  const rival = r.interrupted.length ? null : duelRival(y, uid, now);
  if (!rival) throw new RuleError('There is no standoff to settle.');
  const pair = [uid, rival].sort();
  const before = y.duel && y.duel.uids.join() === pair.join() ? y.duel : null;
  if (before?.choices[uid]) throw new RuleError('You have already chosen.');
  const choices = { ...(before?.choices ?? {}), [uid]: choice };
  const theirs = choices[rival];
  if (!theirs) {
    y.duel = { uids: pair, choices, at: before?.at ?? now };
    return { yard: y, outcome: null };
  }
  y.duel = null;
  if (choice === 'ally' && theirs === 'ally') {
    y.pact = { uids: pair, at: now, started: [], ends: {}, meals: {} };
    return { yard: y, outcome: { kind: 'allied', uids: [pair[0], pair[1]] } };
  }
  if (choice === 'fight' && theirs === 'fight') {
    throwOut(y, uid, rival, now, BRAWL_MS, 'brawl');
    throwOut(y, rival, uid, now, BRAWL_MS, 'brawl');
    return { yard: y, outcome: { kind: 'brawl', uids: [pair[0], pair[1]] } };
  }
  const [winnerUid, loserUid] = choice === 'fight' ? [uid, rival] : [rival, uid];
  throwOut(y, loserUid, winnerUid, now, FOUGHT_OFF_MS, 'beaten');
  return { yard: y, outcome: { kind: 'fought', winnerUid, loserUid } };
}

export interface ShotResult {
  yard: Yard;
  victimUid: string | null;
  /** The victim was the shooter's ally. */
  betrayal: boolean;
  /** Feed the victim lost from a meal in progress (an ally shot while eating). */
  lost: number;
}

/**
 * The standoff's secret way out: `uid` draws a gun on another chicken in the
 * yard. The victim is thrown out and cannot come back for `waitMs`. Shooting
 * your own ally, even mid-meal, is a betrayal: they lose the meal and the
 * shooter wears horns for the rest of the game. `pick` (0 to 1) chooses the
 * victim when there are several. Returns no victim, and the yard untouched,
 * when there is nobody to shoot.
 */
export function shoot(yard: Yard, uid: string, now: number, pick: number, waitMs: number, minOthers = 1): ShotResult {
  const none = { yard, victimUid: null, betrayal: false, lost: 0 };
  if (isOut(yard, uid, now)) return none; // a lurker cannot shoot
  const r = touch(yard, uid, now);
  const y = r.yard;
  if (y.status !== 'active' || r.interrupted.length) return none;
  const ally = allyOf(y, uid, now);
  const targets = new Set(othersPresent(y, uid, now));
  if (ally && mealOf(y, ally)) targets.add(ally); // an ally feeding is in the yard, phone or not
  const list = [...targets].sort();
  // Nobody to shoot; or the trigger, which only fires in a crowd, is late and it is down to two.
  if (list.length < Math.max(1, minOthers)) return none;
  const victimUid = list[Math.min(list.length - 1, Math.floor(Math.max(0, pick) * list.length))];
  const betrayal = victimUid === ally;
  let lost = 0;
  if (betrayal) {
    const e = mealOf(y, victimUid);
    if (e) {
      lost = mealPoints(y, now, e);
      dropMeal(y, victimUid);
      y.members[victimUid].mealsLost += 1;
      y.members[victimUid].feedLost = (y.members[victimUid].feedLost ?? 0) + lost;
    }
    y.members[uid].traitor = true;
    // The alliance is over: the traitor's own meal is no longer protected.
    y.pact!.broken = true;
  }
  const wait = Math.max(SHOT_MIN_MS, Math.min(SHOT_MAX_MS, Math.round(waitMs)));
  throwOut(y, victimUid, uid, now, wait, 'shot');
  y.duel = null;
  y.shot = { byUid: uid, victimUid, at: now, ...(betrayal ? { betrayal: true } : {}) };
  tidyPact(y, now);
  return { yard: y, victimUid, betrayal, lost };
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
  if (yard.status === 'waiting') {
    return yard.startsAt != null ? 'The game has not started yet.' : 'Waiting for the invited chickens to answer.';
  }
  if (isAsleep(yard.sleep, now)) return 'The chickens are asleep.';
  if (yard.members[uid]?.dead) return 'The fox killed your chicken. It can never eat again.';
  if (isOut(yard, uid, now)) return 'You were thrown out of this yard. Wait before going back in.';
  if (mealOf(yard, uid)) return 'You are already eating.';
  if (isCoop(yard)) {
    const { here, of } = flockCount(yard, now);
    if (of >= 2 && here >= of) return 'The whole flock is in the yard: anyone eating now would be caught.';
    if (roomLeft(yard, uid) <= 0) return 'There is nothing left to eat.';
    return null;
  }
  // While the alliance holds, allies may feed side by side.
  const ally = allyOf(yard, uid, now);
  if (meals(yard).some((e) => e.uid !== ally)) return 'Another chicken is eating.';
  if (othersPresent(yard, uid, now).some((u) => u !== ally)) return 'Another chicken is watching. Wait them out.';
  if (roomLeft(yard, uid) <= 0) return 'There is nothing left to eat.';
  return null;
}

/** The longest meal (seconds) `uid` could start right now. */
export function maxMealSeconds(yard: Yard, uid: string, now: number): number {
  let end = yard.endsAt;
  const sleepAt = nextSleepStart(yard.sleep, now);
  if (sleepAt != null) end = Math.min(end, sleepAt);
  // A further meal under an alliance ends with it, so nobody is left eating in front of an ex-ally.
  if (allyOf(yard, uid, now) && yard.pact?.started.includes(uid)) {
    const pact = pactEnd(yard, now);
    if (pact != null) end = Math.min(end, pact);
  }
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
  let meal: Eating;
  if (y.hardcore) {
    meal = { uid, startedAt: now, endsAt: null, lastBeat: now };
  } else {
    if (!Number.isFinite(seconds) || seconds < MIN_MEAL_S) {
      throw new RuleError(`A meal lasts at least ${MIN_MEAL_S} seconds.`);
    }
    const length = Math.min(Math.floor(seconds), maxMealSeconds(y, uid, now));
    if (length <= 0) throw new RuleError('There is no time left to eat.');
    meal = { uid, startedAt: now, endsAt: now + length * 1000, lastBeat: now };
  }
  const ally = allyOf(y, uid, now);
  if (isCoop(y)) {
    // Side by side: each meal claims its share of the pile up front.
    const room = roomLeft(y, uid);
    const cap = meal.endsAt != null ? (meal.endsAt - now) / 1000 : room;
    y.feast = { ...(y.feast ?? {}), [uid]: { ...meal, ...(Number.isFinite(cap) ? { cap: Math.min(cap, room) } : {}) } };
  } else if (ally && y.pact) {
    // An allied meal: safe from the ally while the alliance holds, and it claims its share of the pile up front.
    const room = roomLeft(y, uid);
    const cap = meal.endsAt != null ? (meal.endsAt - now) / 1000 : room;
    y.pact.meals[uid] = { ...meal, allyUid: ally, ...(Number.isFinite(cap) ? { cap: Math.min(cap, room) } : {}) };
    y.pact.ends ??= {};
    if (!y.pact.started.includes(uid)) {
      // The first meal is the length this ally chose for the alliance.
      y.pact.started.push(uid);
      y.pact.ends[uid] = meal.endsAt;
    }
  } else {
    y.eating = meal;
  }
  return r;
}

/** The eater stops early and keeps what they have eaten so far. */
export function stopEating(yard: Yard, uid: string, now: number): Result {
  const r = touch(yard, uid, now);
  const y = r.yard;
  const e = mealOf(y, uid);
  if (e) {
    bankMeal(y, e, now);
    finishIfOver(y, now);
    tidyPact(y, now);
  }
  return r;
}

/** `uid` closes the yard screen: they are no longer present. */
export function leave(yard: Yard, uid: string): Yard {
  const y = clone(yard);
  if (y.members[uid]) {
    y.members[uid].lastSeen = 0;
    y.members[uid].lurkingAt = 0;
  }
  return y;
}

export function join(yard: Yard, uid: string, username: string, look: Look, now: number): Yard {
  const y = settle(yard, now);
  if (y.members[uid]) return y;
  if (y.status === 'finished') throw new RuleError('This yard is closed.');
  if (y.memberUids.length >= MAX_MEMBERS) throw new RuleError('This yard is full.');
  // Joining a game already under way: start level with the average chicken already in it.
  const headStart = joinHeadStart(y);
  y.members[uid] = {
    username, look, points: headStart, lastSeen: 0, mealsLost: 0, mealsStolen: 0, statsClaimed: false,
    ...(headStart ? { headStart } : {}),
  };
  y.memberUids.push(uid);
  if (y.invitedUids?.includes(uid)) y.invitedUids = y.invitedUids.filter((u) => u !== uid);
  startIfEveryoneAnswered(y, now);
  return y;
}

/** The points a chicken joining now would start with: the average banked score, once the game is under way. */
export function joinHeadStart(yard: Yard): number {
  if (yard.status !== 'active' || !yard.memberUids.length) return 0;
  const sum = yard.memberUids.reduce((n, u) => n + (yard.members[u]?.points ?? 0), 0);
  return Math.floor(sum / yard.memberUids.length);
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
  // A yard with a set start time keeps to it, whatever the answers.
  if (yard.status === 'waiting' && yard.startsAt == null && !(yard.invitedUids ?? []).length) start(yard, now);
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
  /** Begin the game at this moment instead of straight away. The yard keeps its full length from then. */
  startsAt?: number | null;
  /** Classic, cooperative or brutal (classic when absent). */
  ruleset?: Ruleset;
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
  const startsAt = opts.startsAt ?? null;
  if (startsAt != null) {
    if (!(startsAt >= now + 55_000)) throw new RuleError('The start must be at least a minute away.');
    if (startsAt > now + MAX_YARD_MS) throw new RuleError('The start can be at most a fortnight away.');
  }
  const hardcore = !!opts.hardcore;
  const invites = (opts.invites ?? []).filter((i) => i.uid !== uid).slice(0, MAX_MEMBERS - 1);
  return {
    name, joinCode, ownerUid: uid, createdAt: now, endsAt: opts.endsAt,
    mode: opts.mode, goal, hardcore,
    sleep: hardcore ? null : opts.sleep,
    startsAt,
    ...(opts.ruleset && opts.ruleset !== 'classic' ? { ruleset: opts.ruleset, feast: {} } : {}),
    status: startsAt != null || (opts.waitForInvites && invites.length) ? 'waiting' : 'active',
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
export function mealEvents(before: Yard, after: Yard, now: number, caught: InterruptEvent[] = []): BoardEvent[] {
  const out: BoardEvent[] = [];
  for (const e of meals(before)) {
    const still = mealOf(after, e.uid);
    if (still && still.startedAt === e.startedAt) continue;
    const hit = caught.find((c) => c.victimUid === e.uid);
    if (hit) {
      out.push({ kind: 'caught', uid: hit.byUid, victimUid: e.uid, lost: hit.pointsLost, taken: hit.pointsGained, at: now });
      continue;
    }
    // What the eater gained, less anything they took by catching others in the same moment.
    const gained = caught.filter((c) => c.byUid === e.uid).reduce((n, c) => n + c.pointsGained, 0);
    const amount = (after.members[e.uid]?.points ?? 0) - (before.members[e.uid]?.points ?? 0) - gained;
    if (amount > 0) out.push({ kind: 'ate', uid: e.uid, amount, at: Math.min(now, mealEnd(before, now, e)) });
  }
  return out;
}

/** A yard only counts towards lifetime records if at least two chickens joined it. */
export function countsForRecords(yard: Yard): boolean {
  return yard.memberUids.length >= 2;
}

// ---------- records ----------

/** A player's record: lifetime, or what one yard adds to it. */
export interface Tally {
  gamesPlayed: number;
  wins: number;
  losses: number;
  biggestChicken: number;
  totalPoints: number;
  feedStolen: number;
  feedLost: number;
  mealsStolen: number;
  mealsLost: number;
}

export const EMPTY_TALLY: Tally = {
  gamesPlayed: 0, wins: 0, losses: 0, biggestChicken: 0, totalPoints: 0, feedStolen: 0, feedLost: 0, mealsStolen: 0, mealsLost: 0,
};

export function addTally(a: Tally, b: Tally): Tally {
  return {
    gamesPlayed: a.gamesPlayed + b.gamesPlayed,
    wins: a.wins + b.wins,
    losses: a.losses + b.losses,
    biggestChicken: Math.max(a.biggestChicken, b.biggestChicken),
    totalPoints: a.totalPoints + b.totalPoints,
    feedStolen: a.feedStolen + b.feedStolen,
    feedLost: a.feedLost + b.feedLost,
    mealsStolen: a.mealsStolen + b.mealsStolen,
    mealsLost: a.mealsLost + b.mealsLost,
  };
}

/**
 * What this yard adds to `uid`'s record as things stand at `now`. A yard still
 * running counts as played, with the feed so far, but is not yet won or lost.
 */
export function yardTally(yard: Yard, uid: string, now: number): Tally {
  const m = yard.members[uid];
  if (!m || yard.status === 'waiting' || !countsForRecords(yard)) return EMPTY_TALLY;
  const over = yard.status === 'finished';
  const won = over && yard.winnerUids.includes(uid);
  const points = livePoints(yard, uid, now);
  return {
    gamesPlayed: 1,
    wins: won ? 1 : 0,
    losses: over && !won ? 1 : 0,
    biggestChicken: points,
    totalPoints: points - (m.headStart ?? 0), // feed eaten, not the head start
    feedStolen: m.feedStolen ?? 0,
    feedLost: m.feedLost ?? 0,
    mealsStolen: m.mealsStolen,
    mealsLost: m.mealsLost,
  };
}

/** Everyone's running total from yards that are not closed yet. */
export function liveTallies(yards: Yard[], now: number): Record<string, Tally> {
  const out: Record<string, Tally> = {};
  for (const raw of yards) {
    if (raw.status !== 'active') continue;
    const y = settle(raw, now);
    for (const uid of y.memberUids) out[uid] = addTally(out[uid] ?? EMPTY_TALLY, yardTally(y, uid, now));
  }
  return out;
}

// ---------- display helpers ----------

/** Points to show for a chicken right now, including the meal in progress. */
export function livePoints(yard: Yard, uid: string, now: number): number {
  const banked = yard.members[uid]?.points ?? 0;
  const e = mealOf(yard, uid);
  return e ? banked + mealPoints(yard, now, e) : banked;
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
    return clamp(1 - uids.reduce((s, u) => s + live(u) - (yard.members[u].headStart ?? 0), 0) / yard.goal);
  }
  if (yard.mode === 'fatHen' && yard.goal) {
    return clamp(1 - Math.max(0, ...uids.map(live)) / yard.goal);
  }
  if (yard.status === 'finished') return 0;
  if (yard.status === 'waiting') return 1;
  return clamp((yard.endsAt - now) / (yard.endsAt - yard.createdAt));
}

export const RULESET_NAMES: Record<Ruleset, string> = {
  classic: 'Classic',
  coop: 'Cooperative',
  brutal: 'Cooperative brutal',
};

export const RULESET_BLURBS: Record<Ruleset, string> = {
  classic: 'One chicken eats at a time. Anyone who walks in catches it.',
  coop: 'Eat side by side, but never let the whole flock be in the yard at once. A fox drops by every few hours.',
  brutal: 'Cooperative, but the fox also kills one of the chickens it finds eating.',
};

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
