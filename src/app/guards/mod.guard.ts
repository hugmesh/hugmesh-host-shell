import { CanActivateFn } from '@angular/router';
import { roleGuard } from './role-guard.factory';

/** Gate the /mod role-home on the Casdoor moderator role (roles includes 'mod').
 *  /mod mounts the snapdragon-mod-ui remote (MOD_ROUTES) via loadRemoteModule.
 *  Non-moderators are sent to /login. */
export const modGuard: CanActivateFn = roleGuard((session) => session.isMod());
