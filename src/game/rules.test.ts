import { describe, expect, it } from 'vitest';
import {
  createYard, isAsleep, join, leave, livePoints, maxMealSeconds, nextSleepStart, pileFraction,
  RuleError, settle, sizeFor, startEating, stopEating, touch, whyCannotEat,
  type Look, type NewYard, type Yard,
} from './rules';

const look: Look = { body: '#fff', beak: 'short', beakColor: '#f90', comb: 'classic', combColor: '#d00' };
const T0 = Date.UTC(2026, 0, 10, 12, 0, 0); // noon UTC
const s = (n: number) => T0 + n * 1000;
const HOUR = 3600;

function yard(over: Partial<NewYard> = {}): Yard {
  const opts: NewYard = {
    name: 'Test yard', mode: 'sundown', goal: null, endsAt: s(24 * HOUR), hardcore: false, sleep: null, ...over,
  };
  let y = createYard(opts, 'a', 'Anna', look, 'ABC123', T0);
  y = join(y, 'b', 'Ben', look, T0);
  return y;
}

describe('eating and banking', () => {
  it('banks a full meal once its timer runs out', () => {
    let y = startEating(yard(), 'a', s(0), 60).yard;
    y = leave(y, 'a');
    expect(settle(y, s(30)).members.a.points).toBe(0);
    expect(livePoints(y, 'a', s(30))).toBe(30);
    y = settle(y, s(61));
    expect(y.members.a.points).toBe(60);
    expect(y.eating).toBeNull();
  });

  it('banks points so far when the eater stops early', () => {
    let y = startEating(yard(), 'a', s(0), 600).yard;
    y = stopEating(y, 'a', s(42)).yard;
    expect(y.members.a.points).toBe(42);
    expect(y.eating).toBeNull();
  });

  it('refuses meals shorter than 5 seconds', () => {
    expect(() => startEating(yard(), 'a', s(0), 4)).toThrow(RuleError);
  });

  it('clamps a meal to the end of the yard', () => {
    const y = startEating(yard({ endsAt: s(100) }), 'a', s(0), 5000).yard;
    expect(y.eating!.endsAt).toBe(s(100));
  });
});

describe('interruption', () => {
  it('wipes the meal and gives the entrant a third, rounded down', () => {
    let y = startEating(yard(), 'a', s(0), 600).yard;
    y = leave(y, 'a');
    const r = touch(y, 'b', s(100));
    expect(r.yard.members.a.points).toBe(0);
    expect(r.yard.members.b.points).toBe(33);
    expect(r.yard.eating).toBeNull();
    expect(r.interrupted).toEqual({ victimUid: 'a', byUid: 'b', pointsLost: 100, pointsGained: 33 });
    expect(r.yard.members.a.mealsLost).toBe(1);
    expect(r.yard.members.b.mealsStolen).toBe(1);
  });

  it('leaves previously banked points alone', () => {
    let y = startEating(yard(), 'a', s(0), 50).yard;
    y = leave(y, 'a');
    y = startEating(settle(y, s(60)), 'a', s(60), 600).yard;
    y = leave(y, 'a');
    y = touch(y, 'b', s(90)).yard;
    expect(y.members.a.points).toBe(50);
    expect(y.members.b.points).toBe(10);
  });

  it('does not interrupt a meal that already finished', () => {
    let y = startEating(yard(), 'a', s(0), 30).yard;
    y = leave(y, 'a');
    const r = touch(y, 'b', s(31));
    expect(r.interrupted).toBeNull();
    expect(r.yard.members.a.points).toBe(30);
    expect(r.yard.members.b.points).toBe(0);
  });

  it('lets the entrant start eating right away when the eater is gone', () => {
    let y = startEating(yard(), 'a', s(0), 600).yard;
    y = leave(y, 'a');
    y = startEating(y, 'b', s(90), 20).yard;
    expect(y.members.b.points).toBe(30);
    expect(y.eating!.uid).toBe('b');
  });

  it("the eater's own return does not interrupt", () => {
    let y = startEating(yard(), 'a', s(0), 600).yard;
    const r = touch(y, 'a', s(50));
    expect(r.interrupted).toBeNull();
    expect(r.yard.eating).not.toBeNull();
  });
});

