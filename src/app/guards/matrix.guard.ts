import { RoleGuardFn, roleGuard } from './role-guard.factory';
import { canUseMatrix } from './social-access';

/** Gate the MATRIX micro-frontend (hugmesh-matrix-ui, mounted at /social/matrix)
 *  on {@link canUseMatrix}: fully registered AND ROLE_MATRIX — the user-bff
 *  hsproxy's own rule. This used to be registeredGuard alone, which mounted the
 *  remote for every registered identity, including the admin, mod and superadmin
 *  the hsproxy refuses; the remote then booted into a page of 403s. Signed in
 *  without access -> /home?denied=/social/matrix; signed out -> /login (the
 *  roleGuard factory's two destinations). Because the guard also runs as
 *  canMatch, a refused session never fetches the remote's remoteEntry.json. */
export const matrixGuard: RoleGuardFn = roleGuard((session) => canUseMatrix(session));
