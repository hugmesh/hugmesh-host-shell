import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../session.service';

/** Gate the GAMES entry-point mount (Phase 8, route 'games') on the games access
 *  tier. Mirrors the wiki/tube/owncast guards: allow vs the exact /login redirect
 *  (a UrlTree).
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
export const gamesGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  if (session.isGames() || session.isAdmin() || session.isSuperadmin()) {
    return true;
  }
  return router.parseUrl('/login');
};
