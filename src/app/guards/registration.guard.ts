import { CanActivateFn } from '@angular/router';
import { roleGuard } from './role-guard.factory';

/** Gate the Matrix/Mastodon micro-frontends: usable only after the user has
 *  fully completed registration through the login/registration remote (which
 *  mints the per-service tokens). Otherwise send them to /login to finish. */
export const registeredGuard: CanActivateFn = roleGuard((session) => session.fullyRegistered());
