// "How to play": the rules in plain words. Readable signed in or out.
import { DEFAULT_LOOK } from '../api';
import { MAX_MEMBERS, MIN_MEAL_S, MODE_NAMES } from '../game/rules';
import { t } from '../i18n';
import { chickenSvg } from '../ui/chicken';

export function helpScreen(root: HTMLElement): void {
  root.innerHTML = `
    <article class="card help">
      <div class="help-hero">${chickenSvg(DEFAULT_LOOK, { px: 96, pecking: true })}</div>
      <h1>${t('How to play')}</h1>
      <p class="lead">${t('You are a chicken. There is one pile of feed and everyone wants it. Eat while nobody is looking, because the moment another chicken walks in, your meal is gone.')}</p>

      <h2>${t('Eating')}</h2>
      <ul>
        <li>${t('Open a yard. If you are alone in it, choose how long to eat (at least {0} seconds) and start.', MIN_MEAL_S)}</li>
        <li>${t('You earn <strong>one point for every second</strong> your chicken eats.')}</li>
        <li>${t('You can close the app. Your chicken keeps eating until the timer runs out, and the whole meal is then yours.')}</li>
        <li>${t('Come back and stop early whenever you like: you keep what you have eaten so far.')}</li>
      </ul>

      <h2>${t('Getting caught')}</h2>
      <ul>
        <li>${t('Opening a yard means your chicken walks in. If someone else is eating at that moment, <strong>they lose that whole meal</strong>.')}</li>
        <li>${t('You get <strong>a third of it</strong>, added to your score straight away.')}</li>
        <li>${t('Only the meal in progress is lost. Points from meals already finished or stopped are safe for good.')}</li>
        <li>${t('A caught chicken shrinks back to the size it had before the meal.')}</li>
        <li>${t('The caught chicken lets out its battle cry and leaves the yard.')}</li>
        <li>${t('Nobody is told when they are caught. They find out the next time they open the game.')}</li>
      </ul>
      <p class="callout">${t('That is the game of chicken: a long meal is worth a lot, but every extra minute is another chance for someone to walk in.')}</p>

      <h2>${t('Allianceship and standoffs')}</h2>
      <h3>${t('The standoff')}</h3>
      <ul>
        <li>${t('Nobody can start eating while another chicken is in the yard.')}</li>
        <li>${t('A chicken is only in the yard while its owner has the yard open, or while it is eating. You cannot leave a chicken behind to stand guard.')}</li>
        <li>${t('So when two of you are there together, somebody has to leave first, or you settle it below.')}</li>
      </ul>

      <h3>${t('Two chickens: ally or fight')}</h3>
      <p>${t('When exactly two chickens are in the yard and nobody is eating, both see two buttons under the yard: <strong>Ally</strong> and <strong>Fight</strong>.')}</p>
      <ul>
        <li>${t('Each chooses in secret. You see when the other chicken has decided, but not what they chose.')}</li>
        <li>${t('A choice cannot be taken back. If either chicken leaves before both have chosen, the choice is forgotten.')}</li>
        <li>${t('This only happens in yards that at least three chickens have joined. With just two, there is nobody to ally against, so it stays a plain standoff.')}</li>
      </ul>
      <dl class="modes-help">
        <div><dt>${t('Both ally')}</dt><dd>${t('You become allies. Each of you picks how long to feed, and that length stays secret, even from your ally. You can feed at the same time, side by side, and neither of you can catch the other.')}</dd></div>
        <div><dt>${t('One fights, one allies')}</dt><dd>${t('The fighter wins the yard. The chicken who offered an alliance is thrown out for 7 minutes.')}</dd></div>
        <div><dt>${t('Both fight')}</dt><dd>${t('Both chickens are thrown out for 12 minutes.')}</dd></div>
      </dl>

      <h3>${t('Feeding as allies')}</h3>
      <ul>
        <li>${t('Each ally picks a secret meal length. The alliance lasts until the longer of the two runs out.')}</li>
        <li>${t('If you leave the yard without picking a length, your length counts as zero.')}</li>
        <li>${t('Your ally cannot catch you, but any other chicken who walks in can, and catches both of you if you are both eating.')}</li>
        <li>${t('When your meal is over, or you stop it early, you keep the feed and your chicken leaves the yard.')}</li>
        <li>${t('While the alliance lasts you can come back and eat again, still safe from your ally and still unable to catch them.')}</li>
        <li>${t('Once the alliance is over you are rivals again, and can catch each other as usual.')}</li>
        <li>${t('If any other chicken walks in, the alliance is broken: any ally who is eating is caught, and it is a standoff again.')}</li>
        <li>${t('In Last Grain, allies share what is left of the pile: whoever starts second can only eat what the first has not already claimed.')}</li>
      </ul>

      <h3>${t('Three or more chickens: the trigger')}</h3>
      <ul>
        <li>${t('When three or more chickens are in the yard, each sees a button that reads <strong>Shoot??????????</strong>.')}</li>
        <li>${t('Every press takes away one question mark. Nobody else can see how many you have left.')}</li>
        <li>${t('After ten presses it turns into <strong>Shoot!</strong>. Press it and you shoot one of the other chickens, picked at random.')}</li>
        <li>${t('A chicken that is shot is thrown out of the yard for 2 to 4 minutes. Your trigger then starts again from ten.')}</li>
        <li>${t('As soon as only two chickens are left in the yard, any shot not yet fired is ignored, every trigger goes back to ten, and the two chickens get Ally and Fight instead.')}</li>
      </ul>

      <h3>${t('Thrown out')}</h3>
      <ul>
        <li>${t('A chicken thrown out of a yard cannot go back in until its time is up. The yard’s row on your home screen says who did it and counts down the wait.')}</li>
        <li>${t('If the shot hits your own ally, that is a betrayal: they lose the meal they were eating, the yard’s notice board says so, and the traitor wears red horns for the rest of that game.')}</li>
      </ul>

      <h2>${t('Three games')}</h2>
      <dl class="modes-help">
        <div><dt>${t(MODE_NAMES.lastGrain)}</dt><dd>${t('The pile holds a fixed amount of feed. When it is all eaten, whoever ate the most wins. Feed from a lost meal goes back in the pile, apart from the stolen third.')}</dd></div>
        <div><dt>${t(MODE_NAMES.sundown)}</dt><dd>${t('Eat until the yard closes. Most points at the end wins. The pile shrinks as time runs out.')}</dd></div>
        <div><dt>${t(MODE_NAMES.fatHen)}</dt><dd>${t('The first chicken to reach the target size wins at once. The pile shrinks as the biggest chicken closes in.')}</dd></div>
      </dl>
      <p>${t('Chickens grow as they score. If the top score is shared, the win is shared.')}</p>

      <h2>${t('Extra rules a yard can have')}</h2>
      <dl class="modes-help">
        <div><dt>${t('Hardcore')}</dt><dd>${t('No timers, just Start and Stop. Your chicken only eats while the game is open with the screen on. Leave the app and the meal stops, but you keep it.')}</dd></div>
        <div><dt>${t('Sleep hours')}</dt><dd>${t('Every night the coop shuts and nobody can eat. A meal is cut off at bedtime and kept. Not available in hardcore yards.')}</dd></div>
      </dl>
      <p class="muted small">${t('The sky in the yard follows your own clock and is only scenery. Chickens can eat at night unless the yard has sleep hours.')}</p>

      <h2>${t('Yards')}</h2>
      <ul>
        <li>${t('Anyone can start a yard and choose the game, how long it stays open (up to two weeks) and the extra rules.')}</li>
        <li>${t('Others join with the yard’s code or invite link. A yard holds up to {0} chickens.', MAX_MEMBERS)}</li>
        <li>${t('You can invite friends from your flock when starting a yard. They accept or decline from their home screen.')}</li>
        <li>${t('With <strong>Wait for everyone</strong>, the game only starts once every invited chicken has answered, and the clock starts then.')}</li>
      </ul>

      <h2>${t('Your chicken and your record')}</h2>
      <ul>
        <li>${t('<strong>My chicken</strong> is where you design your personal chicken. It is offered for every yard you start or join.')}</li>
        <li>${t('There you can also record a battle cry of up to 5 seconds. It plays when you are caught eating, and when you tap your own chicken in a yard, for everyone there to hear.')}</li>
        <li>${t('Notes you post in a yard also appear in a speech bubble above your chicken for two minutes, or until you leave.')}</li>
        <li>${t('<strong>Flock</strong> shows your record next to your friends’. Add friends by username.')}</li>
        <li>${t('<strong>Leaderboard</strong> ranks every chicken in the game.')}</li>
        <li>${t('A yard only counts towards your record if at least one other chicken joined it.')}</li>
      </ul>

      <a class="btn" href="#/">${t('Back')}</a>
    </article>`;
}
