// The end-of-game report: what happened in a yard, worked out from its final
// scores and its notice-board log. Pure, like the rules.
import { leaderPoints, totalPoints, type Yard } from './rules';

/** One line of the yard's log (see BoardEntry in api.ts). */
export interface LogEntry {
  kind: 'chat' | 'visit' | 'ate' | 'caught' | 'shot' | 'duel' | 'fox';
  at: number;
  uid: string;
  amount?: number;
  victimUid?: string;
  lost?: number;
  taken?: number;
  betrayal?: boolean;
  outcome?: 'allied' | 'fought' | 'brawl' | 'showdown';
  victimUids?: string[];
  killedUid?: string | null;
}

export interface Dealings { times: number; feed: number }

export interface PlayerReport {
  uid: string;
  visits: number;
  notes: number;
  /** Meals that ran their course or were stopped, and so were kept. */
  meals: number;
  /** Time spent with the beak in the pile, lost meals included. */
  feedingMs: number;
  /** The biggest meal kept, in feed. */
  longestMeal: number;
  steals: number;
  feedStolen: number;
  biggestHeist: number;
  stolenFrom: Record<string, Dealings>;
  timesCaught: number;
  feedLost: number;
  caughtBy: Record<string, Dealings>;
  shotsFired: number;
  timesShot: number;
  /** Standoffs settled by choosing: alliances made, fights won, thrown out for offering peace, brawls. */
  alliances: number;
  fightsWon: number;
  foughtOff: number;
  brawls: number;
  /** Shots at one's own ally, and being shot by one's ally. */
  betrayals: number;
  betrayed: number;
  /** Caught by the fox, and killed by it (brutal rules). */
  foxed: number;
  killed: boolean;
  /** Walked in just after another chicken finished a meal: how often, and how much feed got away. */
  nearMisses: number;
  nearMissFeed: number;
  /** Finished a meal just before another chicken walked in. */
  closeShaves: number;
  /** Activity in each hour of the day (0–23), and the busiest of them. */
  hours: number[];
  busiestHour: number | null;
}

export type AwardKind = 'thief' | 'robbed' | 'longestMeal' | 'nosiest' | 'glutton' | 'sharpshooter' | 'escape' | 'chatterbox' | 'traitor' | 'fighter';
export interface Award { kind: AwardKind; uid: string; value: number }

export interface YardReport {
  players: Record<string, PlayerReport>;
  /** How long the game really ran, and how much of it nobody was eating. */
  lengthMs: number;
  idleMs: number;
  longestIdleMs: number;
  totalEaten: number;
  totalStolen: number;
  catches: number;
  /** How often the fox came and caught someone. */
  foxVisits: number;
  hours: number[];
  busiestHour: number | null;
  awards: Award[];
  /** False when the yard has no log to speak of (it predates the notice board). */
  hasLog: boolean;
}

export const NEAR_MS = 5 * 60_000;

const busiest = (hours: number[]) => {
  const top = Math.max(...hours);
  return top > 0 ? hours.indexOf(top) : null;
};