describe('standoff', () => {
  it('blocks eating while another chicken is present', () => {
    let y = touch(yard(), 'b', s(0)).yard;
    y = touch(y, 'a', s(5)).yard;
    expect(whyCannotEat(y, 'a', s(5))).toMatch(/watching/);
    expect(() => startEating(y, 'a', s(5), 10)).toThrow(RuleError);
  });

  it('clears once the other chicken leaves or goes quiet for 30 s', () => {
    let y = touch(yard(), 'b', s(0)).yard;
    expect(whyCannotEat(touch(y, 'a', s(29)).yard, 'a', s(29))).not.toBeNull();
    expect(whyCannotEat(touch(y, 'a', s(31)).yard, 'a', s(31))).toBeNull();
    y = leave(y, 'b');
    expect(whyCannotEat(touch(y, 'a', s(1)).yard, 'a', s(1))).toBeNull();
  });
});

describe('Sundown', () => {
  it('ends at the end date, highest points wins, pile follows the clock', () => {
    let y = yard({ endsAt: s(1000) });
    expect(pileFraction(y, s(250))).toBeCloseTo(0.75);
    y = stopEating(startEating(y, 'a', s(0), 100).yard, 'a', s(40)).yard;
    y = leave(y, 'a');
    y = stopEating(startEating(y, 'b', s(100), 100).yard, 'b', s(160)).yard;
    y = settle(y, s(1000));
    expect(y.status).toBe('finished');
    expect(y.winnerUids).toEqual(['b']);
    expect(pileFraction(y, s(2000))).toBe(0);
  });

  it('banks a meal still running at the end, and shares ties', () => {
    let y = yard({ endsAt: s(200) });
    y = stopEating(startEating(y, 'a', s(0), 50).yard, 'a', s(50)).yard;
    y = leave(y, 'a');
    y = startEating(y, 'b', s(150), 500).yard;
    y = settle(y, s(5000));
    expect(y.members.b.points).toBe(50);
    expect(y.winnerUids).toEqual(['a', 'b']);
  });

  it('has no winner if nobody ate', () => {
    expect(settle(yard({ endsAt: s(100) }), s(101)).winnerUids).toEqual([]);
  });

  it('sizes chickens against the current leader', () => {
    let y = stopEating(startEating(yard(), 'a', s(0), 100).yard, 'a', s(100)).yard;
    y = leave(y, 'a');
    y = stopEating(startEating(y, 'b', s(200), 100).yard, 'b', s(250)).yard;
    expect(sizeFor(y, 'a', s(300))).toBe(1);
    expect(sizeFor(y, 'b', s(300))).toBe(0.5);
  });
});

describe('Fat Hen', () => {
  it('ends the moment a chicken reaches the target', () => {
    let y = yard({ mode: 'fatHen', goal: 100 });
    y = startEating(y, 'a', s(0), 5000).yard;
    expect(y.eating!.endsAt).toBe(s(100));
    y = leave(y, 'a');
    expect(pileFraction(y, s(25))).toBeCloseTo(0.75);
    expect(sizeFor(y, 'a', s(25))).toBeCloseTo(0.25);
    y = settle(y, s(100));
    expect(y.status).toBe('finished');
    expect(y.winnerUids).toEqual(['a']);
    expect(y.members.a.points).toBe(100);
  });

  it('can be won by a steal', () => {
    let y = yard({ mode: 'fatHen', goal: 20 });
    y = stopEating(startEating(y, 'b', s(0), 15).yard, 'b', s(15)).yard;
    y = leave(y, 'b');
    y = startEating(y, 'a', s(100), 20).yard;
    y = leave(y, 'a');
    y = touch(y, 'b', s(118)).yard; // steals floor(18/3)=6, capped to the 5 still needed
    expect(y.members.b.points).toBe(20);
    expect(y.status).toBe('finished');
    expect(y.winnerUids).toEqual(['b']);
  });
});

describe('Last Grain', () => {
  it('shrinks the pile as feed is eaten and ends when it is gone', () => {
    let y = yard({ mode: 'lastGrain', goal: 100 });
    y = stopEating(startEating(y, 'a', s(0), 40).yard, 'a', s(40)).yard;
    y = leave(y, 'a');
    expect(pileFraction(y, s(40))).toBeCloseTo(0.6);
    y = startEating(y, 'b', s(50), 5000).yard;
    expect(y.eating!.endsAt).toBe(s(110)); // only 60 feed left
    y = leave(y, 'b');
    expect(pileFraction(y, s(80))).toBeCloseTo(0.3);
    y = settle(y, s(110));
    expect(y.status).toBe('finished');
    expect(y.winnerUids).toEqual(['b']);
    expect(pileFraction(y, s(110))).toBe(0);
  });

  it('spills a wiped meal back into the pile except the stolen third', () => {
    let y = yard({ mode: 'lastGrain', goal: 100 });
    y = startEating(y, 'a', s(0), 90).yard;
    y = leave(y, 'a');
    y = touch(y, 'b', s(60)).yard;
    expect(y.members.b.points).toBe(20);
    expect(pileFraction(y, s(60))).toBeCloseTo(0.8);
  });
});

