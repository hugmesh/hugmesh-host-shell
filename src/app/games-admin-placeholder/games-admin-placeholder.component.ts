import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Phase 8/10 DERIVED ROLE_GAMES_ADMIN mount. This is a GUARDED PLACEHOLDER (see
 * gamesAdminGuard on the /games/admin route), NOT a federated mount: no
 * games-admin UI remote exists yet, so there is deliberately NO
 * loadRemoteModule('gamesAdmin') here — this mirrors the ModPlaceholderComponent
 * precedent (the same pattern was used for /mod before hugmesh-mod-ui
 * landed). When the games-admin UI remote ships, replace this route's
 * loadComponent with a loadChildren -> remote('gamesAdmin') mount and add
 * 'gamesAdmin' to federation.manifest.json.
 *
 * Honest-disclosure invariant: this NEVER fakes a working games-admin console —
 * a derived ROLE_GAMES_ADMIN holder reaching /games/admin sees an explicit TODO,
 * not a silent 404 or a faked success state.
 *
 * TODO(games-admin-ui): swap this placeholder for the real games-admin UI remote.
 */
@Component({
  selector: 'app-games-admin-placeholder',
  imports: [RouterLink],
  host: {
    id: 'maincontent',
    tabindex: '-1',
    class: 'container mt-1 mb-5',
  },
  templateUrl: './games-admin-placeholder.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './games-admin-placeholder.component.scss',
})
export class GamesAdminPlaceholderComponent {
  /** Surfaced in the template so the TODO is impossible to miss. */
  readonly futureRemote = 'hugmesh-games-admin-ui';
}
