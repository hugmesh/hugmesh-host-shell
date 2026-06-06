import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Phase 10 ROLE_MOD entry. This is a GUARDED PLACEHOLDER (see modGuard on the
 * /mod route), NOT a federated mount: the snapdragon-mod-ui remote does not exist
 * yet, so there is deliberately NO loadRemoteModule('mod') here. When that remote
 * ships, replace this route's loadComponent with a loadChildren -> remote('mod')
 * and add 'mod' to federation.manifest.json.
 *
 * TODO(mod-ui): swap this placeholder for the real snapdragon-mod-ui remote.
 */
@Component({
  selector: 'app-mod-placeholder',
  imports: [RouterLink],
  host: {
    id: 'maincontent',
    tabindex: '-1',
    class: 'container mt-1 mb-5',
  },
  templateUrl: './mod-placeholder.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './mod-placeholder.component.scss',
})
export class ModPlaceholderComponent {
  /** Surfaced in the template so the TODO is impossible to miss. */
  readonly futureRemote = 'snapdragon-mod-ui';
}
