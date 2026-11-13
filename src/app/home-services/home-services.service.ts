import { Injectable, Signal, computed, inject } from '@angular/core';

import { SessionService } from '../session.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CardState, ServiceCard } from './service-card.model';
import { canUseForum, holdsMastodonRole, holdsMatrixRole } from '../guards/social-access';

/**
 * The static catalog row for one launcher card. `slug` (when set) is the
 * federation-capability the card depends on — present for the OPTIONAL services
 * (matrix/mastodon/forum/games/tube/owncast), absent for the always-present
 * role-homes (admin/mod). `requiresRegistration` adds the social registration
 * gate. `requiresRole` (when set) gates a card on a session role — the CORE
 * role-homes, games, and the three social services, whose role terms come from
 * guards/social-access.ts so the card can never disagree with the route guard
 * (Matrix/Mastodon = role + registration, Forum = role or admin). NOTE: tube
 * and owncast have no `requiresRole` here — they are slug-gated only, so they
 * render 'enabled' for any signed-in, registered user regardless of the
 * per-service ROLE_TUBE/ROLE_OWNCAST grant that their destination route guards
 * (tubeGuard/owncastGuard) actually require.
 */
interface CardSpec {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly route: string;
  readonly slug?: string;
  readonly requiresRegistration?: boolean;
  readonly requiresRole?: CardRole;
  /** Human label for the missing role, used in the "sign in as …" helptext. */
  readonly roleLabel?: string;
}

type CardRole = 'admin' | 'mod' | 'games' | 'games-admin' | 'matrix' | 'mastodon' | 'forum';

/** The host launcher catalog. OPTIONAL services (matrix/mastodon/forum/games/
 *  tube/owncast) are install-state-gated via their capability slug; admin/mod are
 *  CORE role-homes (not federation-registered, so no slug — always "present",
 *  gated purely on the session role). mountAt values mirror the federation
 *  registry / fe-gateway. */
const CARD_CATALOG: readonly CardSpec[] = [
  // MATRIX / MASTODON: the per-service role AND registration — together exactly
  // matrixGuard / mastodonGuard (guards/social-access.ts canUseMatrix /
  // canUseMastodon), the user-bff hsproxy's rule. Registration alone used to be
  // enough here, so admins, mods, superadmins and plain members saw an enabled
  // card into a remote whose every call then 403'd. The role gate precedes the
  // registration gate (see resolve()): registering cannot unlock a missing role.
  {
    id: 'matrix', label: 'Matrix', description: 'Secure chat',
    route: '/social/matrix', slug: 'matrix', requiresRegistration: true,
    requiresRole: 'matrix', roleLabel: 'a Matrix member',
  },
  {
    id: 'mastodon', label: 'Mastodon', description: 'The fediverse timeline',
    route: '/social/mastodon', slug: 'mastodon', requiresRegistration: true,
    requiresRole: 'mastodon', roleLabel: 'a Mastodon member',
  },
  // FORUM: route '/social/forum' is a real HOST mount (app.routes.ts
  // REMOTE_ROUTES -> forum remote, forumGuard). Role-gated on canUseForum
  // (ROLE_FORUM, or admin/superadmin — the gateway row plus its bypasses), with
  // no registration term. It used to be enabled for every signed-in user, and
  // for anyone without ROLE_FORUM the click died on a 403'd remoteEntry.
  {
    id: 'forum', label: 'Forum', description: 'Discussion boards',
    route: '/social/forum', slug: 'forum', requiresRole: 'forum', roleLabel: 'a forum member',
  },
  // GAMES entry-point (Phase 8): a plain ROLE_GAMES member reaches this — the
  // ENTRY-POINT ONLY, distinct from the games-ADMIN console below (a bare
  // ROLE_GAMES does NOT earn games-admin; see SessionService.isGamesAdmin).
  {
    id: 'games', label: 'Games', description: 'Play together',
    route: '/games', slug: 'games', requiresRole: 'games', roleLabel: 'a games member',
  },
  // GAMES-ADMIN console (Phase 8/10): the DERIVED ROLE_GAMES_ADMIN tier
  // (ROLE_GAMES ∩ (ROLE_ADMIN ∪ ROLE_MOD)) — see SessionService.isGamesAdmin.
  // Shares the 'games' install-state slug (there is no games-admin console
  // without the games service itself being installed).
  {
    id: 'games-admin', label: 'Games Admin', description: 'Manage the games namespace',
    route: '/games/admin', slug: 'games', requiresRole: 'games-admin', roleLabel: 'a games admin',
  },
  {
    id: 'tube', label: 'My Tube', description: 'YouTube subscription archive',
    route: '/tube', slug: 'tube',
  },
  {
    id: 'owncast', label: 'Live Stream', description: 'Owncast broadcast console',
    route: '/owncast', slug: 'owncast',
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

  private hasRole(role: CardRole): boolean {
    switch (role) {
      // The adminGuard predicate (admin OR superadmin): the card must not grey out
      // for the pure superadmin the guard lets through.
      case 'admin': return this.session.isAdminTier();
      case 'mod': return this.session.isMod();
      // ALIGNED WITH gamesGuard (app.routes.ts / guards/games.guard.ts): the
      // entry point admits a ROLE_GAMES holder OR an admin / superadmin, so the
      // card must not grey out for the bare admin the guard lets through — the
      // inconsistency home-services.service.spec.ts used to record. 'games-admin'
      // below stays the DERIVED tier (a bare admin is still refused there).
      case 'games': return this.session.isGames() || this.session.isAdmin() || this.session.isSuperadmin();
      case 'games-admin': return this.session.isGamesAdmin();
      // The social ROLE terms, from the one shared definition. Matrix/Mastodon
      // add the registration half through requiresRegistration (step 3), so
      // role + registration here == canUseMatrix / canUseMastodon == the guard.
      case 'matrix': return holdsMatrixRole(this.session);
      case 'mastodon': return holdsMastodonRole(this.session);
      case 'forum': return canUseForum(this.session);
    }
  }
}
