import { RoleGuardFn, roleGuard } from './role-guard.factory';

/** Gate a micro-frontend on completed registration alone (the login/registration
 *  remote's stage 2). Used by the character-studio / character-forge mounts, which
 *  the gateway opens to any ROLE_USER and which have no per-service role.
 *
 *  NOT the Matrix/Mastodon gate any more: those need their per-service role as well
 *  (the user-bff hsproxy refuses without it), so they have matrixGuard /
 *  mastodonGuard, built on guards/social-access.ts. Do not tighten this predicate
 *  for them — it would deny the character tools to the users the backend admits. */
export const registeredGuard: RoleGuardFn = roleGuard((session) => session.fullyRegistered());
