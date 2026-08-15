import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../session.service';

/** Where an AUTHENTICATED user who lacks the role is sent. Not /login — see below. */
export const DENIED_PATH = '/home';

/** Shared shape behind every federation route guard (admin/mod/user/registration/
 *  wiki/tube/owncast): inject the session + router, evaluate a per-guard access
 *  predicate against the SessionService, and either allow navigation or redirect.
 *  Only the predicate varies between guards, so factoring it out here keeps the
 *  authorization rule as the only thing a new guard needs to define.
 *
 *  TWO FAILURES, TWO DESTINATIONS — they are not the same thing and must not share
 *  an answer:
 *
 *    NOT SIGNED IN      -> /login. Correct: there is a credential to supply.
 *    SIGNED IN, no role -> DENIED_PATH, with ?denied=<attempted path>.
 *
 *  Sending the second case to /login was a real defect (operator report 2026-08-14:
 *  "moderation menu option just redirects to login"). It tells a user who just
 *  signed in that they are not signed in, which reads as the mesh being broken
 *  rather than as a permissions boundary — and since login then bounces them back to
 *  where they were, it looks like a loop. It also actively hid the real fault: the
 *  operator's Casdoor role membership had been stripped by a plain `make stack-seed`
 *  (see the operator-account notes), and the login redirect made an AUTHORIZATION
 *  problem present as a SESSION problem, which is where the diagnosis went wrong.
 *
 *  The attempted path rides along as ?denied= so the landing page can say WHICH
 *  console was refused instead of silently dropping the user somewhere else.
 *
 *  This is defense-in-depth only: the BFF + gateway route-access rows are the
 *  real authorization; guards built from this factory just keep the unauthorized
 *  out of the remote's UI shell before a round-trip to the BFF. A guard that PASSES
 *  is not a promise the gateway will agree — the two read different sources (the
 *  admin-bff account record vs Casdoor role membership), and when they disagree the
 *  gateway wins with a 403. */
export function roleGuard(predicate: (session: SessionService) => boolean): CanActivateFn {
  return (_route, state) => {
    const session = inject(SessionService);
    const router = inject(Router);
    if (predicate(session)) return true;
    if (session.session() === null) return router.parseUrl('/login');
    return router.createUrlTree([DENIED_PATH], {
      queryParams: { denied: state.url },
    });
  };
}
