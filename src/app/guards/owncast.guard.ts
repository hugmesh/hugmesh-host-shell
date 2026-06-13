import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../session.service';

/** Gate the OWNCAST management micro-frontend (the snapdragon-owncast-ui remote
 *  mounted at /owncast, exposing ./routes) on the Owncast access tier. Mirrors the
 *  wiki/tube guards: allow vs the exact /login redirect (a UrlTree).
 *
 *  OWNCAST access cascade (sibling of ROLE_WIKI/ROLE_TUBE/ROLE_FORUM): an ADMIN or
 *  SUPERADMIN always reaches the Owncast console (for per-domain grant management,
 *  quota, and stream config); a streamer with ROLE_OWNCAST can reach their own
 *  stream console (visibility toggle, stream status). A MOD with ROLE_OWNCAST can
 *  access the moderation view. A user without ROLE_OWNCAST is bounced to /login.
 *
 *  This is defense-in-depth only: the BFF + gateway route-access rows
 *  (/bff/owncast/** → ROLE_OWNCAST, /bff/owncast/admin/** → ADMIN|SUPERADMIN) are
 *  the real authorization; this guard keeps the unauthorized out of the remote's UI
 *  shell before a round-trip to the BFF. */
export const owncastGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  if (session.isAdmin() || session.isSuperadmin() || session.hasRole('OWNCAST')) {
    return true;
  }
  return router.parseUrl('/login');
};
