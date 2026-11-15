// "How to play": the rules in plain words. Readable signed in or out.
import { DEFAULT_LOOK } from '../api';
import { MAX_MEMBERS, MIN_MEAL_S, MODE_NAMES } from '../game/rules';
import { chickenSvg } from '../ui/chicken';

export function helpScreen(root: HTMLElement): void {
  root.innerHTML = `
    <article class="card help">
      <div class="help-hero">${chickenSvg(DEFAULT_LOOK, { px: 96, pecking: true })}</div>
      <h1>How to play</h1>
      <p class="lead">You are a chicken. There is one pile of feed and everyone wants it. Eat while nobody is looking, because the moment another chicken walks in, your meal is gone.</p>

      <h2>Eating</h2>
      <ul>
        <li>Open a yard. If you are alone in it, choose how long to eat (at least ${MIN_MEAL_S} seconds) and start.</li>
        <li>You earn <strong>one point for every second</strong> your chicken eats.</li>
        <li>You can close the app. Your chicken keeps eating until the timer runs out, and the whole meal is then yours.</li>
        <li>Come back and stop early whenever you like: you keep what you have eaten so far.</li>
      </ul>

      <h2>Getting caught</h2>
      <ul>
        <li>Opening a yard means your chicken walks in. If someone else is eating at that moment, <strong>they lose that whole meal</strong>.</li>
        <li>You get <strong>a third of it</strong>, added to your score straight away.</li>
        <li>Only the meal in progress is lost. Points from meals already finished or stopped are safe for good.</li>
        <li>A caught chicken shrinks back to the size it had before the meal.</li>
        <li>Nobody is told when they are caught. They find out the next time they open the game.</li>
      </ul>
      <p class="callout">That is the game of chicken: a long meal is worth a lot, but every extra minute is another chance for someone to walk in.</p>

      <h2>The standoff</h2>
      <ul>
        <li>Nobody can start eating while another chicken is in the yard.</li>
        <li>A chicken is only in the yard while its owner has the yard open, or while it is eating. You cannot leave a chicken behind to stand guard.</li>
        <li>So when two of you are there together, somebody has to leave first.</li>
      </ul>

      <h2>Three games</h2>
      <dl class="modes-help">
        <div><dt>${MODE_NAMES.lastGrain}</dt><dd>The pile holds a fixed amount of feed. When it is all eaten, whoever ate the most wins. Feed from a lost meal goes back in the pile, apart from the stolen third.</dd></div>
        <div><dt>${MODE_NAMES.sundown}</dt><dd>Eat until the yard closes. Most points at the end wins. The pile shrinks as time runs out.</dd></div>
        <div><dt>${MODE_NAMES.fatHen}</dt><dd>The first chicken to reach the target size wins at once. The pile shrinks as the biggest chicken closes in.</dd></div>
      </dl>
      <p>Chickens grow as they score. If the top score is shared, the win is shared.</p>

      <h2>Extra rules a yard can have</h2>
      <dl class="modes-help">
        <div><dt>Hardcore</dt><dd>No timers, just Start and Stop. Your chicken only eats while the game is open with the screen on. Leave the app and the meal stops, but you keep it.</dd></div>
        <div><dt>Sleep hours</dt><dd>Every night the coop shuts and nobody can eat. A meal is cut off at bedtime and kept. Not available in hardcore yards.</dd></div>
      </dl>
      <p class="muted small">The sky in the yard follows your own clock and is only scenery. Chickens can eat at night unless the yard has sleep hours.</p>

      <h2>Yards</h2>
      <ul>
        <li>Anyone can start a yard and choose the game, how long it stays open (up to two weeks) and the extra rules.</li>
        <li>Others join with the yard's code or invite link. A yard holds up to ${MAX_MEMBERS} chickens.</li>
        <li>You can invite friends from your flock when starting a yard. They accept or decline from their home screen.</li>
        <li>With <strong>Wait for everyone</strong>, the game only starts once every invited chicken has answered, and the clock starts then.</li>
      </ul>

      <h2>Your chicken and your record</h2>
      <ul>
        <li><strong>My chicken</strong> is where you design your personal chicken. It is offered for every yard you start or join.</li>
        <li><strong>Flock</strong> shows your record next to your friends'. Add friends by username.</li>
        <li><strong>Leaderboard</strong> ranks every chicken in the game.</li>
        <li>A yard only counts towards your record if at least one other chicken joined it.</li>
      </ul>

      <a class="btn" href="#/">Back</a>
    </article>`;
}
