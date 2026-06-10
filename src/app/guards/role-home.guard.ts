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
  return router.parseUrl(`/${role}`);
};
