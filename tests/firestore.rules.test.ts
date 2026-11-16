// Runs against the Firestore emulator: npm run test:rules
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import {
  createYard, declineInvite, join, settle, startEating, startNow, touch, type Look, type Yard,
} from '../src/game/rules';

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
  // The app always writes the name and the profile together.
  function claim(uid: string, username: string, stats = { gamesPlayed: 0, wins: 0 }) {
    const db = dbFor(uid);
    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', username.toLowerCase()), { uid });
    batch.set(doc(db, 'users', uid), { username, stats });
    return batch.commit();
  }

  it('lets a player claim a username and profile for themselves only', async () => {
    await assertSucceeds(claim('anna', 'Anna'));
    await assertFails(setDoc(doc(dbFor('ben'), 'usernames/carl'), { uid: 'anna' }));
    await assertFails(setDoc(doc(dbFor('ben'), 'users/anna'), { username: 'Anna', stats: { gamesPlayed: 0, wins: 0 } }));
    await assertFails(claim('ben', 'Ben', { gamesPlayed: 9, wins: 9 }));
    await assertFails(updateDoc(doc(dbFor('anna'), 'users/anna'), { username: 'Queen' }));
  });

  it('never lets two players hold the same username, whatever the capitals', async () => {
    await assertSucceeds(claim('anna', 'Anna'));
    await assertFails(claim('ben', 'Anna'));
    await assertFails(claim('ben', 'ANNA'));
    await assertFails(claim('ben', 'anna'));
    // Not by overwriting the register entry either.
    await assertFails(setDoc(doc(dbFor('ben'), 'usernames/anna'), { uid: 'ben' }));
    await assertSucceeds(claim('ben', 'Ben'));
  });

  it('refuses a profile whose name its owner does not hold, and hoarding names', async () => {
    // A profile on its own, borrowing someone's name for display.
    await assertSucceeds(claim('anna', 'Anna'));
    await assertFails(setDoc(doc(dbFor('ben'), 'users/ben'), { username: 'Anna', stats: { gamesPlayed: 0, wins: 0 } }));
    // A name on its own, without the profile that uses it.
    await assertFails(setDoc(doc(dbFor('ben'), 'usernames/spare'), { uid: 'ben' }));
    // A second name for someone who already has one.
    await assertFails(setDoc(doc(dbFor('anna'), 'usernames/anna2'), { uid: 'anna' }));
  });

  it('lets a player rename to a free name, releasing the old one', async () => {
    await assertSucceeds(claim('anna', 'Anna'));
    await assertSucceeds(claim('ben', 'Ben'));
    const rename = (uid: string, from: string, to: string) => {
      const db = dbFor(uid);
      const batch = writeBatch(db);
      batch.set(doc(db, 'usernames', to.toLowerCase()), { uid, login: from.toLowerCase() });
      batch.delete(doc(db, 'usernames', from.toLowerCase()));
      batch.update(doc(db, 'users', uid), { username: to });
      return batch.commit();
    };
    await assertFails(rename('anna', 'Anna', 'Ben')); // taken
    await assertSucceeds(rename('anna', 'Anna', 'Queen'));
    await assertSucceeds(updateDoc(doc(dbFor('anna'), 'users/anna'), { username: 'QUEEN' })); // capitals only
    // The old name is free again, and nobody else could have released it.
    await assertFails(deleteDoc(doc(dbFor('ben'), 'usernames/queen')));
    await assertSucceeds(claim('carl', 'Anna'));
    // A player cannot drop their own name while still using it, or keep two.
    await assertFails(deleteDoc(doc(dbFor('ben'), 'usernames/ben')));
    const bens = dbFor('ben');
    const greedy = writeBatch(bens);
    greedy.set(doc(bens, 'usernames/benny'), { uid: 'ben' });
    greedy.update(doc(bens, 'users/ben'), { username: 'Benny' });
    await assertFails(greedy.commit()); // taking a new name without releasing the old one
  });

  it('lets a player delete their own account, name included, and nobody else\'s', async () => {
    await assertSucceeds(claim('anna', 'Anna'));
    await assertSucceeds(claim('ben', 'Ben'));
    const remove = (actor: string, uid: string, name: string) => {
      const db = dbFor(actor);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', uid));
      batch.delete(doc(db, 'usernames', name));
      return batch.commit();
    };
    await assertFails(remove('ben', 'anna', 'anna'));
    await assertFails(deleteDoc(doc(dbFor('anna'), 'users/anna'))); // must release the name too
    await assertSucceeds(remove('anna', 'anna', 'anna'));
    await assertSucceeds(claim('carl', 'Anna'));
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

  it('handles invitations: decline, join, start, and nothing else', async () => {
    const now = Date.now();
    const y = freshYard({ invites: [{ uid: 'ben', username: 'Ben' }, { uid: 'carl', username: 'Carl' }], waitForInvites: true });
    await assertSucceeds(setDoc(doc(dbFor('anna'), 'yards/y1'), y));
    // A stranger cannot decline for Ben, and Ben cannot touch anything but his own invitation.
    await assertFails(setDoc(doc(dbFor('dora'), 'yards/y1'), declineInvite(y, 'ben', now)));
    const sneaky = declineInvite(y, 'ben', now);
    sneaky.members.anna.points = 0.5;
    await assertFails(setDoc(doc(dbFor('ben'), 'yards/y1'), sneaky));
    const afterBen = declineInvite(y, 'ben', now);
    await assertSucceeds(setDoc(doc(dbFor('ben'), 'yards/y1'), afterBen));
    // Carl accepts: the last answer starts the game with its length intact.
    const started = join(afterBen, 'carl', 'Carl', look, Date.now());
    await assertSucceeds(setDoc(doc(dbFor('carl'), 'yards/y1'), started));
    // Once running, the clock cannot be moved again.
    await assertFails(updateDoc(doc(dbFor('anna'), 'yards/y1'), { endsAt: started.endsAt + 1000 }));
    await assertFails(updateDoc(doc(dbFor('anna'), 'yards/y1'), { status: 'waiting' }));
  });

  it('lets the owner start a waiting yard but not stretch it', async () => {
    const y = freshYard({ invites: [{ uid: 'ben', username: 'Ben' }], waitForInvites: true });
    await seed(y);
    const longer = startNow(y, 'anna', Date.now());
    longer.endsAt += 3600_000;
    await assertFails(setDoc(doc(dbFor('anna'), 'yards/y1'), longer));
    await assertSucceeds(setDoc(doc(dbFor('anna'), 'yards/y1'), startNow(y, 'anna', Date.now())));
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

  it('keeps the notice board to members, in their own name', async () => {
    const y = join(freshYard(), 'ben', 'Ben', look, Date.now());
    await seed(y);
    const at = Date.now();
    const board = (uid: string) => collection(dbFor(uid), 'yards/y1/board');
    const note = { kind: 'chat', at, by: 'anna', uid: 'anna', username: 'Anna', text: 'cluck' };
    await assertSucceeds(addDoc(board('anna'), note));
    await assertSucceeds(addDoc(board('anna'), { kind: 'visit', at, by: 'anna', uid: 'anna', username: 'Anna' }));
    // A meal Ben finished long ago may be noted by whoever notices it.
    await assertSucceeds(addDoc(board('anna'), { kind: 'ate', at: at - 3600_000, by: 'anna', uid: 'ben', username: 'Ben', amount: 60 }));
    await assertSucceeds(addDoc(board('ben'), {
      kind: 'caught', at, by: 'ben', uid: 'ben', username: 'Ben', victimUid: 'anna', victimName: 'Anna', lost: 30, taken: 10,
    }));
    await assertSucceeds(getDocs(board('ben')));
    // Not for outsiders, not in someone else's name, not empty or endless, not from the future.
    await assertFails(getDocs(board('carl')));
    await assertFails(addDoc(board('carl'), { ...note, by: 'carl', uid: 'carl' }));
    await assertFails(addDoc(board('ben'), note));
    await assertFails(addDoc(board('ben'), { ...note, by: 'ben' }));
    await assertFails(addDoc(board('anna'), { ...note, text: '' }));
    await assertFails(addDoc(board('anna'), { ...note, text: 'x'.repeat(301) }));
    await assertFails(addDoc(board('anna'), { ...note, at: at + 3600_000 }));
    await assertFails(addDoc(board('anna'), { ...note, extra: 1 }));
    // Lines are never changed or removed.
    const mine = await addDoc(board('anna'), note);
    await assertFails(updateDoc(mine, { text: 'moo' }));
    await assertFails(deleteDoc(mine));
  });
});
