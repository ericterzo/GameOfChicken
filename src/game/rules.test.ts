import { describe, expect, it } from 'vitest';
import {
  countsForRecords, createYard, totalPoints, declineInvite, isAsleep, join, leave, livePoints, liveTallies, maxMealSeconds, mealEvents, nextSleepStart, pileFraction,
  RuleError, settle, shoot, sizeFor, showdownOpen, winShowdown, SHOWDOWN_MS, joinHeadStart, isLurking, othersPresent, nextFox, flockCount, FOX_MIN_MS, FOX_MAX_MS, choose, duelRival, allyOf, mealOf, whyCannotEat as why, yardTally, startEating, startNow, stopEating, touch, whyCannotEat,
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
    expect(r.interrupted).toEqual([{ victimUid: 'a', byUid: 'b', pointsLost: 100, pointsGained: 33 }]);
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
    expect(r.interrupted).toEqual([]);
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
    expect(r.interrupted).toEqual([]);
    expect(r.yard.eating).not.toBeNull();
  });
});

describe('getting caught, start to finish', () => {
  // Anna banks 100, then is 300 seconds into a new meal when Ben walks in.
  function scene(mode: 'fatHen' | 'lastGrain' | 'sundown') {
    let y = yard({ mode, goal: mode === 'sundown' ? null : 1000 });
    y = stopEating(startEating(y, 'a', s(0), 100).yard, 'a', s(100)).yard;
    y = leave(y, 'a');
    const sizeBeforeMeal = sizeFor(y, 'a', s(150));
    y = leave(startEating(y, 'a', s(200), 600).yard, 'a');
    return { y, sizeBeforeMeal };
  }

  it('grows the chicken while it eats, then puts it back to its old size', () => {
    const { y, sizeBeforeMeal } = scene('fatHen');
    expect(sizeBeforeMeal).toBeCloseTo(0.1);
    expect(sizeFor(y, 'a', s(500))).toBeCloseTo(0.4); // 100 banked + 300 on the plate
    const after = touch(y, 'b', s(500)).yard;
    expect(sizeFor(after, 'a', s(500))).toBeCloseTo(sizeBeforeMeal);
    expect(sizeFor(after, 'a', s(900))).toBeCloseTo(sizeBeforeMeal); // and it stays there
  });

  it('takes every point of that meal and nothing from earlier meals', () => {
    const { y } = scene('fatHen');
    const r = touch(y, 'b', s(500));
    expect(r.interrupted[0].pointsLost).toBe(300);
    expect(r.yard.members.a.points).toBe(100);
    expect(livePoints(r.yard, 'a', s(500))).toBe(100);
    expect(r.yard.eating).toBeNull();
  });

  it('banks a third for the catcher on the spot, with no meal needed', () => {
    const { y } = scene('fatHen');
    const after = touch(y, 'b', s(500)).yard;
    expect(after.members.b.points).toBe(100);
    expect(after.eating).toBeNull();
    // It is safe at once: Anna walking back in cannot take it.
    expect(touch(after, 'a', s(501)).yard.members.b.points).toBe(100);
    expect(sizeFor(after, 'b', s(500))).toBeCloseTo(0.1);
  });

  it('puts the lost feed back in the pile where the pile is the feed (Last Grain)', () => {
    const { y } = scene('lastGrain');
    expect(pileFraction(y, s(500))).toBeCloseTo(0.6); // 100 banked + 300 being eaten
    const after = touch(y, 'b', s(500)).yard;
    // Only what is banked is gone: Anna's 100 and Ben's 100. The other 200 are back.
    expect(pileFraction(after, s(500))).toBeCloseTo(0.8);
    expect(1000 - after.members.a.points - after.members.b.points).toBe(800);
  });

  it('moves the Fat Hen pile back to match the biggest chicken', () => {
    const { y } = scene('fatHen');
    expect(pileFraction(y, s(500))).toBeCloseTo(0.6);
    expect(pileFraction(touch(y, 'b', s(500)).yard, s(500))).toBeCloseTo(0.9);
  });

  it('works the same in Sundown, where the pile only follows the clock', () => {
    const { y } = scene('sundown');
    const before = pileFraction(y, s(500));
    const after = touch(y, 'b', s(500)).yard;
    expect(after.members.a.points).toBe(100);
    expect(after.members.b.points).toBe(100);
    expect(pileFraction(after, s(500))).toBe(before);
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
    expect(r.interrupted).toEqual([]);
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
    expect(r.interrupted).toEqual([]);
    expect(r.yard.members.a.points).toBe(HOUR);
  });
});

