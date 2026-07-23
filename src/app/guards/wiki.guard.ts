import { CanActivateFn } from '@angular/router';
import { roleGuard } from './role-guard.factory';

/** Gate the WIKI management micro-frontend (the hugmesh-wiki-ui remote mounted
 *  at /wiki, exposing ./Wiki) on the wiki access tier. Mirrors the other federation
 *  route guards (admin/mod/user): allow vs the exact /login redirect (a UrlTree).
 *
 *  WIKI access cascade (design PR6, sibling of ROLE_FORUM): an ADMIN or SUPERADMIN
 *  always reaches the wiki console; a MOD reaches it ONLY when additionally granted
 *  the per-service ROLE_WIKI (hasRole('WIKI')) — the cascade alone (a bare mod) does
 *  NOT admit them. A plain user is bounced to /login like the other role consoles.
 *  This is defense-in-depth only: the BFF + gateway route-access rows
 *  (/bff/wiki/** -> ROLE_WIKI) are the real authorization; this guard keeps the
 *  unauthorized out of the remote's UI. */
export const wikiGuard: CanActivateFn = roleGuard(
  (session) => session.isAdmin() || session.isSuperadmin() || (session.isMod() && session.hasRole('WIKI')),
);
