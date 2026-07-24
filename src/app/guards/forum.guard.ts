import { CanActivateFn } from '@angular/router';
import { roleGuard } from './role-guard.factory';

/** Gate the FORUM micro-frontend (the hugmesh-forum-ui remote mounted at
 *  /social/forum, exposing ./routes -> FORUM_ROUTES) on any AUTHENTICATED
 *  identity. Mirrors the other federation route guards: allow vs the exact
 *  /login redirect (a UrlTree).
 *
 *  UNLIKE the sibling social remotes (matrix/mastodon, which are gated on the
 *  registeredGuard because registration is what mints their per-service tokens),
 *  the forum uses OUR native federated identity directly — a forum post embeds
 *  our own user-profile fragment (see forum-ui forum.routes.ts `profile/:subject`),
 *  so there is no separate per-service registration to complete. This EXACTLY
 *  matches the home-services 'forum' launcher card, which carries a `slug` (for
 *  the install-state greying) but NO `requiresRegistration` and NO `requiresRole`:
 *  the card renders 'enabled' for any signed-in user. Keeping this guard to the
 *  same "authenticated only" predicate is what makes the card a live link rather
 *  than a dead one (the shell's grey-and-explain / never-a-dead-link contract):
 *  a registration or role gate here would bounce a user the card told was ready.
 *
 *  This is defense-in-depth only: the fe-gateway + admin-bff route-access rows
 *  (/social/forum/** and /bff/forum/**) are the real authorization; this guard
 *  keeps anonymous visitors out of the remote's UI shell and into /login. */
export const forumGuard: CanActivateFn = roleGuard((session) => session.isUser());
