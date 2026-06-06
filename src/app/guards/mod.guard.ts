import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../session.service';

/** Gate the /mod entry on the Casdoor moderator role (roles includes 'mod').
 *  NOTE: /mod is a guarded PLACEHOLDER — the real snapdragon-mod-ui remote does
 *  not exist yet, so this guard protects a TODO landing rather than a federated
 *  mount. Non-moderators are sent to /login. */
export const modGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  if (session.isMod()) return true;
  return router.parseUrl('/login');
};
