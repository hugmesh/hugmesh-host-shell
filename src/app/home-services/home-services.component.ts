import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HomeServicesService } from './home-services.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';

/**
 * The home-page SERVICES launcher grid — a data-driven, role-gated set of cards for
 * the platform's services (Matrix / Mastodon / Forum / Games + the Admin /
 * Moderation consoles), fed by the PUBLIC federation install-state
 * (CapabilitiesService) and the live session (via HomeServicesService).
 *
 * Each card is either an ENABLED link or a DISABLED card with helptext explaining
 * WHY (defense-in-depth grey + EXPLAIN, never hide):
 *  - an OPTIONAL service NOT installed on this deployment renders greyed
 *    (aria-disabled) with "not available on this deployment";
 *  - a role-gated card the principal lacks renders disabled with "sign in as …";
 *  - an installed social service awaiting registration renders disabled with
 *    "complete your registration".
 *
 * Accessibility: the grid is a labelled role="list"; each card is a role="listitem".
 * An enabled card is a real <a routerLink> (keyboard-operable, focusable); a
 * disabled card is a focusable element with aria-disabled="true" +
 * aria-describedby -> its .field-help reason (so the reason is announced, and the
 * control is greyed rather than a dead link). Reuses the LinksComponent grid SCSS.
 */
@Component({
  selector: '[home-services]',
  imports: [RouterLink],
  host: {
    id: 'home-services',
    class: 'links-grid container-sm',
    role: 'list',
    'aria-label': 'Services',
  },
  templateUrl: './home-services.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './home-services.component.scss',
})
export class HomeServicesComponent implements OnInit {
  private readonly services = inject(HomeServicesService);
  private readonly capabilities = inject(CapabilitiesService);

  /** The launcher cards for the current session + install-state (catalog order). */
  readonly cards = this.services.cards;

  ngOnInit(): void {
    // Share the menu's load-once capability fetch (no-op if already loaded); a
    // failed/empty load simply greys every optional service.
    void this.capabilities.load();
  }
}
