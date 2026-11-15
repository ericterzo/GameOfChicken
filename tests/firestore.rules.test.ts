// Runs against the Firestore emulator: npm run test:rules
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { createYard, join, settle, startEating, touch, type Look, type Yard } from '../src/game/rules';

const look: Look = { body: '#fff', beak: 'short', beakColor: '#f90', comb: 'classic', combColor: '#d00' };
let env: RulesTestEnvironment;
const dbFor = (uid: string) => env.authenticatedContext(uid).firestore();

function freshYard(over: Partial<Parameters<typeof createYard>[0]> = {}): Yard {
  const now = Date.now();
  return createYard(
    { name: 'Yard', mode: 'sundown', goal: null, endsAt: now + 3600_000, hardcore: false, sleep: null, ...over },
    'anna', 'Anna', look, 'ABC123', now,
  );
}

async function seed(yard: Yard): Promise<void> {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'yards/y1'), yard));
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-chicken-yard',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

describe('accounts', () => {
  it('lets a player claim a username and profile for themselves only', async () => {
    const profile = { username: 'Anna', stats: { gamesPlayed: 0, wins: 0 } };
    await assertSucceeds(setDoc(doc(dbFor('anna'), 'usernames/anna'), { uid: 'anna' }));
    await assertSucceeds(setDoc(doc(dbFor('anna'), 'users/anna'), profile));
    await assertFails(setDoc(doc(dbFor('ben'), 'usernames/anna'), { uid: 'ben' }));
    await assertFails(setDoc(doc(dbFor('ben'), 'usernames/carl'), { uid: 'anna' }));
    await assertFails(setDoc(doc(dbFor('ben'), 'users/anna'), profile));
    await assertFails(setDoc(doc(dbFor('ben'), 'users/ben'), { username: 'Ben', stats: { gamesPlayed: 9, wins: 9 } }));
    await assertFails(updateDoc(doc(dbFor('anna'), 'users/anna'), { username: 'Queen' }));
  });

  it('keeps everything from signed-out visitors', async () => {
    await seed(freshYard());
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'yards/y1')));
  });

  it('lets others drop a message in an inbox but not read it', async () => {
    const msg = { byUid: 'ben', read: false, pointsLost: 5 };
    await assertSucceeds(setDoc(doc(dbFor('ben'), 'users/anna/inbox/m1'), msg));
    await assertFails(setDoc(doc(dbFor('ben'), 'users/anna/inbox/m2'), { ...msg, byUid: 'carl' }));
    await assertFails(getDoc(doc(dbFor('ben'), 'users/anna/inbox/m1')));
    await assertSucceeds(getDoc(doc(dbFor('anna'), 'users/anna/inbox/m1')));
  });
});

describe('yards', () => {
  it('accepts a valid new yard and rejects one longer than a fortnight', async () => {
    await assertSucceeds(setDoc(doc(dbFor('anna'), 'yards/ok'), freshYard()));
    const long = { ...freshYard(), endsAt: Date.now() + 15 * 24 * 3600_000 };
    await assertFails(setDoc(doc(dbFor('anna'), 'yards/long'), long));
    await assertFails(setDoc(doc(dbFor('ben'), 'yards/notmine'), freshYard()));
    const rich = freshYard();
    rich.members.anna.points = 999;
    await assertFails(setDoc(doc(dbFor('anna'), 'yards/rich'), rich));
  });

  it('lets a newcomer join as themselves with zero points', async () => {
    const y = freshYard();
    await seed(y);
    const now = Date.now();
    await assertFails(setDoc(doc(dbFor('ben'), 'yards/y1'), join(y, 'carl', 'Carl', look, now)));
    const cheat = join(y, 'ben', 'Ben', look, now);
    cheat.members.ben.points = 50;
    await assertFails(setDoc(doc(dbFor('ben'), 'yards/y1'), cheat));
    await assertSucceeds(setDoc(doc(dbFor('ben'), 'yards/y1'), join(y, 'ben', 'Ben', look, now)));
  });

  it('allows normal play by members and nothing from outsiders', async () => {
    const now = Date.now();
    const y = join(freshYard(), 'ben', 'Ben', look, now);
    await seed(y);
    const eating = startEating(y, 'anna', now, 600).yard;
    await assertFails(setDoc(doc(dbFor('carl'), 'yards/y1'), eating));
    await assertFails(setDoc(doc(dbFor('ben'), 'yards/y1'), eating)); // Ben starting Anna's meal
    await assertSucceeds(setDoc(doc(dbFor('anna'), 'yards/y1'), eating));
    const interrupted = touch({ ...eating, eating: { ...eating.eating!, startedAt: now - 30_000 } }, 'ben', now).yard;
    await assertSucceeds(setDoc(doc(dbFor('ben'), 'yards/y1'), interrupted));
  });

  it('refuses changed settings, backdated meals and timers in hardcore', async () => {
    const now = Date.now();
    const y = freshYard();
    await seed(y);
    await assertFails(updateDoc(doc(dbFor('anna'), 'yards/y1'), { endsAt: now + 9e9 }));
    await assertFails(updateDoc(doc(dbFor('anna'), 'yards/y1'), { goal: 5 }));
    const backdated = startEating(y, 'anna', now, 600).yard;
    backdated.eating!.startedAt = now - 3600_000;
    await assertFails(setDoc(doc(dbFor('anna'), 'yards/y1'), backdated));

    const hc = freshYard({ hardcore: true });
    await seed(hc);
    const timed = startEating(hc, 'anna', now, 0).yard;
    await assertSucceeds(setDoc(doc(dbFor('anna'), 'yards/y1'), timed));
    await seed(hc);
    timed.eating!.endsAt = now + 60_000;
    await assertFails(setDoc(doc(dbFor('anna'), 'yards/y1'), timed));
  });

  it('freezes scores once a yard is finished', async () => {
    const y = freshYard();
    y.members.anna.points = 40;
    const done = settle(y, y.endsAt + 1);
    await seed(done);
    await assertSucceeds(updateDoc(doc(dbFor('anna'), 'yards/y1'), { 'members.anna.statsClaimed': true }));
    await assertFails(updateDoc(doc(dbFor('anna'), 'yards/y1'), { 'members.anna.points': 4000 }));
    await assertFails(updateDoc(doc(dbFor('anna'), 'yards/y1'), { status: 'active' }));
  });
});
