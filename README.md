# The Game of Chicken

A multiplayer game of chicken. Every player is a chicken sharing one feed pile in a **chicken yard**. Eating earns a point per second and carries on while you are away, but if another chicken walks into the yard while yours is eating, you lose that meal and they take a third of it.

It is a web app that installs to an Android (or iPhone, or desktop) home screen with a white-chicken icon.

## How the game works

- **Eating**: when you are alone in the yard, pick a meal length (5 seconds minimum) and start. You can close the app; the chicken keeps eating. Come back and stop early to keep what you have eaten so far.
- **Getting caught**: opening a yard means your chicken walks in. If someone else is eating, their meal is wiped and you get ⅓ of it (rounded down). Points from finished meals are safe. The victim is not notified; they see a message next time they open the app.
- **Standoff**: nobody can start eating while another player has the yard open. A chicken is only in the yard while its owner is looking at it or while it is eating.
- **Yards** stay open until a date you choose, at most a fortnight away. Join with a 6-character code or invite link (up to 12 chickens).

### Game modes

| Mode | Ends when | Winner | The feed pile shows |
|---|---|---|---|
| **Last Grain** | the pile is eaten (or the end date) | most feed eaten | feed left |
| **Sundown** | the end date | most points | time left |
| **Fat Hen** | a chicken reaches the target size (or the end date) | that chicken | how close the biggest chicken is |

Ties share the win. Chickens grow with their points.

### Options

- **Hardcore**: no timers, just Start and Stop. The chicken only eats while the app is open with the screen on; leaving stops the meal and keeps it. If the phone dies, the meal counts up to its last sign of life.
- **Sleep hours** (not in hardcore): a nightly window when nobody can eat. Meals are cut off at bedtime. Times are fixed to the yard creator's time zone.

### Also

- **My chicken**: a personal chicken (feathers, beak, comb) shown on the home screen and offered for every yard; optionally used everywhere without asking.
- **Invitations**: when starting a yard you can invite friends from your flock. They see the invitation on their home screen and accept or decline. With **Wait for everyone** the game only starts (and its clock only begins) once every invited chicken has answered; the owner can start it early. Codes and invite links keep working alongside.
- **Flock**: your record (yards won and played, biggest chicken, meals stolen and lost) and your friends', added by username. Yards nobody else joined do not count.

## Running it on this computer

Needs Node.js 22+ and Java 21+ (for the Firebase emulator). No Firebase account is needed for this.

```bash
npm install
```

In one terminal, start the local database:

```bash
npm run emulators
```

In another, start the game and open the address it prints:

```bash
npm run dev
```

Tests:

```bash
npm test
```

```bash
npm run test:rules
```

## Going online

1. Create a free project at <https://console.firebase.google.com> (the Spark plan is enough).
2. In the project: **Security → Authentication → Sign-in method** (older consoles: Build → Authentication).
   - **Email/Password → Enable**. Players only ever see usernames; the game builds a placeholder address behind the scenes.
   - **Google → Enable**, pick a support email, **Save**. This powers "Continue with Google"; first-time Google players choose a username. The SHA-1 warning is for native Android apps and can be ignored.
3. **Databases & Storage → Firestore → Create database** (production mode).
4. **Project settings → Your apps → Web (`</>`)**, register an app, and copy the config values into a new file called `.env` (see `.env.example`).
5. Sign in and pick the project:

   ```bash
   npx firebase login
   ```

   ```bash
   npx firebase use --add
   ```

6. Build and publish the game and its security rules:

   ```bash
   npm run deploy
   ```

Firebase prints the game's address (`https://<project>.web.app`). On Android, open it in Chrome and choose **Add to Home screen** / **Install app**.

## How it is built

- `src/game/rules.ts` holds every game rule as pure functions, tested in `src/game/rules.test.ts`. Nothing runs on a timer on a server: a yard stores who is eating and since when, and whoever next touches the yard settles it.
- `src/api.ts` applies those rules inside Firestore transactions.
- `firestore.rules` keeps outsiders out, freezes yard settings and finished scores, and stops players starting meals for others. It does not re-check every point, so a member using developer tools could still cheat; closing that would need server-side code (Cloud Functions, a paid plan).
- `src/ui/` draws the chicken and the yard as SVG; `src/screens/` are the app's screens.
- `npm run icons` regenerates the app icons.

## Known limits

- A phone's clock is trusted to within a few minutes.
- Sleep hours ignore daylight-saving changes during a yard's (at most two-week) life.
- No password reset for username + password accounts: they have no real email address. Google sign-in avoids this.
