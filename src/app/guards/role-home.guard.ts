import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../session.service';

/** The AUTHGATE + home resolver for the default ('') route. There is no
 *  standalone content at '': the host's home is a FEDERATED REMOTE, so '' is a
 *  pure redirect.
 *
 *   - anonymous            -> /login        (unauthenticated users get the login flow)
 *   - suspended / banned   -> /login/appeal (the appeal short-circuit, BEFORE the
 *                                            home redirect — see below)
 *   - signed in            -> /user         (hugmesh-user-ui — the MEMBER home,
 *                                            for every role)
 *
 * ADMIN/MOD ARE NOT THE HOME PAGE (operator requirement, issue #19). This guard
 * used to map the session's highest role to a role-home (admin -> /admin,
 * mod -> /mod), which made the ADMINISTRATION CONSOLE the landing page for
 * every admin — 'Home' in the menubar led an operator to the moderation
 * tooling instead of the platform they run. Everyone now lands on the member
 * home (/user); the consoles stay one deliberate click away in the menubar
 * (nav-admin / nav-mod) and the profile dropdown, both gated on the same
 * isAdmin()/isMod() predicates as their guards. userGuard admits ANY
 * authenticated identity (session.isUser() === loggedIn()), so this redirect
 * can never bounce a role-holder.
 *
 * session.role() is still read — as the AUTHGATE ONLY (null === anonymous);
 * which role it is no longer picks the destination.
 *
 * SUSPENDED/BANNED SHORT-CIRCUIT: the prerequisites the old deferral waited on
 * have all shipped — the admin-bff emits `status` on `/bff/login` and `/bff/me`,
 * the permitAll appeal-contact resolver exists (`GET /bff/public/appeal-contact`)
 * and the login-ui `appeal` child route + AppealComponent render at
 * `/login/appeal` (with an optional `?reason=<text>` announced role=alert). The
 * host syncs the authoritative `/bff/me` status into SnapSession.status
 * (AccountStatusService), so a curtailed principal is routed to the appeal page
 * INSTEAD of a home that would only dead-end on gateway 403s. Reads the
 * synchronous session signal only (no HTTP here); an absent status is 'active'
 * (fail-open), so older session writers keep their exact pre-guard behaviour. */
export const roleHomeGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  if (!session.role()) return router.parseUrl('/login');
  if (session.curtailed()) return router.parseUrl('/login/appeal');
  return router.parseUrl('/user');
};
