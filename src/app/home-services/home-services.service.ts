import { Injectable, Signal, computed, inject } from '@angular/core';

import { SessionService } from '../session.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CardState, ServiceCard } from './service-card.model';

/**
 * The static catalog row for one launcher card. `slug` (when set) is the
 * federation-capability the card depends on — present for the OPTIONAL services
 * (matrix/mastodon/forum/games), absent for the always-present role-homes
 * (admin/mod). `requiresRegistration` adds the social registration gate.
 * `requiresRole` (when set) gates a CORE card on a session role.
 */
interface CardSpec {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly route: string;
  readonly slug?: string;
  readonly requiresRegistration?: boolean;
  readonly requiresRole?: 'admin' | 'mod';
  /** Human label for the missing role, used in the "sign in as …" helptext. */
  readonly roleLabel?: string;
}

/** The host launcher catalog. OPTIONAL services (matrix/mastodon/forum/games) are
 *  install-state-gated via their capability slug; admin/mod are CORE role-homes
 *  (not federation-registered, so no slug — always "present", gated purely on the
 *  session role). mountAt values mirror the federation registry / fe-gateway. */
const CARD_CATALOG: readonly CardSpec[] = [
  {
    id: 'matrix', label: 'Matrix', description: 'Secure chat',
    route: '/social/matrix', slug: 'matrix', requiresRegistration: true,
  },
  {
    id: 'mastodon', label: 'Mastodon', description: 'The fediverse timeline',
    route: '/social/mastodon', slug: 'mastodon', requiresRegistration: true,
  },
  {
    id: 'forum', label: 'Forum', description: 'Discussion boards',
    route: '/social/forum', slug: 'forum',
  },
  {
    id: 'games', label: 'Games', description: 'Play together',
    route: '/games', slug: 'games',
  },
  {
    id: 'admin', label: 'Admin', description: 'Administration console',
    route: '/admin', requiresRole: 'admin', roleLabel: 'an administrator',
  },
  {
    id: 'mod', label: 'Moderation', description: 'Moderation console',
    route: '/mod', requiresRole: 'mod', roleLabel: 'a moderator',
  },
];

/**
 * Derives the home-services launcher cards from the federation install-state
 * (CapabilitiesService) + the live session (SessionService). Pure projection — the
 * menu owns the capability fetch; this service only maps catalog x state -> cards.
 *
 * Gate precedence per card (most-dominant first), so the disabled REASON is the one
 * the user can act on least:
 *   1. OPTIONAL + not installed   -> 'absent'        (unrecoverable on this deploy)
 *   2. requiresRole + role absent -> 'role'          ('sign in as …')
 *      (anonymous principal also falls here for any service card via the implicit
 *       "you must be signed in" — modelled as the role gate)
 *   3. requiresRegistration unmet -> 'registration'  (social, complete registration)
 *   4. otherwise                  -> 'enabled'
 *
 * This UNIFIES the optional-services greying (absent) with the UI-wave role-gated
 * cards (role) under one data-driven grid.
 */
@Injectable({ providedIn: 'root' })
export class HomeServicesService {
  private readonly session = inject(SessionService);
  private readonly capabilities = inject(CapabilitiesService);

  /** The launcher cards for the current session + install-state, in catalog order. */
  readonly cards: Signal<readonly ServiceCard[]> = computed(() =>
    CARD_CATALOG.map((spec) => this.toCard(spec)),
  );

  private toCard(spec: CardSpec): ServiceCard {
    const { state, disabledReason } = this.resolve(spec);
    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      route: spec.route,
      state,
      disabledReason,
    };
  }

  private resolve(spec: CardSpec): { state: CardState; disabledReason: string } {
    // 1. OPTIONAL service absent on this deployment — dominant, unrecoverable.
    if (spec.slug && !this.capabilities.installed(spec.slug)) {
      return { state: 'absent', disabledReason: 'This service is not available on this deployment.' };
    }
    // 2. Role gate (CORE cards), or the implicit sign-in gate for anyone anonymous.
    if (spec.requiresRole) {
      if (!this.hasRole(spec.requiresRole)) {
        return { state: 'role', disabledReason: `Sign in as ${spec.roleLabel} to open this.` };
      }
    } else if (!this.session.loggedIn()) {
      // Optional-service card, but the principal isn't signed in at all.
      return { state: 'role', disabledReason: 'Sign in to use this.' };
    }
    // 3. Social registration gate.
    if (spec.requiresRegistration && !this.session.fullyRegistered()) {
      return { state: 'registration', disabledReason: 'Complete your registration to use this.' };
    }
    return { state: 'enabled', disabledReason: '' };
  }

  private hasRole(role: 'admin' | 'mod'): boolean {
    return role === 'admin' ? this.session.isAdmin() : this.session.isMod();
  }
}
