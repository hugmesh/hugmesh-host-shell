import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Phase 8 ROLE_GAMES entry-point. This is a GUARDED PLACEHOLDER (see gamesGuard
 * on the /games route), NOT a federated mount: no games-namespace UI remote
 * exists yet, so there is deliberately NO loadRemoteModule('games') here — this
 * mirrors the ModPlaceholderComponent precedent (the same pattern was used for
 * /mod before snapdragon-mod-ui landed). When the games UI remote ships, replace
 * this route's loadComponent with a loadChildren -> remote('games') mount and add
 * 'games' to federation.manifest.json.
 *
 * Honest-disclosure invariant: this NEVER fakes a working games surface — a
 * ROLE_GAMES holder reaching /games sees an explicit TODO, not a silent 404 or a
 * faked success state.
 *
 * TODO(games-ui): swap this placeholder for the real games-namespace UI remote.
 */
@Component({
  selector: 'app-games-placeholder',
  imports: [RouterLink],
  host: {
    id: 'maincontent',
    tabindex: '-1',
    class: 'container mt-1 mb-5',
  },
  templateUrl: './games-placeholder.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './games-placeholder.component.scss',
})
export class GamesPlaceholderComponent {
  /** Surfaced in the template so the TODO is impossible to miss. */
  readonly futureRemote = 'snapdragon-games-ui';
}
