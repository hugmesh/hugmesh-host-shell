import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../session.service';

/** The AUTHGATE + role-home resolver for the default ('') route. There is no
 *  standalone content at '': the host's home is the FEDERATED REMOTE for the
 *  signed-in user's role, so '' is a pure redirect.
 *
 *   - anonymous           -> /login  (unauthenticated users get the login flow)
 *   - admin               -> /admin  (snapdragon-admin-ui remote)
 *   - mod                 -> /mod    (snapdragon-mod-ui   remote)
 *   - user (the default)  -> /user   (snapdragon-user-ui  remote)
 *
 * Role precedence (admin > mod > user) lives in SessionService.role(); this guard
 * just maps that to the matching role-home path. Returning a UrlTree performs the
 * redirect, so the user never lands on a bare '' with no content. */
export const roleHomeGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  const role = session.role();
  if (!role) return router.parseUrl('/login');

  // TODO (DEFERRED — backend-gated, do NOT implement until the token carries status):
  //   The appeal-on-login SUSPENDED-GUARD belongs HERE: a suspended principal would
  //   short-circuit to /appeal (a user-remote surface loaded via loadRemoteModule)
  //   BEFORE the role redirect, e.g.
  //       if (session.session()?.status === 'suspended') return router.parseUrl('/appeal');
  //   It is NOT wired because (UI-wave verdicts V2/V3): (a) /bff/login, /bff/me and
  //   the JWT do NOT yet emit a suspend/ban status claim, so session.status is always
  //   absent (=> 'active') and the guard could never fire; and (b) a fully banned
  //   principal is hard-stopped at the gateway (403, no JWT) so there is no reachable
  //   appeal POST — the canonical path is a permitAll GET appeal-contact resolver +
  //   client-side mailto, which does not exist yet. The SnapSession.status field is
  //   already shipped (additive) so enabling this later is a one-line guard + an
  //   /appeal route, with NO cross-tab session-shape change. Do not invent endpoints.
  return router.parseUrl(`/${role}`);
};
