import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../session.service';

/** Gate the /mod role-home on the Casdoor moderator role (roles includes 'mod').
 *  /mod mounts the snapdragon-mod-ui remote (MOD_ROUTES) via loadRemoteModule.
 *  Non-moderators are sent to /login. */
export const modGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  if (session.isMod()) return true;
  return router.parseUrl('/login');
};
