import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../session.service';

/** Shared shape behind every federation route guard (admin/mod/user/registration/
 *  wiki/tube/owncast): inject the session + router, evaluate a per-guard access
 *  predicate against the SessionService, and either allow navigation or redirect
 *  to /login (a UrlTree) — the exact /login redirect other guard specs assert
 *  against. Only the predicate varies between guards, so factoring it out here
 *  keeps the authorization rule as the only thing a new guard needs to define.
 *
 *  This is defense-in-depth only: the BFF + gateway route-access rows are the
 *  real authorization; guards built from this factory just keep the unauthorized
 *  out of the remote's UI shell before a round-trip to the BFF. */
export function roleGuard(predicate: (session: SessionService) => boolean): CanActivateFn {
  return () => {
    const session = inject(SessionService);
    const router = inject(Router);
    if (predicate(session)) return true;
    return router.parseUrl('/login');
  };
}
