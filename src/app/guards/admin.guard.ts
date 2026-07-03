import { CanActivateFn } from '@angular/router';
import { roleGuard } from './role-guard.factory';

/** Gate the admin micro-frontend on the Casdoor admin role (roles includes
 *  'admin'). Anyone else is bounced to /login. */
export const adminGuard: CanActivateFn = roleGuard((session) => session.isAdmin());
