import { RoleGuardFn, roleGuard } from './role-guard.factory';
import { canUseForum } from './social-access';

/** Gate the FORUM micro-frontend (the hugmesh-forum-ui remote mounted at
 *  /social/forum, exposing ./routes -> FORUM_ROUTES) on {@link canUseForum}:
 *  ROLE_FORUM, or an admin / superadmin — the gateway's /social/forum/** row plus
 *  its admin bypasses.
 *
 *  It used to admit ANY signed-in identity, on the reasoning that the forum reuses
 *  the native identity and needs no per-service registration. That part is true,
 *  and there is still no registration term. But the gateway has always required
 *  ROLE_FORUM on /social/forum/**, so for everyone else the guard passed, the shell
 *  fetched /social/forum/remoteEntry.json, the gateway answered 403, native
 *  federation threw, and the navigation died: clicking the Forum card left the user
 *  on /user with nothing but an NFError in the console. Refusing here instead sends
 *  them to /home?denied=/social/forum, where the denied notice explains it, and the
 *  canMatch half means the remoteEntry is never requested.
 *
 *  Defence-in-depth only: the fe-gateway + admin-bff route-access rows
 *  (/social/forum/** and /bff/forum/**) are the real authorization. */
export const forumGuard: RoleGuardFn = roleGuard((session) => canUseForum(session));
