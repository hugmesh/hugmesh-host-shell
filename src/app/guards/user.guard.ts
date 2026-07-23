import { CanActivateFn } from '@angular/router';
import { roleGuard } from './role-guard.factory';

/** Gate the USER role-home (the hugmesh-user-ui remote mounted at /user).
 *  Every authenticated identity is a ROLE_USER, so this only blocks anonymous
 *  visitors — they are bounced to /login to sign in first. */
export const userGuard: CanActivateFn = roleGuard((session) => session.isUser());
