import { environment } from '../../environments/environment';
import {
  FEDERATION_MANIFEST_URL,
  fetchDynamicRemotes,
  resolveFederationSource,
  toRemotesMap,
} from './federation-bootstrap';

/**
 * DYNAMIC-FIRST + STATIC-FALLBACK manifest bootstrap.
 *
 * These cover the load-bearing contract from the ROADMAP item:
 *  (a) the bootstrap calls the DYNAMIC URL (/api/federation/manifest);
 *  (b) on dynamic failure (incl. the 401 an anonymous caller gets) it FALLS BACK
 *      to the bundled static manifest so the host still boots;
 *  (c) it ALWAYS carries the session cookie (`credentials: 'include'`) and NEVER
 *      attaches a browser bearer — the gateway exchanges the cookie server-side.
 */

/** A federation-api manifest body: {generatedAt, remotes[]}. */
function manifestBody(): unknown {
  return {
    generatedAt: '2026-06-13T00:00:00Z',
    remotes: [
      { slug: 'login', remoteEntryUrl: '/login/remoteEntry.json', kind: 'core', visibility: 'public' },
      { slug: 'admin', remoteEntryUrl: '/admin/remoteEntry.json', kind: 'role', visibility: 'internal' },
    ],
  };
}

/** Minimal Response stub for the injected fetch. */
function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function status(code: number): Response {
  return { ok: false, status: code, json: async () => ({}) } as unknown as Response;
}

