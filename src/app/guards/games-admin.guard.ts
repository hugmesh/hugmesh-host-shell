import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../session.service';

/** Gate the GAMES-ADMIN mount (Phase 8/10, route 'games/admin') on the DERIVED
 *  ROLE_GAMES_ADMIN tier. Mirrors the wiki/tube/owncast guards: allow vs the
 *  exact /login redirect (a UrlTree).
 *
 *  GAMES-ADMIN cascade: {@link SessionService.isGamesAdmin} already encodes the
 *  server-computed intersection ROLE_GAMES ∩ (ROLE_ADMIN ∪ ROLE_MOD) — a bare
 *  ROLE_GAMES (e2e-gamesonly) or a bare ROLE_ADMIN (e2e-adminonly) does NOT earn
 *  it. SUPERADMIN is additionally admitted unconditionally, matching the
 *  wiki/tube/owncast "superadmin manages ALL" precedent.
 *
 *  This is defense-in-depth only: the games-admin-sync-job + the fe/be-gateway
 *  route-access rows (/games/admin/**, /games/api/admin/**) are the real
 *  authorization; this guard keeps the unauthorized out of the host shell's
 *  games-admin mount so it is never a dead link for a holder, nor reachable by a
 *  non-holder. */
export const gamesAdminGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  if (session.isGamesAdmin() || session.isSuperadmin()) {
    return true;
  }
  return router.parseUrl('/login');
};
