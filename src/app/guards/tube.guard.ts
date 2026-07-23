import { CanActivateFn } from '@angular/router';
import { roleGuard } from './role-guard.factory';

/** Gate the TUBE management micro-frontend (the hugmesh-tube-ui remote mounted
 *  at /tube, exposing ./routes) on the tube access tier. Mirrors the wiki/owncast
 *  guards: allow vs the exact /login redirect (a UrlTree).
 *
 *  TUBE access cascade (sibling of ROLE_WIKI/ROLE_OWNCAST/ROLE_FORUM): an ADMIN or
 *  SUPERADMIN always reaches the tube console (for per-domain quota/retention
 *  management); a plain user with ROLE_TUBE can also reach it (connect Google, browse
 *  subscriptions, view downloads). A MOD without ROLE_TUBE is NOT admitted — the
 *  mod-side tube surface lives in mod-bff (tube.* ModActionTypes), not this remote.
 *
 *  This is defense-in-depth only: the BFF + gateway route-access rows
 *  (/bff/tube/** → ROLE_TUBE, /bff/tube/admin/** → ADMIN|SUPERADMIN) are the real
 *  authorization; this guard keeps the unauthorized out of the remote's UI shell. */
export const tubeGuard: CanActivateFn = roleGuard(
  (session) => session.isAdmin() || session.isSuperadmin() || session.hasRole('TUBE'),
);