describe('invitations', () => {
  const invites = [{ uid: 'b', username: 'Ben' }, { uid: 'c', username: 'Cy' }];
  const waiting = () => createYard(
    { name: 'Y', mode: 'sundown', goal: null, endsAt: s(HOUR), hardcore: false, sleep: null, invites, waitForInvites: true },
    'a', 'Anna', look, 'X', T0,
  );

  it('opens at once when not asked to wait, and lists who is invited', () => {
    const y = createYard(
      { name: 'Y', mode: 'sundown', goal: null, endsAt: s(HOUR), hardcore: false, sleep: null, invites }, 'a', 'Anna', look, 'X', T0,
    );
    expect(y.status).toBe('active');
    expect(y.invitedUids).toEqual(['b', 'c']);
    expect(y.invitedNames).toEqual({ b: 'Ben', c: 'Cy' });
  });

  it('holds the game until everyone has joined or declined', () => {
    let y = waiting();
    expect(y.status).toBe('waiting');
    expect(() => startEating(y, 'a', s(10), 30)).toThrow(/Waiting/);
    expect(settle(y, s(2 * HOUR)).status).toBe('waiting'); // does not expire while waiting
    y = join(y, 'b', 'Ben', look, s(100));
    expect(y.status).toBe('waiting');
    expect(y.invitedUids).toEqual(['c']);
    y = declineInvite(y, 'c', s(500));
    expect(y.status).toBe('active');
    expect(y.declinedUids).toEqual(['c']);
    // The full hour is played from the moment the game starts.
    expect(y.createdAt).toBe(s(500));
    expect(y.endsAt).toBe(s(500 + HOUR));
    expect(startEating(y, 'a', s(510), 30).yard.eating!.uid).toBe('a');
  });

  it('lets only the owner start early, and refuses a second answer', () => {
    const y = waiting();
    expect(() => startNow(y, 'b', s(5))).toThrow(RuleError);
    const started = startNow(y, 'a', s(5));
    expect(started.status).toBe('active');
    expect(started.endsAt).toBe(s(5 + HOUR));
    const declined = declineInvite(started, 'b', s(6));
    expect(() => declineInvite(declined, 'b', s(7))).toThrow(/no longer open/);
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

  it('only counts towards records once a second chicken has joined', () => {
    const solo = make({});
    expect(countsForRecords(solo)).toBe(false);
    expect(countsForRecords(join(solo, 'b', 'Ben', look, T0))).toBe(true);
  });

  it('does nothing in a closed yard', () => {
    const y = settle(make({}), s(2 * HOUR));
    expect(y.status).toBe('finished');
    expect(() => startEating(y, 'a', s(2 * HOUR), 10)).toThrow(/closed/);
    expect(() => join(y, 'c', 'Cy', look, s(2 * HOUR))).toThrow(/closed/);
  });
});

describe('notice board events', () => {
  it('notes a meal that ran its course, at the time it ended', () => {
    const before = leave(startEating(yard(), 'a', s(0), 60).yard, 'a');
    expect(mealEvents(before, settle(before, s(30)), s(30))).toEqual([]);
    expect(mealEvents(before, settle(before, s(500)), s(500))).toEqual([{ kind: 'ate', uid: 'a', amount: 60, at: s(60) }]);
  });

  it('notes a meal stopped early, and a new meal started after an old one ran out', () => {
    const before = startEating(yard(), 'a', s(0), 60).yard;
    expect(mealEvents(before, stopEating(before, 'a', s(20)).yard, s(20))).toEqual([{ kind: 'ate', uid: 'a', amount: 20, at: s(20) }]);
    const again = startEating(leave(before, 'a'), 'a', s(100), 30).yard;
    expect(mealEvents(before, again, s(100))).toEqual([{ kind: 'ate', uid: 'a', amount: 60, at: s(60) }]);
  });

  it('notes who caught whom, what was lost and what was taken', () => {
    const before = leave(startEating(yard(), 'a', s(0), 600).yard, 'a');
    const r = touch(before, 'b', s(90));
    expect(mealEvents(before, r.yard, s(90), r.interrupted)).toEqual([{ kind: 'caught', uid: 'b', victimUid: 'a', lost: 90, taken: 30, at: s(90) }]);
    // Nothing more to say about the yard afterwards.
    expect(mealEvents(r.yard, touch(r.yard, 'a', s(95)).yard, s(95))).toEqual([]);
  });
});

describe('records', () => {
  it('tracks feed stolen and feed lost, and counts a running yard as played', () => {
    let y = leave(startEating(yard(), 'a', s(0), 600).yard, 'a');
    y = touch(y, 'b', s(90)).yard; // Ben catches Anna: she loses 90, he takes 30
    expect(y.members.a.feedLost).toBe(90);
    expect(y.members.b.feedStolen).toBe(30);
    expect(yardTally(y, 'b', s(100))).toMatchObject({ gamesPlayed: 1, wins: 0, losses: 0, totalPoints: 30, feedStolen: 30, feedLost: 0 });
    expect(liveTallies([y], s(100)).a).toMatchObject({ gamesPlayed: 1, wins: 0, losses: 0, totalPoints: 0, feedLost: 90 });
    // A meal in progress is feed eaten so far.
    y = startEating(leave(y, 'b'), 'a', s(200), 60).yard;
    expect(liveTallies([y], s(220)).a.totalPoints).toBe(20);
  });

  it('settles wins and losses once the yard is over, and ignores solo and waiting yards', () => {
    let y = leave(startEating(yard(), 'a', s(0), 60).yard, 'a');
    y = settle(y, s(24 * HOUR + 1));
    expect(yardTally(y, 'a', s(24 * HOUR + 1))).toMatchObject({ gamesPlayed: 1, wins: 1, losses: 0, totalPoints: 60 });
    expect(yardTally(y, 'b', s(24 * HOUR + 1))).toMatchObject({ gamesPlayed: 1, wins: 0, losses: 1 });
    const solo = createYard({ name: 'Solo', mode: 'sundown', goal: null, endsAt: s(HOUR), hardcore: false, sleep: null }, 'a', 'Anna', look, 'SOLO11', T0);
    expect(liveTallies([solo], s(10))).toEqual({ a: expect.objectContaining({ gamesPlayed: 0 }) });
  });
});

describe('a set start time', () => {
  const later = () => createYard(
    { name: 'Later', mode: 'sundown', goal: null, endsAt: s(2 * HOUR), hardcore: false, sleep: null, startsAt: s(HOUR), invites: [{ uid: 'c', username: 'Carl' }], waitForInvites: true },
    'a', 'Anna', look, 'LATER1', T0,
  );

  it('waits until the start, then runs for its full length', () => {
    let y = later();
    expect(y.status).toBe('waiting');
    y = join(y, 'b', 'Ben', look, s(600));
    expect(touch(y, 'a', s(700)).yard.status).toBe('waiting');
    expect(whyCannotEat(y, 'a', s(700))).toBe('The game has not started yet.');
    expect(() => startEating(y, 'a', s(700), 60)).toThrow(RuleError);
    // Invited chickens answering does not start it early.
    expect(declineInvite(y, 'c', s(800)).status).toBe('waiting');
    // The first to look after the start finds it running since the start, not since they looked.
    const started = settle(y, s(HOUR + 300));
    expect(started.status).toBe('active');
    expect(started.createdAt).toBe(s(HOUR));
    expect(started.endsAt).toBe(s(3 * HOUR));
    expect(startEating(y, 'a', s(HOUR + 300), 60).yard.eating?.uid).toBe('a');
  });

  it('can be started early by its owner, is over if nobody looked in time, and needs a sensible start', () => {
    expect(startNow(later(), 'a', s(60)).status).toBe('active');
    expect(settle(later(), s(4 * HOUR)).status).toBe('finished');
    const opts = { name: 'X', mode: 'sundown' as const, goal: null, endsAt: s(HOUR), hardcore: false, sleep: null };
    expect(() => createYard({ ...opts, startsAt: s(10) }, 'a', 'Anna', look, 'ABC123', T0)).toThrow(RuleError);
    expect(() => createYard({ ...opts, startsAt: s(15 * 24 * HOUR) }, 'a', 'Anna', look, 'ABC123', T0)).toThrow(RuleError);
  });
});

describe('the gun', () => {
  const standoff = () => touch(touch(yard(), 'a', s(0)).yard, 'b', s(1)).yard;

  it('ends a standoff: the victim is thrown out and kept out for two to four minutes', () => {
    const { yard: y, victimUid } = shoot(standoff(), 'a', s(5), 0.5, 180_000);
    expect(victimUid).toBe('b');
    expect(y.shot).toEqual({ byUid: 'a', victimUid: 'b', at: s(5) });
    expect(whyCannotEat(y, 'a', s(6))).toBeNull(); // the yard is Anna's now
    expect(touch(y, 'b', s(60)).yard.members.b.lastSeen).toBe(0); // only lurking
    expect(() => startEating(y, 'b', s(60), 30)).toThrow(RuleError);
    expect(touch(y, 'b', s(186)).yard.members.b.lastSeen).toBe(s(186)); // back after the wait
    expect(shoot(standoff(), 'a', s(5), 0, 1).yard.members.b.outUntil).toBe(s(5) + 120_000);
    expect(shoot(standoff(), 'a', s(5), 0, 9e9).yard.members.b.outUntil).toBe(s(5) + 240_000);
  });

  it('does nothing without a standoff, and the shot cannot shoot back', () => {
    const alone = touch(yard(), 'a', s(0)).yard;
    expect(shoot(alone, 'a', s(5), 0, 180_000).victimUid).toBeNull();
    const eating = leave(startEating(yard(), 'a', s(0), 600).yard, 'a');
    expect(shoot(eating, 'b', s(5), 0, 180_000).victimUid).toBeNull(); // walking in on a meal is a catch, not a standoff
    const { yard: y } = shoot(standoff(), 'a', s(5), 0, 180_000);
    expect(shoot(y, 'b', s(6), 0, 180_000).victimUid).toBeNull(); // the shot one only lurks
  });
});

describe('ally or fight', () => {
  // Three chickens joined the yard; Anna and Ben are the two in it.
  const three = (over: Partial<NewYard> = {}) => join(yard(over), 'c', 'Carl', look, T0);
  const standoff = (over: Partial<NewYard> = {}) => touch(touch(three(over), 'a', s(0)).yard, 'b', s(1)).yard;
  const allies = (over: Partial<NewYard> = {}) => choose(choose(standoff(over), 'a', s(2), 'ally').yard, 'b', s(3), 'ally').yard;

  it('waits for both secret choices, and an alliance lets both feed side by side', () => {
    const one = choose(standoff(), 'a', s(2), 'ally');
    expect(one.outcome).toBeNull();
    expect(() => choose(one.yard, 'a', s(3), 'fight')).toThrow(RuleError); // no changing your mind
    const both = choose(one.yard, 'b', s(4), 'ally');
    expect(both.outcome).toEqual({ kind: 'allied', uids: ['a', 'b'] });
    expect(allyOf(both.yard, 'a', s(5))).toBe('b');
    expect(duelRival(both.yard, 'a', s(5))).toBeNull();
    let y = startEating(both.yard, 'a', s(10), 60).yard;
    expect(why(y, 'b', s(11))).toBeNull();
    y = startEating(y, 'b', s(11), 600).yard;
    y = touch(touch(y, 'a', s(20)).yard, 'b', s(21)).yard;
    expect(mealOf(y, 'a')).not.toBeNull();
    expect(mealOf(y, 'b')).not.toBeNull();
    // Anna's meal is over: she keeps it all and stays in the yard with her ally.
    y = touch(y, 'a', s(80)).yard;
    expect(y.members.a.points).toBe(60);
    expect(y.members.a.lastSeen).toBe(s(80));
    expect(mealOf(y, 'b')).not.toBeNull();
  });

  it('lets an ally stop early, stay, and eat again until the alliance ends; then they are rivals', () => {
    let y = startEating(allies(), 'a', s(10), 60).yard; // Anna chose a minute
    y = startEating(y, 'b', s(11), 300).yard; // Ben chose five
    y = stopEating(y, 'a', s(40)).yard; // Anna stops early and keeps 30
    expect(y.members.a).toMatchObject({ points: 30, lastSeen: s(40) });
    expect(why(y, 'a', s(41))).toBeNull(); // she may start again straight away
    // Her next meal ends with the alliance (Ben's five minutes), however long she asks for.
    y = startEating(y, 'a', s(50), 3600).yard;
    expect(mealOf(y, 'a')!.endsAt).toBe(s(311));
    y = touch(touch(y, 'a', s(200)).yard, 'b', s(200)).yard; // nobody catches anybody meanwhile
    expect(mealOf(y, 'a')).not.toBeNull();
    // At 311 both meals are over and so is the alliance: two rivals, nobody eating.
    y = settle(touch(touch(y, 'a', s(300)).yard, 'b', s(300)).yard, s(312));
    expect(y.pact).toBeNull();
    expect(y.members.a.points).toBe(30 + 261);
    expect(y.members.b.points).toBe(300);
    expect(why(y, 'a', s(313))).toBe('Another chicken is watching. Wait them out.');
  });

  it('lets an ally whose meal ran out while away come back and eat again, while the alliance lasts', () => {
    let y = startEating(allies(), 'a', s(10), 60).yard;
    y = startEating(y, 'b', s(11), 300).yard;
    y = settle(leave(y, 'a'), s(80)); // Anna's minute ran out with her app closed
    const back = touch(y, 'a', s(100));
    expect(back.interrupted).toEqual([]); // she cannot catch Ben
    expect(why(back.yard, 'a', s(101))).toBeNull(); // and may eat again, as an ally
  });

  it('counts leaving without choosing a length as zero, unless you come back and choose in time', () => {
    // Ben steps away before choosing; Anna eats for a minute.
    let y = startEating(allies(), 'a', s(10), 60).yard;
    y = settle(leave(y, 'b'), s(40));
    expect(allyOf(y, 'a', s(40))).toBe('b'); // Anna's minute still holds
    // If Ben stays away, the alliance ends with Anna's minute.
    expect(settle(y, s(80)).pact).toBeNull();
    // Ben comes back within it and chooses five minutes: that is his agreed time.
    y = startEating(touch(y, 'b', s(50)).yard, 'b', s(50), 300).yard;
    const later = touch(settle(y, s(80)), 'a', s(120));
    expect(later.interrupted).toEqual([]); // Anna cannot catch Ben during his agreed time
    expect(mealOf(later.yard, 'b')).not.toBeNull();
    expect(allyOf(later.yard, 'a', s(349))).toBe('b');
    expect(allyOf(settle(later.yard, s(351)), 'a', s(351))).toBeNull();
  });

  it('is broken by any other chicken walking in, who catches whoever is eating', () => {
    let y = startEating(allies(), 'a', s(10), 60).yard;
    y = startEating(y, 'b', s(11), 600).yard;
    const r = touch(y, 'c', s(40));
    expect(r.interrupted.map((i) => i.victimUid).sort()).toEqual(['a', 'b']);
    expect(r.yard.pact).toBeNull();
    // Allies who had not eaten yet lose the alliance too: it is a three-way standoff.
    const idle = touch(allies(), 'c', s(5)).yard;
    expect(allyOf(idle, 'a', s(5))).toBeNull();
    expect(why(idle, 'a', s(6))).toBe('Another chicken is watching. Wait them out.');
  });

  it('throws out a chicken that offers an alliance to one that fights, and both when both fight', () => {
    const fought = choose(choose(standoff(), 'a', s(2), 'fight').yard, 'b', s(3), 'ally');
    expect(fought.outcome).toEqual({ kind: 'fought', winnerUid: 'a', loserUid: 'b' });
    expect(fought.yard.members.b).toMatchObject({ outUntil: s(3) + 7 * 60_000, outBy: 'a', outWhy: 'beaten', lastSeen: 0 });
    expect(why(fought.yard, 'a', s(4))).toBeNull(); // the yard is Anna's: Ben only lurks
    // Ben may watch from the edge, but catches nobody and cannot eat until his time is up.
    const eating = startEating(fought.yard, 'a', s(10), 600).yard;
    const lurk = touch(eating, 'b', s(300));
    expect(lurk.interrupted).toEqual([]);
    expect(isLurking(lurk.yard, 'b', s(301))).toBe(true);
    expect(othersPresent(lurk.yard, 'a', s(301))).toEqual([]);
    expect(why(lurk.yard, 'b', s(301))).toBe('You were thrown out of this yard. Wait before going back in.');
    // Once his seven minutes are up, walking in is a catch as usual.
    expect(touch(lurk.yard, 'b', s(3 + 7 * 60 + 1)).interrupted[0]).toMatchObject({ victimUid: 'a', byUid: 'b' });
    const brawl = choose(choose(standoff(), 'a', s(2), 'fight').yard, 'b', s(3), 'fight');
    expect(brawl.outcome).toEqual({ kind: 'brawl', uids: ['a', 'b'] });
    expect(brawl.yard.members.a).toMatchObject({ outUntil: s(3) + 12 * 60_000, outWhy: 'brawl' });
    expect(brawl.yard.members.b).toMatchObject({ outUntil: s(3) + 12 * 60_000, outWhy: 'brawl' });
  });

  it('only offers the choice to exactly two chickens, nobody eating, in a yard at least three joined', () => {
    const crowd = touch(standoff(), 'c', s(2)).yard;
    expect(duelRival(crowd, 'a', s(3))).toBeNull();
    expect(() => choose(crowd, 'a', s(3), 'ally')).toThrow(RuleError);
    expect(duelRival(touch(three(), 'a', s(0)).yard, 'a', s(1))).toBeNull(); // alone
    const pair = touch(touch(yard(), 'a', s(0)).yard, 'b', s(1)).yard; // only two ever joined
    expect(duelRival(pair, 'a', s(2))).toBeNull();
    // A half-made choice lapses when the other chicken walks away.
    const half = choose(standoff(), 'a', s(2), 'fight').yard;
    expect(settle(leave(half, 'b'), s(3)).duel).toBeNull();
  });

  it('fires the trigger only while there are three or more chickens in the yard', () => {
    const crowd = touch(standoff(), 'c', s(2)).yard;
    expect(shoot(crowd, 'a', s(3), 0.5, 180_000, 2).victimUid).not.toBeNull();
    expect(shoot(standoff(), 'a', s(3), 0.5, 180_000, 2).victimUid).toBeNull();
  });

  it('shares the pile between allies in Last Grain', () => {
    let y = allies({ mode: 'lastGrain', goal: 100 });
    y = startEating(y, 'a', s(10), 80).yard;
    y = startEating(y, 'b', s(11), 600).yard;
    expect(mealOf(y, 'b')!.endsAt).toBe(s(11 + 20)); // only 20 feed was left unclaimed
    y = settle(y, s(200));
    expect(y.members.a.points + y.members.b.points).toBe(100);
    expect(y.status).toBe('finished');
  });

  it('makes shooting your ally a betrayal: the ally loses the meal, the traitor gets horns', () => {
    let y = startEating(allies(), 'a', s(10), 600).yard;
    y = startEating(y, 'b', s(11), 600).yard;
    const shot = shoot(y, 'a', s(41), 0, 180_000);
    expect(shot).toMatchObject({ victimUid: 'b', betrayal: true, lost: 30 });
    expect(shot.yard.members.a.traitor).toBe(true);
    expect(shot.yard.members.b).toMatchObject({ outWhy: 'shot', outBy: 'a', feedLost: 30, mealsLost: 1 });
    expect(mealOf(shot.yard, 'b')).toBeNull();
    expect(allyOf(shot.yard, 'a', s(42))).toBeNull();
    expect(shot.yard.shot).toEqual({ byUid: 'a', victimUid: 'b', at: s(41), betrayal: true });
    // Back after the wait, Ben catches the traitor.
    const back = touch(shot.yard, 'b', s(41 + 181));
    expect(back.interrupted[0]).toMatchObject({ victimUid: 'a', byUid: 'b' });
  });
});

describe('a caught chicken', () => {
  it('stays in the yard if it was watching, straight into a standoff, and the catch is noted for the yard to act out', () => {
    // Anna eats while watching; Ben walks in.
    const y = touch(startEating(yard(), 'a', s(0), 600).yard, 'a', s(20)).yard;
    const r = touch(y, 'b', s(30));
    expect(r.yard.members.a.lastSeen).toBe(s(20));
    expect(r.yard.caught).toEqual({ victims: ['a'], byUid: 'b', at: s(30) });
    expect(why(r.yard, 'b', s(31))).toBe('Another chicken is watching. Wait them out.');
  });

  it('remembers when each chicken last walked in', () => {
    let y = touch(yard(), 'a', s(0)).yard;
    y = touch(y, 'a', s(15)).yard;
    expect(y.members.a.arrivedAt).toBe(s(0));
    y = touch(leave(y, 'a'), 'a', s(40)).yard;
    expect(y.members.a.arrivedAt).toBe(s(40));
  });
});

describe('joining a game already under way', () => {
  it('starts a newcomer on the average score, without touching the pile', () => {
    let y = yard({ mode: 'lastGrain', goal: 1000 });
    y.members.a.points = 300;
    y.members.b.points = 101;
    expect(joinHeadStart(y)).toBe(200);
    y = join(y, 'c', 'Carl', look, s(10));
    expect(y.members.c).toMatchObject({ points: 200, headStart: 200 });
    expect(totalPoints(y)).toBe(401); // feed eaten: the pile is as it was
    expect(pileFraction(y, s(10))).toBeCloseTo(1 - 401 / 1000);
    // In their record it is score, not feed eaten.
    const done = settle(y, y.endsAt + 1);
    expect(yardTally(done, 'c', y.endsAt + 1)).toMatchObject({ totalPoints: 0, biggestChicken: 200 });
  });

  it('gives nothing before the game has started', () => {
    const waiting = createYard({ name: 'W', mode: 'sundown', goal: null, endsAt: s(HOUR), hardcore: false, sleep: null, startsAt: s(600) }, 'a', 'Anna', look, 'WAIT11', T0);
    expect(join(waiting, 'b', 'Ben', look, s(10)).members.b.points).toBe(0);
  });
});

describe('cooperative rules', () => {
  const coop = (ruleset: 'coop' | 'brutal' = 'coop', over: Partial<NewYard> = {}) => {
    let y = createYard({ name: 'Co', mode: 'sundown', goal: null, endsAt: s(20 * HOUR), hardcore: false, sleep: null, ruleset, ...over }, 'a', 'Anna', look, 'COOP42', T0);
    y = join(join(y, 'b', 'Ben', look, T0), 'c', 'Carl', look, T0);
    return y;
  };

  it('lets chickens eat side by side, with others watching', () => {
    let y = touch(touch(coop(), 'a', s(0)).yard, 'b', s(1)).yard;
    y = startEating(y, 'a', s(2), 600).yard;
    expect(why(y, 'b', s(3))).toBeNull();
    y = startEating(y, 'b', s(3), 600).yard;
    y = touch(touch(y, 'a', s(20)).yard, 'b', s(21)).yard;
    expect(mealOf(y, 'a')).not.toBeNull();
    expect(mealOf(y, 'b')).not.toBeNull();
    expect(duelRival(y, 'a', s(22))).toBeNull(); // no standoffs here
  });

  it('catches everyone eating when the whole flock is in the yard, 1/N of the total each', () => {
    let y = startEating(coop(), 'a', s(0), 600).yard;
    y = startEating(leave(y, 'a'), 'b', s(0), 600).yard;
    y = leave(y, 'b');
    // Carl walks in at 90 s: Anna and Ben are both "in" (eating), so the flock is complete.
    const r = touch(y, 'c', s(90));
    expect(r.interrupted.map((i) => i.victimUid).sort()).toEqual(['a', 'b']);
    expect(r.yard.members.c.points).toBe(Math.floor(90 / 2) * 2); // half of each meal: 1/N of the 180 total
    expect(mealOf(r.yard, 'a')).toBeNull();
    // With only two of three in the yard, walking in is harmless.
    const two = touch(startEating(coop(), 'a', s(0), 600).yard, 'b', s(30));
    expect(two.interrupted).toEqual([]);
    expect(flockCount(two.yard, s(31))).toEqual({ here: 2, of: 3 });
    // And nobody may start eating while the whole flock is here.
    const all = touch(touch(touch(coop(), 'a', s(0)).yard, 'b', s(0)).yard, 'c', s(0)).yard;
    expect(why(all, 'a', s(1))).toBe('The whole flock is in the yard: anyone eating now would be caught.');
  });

  it('sends the fox every 1 to 5 hours: it takes every meal and puts everyone there out for 20 minutes', () => {
    const y0 = coop();
    const fox = nextFox(y0)!;
    expect(fox - T0).toBeGreaterThanOrEqual(FOX_MIN_MS);
    expect(fox - T0).toBeLessThanOrEqual(FOX_MAX_MS);
    // Anna eats a long meal; Ben watches at the moment the fox comes; Carl is away.
    let y = startEating(y0, 'a', fox - 600_000, 3600).yard;
    y = touch(y, 'b', fox - 10_000).yard;
    y = settle(y, fox + 1000);
    expect(y.fox).toEqual({ at: fox, victims: ['a', 'b'], killed: null, lost: 600 });
    expect(mealOf(y, 'a')).toBeNull();
    expect(y.members.a).toMatchObject({ points: 0, outWhy: 'fox', outUntil: fox + 20 * 60_000 });
    expect(y.members.b.outUntil).toBe(fox + 20 * 60_000);
    expect(y.members.c.outUntil).toBeUndefined();
    expect(nextFox(y)! - fox).toBeGreaterThanOrEqual(FOX_MIN_MS); // and it comes again later
    // Classic yards have no fox.
    expect(nextFox(yard())).toBeNull();
  });

  it('under brutal rules the fox also kills one chicken it finds eating, for good', () => {
    const y0 = coop('brutal');
    const fox = nextFox(y0)!;
    let y = startEating(y0, 'a', fox - 60_000, 3600).yard;
    y = startEating(leave(y, 'a'), 'b', fox - 30_000, 3600).yard;
    y = settle(leave(y, 'b'), fox + 1);
    expect(['a', 'b']).toContain(y.fox!.killed);
    const dead = y.fox!.killed!;
    expect(y.members[dead].dead).toBe(true);
    expect(why(y, dead, fox + 25 * 60_000)).toBe('The fox killed your chicken. It can never eat again.');
    // The dead no longer count towards the whole flock.
    expect(flockCount(y, fox + 25 * 60_000).of).toBe(2);
  });
});

describe('the final standoff', () => {
  const tied = () => {
    const y = yard();
    y.members.a.points = 50;
    y.members.b.points = 50;
    return settle(y, y.endsAt + 1);
  };

  it('sends a tie to one last standoff, won by the first tied chicken to shoot', () => {
    const y = tied();
    expect(y.winnerUids).toEqual(['a', 'b']);
    expect(showdownOpen(y, y.endsAt + 10)).toBe(true);
    const won = winShowdown(y, 'b', y.endsAt + 60_000);
    expect(won.winnerUids).toEqual(['b']);
    expect(won.showdown!.winner).toBe('b');
    expect(showdownOpen(won, y.endsAt + 61_000)).toBe(false);
    expect(() => winShowdown(won, 'a', y.endsAt + 62_000)).toThrow(RuleError); // too late
  });

  it('leaves out anyone not tied, needs no tie to begin with, and lets the tie stand after a week', () => {
    let three = join(yard(), 'c', 'Carl', look, T0);
    three.members.a.points = 50;
    three.members.b.points = 50;
    three = settle(three, three.endsAt + 1);
    expect(three.showdown!.uids).toEqual(['a', 'b']);
    expect(() => winShowdown(three, 'c', three.endsAt + 10)).toThrow(RuleError); // Carl was not tied
    const single = yard();
    single.members.a.points = 50;
    expect(settle(single, single.endsAt + 1).showdown).toBeUndefined();
    expect(showdownOpen(tied(), tied().endsAt + SHOWDOWN_MS + 1)).toBe(false);
  });
});
