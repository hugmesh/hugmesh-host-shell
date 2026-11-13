import { RoleGuardFn, roleGuard } from './role-guard.factory';

/** Gate the admin micro-frontend (and the /admin/docs API-docs console) on the
 *  admin-console tier: an admin OR a superadmin (SessionService.isAdminTier — the
 *  same pair admin-bff admits on /bff/admin/**). A pure superadmin used to be
 *  bounced here because this read the literal 'admin' role only. Anyone else is
 *  sent to the denied landing (signed in) or /login (signed out). */
export const adminGuard: RoleGuardFn = roleGuard((session) => session.isAdminTier());
