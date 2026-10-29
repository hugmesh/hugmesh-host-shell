import DEV_MANIFEST from '../../assets/federation.manifest.json';
import PROD_MANIFEST from '../../assets/federation.manifest.prod.json';
import type { RemotesMap } from './federation-bootstrap';

/**
 * DECISION 35 — operator, 2026-09-17 (hugmesh/hugmesh-generator#347).
 *
 * "Each consumer HARDCODES `/login/remoteEntry.json` and degrades to the
 * `?returnTo=` link." The alternatives where the shell publishes the URL to its
 * consumers — a `window.__HUG_*` global, a manifest fetch, a BFF endpoint, a
 * config knob — were put to the operator and DECLINED. Do not reintroduce one
 * here because the duplication below looks like it wants a single source: the
 * duplication IS the answer, and this file is the price of it.
 *
 * That answer makes THIS repo the owner of a literal that hugmesh-login-ui,
 * hugmesh-forum-ui, hugmesh-mod-ui and hugmesh-wiki-ui each copy into their own
 * source (login-ui#20, forum-ui#3, mod-ui#1, wiki-ui#4). Nothing used to compare
 * the copies, and the drift is SILENT by construction:
 *
 *   the manifest is not uniform (`forum` lives at /social/forum/remoteEntry.json,
 *   `matrix` at /social/matrix/remoteEntry.json), so a path prefix for `login` is
 *   not hypothetical — and when a consumer's remoteEntry fetch 404s it degrades to
 *   the ?returnTo= link EXACTLY AS DESIGNED. No error, no failing suite. The
 *   federated step-up dialog just never appears again.
 *
 * So the login row is pinned here, where it is written, rather than trusted.
 */

/**
 * The literal decision 35 tells every consumer to hardcode. Written out rather
 * than read from the manifest — reading it from the file under test would make
 * this suite vacuous.
 */
const LOGIN_REMOTE_ENTRY = '/login/remoteEntry.json';

describe('federation manifest contract — the login remoteEntry consumers hardcode (decision 35)', () => {
  it('serves `login` at the exact path the four consumers copy', () => {
    expect((PROD_MANIFEST as RemotesMap)['login'])
      .withContext(
        'Moving this row silently breaks the federated step-up dialog in login-ui, ' +
          'forum-ui, mod-ui and wiki-ui: their loadRemoteModule fetch 404s and each ' +
          'degrades to the ?returnTo= link with no error. If the row MUST move, the ' +
          'four consumer issues have to move with it in the same change.',
      )
      .toBe(LOGIN_REMOTE_ENTRY);
  });

  it('keeps the prod manifest a flat name -> absolute-path map, so a consumer can hardcode one string', () => {
    for (const [name, url] of Object.entries(PROD_MANIFEST as RemotesMap)) {
      expect(typeof url).withContext(`remote '${name}'`).toBe('string');
      expect(url.startsWith('/'))
        .withContext(
          `remote '${name}' -> '${url}': a consumer hardcodes a same-origin path served ` +
            'through the fe-gateway. An absolute http(s) URL here would be a cross-origin ' +
            'entry no consumer can copy.',
        )
        .toBeTrue();
    }
  });

  describe('the games remote row (cross-repo contract 2026-10-28)', () => {
    // The deploy step assumes these two literals: the games-ui nginx serves
    // remoteEntry.json under /games/ on the mesh (fe-gateway route games-ui,
    // Path=/games/**), and the dev workspace serves it from :4208. The key is
    // the remote's declared federation name — see app.routes.ts REMOTE_ROUTES.
    it('prod serves `games` at /games/remoteEntry.json (under /games/, never /games/admin/)', () => {
      expect((PROD_MANIFEST as RemotesMap)['games']).toBe('/games/remoteEntry.json');
    });

    it('dev serves `games` from the games-ui workspace dev port 4208', () => {
      expect((DEV_MANIFEST as RemotesMap)['games']).toBe('http://localhost:4208/remoteEntry.json');
    });
  });

  describe('what this pin CANNOT cover — measured, recorded so it is not mistaken for covered', () => {
    it('DEV serves login somewhere else entirely, so the hardcoded literal degrades under `ng serve`', () => {
      // Not a defect and not a thing to "fix" — the dev manifest is localhost
      // ports by design. It is pinned so the next agent SEES that a consumer
      // hardcoding the prod literal cannot resolve login under a dev serve, and
      // does not conclude the path ought to be made configurable (the option the
      // operator declined in decision 35).
      expect((DEV_MANIFEST as RemotesMap)['login'])
        .withContext('dev is the localhost-ports manifest; consumers degrade to ?returnTo= there')
        .not.toBe(LOGIN_REMOTE_ENTRY);
      expect((DEV_MANIFEST as RemotesMap)['login']).toBe('http://localhost:4203/remoteEntry.json');
    });

    // The DYNAMIC manifest is the fourth copy and is OUT OF REACH of this or any
    // other spec in this repo: resolveFederationSource() returns
    // `{ ...environment.federationStaticManifest, ...dynamic }`, so a
    // `federation_modules` row served by federation-api OVERRIDES the login URL
    // pinned above at runtime. Nothing here can see that row. Changing login's
    // row in that table has the same silent effect as editing this file, and only
    // a human looking at the live manifest can catch it.
  });
});