describe('federation-bootstrap', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  describe('FEDERATION_MANIFEST_URL', () => {
    it('composes the configured dynamic endpoint from base + path', () => {
      expect(FEDERATION_MANIFEST_URL).toBe(
        `${environment.federationApiBase}${environment.federationManifestUrl}`,
      );
      expect(FEDERATION_MANIFEST_URL).toContain('/api/federation/manifest');
    });
  });

  describe('toRemotesMap — {generatedAt,remotes[]} -> {name:url}', () => {
    it('maps every well-formed remote row to slug -> remoteEntryUrl', () => {
      const map = toRemotesMap(manifestBody() as never);
      expect(map).toEqual({
        login: '/login/remoteEntry.json',
        admin: '/admin/remoteEntry.json',
      });
    });

    it('drops malformed rows but keeps the good ones', () => {
      const map = toRemotesMap({
        remotes: [
          { slug: 'login', remoteEntryUrl: '/login/remoteEntry.json' },
          { slug: 'broken' }, // no url
          { remoteEntryUrl: '/x/remoteEntry.json' }, // no slug
        ],
      } as never);
      expect(map).toEqual({ login: '/login/remoteEntry.json' });
    });

    it('returns null for an empty / missing / all-malformed remotes list', () => {
      expect(toRemotesMap({ remotes: [] } as never)).toBeNull();
      expect(toRemotesMap({} as never)).toBeNull();
      expect(toRemotesMap(null)).toBeNull();
      expect(toRemotesMap({ remotes: [{ slug: 'x' }] } as never)).toBeNull();
    });

    it('drops cluster-internal absolute URLs the browser cannot fetch (they must not override the floor)', () => {
      // The federation_modules seed stores in-mesh service addresses for the
      // remote-shell rows. Live 2026-08-13: a successful authenticated manifest
      // read overrode the floor's working '/admin/remoteEntry.json' with
      // 'http://admin:8080/remoteEntry.json' and the admin view never mounted
      // (e2e specs 02/09). Same-origin absolute URLs stay allowed.
      const map = toRemotesMap({
        remotes: [
          { slug: 'admin', remoteEntryUrl: 'http://admin:8080/remoteEntry.json' },
          { slug: 'matrix', remoteEntryUrl: 'http://hugmesh-matrix-ui:8080/remoteEntry.json' },
          { slug: 'login', remoteEntryUrl: '/login/remoteEntry.json' },
          { slug: 'same-origin', remoteEntryUrl: `${window.location.origin}/so/remoteEntry.json` },
          { slug: 'garbage', remoteEntryUrl: 'http://[not-a-url' },
        ],
      } as never);
      expect(map).toEqual({
        login: '/login/remoteEntry.json',
        'same-origin': `${window.location.origin}/so/remoteEntry.json`,
      });
    });
  });

  describe('fetchDynamicRemotes — (a) calls the dynamic URL, (c) cookie-only auth', () => {
    it('(a) fetches the DYNAMIC manifest URL and returns the mapped remotes', async () => {
      const fetchSpy = jasmine
        .createSpy('fetch')
        .and.resolveTo(okJson(manifestBody()));

      const map = await fetchDynamicRemotes(fetchSpy as unknown as typeof fetch);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.calls.mostRecent().args as [string, RequestInit];
      expect(url).toBe(FEDERATION_MANIFEST_URL);
      expect(init.credentials).toBe('include'); // session cookie always
      expect(map).toEqual({
        login: '/login/remoteEntry.json',
        admin: '/admin/remoteEntry.json',
      });
    });

    it('(c) NEVER attaches Authorization — the bff_ cookie carries auth, gateway exchanges it', async () => {
      const fetchSpy = jasmine.createSpy('fetch').and.resolveTo(okJson(manifestBody()));

      await fetchDynamicRemotes(fetchSpy as unknown as typeof fetch);

      const init = fetchSpy.calls.mostRecent().args[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
      expect(init.credentials).toBe('include'); // cookie always sent
    });

    it('returns null on 401 (the anonymous caller hits an authenticated() endpoint)', async () => {
      const fetchSpy = jasmine.createSpy('fetch').and.resolveTo(status(401));
      expect(await fetchDynamicRemotes(fetchSpy as unknown as typeof fetch)).toBeNull();
    });

    it('returns null on 5xx', async () => {
      const fetchSpy = jasmine.createSpy('fetch').and.resolveTo(status(503));
      expect(await fetchDynamicRemotes(fetchSpy as unknown as typeof fetch)).toBeNull();
    });

    it('returns null on a network rejection (never throws)', async () => {
      const fetchSpy = jasmine.createSpy('fetch').and.rejectWith(new Error('offline'));
      expect(await fetchDynamicRemotes(fetchSpy as unknown as typeof fetch)).toBeNull();
    });

    it('returns null on a non-JSON / malformed body', async () => {
      const bad = { ok: true, status: 200, json: async () => { throw new Error('bad'); } };
      const fetchSpy = jasmine.createSpy('fetch').and.resolveTo(bad as unknown as Response);
      expect(await fetchDynamicRemotes(fetchSpy as unknown as typeof fetch)).toBeNull();
    });
  });

  describe('resolveFederationSource — (b) dynamic-first, static-FLOOR, static-fallback', () => {
    const floor = environment.federationStaticManifest;

    it('on dynamic SUCCESS returns the UNION { ...staticFloor, ...dynamic } (object)', async () => {
      const fetchSpy = jasmine.createSpy('fetch').and.resolveTo(okJson(manifestBody()));
      const source = await resolveFederationSource(fetchSpy as unknown as typeof fetch);
      // Every baked static remote is present, with the two dynamic rows overriding
      // their slugs' URLs (login/admin), and all other floor remotes untouched.
      expect(source).toEqual({
        ...floor,
        login: '/login/remoteEntry.json',
        admin: '/admin/remoteEntry.json',
      });
    });

    it('(floor guarantee) a baked remote OMITTED by the dynamic response is STILL present from the floor', async () => {
      // manifestBody() omits matrix/mastodon/user/mod/apidocs (the incomplete-seed
      // case VERIFY found). The union must still register them from the static floor.
      const fetchSpy = jasmine.createSpy('fetch').and.resolveTo(okJson(manifestBody()));
      const source = (await resolveFederationSource(
        fetchSpy as unknown as typeof fetch,
      )) as Record<string, string>;
      expect(source['matrix']).toBe(floor['matrix']);
      expect(source['mastodon']).toBe(floor['mastodon']);
      expect(source['user']).toBe(floor['user']);
      expect(source['mod']).toBe(floor['mod']);
      expect(source['apidocs']).toBe(floor['apidocs']);
    });

    it('(override) a dynamic row OVERRIDES the static URL for a matching slug', async () => {
      const overlay = {
        generatedAt: '2026-06-13T00:00:00Z',
        remotes: [{ slug: 'login', remoteEntryUrl: '/db/login/remoteEntry.json' }],
      };
      const fetchSpy = jasmine.createSpy('fetch').and.resolveTo(okJson(overlay));
      const source = (await resolveFederationSource(
        fetchSpy as unknown as typeof fetch,
      )) as Record<string, string>;
      expect(source['login']).toBe('/db/login/remoteEntry.json'); // dynamic wins
      expect(source['login']).not.toBe(floor['login']);
      expect(source['matrix']).toBe(floor['matrix']); // untouched floor slug
    });

    it('(add) a dynamic-ONLY new slug (e.g. wiki) APPEARS in the union', async () => {
      const overlay = {
        generatedAt: '2026-06-13T00:00:00Z',
        remotes: [{ slug: 'wiki', remoteEntryUrl: '/wiki/remoteEntry.json' }],
      };
      const fetchSpy = jasmine.createSpy('fetch').and.resolveTo(okJson(overlay));
      const source = (await resolveFederationSource(
        fetchSpy as unknown as typeof fetch,
      )) as Record<string, string>;
      expect(source['wiki']).toBe('/wiki/remoteEntry.json'); // DB added it, no redeploy
      // ...and the floor is still fully present alongside the new slug.
      expect(source['login']).toBe(floor['login']);
      expect(source['matrix']).toBe(floor['matrix']);
    });

    it('(b) FALLS BACK to the bundled static manifest URL on dynamic failure (still boots)', async () => {
      const fetchSpy = jasmine.createSpy('fetch').and.resolveTo(status(401));
      const source = await resolveFederationSource(fetchSpy as unknown as typeof fetch);
      // A STRING (the bundled static asset path) is a valid initFederation argument;
      // initFederation fetches it itself, so the shell boots even with the API down.
      // The failure path is UNCHANGED — still the path string, not the union object.
      expect(source).toBe(environment.federationManifest);
      expect(typeof source).toBe('string');
    });

    it('(b) falls back on a network rejection too (no white screen)', async () => {
      const fetchSpy = jasmine.createSpy('fetch').and.rejectWith(new Error('offline'));
      const source = await resolveFederationSource(fetchSpy as unknown as typeof fetch);
      expect(source).toBe(environment.federationManifest);
    });
  });
});
