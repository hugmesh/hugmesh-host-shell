import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';

import { SessionService } from '../session.service';

/**
 * Attaches the shared-session credentials to outbound HttpClient requests, so the
 * host's typed/HttpClient calls match the raw-fetch convention the rest of the
 * platform uses (`credentials: 'include'` + a Bearer `bffToken` when signed in):
 *
 *  - `withCredentials: true` ALWAYS — the id-gateway routes `/bff/*` and `/api/*`
 *    with the session cookie, so same-origin relative calls carry it in dev + prod.
 *  - `Authorization: Bearer <bffToken>` ONLY when a session holds one AND the
 *    request doesn't already set Authorization — never clobber an explicit header,
 *    and never send an empty Bearer for an anonymous caller.
 *
 * PUBLIC reads (e.g. GET /api/federation/capabilities, permitAll) work for an
 * anonymous host precisely because the Bearer is OMITTED when there's no session —
 * the interceptor adds auth opportunistically, it never REQUIRES it. This is the
 * single Bearer/credentials seam for the host; the legacy raw-fetch services
 * (announcements) keep their own `credentials: 'include'` and are untouched.
 */
export const bearerInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);
  const token = session.session()?.bffToken;

  const withCreds = req.clone({ withCredentials: true });
  if (token && !withCreds.headers.has('Authorization')) {
    return next(withCreds.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  }
  return next(withCreds);
};
