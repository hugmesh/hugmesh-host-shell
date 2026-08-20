import { environment } from '../../environments/environment';

/**
 * DYNAMIC-FIRST + STATIC-FALLBACK manifest resolution for the native-federation
 * HOST bootstrap (main.ts).
 *
 * THE PROBLEM. The host used to feed native-federation a BUNDLED static asset
 * (`assets/federation.manifest.json` / `.prod.json`) — every remote's
 * remoteEntry.json URL baked into the build. New / disabled / kill-switched
 * remotes needed a host redeploy. The DB-driven endpoint
 * `GET /api/federation/manifest` (federation-api, `federation_modules` table)
 * makes the manifest a runtime read instead.
 *
 * WHY THIS RUNS PRE-DI (raw fetch, not HttpClient). `initFederation(...)` MUST
 * resolve every remoteEntry BEFORE `bootstrapApplication`, so this code runs
 * before Angular's DI exists — the bearerInterceptor / HttpClient / SessionService
 * are not available yet. We therefore re-create the interceptor's seam by hand:
 *   - `credentials: 'include'` ALWAYS (same-origin session cookie, dev proxy + prod
 *     gateway alike), mirroring `bearerInterceptor`'s `withCredentials: true`. The
 *     gateway's BffCookieToBearerWebFilter exchanges the `bff_` cookie for the
 *     upstream bearer SERVER-SIDE, so an ALREADY-AUTHENTICATED full reload gets its
 *     role/visibility-scoped manifest from the cookie alone, while a logged-out
 *     first load (no cookie) fetches anonymously. The browser never holds a bearer.
 *
 * THE AUTH-TIMING NUANCE (load-bearing). `GET /api/federation/manifest` is
 * `authenticated()` server-side (SecurityConfig), NOT public — an ANONYMOUS
 * pre-login caller gets 401. That is FINE and is exactly why the static fallback
 * exists: on a 401 (or any network/5xx/parse/empty failure) we hand
 * `initFederation` the BUNDLED static manifest URL string instead, so the shell
 * ALWAYS boots (never a white screen).
 *
 * THE STATIC FLOOR (union, not replace). On dynamic SUCCESS we do NOT simply
 * return the dynamic remotes — we return the UNION of the bundled static manifest
 * (the build-time FLOOR, every baked remote) and the dynamic overlay, with the
 * dynamic overlay OVERRIDING matching slugs and ADDING new ones. This guarantees a
 * successful DB read is never strictly worse than the static build: even while the
 * `federation_modules` seed is incomplete (today it omits mod/user/matrix/mastodon/
 * apidocs), those remotes always resolve from the floor, AND the DB can still ADD
 * remotes (e.g. a future wiki) without a host redeploy. Role gating is done by the
 * per-route GUARDS (adminGuard/modGuard/userGuard) + BFF authz, NOT by manifest
 * presence — so unioning the public entry-URL map is not an authz weakening, and a
 * one-shot bootstrap fetch is sufficient (no post-login re-init needed to resolve
 * role-gated remotes). The ONLY thing an authenticated reload additionally adds via
 * the bearer is the domain/visibility-scoped DB overlay (e.g. `visibility=internal`
 * rows like admin).
 *
 * The returned shape is the in-memory `Record<remoteName, remoteEntryUrl>` that
 * `initFederation(remotesOrManifestUrl)` accepts directly (it also accepts a URL
 * string, which is the fallback path).
 */

/** A single remote row as returned by federation-api's manifest endpoint. */
export interface DynamicRemote {
  readonly slug: string;
  readonly remoteEntryUrl: string;
  // Other fields (displayName, kind, version, contentHash, visibility, metadata,
  // exposedModule) are present on the wire but irrelevant to initFederation, which
  // only needs name -> remoteEntry URL. Kept loose so a schema add never breaks us.
  readonly [k: string]: unknown;
}

/** Wire shape of `GET /api/federation/manifest`: {generatedAt, remotes[]}. */
export interface DynamicManifestResponse {
  readonly generatedAt?: string;
  readonly remotes?: readonly DynamicRemote[];
}

/** The flat `{ remoteName: remoteEntryUrl }` map native-federation consumes. */
export type RemotesMap = Record<string, string>;

/** Composed dynamic endpoint (same base convention as CAPABILITIES_ENDPOINT). */
export const FEDERATION_MANIFEST_URL =
  `${environment.federationApiBase}${environment.federationManifestUrl}`;

