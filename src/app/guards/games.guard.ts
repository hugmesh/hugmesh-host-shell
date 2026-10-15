import { CanActivateFn } from '@angular/router';
import { roleGuard } from './role-guard.factory';

/** Gate the GAMES entry-point mount (Phase 8, route 'games') on the games access
 *  tier. Built from roleGuard like every other console mount, so the two failures
 *  get their two destinations: an ANONYMOUS visitor is sent to /login, and a
 *  SIGNED-IN caller who lacks the role lands on /home?denied=/games, where
 *  denied-notice explains the refusal. (Issue #88: this guard used to answer both
 *  with /login, telling a signed-in moderator they were signed out.)
 *
 *  GAMES entry-point cascade: a plain ROLE_GAMES member reaches the entry point
 *  (this is the ENTRY-POINT gate ONLY — it does NOT admit games ADMIN, see
 *  {@link gamesAdminGuard} for that separate, narrower gate), plus an ADMIN or
 *  SUPERADMIN always reaches it (management/oversight), matching the
 *  wiki/tube/owncast "admin/superadmin always reach the console" precedent. A
 *  bare MOD without ROLE_GAMES is NOT admitted.
 *
 *  This is defense-in-depth only: the fe-gateway + games-namespace route-access
 *  rows are the real authorization; this guard keeps the unauthorized out of the
 *  host shell's games mount. */
export const gamesGuard: CanActivateFn = roleGuard(
  (session) => session.isGames() || session.isAdmin() || session.isSuperadmin(),
);
