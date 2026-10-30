import { RoleGuardFn, roleGuard } from './role-guard.factory';

/** Gate the admin micro-frontend on the Casdoor admin role (roles includes
 *  'admin'). Anyone else is bounced to /login. */
export const adminGuard: RoleGuardFn = roleGuard((session) => session.isAdmin());