/**
 * True iff THIS BROWSER could actually fetch `url`: a relative path (served
 * through the same front door as the shell) or an absolute URL on the page's own
 * origin. The `federation_modules` seed stores CLUSTER-shaped absolute URLs for
 * the remote-shell rows (`http://admin:8080/remoteEntry.json`,
 * `http://hugmesh-matrix-ui:8080/...`) — in-mesh service addresses that no
 * browser can resolve. Before this guard, a successful authenticated manifest
 * read let those rows OVERRIDE the static floor's working relative URLs, so
 * `loadRemoteModule('admin')` dialed a nonexistent host and the admin view
 * never mounted — the overlay made the boot STRICTLY WORSE than the floor,
 * which is exactly the invariant the union exists to prevent. Latent until the
 * gateway's cookie->JWT exchange went live (before that, the shell's cookie
 * fetch always 401'd at federation-api and the floor served alone).
 *
 * Outside a browser (unit tests / SSR: no window) only relative URLs are
 * accepted — deterministic, and the strictest reading of "reachable".
 */
export function isBrowserReachable(url: string): boolean {
  if (url.startsWith('/')) return true;
  const origin = typeof window !== 'undefined' ? window.location?.origin : undefined;
  if (!origin) return false;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false; // unparseable — never hand it to initFederation
  }
}

/**
 * Map the DB manifest's `remotes[]` to the `{ name: remoteEntryUrl }` shape
 * initFederation wants. Drops rows missing a slug or remoteEntryUrl (a malformed
 * row never poisons the map) AND rows whose URL this browser could not fetch
 * (see {@link isBrowserReachable} — a cluster-internal URL must not override the
 * floor's working one). Returns null when there is NOTHING usable (no remotes /
 * all rows malformed) so the caller treats it as a failure and falls back to the
 * static manifest rather than booting DARK with zero remotes.
 */
export function toRemotesMap(body: DynamicManifestResponse | null): RemotesMap | null {
  const remotes = body?.remotes;
  if (!Array.isArray(remotes) || remotes.length === 0) return null;
  const map: RemotesMap = {};
  for (const r of remotes) {
    if (r && typeof r.slug === 'string' && typeof r.remoteEntryUrl === 'string'
        && r.slug.length > 0 && r.remoteEntryUrl.length > 0
        && isBrowserReachable(r.remoteEntryUrl)) {
      map[r.slug] = r.remoteEntryUrl;
    }
  }
  return Object.keys(map).length > 0 ? map : null;
}

/**
 * Fetch the DYNAMIC manifest and return the remotes map, or null on ANY failure
 * (network error, non-2xx incl. the 401 an anonymous caller gets, non-JSON,
 * empty/malformed body). NEVER throws — the caller falls back to the static
 * manifest on null. Carries the session cookie always (mirrors bearerInterceptor's
 * `withCredentials: true`, by hand, pre-DI); the gateway exchanges that cookie for
 * the upstream bearer server-side, so an authenticated reload gets its scoped
 * manifest and a logged-out load fetches anonymously.
 *
 * `fetchImpl` is injectable so the unit test drives it without a real network.
 */
export async function fetchDynamicRemotes(
  fetchImpl: typeof fetch = typeof fetch !== 'undefined' ? fetch : (undefined as unknown as typeof fetch),
): Promise<RemotesMap | null> {
  if (!fetchImpl) return null;
  try {
    const res = await fetchImpl(FEDERATION_MANIFEST_URL, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res || !res.ok) return null; // 401 (anonymous), 5xx, etc. -> fall back
    const body = (await res.json()) as DynamicManifestResponse;
    return toRemotesMap(body);
  } catch {
    return null; // network / parse failure -> fall back to the static manifest
  }
}

/**
 * Resolve what to hand `initFederation`.
 *
 * ON DYNAMIC SUCCESS: the UNION of the bundled static FLOOR and the dynamic
 * overlay — `{ ...staticFloor, ...dynamic }`. The static floor (every remote baked
 * at build) is therefore ALWAYS present; the dynamic overlay OVERRIDES the URL for
 * any matching slug and ADDS brand-/DB-only slugs (e.g. a future `wiki`). This
 * guarantees a successful DB read is NEVER strictly worse than the static build —
 * if the federation_modules seed is incomplete (today it omits mod/user/matrix/
 * mastodon/apidocs) those remotes still resolve from the floor, while the DB can
 * still ADD remotes without a host redeploy. Unioning entry URLs is not an authz
 * weakening: the manifest only maps name -> public bundle URL, and route guards +
 * BFF authz do all gating — this matches the prior static-for-everyone behavior.
 *
 * ON DYNAMIC FAILURE (401 anonymous / 5xx / network / parse / empty): the BUNDLED
 * static manifest URL string (which initFederation fetches itself) — UNCHANGED
 * fallback so the shell ALWAYS boots. Both returns are valid initFederation
 * arguments (object | url-string). Pure resolution — does not call initFederation,
 * so it is trivially testable.
 */
export async function resolveFederationSource(
  fetchImpl?: typeof fetch,
): Promise<RemotesMap | string> {
  const dynamic = await fetchDynamicRemotes(fetchImpl);
  if (dynamic) {
    // Static floor UNION dynamic overlay: floor first, dynamic overrides/adds.
    return { ...environment.federationStaticManifest, ...dynamic };
  }
  // Fallback: the bundled static asset path (dev json / file-replaced prod json).
  return environment.federationManifest;
}