/** `hourOf` turns a moment into an hour of the day (0–23) in the reader's own time zone. */
export function yardReport(yard: Yard, log: LogEntry[], hourOf: (t: number) => number): YardReport {
  const players: Record<string, PlayerReport> = {};
  for (const uid of yard.memberUids) {
    players[uid] = {
      uid, visits: 0, notes: 0, meals: 0, feedingMs: 0, longestMeal: 0, steals: 0, feedStolen: 0, biggestHeist: 0, stolenFrom: {},
      timesCaught: 0, feedLost: 0, caughtBy: {}, shotsFired: 0, timesShot: 0, nearMisses: 0, nearMissFeed: 0, closeShaves: 0,
      alliances: 0, fightsWon: 0, foughtOff: 0, brawls: 0, betrayals: 0, betrayed: 0, foxed: 0, killed: false,
      hours: new Array<number>(24).fill(0), busiestHour: null,
    };
  }
  const entries = log.filter((e) => players[e.uid]).sort((a, b) => a.at - b.at);
  let foxVisits = 0;
  for (const e of log) {
    if (e.kind !== 'fox') continue;
    foxVisits += 1;
    for (const u of e.victimUids ?? []) if (players[u]) players[u].foxed += 1;
    if (e.killedUid && players[e.killedUid]) players[e.killedUid].killed = true;
  }
  const hours = new Array<number>(24).fill(0);
  const active = (uid: string, t: number) => { players[uid].hours[hourOf(t)] += 1; hours[hourOf(t)] += 1; };
  const deal = (book: Record<string, Dealings>, who: string, feed: number) => {
    book[who] = { times: (book[who]?.times ?? 0) + 1, feed: (book[who]?.feed ?? 0) + feed };
  };
  const meals: [number, number][] = []; // every stretch of eating, kept or lost
  let lastMealAt = 0;

  for (const e of entries) {
    const p = players[e.uid];
    if (e.kind === 'visit') { p.visits += 1; active(e.uid, e.at); }
    if (e.kind === 'chat') p.notes += 1;
    if (e.kind === 'ate') {
      const amount = e.amount ?? 0;
      p.meals += 1;
      p.feedingMs += amount * 1000;
      p.longestMeal = Math.max(p.longestMeal, amount);
      meals.push([e.at - amount * 1000, e.at]);
      active(e.uid, e.at - amount * 1000);
      lastMealAt = Math.max(lastMealAt, e.at);
    }
    if (e.kind === 'caught' && e.victimUid && players[e.victimUid]) {
      const lost = e.lost ?? 0;
      const taken = e.taken ?? 0;
      const v = players[e.victimUid];
      p.steals += 1;
      p.feedStolen += taken;
      p.biggestHeist = Math.max(p.biggestHeist, taken);
      deal(p.stolenFrom, e.victimUid, taken);
      v.timesCaught += 1;
      v.feedLost += lost;
      v.feedingMs += lost * 1000;
      deal(v.caughtBy, e.uid, lost);
      meals.push([e.at - lost * 1000, e.at]);
      active(e.victimUid, e.at - lost * 1000);
      lastMealAt = Math.max(lastMealAt, e.at);
    }
    if (e.kind === 'shot' && e.victimUid && players[e.victimUid]) {
      const v = players[e.victimUid];
      p.shotsFired += 1;
      v.timesShot += 1;
      if (e.betrayal) {
        p.betrayals += 1;
        v.betrayed += 1;
        // A betrayed ally loses the meal they were eating.
        const lost = e.lost ?? 0;
        if (lost > 0) {
          v.feedLost += lost;
          v.feedingMs += lost * 1000;
          meals.push([e.at - lost * 1000, e.at]);
        }
      }
    }
    if (e.kind === 'duel' && e.victimUid && players[e.victimUid]) {
      const v = players[e.victimUid];
      if (e.outcome === 'allied') { p.alliances += 1; v.alliances += 1; }
      if (e.outcome === 'fought') { p.fightsWon += 1; v.foughtOff += 1; }
      if (e.outcome === 'brawl') { p.brawls += 1; v.brawls += 1; }
    }
  }

  // Near misses and close shaves: a visit within five minutes after someone else's kept meal.
  const kept = entries.filter((e) => e.kind === 'ate');
  for (const visit of entries.filter((e) => e.kind === 'visit')) {
    const missed = kept.filter((m) => m.uid !== visit.uid && m.at <= visit.at && visit.at - m.at <= NEAR_MS).pop();
    if (!missed) continue;
    players[visit.uid].nearMisses += 1;
    players[visit.uid].nearMissFeed += missed.amount ?? 0;
    players[missed.uid].closeShaves += 1;
  }
  for (const p of Object.values(players)) p.busiestHour = busiest(p.hours);

  // A game that reached its goal ended with its last meal, not at the closing time.
  const reached = yard.goal != null && (yard.mode === 'fatHen' ? leaderPoints(yard) : totalPoints(yard)) >= yard.goal;
  const end = reached && lastMealAt ? Math.min(yard.endsAt, lastMealAt) : yard.endsAt;
  const lengthMs = Math.max(0, end - yard.createdAt);
  let busyMs = 0;
  let longestIdleMs = 0;
  let cursor = yard.createdAt;
  for (const [from, to] of meals.sort((a, b) => a[0] - b[0])) {
    const start = Math.max(from, cursor);
    const stop = Math.min(to, end);
    if (start > cursor) longestIdleMs = Math.max(longestIdleMs, Math.min(start, end) - cursor);
    if (stop > start) busyMs += stop - start;
    cursor = Math.max(cursor, stop);
  }
  longestIdleMs = Math.max(longestIdleMs, end - cursor, 0);

  const awards: Award[] = [];
  const give = (kind: AwardKind, value: (p: PlayerReport) => number) => {
    const best = Object.values(players).sort((a, b) => value(b) - value(a) || a.uid.localeCompare(b.uid))[0];
    if (best && value(best) > 0) awards.push({ kind, uid: best.uid, value: value(best) });
  };
  give('thief', (p) => p.feedStolen);
  give('robbed', (p) => p.feedLost);
  give('longestMeal', (p) => p.longestMeal);
  give('glutton', (p) => p.feedingMs);
  give('nosiest', (p) => p.visits);
  give('escape', (p) => p.closeShaves);
  give('sharpshooter', (p) => p.shotsFired);
  give('traitor', (p) => p.betrayals);
  give('fighter', (p) => p.fightsWon);
  give('chatterbox', (p) => p.notes);

  const all = Object.values(players);
  return {
    players, lengthMs, idleMs: Math.max(0, lengthMs - busyMs), longestIdleMs,
    totalEaten: totalPoints(yard),
    totalStolen: all.reduce((n, p) => n + p.feedStolen, 0),
    foxVisits,
    catches: all.reduce((n, p) => n + p.steals, 0),
    hours, busiestHour: busiest(hours), awards,
    hasLog: entries.some((e) => e.kind !== 'chat'),
  };
}
