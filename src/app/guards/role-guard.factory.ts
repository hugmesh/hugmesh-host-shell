import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router, RouterStateSnapshot, UrlSegment } from '@angular/router';
import { SessionService } from '../session.service';

/** Where an AUTHENTICATED user who lacks the role is sent. Not /login — see below. */
export const DENIED_PATH = '/home';

/** A guard built by {@link roleGuard}: ONE predicate, usable as BOTH a
 *  `canActivate` and a `canMatch` guard. See "WHY canMatch TOO" below. */
export type RoleGuardFn = CanActivateFn & CanMatchFn;

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
 *  gateway wins with a 403.
 *
 *  WHY canMatch TOO (issue #93, D2 2026-10-29). Every federated mount is
 *  `{ path, canActivate, loadChildren: loadRemoteModule(...) }`, and the router
 *  resolves `loadChildren` during route RECOGNITION, which is BEFORE `canActivate`
 *  runs. So for a signed-in user without the role, an in-app navigation to /games
 *  (or /tube, /owncast, ...) first fetched the remote's remoteEntry.json; the
 *  gateway answered 403, native-federation threw, the navigation errored out, and
 *  this guard never got to send the user to /home?denied=<path>. They stayed where
 *  they were with nothing but NFErrors in the console. `canMatch` runs during
 *  recognition BEFORE `loadChildren`, and a UrlTree returned from it redirects
 *  without the remote ever being requested. `remoteRoute()` (app.routes.ts) puts
 *  the same guard on both hooks.
 *
 *  The two call shapes are told apart by their second argument: canActivate gets
 *  `(snapshot, RouterStateSnapshot)`, canMatch gets `(route, UrlSegment[], partial)`.
 *
 *  NEVER return `false` from the canMatch side: `false` means "this route does not
 *  match, try the next one", which falls through to `**` -> '' -> roleHomeGuard
 *  -> /user, a silent redirect that is exactly the defect being fixed. Both
 *  refusals below are UrlTrees. */
export function roleGuard(predicate: (session: SessionService) => boolean): RoleGuardFn {
  const guard = (_route: unknown, stateOrSegments: RouterStateSnapshot | UrlSegment[]) => {
    const session = inject(SessionService);
    const router = inject(Router);
    if (predicate(session)) return true;
    if (session.session() === null) return router.parseUrl('/login');
    return router.createUrlTree([DENIED_PATH], {
      queryParams: { denied: attemptedUrl(router, stateOrSegments) },
    });
  };
  return guard as RoleGuardFn;
}

/** The URL the refused navigation was heading for, as `state.url` would spell it
 *  (path + query). On the canMatch side there is no RouterStateSnapshot yet, so it
 *  comes from the in-flight navigation; the matched segments are the fallback for a
 *  guard called outside a navigation (every remote mount is top-level, so its
 *  segments are the whole path). */
function attemptedUrl(router: Router, stateOrSegments: RouterStateSnapshot | UrlSegment[]): string {
  if (!Array.isArray(stateOrSegments)) return stateOrSegments.url;
  const nav = router.currentNavigation();
  if (nav) return router.serializeUrl(nav.extractedUrl);
  return '/' + stateOrSegments.map((s) => s.path).join('/');
}
