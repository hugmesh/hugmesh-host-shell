import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../session.service';

interface LandingLink {
  readonly label: string;
  readonly description: string;
  readonly route: string;
  /** Only show this card when the predicate over the session is true. */
  readonly visible: () => boolean;
}

/**
 * Default route ('') landing. Phase 10 role-aware entrypoint:
 *  - Anonymous          -> public welcome + Sign in (into the login remote).
 *  - ROLE_USER          -> link cards into the Matrix + Mastodon remotes
 *                          (RouterLinks ONLY — no fake mounts here).
 *  - ROLE_ADMIN/ROLE_MOD-> additionally surface the Admin / Mod (TODO) entries.
 * Service tokens / mounts live in the remotes; this shell only routes.
 */
@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  host: {
    id: 'maincontent',
    tabindex: '-1',
    class: 'container mt-1 mb-5',
  },
  templateUrl: './landing.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './landing.component.scss',
})
export class LandingComponent {
  readonly session = inject(SessionService);

  /** The registration-gated social remotes plus the role-gated admin/mod entries.
   *  `visible` mirrors the guards so the landing never advertises a card the
   *  user's session can't actually open. */
  readonly links: readonly LandingLink[] = [
    {
      label: 'Matrix',
      description: 'Real-time chat and calls in the federated Matrix space.',
      route: '/social/matrix',
      visible: () => this.session.fullyRegistered(),
    },
    {
      label: 'Mastodon',
      description: 'Your timeline in the federated Mastodon community.',
      route: '/social/mastodon',
      visible: () => this.session.fullyRegistered(),
    },
    {
      label: 'Admin',
      description: 'Allowlist, usage and namespace administration.',
      route: '/admin',
      visible: () => this.session.isAdmin(),
    },
    {
      label: 'Moderation (coming soon)',
      description: 'Moderator tools — the snapdragon-mod-ui remote is not built yet.',
      route: '/mod',
      visible: () => this.session.isMod(),
    },
  ];

  readonly visibleLinks = computed(() =>
    this.links.filter((l) => l.visible()),
  );
}
