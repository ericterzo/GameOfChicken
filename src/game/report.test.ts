import { describe, expect, it } from 'vitest';
import { yardReport, type LogEntry } from './report';
import { createYard, join, type Look } from './rules';

const look: Look = { body: '#fff', beak: 'short', beakColor: '#f90', comb: 'classic', combColor: '#d00' };
const T0 = Date.UTC(2026, 0, 10, 12, 0, 0);
const m = (min: number) => T0 + min * 60_000;
const hourOf = (t: number) => new Date(t).getUTCHours();

function yard() {
  let y = createYard({ name: 'Y', mode: 'sundown', goal: null, endsAt: m(120), hardcore: false, sleep: null }, 'a', 'Anna', look, 'ABC123', T0);
  y = join(y, 'b', 'Ben', look, T0);
  y.status = 'finished';
  y.members.a.points = 600 + 40;
  y.members.b.points = 300;
  return y;
}

const log: LogEntry[] = [
  { kind: 'visit', at: m(0), uid: 'a' },
  { kind: 'ate', at: m(10), uid: 'a', amount: 600 }, // Anna eats 0–10
  { kind: 'visit', at: m(12), uid: 'b' }, // Ben walks in two minutes too late
  { kind: 'chat', at: m(13), uid: 'b' },
  { kind: 'caught', at: m(62), uid: 'a', victimUid: 'b', lost: 120, taken: 40 }, // Ben ate 60–62 and was caught
  { kind: 'visit', at: m(62), uid: 'a' },
  { kind: 'ate', at: m(95), uid: 'b', amount: 300 }, // Ben eats 90–95
  { kind: 'shot', at: m(100), uid: 'b', victimUid: 'a' },
  { kind: 'duel', at: m(101), uid: 'a', victimUid: 'b', outcome: 'allied' },
  { kind: 'duel', at: m(102), uid: 'b', victimUid: 'a', outcome: 'fought' },
  { kind: 'shot', at: m(103), uid: 'a', victimUid: 'b', betrayal: true, lost: 60 },
  { kind: 'visit', at: m(110), uid: 'zz' }, // not a member: ignored
];

describe('the end-of-game report', () => {
  const r = yardReport(yard(), log, hourOf);

  it('counts each chicken\'s visits, meals, time at the pile, steals and losses', () => {
    expect(r.players.a).toMatchObject({
      visits: 2, meals: 1, feedingMs: 600_000, longestMeal: 600, steals: 1, feedStolen: 40, biggestHeist: 40,
      stolenFrom: { b: { times: 1, feed: 40 } }, timesCaught: 0, timesShot: 1, closeShaves: 1, notes: 0,
      alliances: 1, foughtOff: 1, fightsWon: 0, betrayals: 1, shotsFired: 1,
    });
    expect(r.players.b).toMatchObject({
      visits: 1, notes: 1, meals: 1, feedingMs: 480_000, timesCaught: 1, feedLost: 180, betrayed: 1, fightsWon: 1, alliances: 1,
      caughtBy: { a: { times: 1, feed: 120 } }, shotsFired: 1, nearMisses: 1, nearMissFeed: 600,
    });
  });

  it('measures the game: empty time, busiest hour and awards', () => {
    expect(r.lengthMs).toBe(120 * 60_000);
    expect(r.idleMs).toBe((120 - 10 - 2 - 5 - 1) * 60_000); // Ben's betrayed meal ran 102–103
    expect(r.longestIdleMs).toBe(50 * 60_000); // between Anna's meal and Ben's first
    expect(r.busiestHour).toBe(12);
    expect(r.players.b.busiestHour).toBe(13);
    expect(r.catches).toBe(1);
    expect(r.awards).toEqual(expect.arrayContaining([
      { kind: 'thief', uid: 'a', value: 40 }, { kind: 'robbed', uid: 'b', value: 180 }, { kind: 'longestMeal', uid: 'a', value: 600 },
      { kind: 'nosiest', uid: 'a', value: 2 }, { kind: 'sharpshooter', uid: 'a', value: 1 }, { kind: 'escape', uid: 'a', value: 1 },
      { kind: 'traitor', uid: 'a', value: 1 }, { kind: 'fighter', uid: 'b', value: 1 },
    ]));
    expect(r.hasLog).toBe(true);
  });

  it('ends a goal game at its last meal, and copes with no log at all', () => {
    const y = yard();
    y.mode = 'fatHen';
    y.goal = 600;
    expect(yardReport(y, log, hourOf).lengthMs).toBe(95 * 60_000);
    const empty = yardReport(yard(), [], hourOf);
    expect(empty).toMatchObject({ hasLog: false, awards: [], idleMs: 120 * 60_000, busiestHour: null });
  });
});
