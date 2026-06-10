import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../session.service';

/** Gate the USER role-home (the snapdragon-user-ui remote mounted at /user).
 *  Every authenticated identity is a ROLE_USER, so this only blocks anonymous
 *  visitors — they are bounced to /login to sign in first. */
export const userGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  if (session.isUser()) return true;
  return router.parseUrl('/login');
};
