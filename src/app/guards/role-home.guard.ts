import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../session.service';

/** The AUTHGATE + role-home resolver for the default ('') route. There is no
 *  standalone content at '': the host's home is the FEDERATED REMOTE for the
 *  signed-in user's role, so '' is a pure redirect.
 *
 *   - anonymous            -> /login        (unauthenticated users get the login flow)
 *   - suspended / banned   -> /login/appeal (the appeal short-circuit, BEFORE the
 *                                            role redirect — see below)
 *   - admin                -> /admin        (hugmesh-admin-ui remote)
 *   - mod                  -> /mod          (hugmesh-mod-ui   remote)
 *   - user (the default)   -> /user         (hugmesh-user-ui  remote)
 *
 * Role precedence (admin > mod > user) lives in SessionService.role(); this guard
 * just maps that to the matching role-home path. Returning a UrlTree performs the
 * redirect, so the user never lands on a bare '' with no content.
 *
 * SUSPENDED/BANNED SHORT-CIRCUIT: the prerequisites the old deferral waited on
 * have all shipped — the admin-bff emits `status` on `/bff/login` and `/bff/me`,
 * the permitAll appeal-contact resolver exists (`GET /bff/public/appeal-contact`)
 * and the login-ui `appeal` child route + AppealComponent render at
 * `/login/appeal` (with an optional `?reason=<text>` announced role=alert). The
 * host syncs the authoritative `/bff/me` status into SnapSession.status
 * (AccountStatusService), so a curtailed principal is routed to the appeal page
 * INSTEAD of a role-home that would only dead-end on gateway 403s. Reads the
 * synchronous session signal only (no HTTP here); an absent status is 'active'
 * (fail-open), so older session writers keep their exact pre-guard behaviour. */
export const roleHomeGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  const role = session.role();
  if (!role) return router.parseUrl('/login');
  if (session.curtailed()) return router.parseUrl('/login/appeal');
  return router.parseUrl(`/${role}`);
};
