import { RoleGuardFn, roleGuard } from './role-guard.factory';

/** Gate the /mod role-home on the Casdoor moderator role (roles includes 'mod').
 *  /mod mounts the hugmesh-mod-ui remote (MOD_ROUTES) via loadRemoteModule.
 *  Non-moderators are sent to /login. */
export const modGuard: RoleGuardFn = roleGuard((session) => session.isMod());
