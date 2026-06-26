import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Attaches the HttpOnly session cookie to outbound HttpClient requests, so the
 * host's typed/HttpClient calls match the raw-fetch convention the rest of the
 * platform uses (`credentials: 'include'`):
 *
 *  - `withCredentials: true` ALWAYS — the id-gateway routes `/bff/*` and `/api/*`
 *    with the session cookie, so same-origin relative calls carry it in dev + prod.
 *    The gateway's BffCookieToBearerWebFilter exchanges that `bff_` cookie for the
 *    upstream bearer SERVER-SIDE, so the browser never holds (nor sends) a bearer.
 *
 * PUBLIC reads (e.g. GET /api/federation/capabilities, permitAll) work for an
 * anonymous host because no cookie is present — the cookie carries auth when one
 * exists and is simply absent otherwise. This is the single credentials seam for
 * the host; the legacy raw-fetch services (announcements) keep their own
 * `credentials: 'include'` and are untouched.
 */
export const bearerInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req.clone({ withCredentials: true }));
};
