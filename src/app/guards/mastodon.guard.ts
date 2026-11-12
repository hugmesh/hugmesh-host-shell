import { RoleGuardFn, roleGuard } from './role-guard.factory';
import { canUseMastodon } from './social-access';

/** Gate the MASTODON micro-frontend (hugmesh-mastodon-ui, mounted at
 *  /social/mastodon) on {@link canUseMastodon}: fully registered AND
 *  ROLE_MASTODON — the user-bff hsproxy's own rule. Same history and same two
 *  refusal destinations as matrixGuard. */
export const mastodonGuard: RoleGuardFn = roleGuard((session) => canUseMastodon(session));
