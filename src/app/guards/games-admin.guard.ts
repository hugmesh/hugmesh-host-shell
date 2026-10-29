import { RoleGuardFn, roleGuard } from './role-guard.factory';

/** Gate the GAMES-ADMIN mount (Phase 8/10, route 'games/admin') on the DERIVED
 *  ROLE_GAMES_ADMIN tier. Built from roleGuard like every other console mount,
 *  so the two failures get their two destinations: an ANONYMOUS visitor is sent
 *  to /login, and a SIGNED-IN caller who lacks the derived role lands on
 *  /home?denied=/games/admin, where denied-notice explains the refusal. (Issue
 *  #88: this guard used to answer both with /login, telling a signed-in admin
 *  without games — or a games member without admin — that they were signed out.)
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
export const gamesAdminGuard: RoleGuardFn = roleGuard(
  (session) => session.isGamesAdmin() || session.isSuperadmin(),
);