describe('hardcore', () => {
  const hc = () => yard({ hardcore: true });

  it('has no timer and keeps going while heartbeats arrive', () => {
    let y = startEating(hc(), 'a', s(0), 0).yard;
    expect(y.eating!.endsAt).toBeNull();
    for (let t = 10; t <= 120; t += 10) y = touch(y, 'a', s(t)).yard;
    expect(y.eating).not.toBeNull();
    y = stopEating(y, 'a', s(125)).yard;
    expect(y.members.a.points).toBe(125);
  });

  it('counts a meal as stopped at its last heartbeat once the phone goes quiet', () => {
    let y = startEating(hc(), 'a', s(0), 0).yard;
    y = touch(y, 'a', s(10)).yard;
    y = touch(y, 'a', s(20)).yard;
    expect(settle(y, s(44)).eating).not.toBeNull();
    const r = touch(y, 'b', s(46));
    expect(r.interrupted).toBeNull();
    expect(r.yard.members.a.points).toBe(20);
  });

  it('can still be interrupted while alive', () => {
    let y = startEating(hc(), 'a', s(0), 0).yard;
    y = touch(y, 'a', s(10)).yard;
    const r = touch(y, 'b', s(15));
    expect(r.yard.members.a.points).toBe(0);
    expect(r.yard.members.b.points).toBe(5);
  });

  it('never has sleep hours', () => {
    const y = yard({ hardcore: true, sleep: { startMin: 0, endMin: 600, offsetMin: 0 } });
    expect(y.sleep).toBeNull();
  });
});

describe('sleep hours', () => {
  const night = { startMin: 22 * 60, endMin: 7 * 60, offsetMin: 0 };

  it('knows night from day, across midnight and time zones', () => {
    expect(isAsleep(night, T0)).toBe(false);
    expect(isAsleep(night, s(10 * HOUR))).toBe(true); // 22:00
    expect(isAsleep(night, s(18 * HOUR))).toBe(true); // 06:00
    expect(isAsleep(night, s(19 * HOUR))).toBe(false); // 07:00
    expect(isAsleep({ ...night, offsetMin: 600 }, T0)).toBe(true); // 22:00 local
    expect(isAsleep({ startMin: 60, endMin: 120, offsetMin: 0 }, s(13.5 * HOUR))).toBe(true);
  });

  it('blocks eating while asleep', () => {
    const y = yard({ sleep: night });
    expect(() => startEating(y, 'a', s(11 * HOUR), 60)).toThrow(/asleep/);
  });

  it('cuts a meal off at bedtime', () => {
    let y = yard({ sleep: night });
    expect(nextSleepStart(night, s(9 * HOUR))).toBe(s(10 * HOUR));
    expect(maxMealSeconds(y, 'a', s(9 * HOUR))).toBe(HOUR);
    y = startEating(y, 'a', s(9 * HOUR), 5 * HOUR).yard;
    expect(y.eating!.endsAt).toBe(s(10 * HOUR));
    y = leave(y, 'a');
    const r = touch(y, 'b', s(12 * HOUR));
    expect(r.interrupted).toBeNull();
    expect(r.yard.members.a.points).toBe(HOUR);
  });
});

describe('yard setup', () => {
  const base: NewYard = { name: 'Y', mode: 'sundown', goal: null, endsAt: s(HOUR), hardcore: false, sleep: null };
  const make = (o: Partial<NewYard>) => createYard({ ...base, ...o }, 'a', 'Anna', look, 'X', T0);

  it('allows a fortnight but no longer', () => {
    expect(make({ endsAt: s(14 * 24 * HOUR) }).status).toBe('active');
    expect(() => make({ endsAt: s(14 * 24 * HOUR + 1) })).toThrow(/fortnight/);
  });

  it('needs a goal for Last Grain and Fat Hen', () => {
    expect(() => make({ mode: 'fatHen', goal: null })).toThrow(RuleError);
    expect(make({ mode: 'lastGrain', goal: 500 }).goal).toBe(500);
    expect(make({ mode: 'sundown', goal: 500 }).goal).toBeNull();
  });

  it('does nothing in a closed yard', () => {
    const y = settle(make({}), s(2 * HOUR));
    expect(y.status).toBe('finished');
    expect(() => startEating(y, 'a', s(2 * HOUR), 10)).toThrow(/closed/);
    expect(() => join(y, 'c', 'Cy', look, s(2 * HOUR))).toThrow(/closed/);
  });
});
