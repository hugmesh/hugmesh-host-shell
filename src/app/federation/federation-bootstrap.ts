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
 *     gateway alike), mirroring `bearerInterceptor`'s `withCredentials: true`; and
 *   - `Authorization: Bearer <bffToken>` ONLY when the canonical `snap.session`
 *     localStorage record (the SAME contract SessionService reads) holds a token —
 *     so an ALREADY-AUTHENTICATED full reload gets its role/visibility-scoped
 *     manifest, while a logged-out first load fetches anonymously.
 *
 * THE AUTH-TIMING NUANCE (load-bearing). `GET /api/federation/manifest` is
 * `authenticated()` server-side (SecurityConfig), NOT public — an ANONYMOUS
 * pre-login caller gets 401. That is FINE and is exactly why the static fallback
 * exists: on a 401 (or any network/5xx/parse/empty failure) we hand
 * `initFederation` the BUNDLED static manifest URL string instead, so the shell
 * ALWAYS boots (never a white screen). The static manifest already lists every
 * remote (login/admin/mod/user/…); role gating is done by the per-route GUARDS
 * (adminGuard/modGuard/userGuard), NOT by manifest presence — so a one-shot
 * bootstrap fetch is sufficient and no post-login manifest re-init is required to
 * resolve role-gated remotes (see README / PR body). The ONLY thing an
 * authenticated reload additionally unlocks is `visibility=internal` remotes, which
 * the bearer carries here.
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

/** Canonical shared-session localStorage key (verbatim from SessionService). */
const SESSION_KEY = 'snap.session';

/**
 * Read the persisted session's bffToken WITHOUT Angular DI (SessionService is not
 * constructed yet at bootstrap). Returns null for anonymous / unparseable / empty,
 * so the caller fetches anonymously — never sends an empty Bearer.
 */
export function bootstrapBearerToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const token = (JSON.parse(raw) as { bffToken?: unknown } | null)?.bffToken;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Map the DB manifest's `remotes[]` to the `{ name: remoteEntryUrl }` shape
 * initFederation wants. Drops rows missing a slug or remoteEntryUrl (a malformed
 * row never poisons the map). Returns null when there is NOTHING usable (no
 * remotes / all rows malformed) so the caller treats it as a failure and falls
 * back to the static manifest rather than booting DARK with zero remotes.
 */
export function toRemotesMap(body: DynamicManifestResponse | null): RemotesMap | null {
  const remotes = body?.remotes;
  if (!Array.isArray(remotes) || remotes.length === 0) return null;
  const map: RemotesMap = {};
  for (const r of remotes) {
    if (r && typeof r.slug === 'string' && typeof r.remoteEntryUrl === 'string'
        && r.slug.length > 0 && r.remoteEntryUrl.length > 0) {
      map[r.slug] = r.remoteEntryUrl;
    }
  }
  return Object.keys(map).length > 0 ? map : null;
}

/**
 * Fetch the DYNAMIC manifest and return the remotes map, or null on ANY failure
 * (network error, non-2xx incl. the 401 an anonymous caller gets, non-JSON,
 * empty/malformed body). NEVER throws — the caller falls back to the static
 * manifest on null. Carries the session cookie always and an opportunistic Bearer
 * when one is persisted (mirrors bearerInterceptor, by hand, pre-DI).
 *
 * `fetchImpl` is injectable so the unit test drives it without a real network.
 */
export async function fetchDynamicRemotes(
  fetchImpl: typeof fetch = typeof fetch !== 'undefined' ? fetch : (undefined as unknown as typeof fetch),
): Promise<RemotesMap | null> {
  if (!fetchImpl) return null;
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = bootstrapBearerToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetchImpl(FEDERATION_MANIFEST_URL, {
      credentials: 'include',
      headers,
    });
    if (!res || !res.ok) return null; // 401 (anonymous), 5xx, etc. -> fall back
    const body = (await res.json()) as DynamicManifestResponse;
    return toRemotesMap(body);
  } catch {
    return null; // network / parse failure -> fall back to the static manifest
  }
}

/**
 * Resolve what to hand `initFederation`: the DYNAMIC remotes map when the DB read
 * succeeds, else the BUNDLED static manifest URL string (which initFederation
 * fetches itself). Both are valid initFederation arguments (object | url-string).
 * Pure resolution — does not call initFederation, so it is trivially testable.
 */
export async function resolveFederationSource(
  fetchImpl?: typeof fetch,
): Promise<RemotesMap | string> {
  const dynamic = await fetchDynamicRemotes(fetchImpl);
  if (dynamic) return dynamic;
  // Fallback: the bundled static asset path (dev json / file-replaced prod json).
  return environment.federationManifest;
}
