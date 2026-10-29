import { Route } from '@angular/router';

import { routes, REMOTE_ROUTES, federationLoader } from './app.routes';
import { adminGuard } from './guards/admin.guard';
import { registeredGuard } from './guards/registration.guard';
import { forumGuard } from './guards/forum.guard';
import { modGuard } from './guards/mod.guard';
import { userGuard } from './guards/user.guard';
import { wikiGuard } from './guards/wiki.guard';
import { tubeGuard } from './guards/tube.guard';
import { owncastGuard } from './guards/owncast.guard';
import { gamesGuard } from './guards/games.guard';
import { gamesAdminGuard } from './guards/games-admin.guard';
import { roleHomeGuard } from './guards/role-home.guard';

/** These tests assert the FEDERATION WIRING: that each public path resolves its
 *  loadChildren via the native-federation loader using the correct remote name +
 *  exposed module + exported routes constant, and that the right guard protects
 *  each. The verbatim contract (login/matrix/mastodon/admin/mod/user -> ./routes
 *  -> *_ROUTES) is declared in REMOTE_ROUTES and exercised end-to-end here. */
describe('app.routes federation wiring', () => {
  function routeFor(path: string): Route {
    const r = routes.find((x) => x.path === path);
    if (!r) throw new Error(`route '${path}' not found`);
    return r;
  }

  it('declares the verbatim remote contract (name -> exposed -> routes const)', () => {
    expect(REMOTE_ROUTES).toEqual([
      jasmine.objectContaining({ path: 'login', remoteName: 'login', exposed: './routes', routesConst: 'LOGIN_ROUTES' }),
      jasmine.objectContaining({ path: 'social/matrix', remoteName: 'matrix', exposed: './routes', routesConst: 'MATRIX_ROUTES' }),
      jasmine.objectContaining({ path: 'social/mastodon', remoteName: 'mastodon', exposed: './routes', routesConst: 'MASTODON_ROUTES' }),
      // The forum remote follows the './routes' -> FORUM_ROUTES convention of the
      // social role-homes (verified against forum-ui federation.config.js).
      jasmine.objectContaining({ path: 'social/forum', remoteName: 'forum', exposed: './routes', routesConst: 'FORUM_ROUTES' }),
      jasmine.objectContaining({ path: 'admin/docs', remoteName: 'apidocs', exposed: './routes', routesConst: 'API_DOCS_ROUTES' }),
      jasmine.objectContaining({ path: 'admin', remoteName: 'admin', exposed: './routes', routesConst: 'ADMIN_ROUTES' }),
      jasmine.objectContaining({ path: 'mod', remoteName: 'mod', exposed: './routes', routesConst: 'MOD_ROUTES' }),
      jasmine.objectContaining({ path: 'user', remoteName: 'user', exposed: './routes', routesConst: 'USER_ROUTES' }),
      // The wiki remote uses the './Wiki' exposed module (WIKI_ROUTES), NOT the
      // './routes' convention of the role-homes.
      jasmine.objectContaining({ path: 'wiki', remoteName: 'wiki', exposed: './Wiki', routesConst: 'WIKI_ROUTES' }),
      // The tube + owncast management remotes follow the wiki './<Pascal>' precedent:
      // ./Tube -> TUBE_ROUTES and ./Owncast -> OWNCAST_ROUTES (NOT './routes').
      jasmine.objectContaining({ path: 'tube', remoteName: 'tube', exposed: './Tube', routesConst: 'TUBE_ROUTES' }),
      jasmine.objectContaining({ path: 'owncast', remoteName: 'owncast', exposed: './Owncast', routesConst: 'OWNCAST_ROUTES' }),
      // The CHARACTER remotes. remoteName MUST stay kebab-case: native-federation
      // registers a remote under the `name` declared inside its OWN remoteEntry.json,
      // not the manifest key, so a camelCase key throws "Remote 'characterStudio' is
      // not initialized" at loadRemoteModule time with no failed request to point at
      // (app.routes.ts:105-119). Both expose './routes', like the role-homes.
      jasmine.objectContaining({ path: 'character-studio', remoteName: 'character-studio', exposed: './routes', routesConst: 'CHARACTER_STUDIO_ROUTES' }),
      jasmine.objectContaining({ path: 'character-forge', remoteName: 'character-forge', exposed: './routes', routesConst: 'CHARACTER_FORGE_ROUTES' }),
      // The GAMES remote (cross-repo contract 2026-10-28): ONE remote named
      // 'games' exposing TWO modules — './admin-routes' (GAMES_ADMIN_ROUTES) for
      // the /games/admin console and './routes' (GAMES_ROUTES) for the member
      // catalog/play screens. games/admin MUST come first (specific-before-general).
      jasmine.objectContaining({ path: 'games/admin', remoteName: 'games', exposed: './admin-routes', routesConst: 'GAMES_ADMIN_ROUTES' }),
      jasmine.objectContaining({ path: 'games', remoteName: 'games', exposed: './routes', routesConst: 'GAMES_ROUTES' }),
    ]);
  });

  REMOTE_ROUTES.forEach(({ path, remoteName, exposed, routesConst }) => {
    it(`/${path} loadChildren loads remote '${remoteName}' ${exposed} and returns ${routesConst}`, async () => {
      const sentinel = [`${routesConst}_SENTINEL`];
      const spy = spyOn(federationLoader, 'load').and.resolveTo({ [routesConst]: sentinel });

      const route = routeFor(path);
      expect(route.loadChildren).withContext('must lazy-load the remote').toBeDefined();

      const resolved = await (route.loadChildren as () => Promise<unknown>)();

      expect(spy).toHaveBeenCalledWith(remoteName, exposed);
      expect(resolved)
        .withContext('returns the remote-exported routes constant')
        .toBe(sentinel);
    });
  });

  it('guards the social + admin remotes (registeredGuard / adminGuard)', () => {
    expect(routeFor('social/matrix').canActivate).toContain(registeredGuard);
    expect(routeFor('social/mastodon').canActivate).toContain(registeredGuard);
    expect(routeFor('admin').canActivate).toContain(adminGuard);
  });

  it('mounts the forum remote at /social/forum behind forumGuard (authenticated, NOT registration-gated)', () => {
    const forum = routeFor('social/forum');
    // The forum reuses our native identity, so it is authenticated-only — the
    // registration gate (matrix/mastodon per-service tokens) does NOT apply, and
    // adding it would turn the 'enabled' launcher card into a dead link.
    expect(forum.canActivate).withContext('authenticated-only forum gate').toContain(forumGuard);
    expect(forum.canActivate ?? []).withContext('forum is not registration-gated').not.toContain(registeredGuard);
    expect(forum.loadChildren).withContext('mounts the forum remote via loadChildren').toBeDefined();
    expect(forum.loadComponent).withContext('not a local placeholder component').toBeUndefined();
  });

  it('/admin/docs mounts the api-docs remote behind the adminGuard', () => {
    const docs = routeFor('admin/docs');
    expect(docs.canActivate).withContext('admin-only console').toContain(adminGuard);
    expect(docs.loadChildren).withContext('mounts the apidocs remote via loadChildren').toBeDefined();
    expect(docs.loadComponent).withContext('not a local placeholder component').toBeUndefined();
  });

  it('/admin/docs is registered BEFORE /admin so the specific path matches first', () => {
    const docsIdx = routes.findIndex((r) => r.path === 'admin/docs');
    const adminIdx = routes.findIndex((r) => r.path === 'admin');
    expect(docsIdx).toBeGreaterThanOrEqual(0);
    expect(docsIdx).withContext('admin/docs precedes the admin remote mount').toBeLessThan(adminIdx);
  });

  it('/login is reachable by anyone (no guard)', () => {
    expect(routeFor('login').canActivate ?? []).toEqual([]);
  });

  it('/mod is now a REAL remote mount guarded by modGuard (no placeholder)', () => {
    const mod = routeFor('mod');
    expect(mod.canActivate).toContain(modGuard);
    expect(mod.loadChildren).withContext('mounts the mod remote via loadChildren').toBeDefined();
    expect(mod.loadComponent).withContext('no longer a local placeholder component').toBeUndefined();
  });

  it('/user is the user role-home remote mount guarded by userGuard', () => {
    const user = routeFor('user');
    expect(user.canActivate).toContain(userGuard);
    expect(user.loadChildren).withContext('mounts the user remote via loadChildren').toBeDefined();
  });

  it('/wiki mounts the wiki management remote (./Wiki -> WIKI_ROUTES) behind wikiGuard', () => {
    const wiki = routeFor('wiki');
    expect(wiki.canActivate).withContext('wiki access tier gate').toContain(wikiGuard);
    expect(wiki.loadChildren).withContext('mounts the wiki remote via loadChildren').toBeDefined();
    expect(wiki.loadComponent).withContext('not a local placeholder component').toBeUndefined();
  });

  it('/wiki loadChildren loads remote \'wiki\' ./Wiki and returns WIKI_ROUTES', async () => {
    const sentinel = ['WIKI_ROUTES_SENTINEL'];
    const spy = spyOn(federationLoader, 'load').and.resolveTo({ WIKI_ROUTES: sentinel });
    const resolved = await (routeFor('wiki').loadChildren as () => Promise<unknown>)();
    expect(spy).toHaveBeenCalledWith('wiki', './Wiki');
    expect(resolved).toBe(sentinel);
  });

  it('/tube mounts the tube management remote (./Tube -> TUBE_ROUTES) behind tubeGuard', () => {
    const tube = routeFor('tube');
    expect(tube.canActivate).withContext('tube access tier gate').toContain(tubeGuard);
    expect(tube.loadChildren).withContext('mounts the tube remote via loadChildren').toBeDefined();
    expect(tube.loadComponent).withContext('not a local placeholder component').toBeUndefined();
  });

  it('/tube loadChildren loads remote \'tube\' ./Tube and returns TUBE_ROUTES', async () => {
    const sentinel = ['TUBE_ROUTES_SENTINEL'];
    const spy = spyOn(federationLoader, 'load').and.resolveTo({ TUBE_ROUTES: sentinel });
    const resolved = await (routeFor('tube').loadChildren as () => Promise<unknown>)();
    expect(spy).toHaveBeenCalledWith('tube', './Tube');
    expect(resolved).toBe(sentinel);
  });

  it('/owncast mounts the owncast management remote (./Owncast -> OWNCAST_ROUTES) behind owncastGuard', () => {
    const owncast = routeFor('owncast');
    expect(owncast.canActivate).withContext('owncast access tier gate').toContain(owncastGuard);
    expect(owncast.loadChildren).withContext('mounts the owncast remote via loadChildren').toBeDefined();
    expect(owncast.loadComponent).withContext('not a local placeholder component').toBeUndefined();
  });

  it('/owncast loadChildren loads remote \'owncast\' ./Owncast and returns OWNCAST_ROUTES', async () => {
    const sentinel = ['OWNCAST_ROUTES_SENTINEL'];
    const spy = spyOn(federationLoader, 'load').and.resolveTo({ OWNCAST_ROUTES: sentinel });
    const resolved = await (routeFor('owncast').loadChildren as () => Promise<unknown>)();
    expect(spy).toHaveBeenCalledWith('owncast', './Owncast');
    expect(resolved).toBe(sentinel);
  });

  it('default ("") path is a pure AUTHGATE + role-home redirect (roleHomeGuard, no component)', () => {
    const root = routes.find((r) => r.path === '');
    expect(root?.canActivate).withContext('default route is guarded').toContain(roleHomeGuard);
    expect(root?.loadComponent).withContext('renders no host component at ""').toBeUndefined();
    expect(root?.loadChildren).toBeUndefined();
  });

  // ── GAMES member + admin mounts (cross-repo contract 2026-10-28) ──────────
  // Both are REAL remote mounts of the single 'games' remote now; the host-local
  // TODO placeholders are gone. These pin the contract the deploy assumes: remote
  // name, the two exposed modules, the two routes constants, the two guards, and
  // the games/admin-before-games order in BOTH tables.

  it('/games mounts the games remote (./routes -> GAMES_ROUTES) behind gamesGuard, no placeholder', () => {
    const games = routeFor('games');
    expect(games.canActivate).withContext('games entry-point gate').toContain(gamesGuard);
    expect(games.canActivate ?? []).withContext('member mount is NOT admin-gated').not.toContain(gamesAdminGuard);
    expect(games.loadChildren).withContext('mounts the games remote via loadChildren').toBeDefined();
    expect(games.loadComponent).withContext('no longer a local placeholder component').toBeUndefined();
  });

  it('/games loadChildren loads remote \'games\' ./routes and returns GAMES_ROUTES', async () => {
    const sentinel = ['GAMES_ROUTES_SENTINEL'];
    const spy = spyOn(federationLoader, 'load').and.resolveTo({ GAMES_ROUTES: sentinel });
    const resolved = await (routeFor('games').loadChildren as () => Promise<unknown>)();
    expect(spy).toHaveBeenCalledWith('games', './routes');
    expect(resolved).toBe(sentinel);
  });

  it('/games/admin mounts the SAME games remote (./admin-routes -> GAMES_ADMIN_ROUTES) behind gamesAdminGuard', () => {
    const gamesAdmin = routeFor('games/admin');
    expect(gamesAdmin.canActivate).withContext('derived games-admin gate').toContain(gamesAdminGuard);
    expect(gamesAdmin.canActivate ?? []).withContext('admin mount is not merely games-gated').not.toContain(gamesGuard);
    expect(gamesAdmin.loadChildren).withContext('mounts the games remote via loadChildren').toBeDefined();
    expect(gamesAdmin.loadComponent).withContext('no longer a local placeholder component').toBeUndefined();
  });

  it('/games/admin loadChildren loads remote \'games\' ./admin-routes and returns GAMES_ADMIN_ROUTES', async () => {
    const sentinel = ['GAMES_ADMIN_ROUTES_SENTINEL'];
    const spy = spyOn(federationLoader, 'load').and.resolveTo({ GAMES_ADMIN_ROUTES: sentinel });
    const resolved = await (routeFor('games/admin').loadChildren as () => Promise<unknown>)();
    expect(spy).toHaveBeenCalledWith('games', './admin-routes');
    expect(resolved).toBe(sentinel);
  });

  it('the two games mounts share ONE remote name, so one remoteEntry.json serves both', () => {
    const rows = REMOTE_ROUTES.filter((r) => r.remoteName === 'games');
    expect(rows.map((r) => r.path)).toEqual(['games/admin', 'games']);
    expect(new Set(rows.map((r) => r.exposed)).size).withContext('two distinct exposed modules').toBe(2);
  });

  it('/games/admin is registered BEFORE /games in REMOTE_ROUTES and in the routes table', () => {
    const specAdminIdx = REMOTE_ROUTES.findIndex((r) => r.path === 'games/admin');
    const specGamesIdx = REMOTE_ROUTES.findIndex((r) => r.path === 'games');
    expect(specAdminIdx).toBeGreaterThanOrEqual(0);
    expect(specAdminIdx).withContext('games/admin precedes games in REMOTE_ROUTES').toBeLessThan(specGamesIdx);
    const gamesAdminIdx = routes.findIndex((r) => r.path === 'games/admin');
    const gamesIdx = routes.findIndex((r) => r.path === 'games');
    expect(gamesAdminIdx).toBeGreaterThanOrEqual(0);
    expect(gamesAdminIdx).withContext('games/admin precedes the games remote mount').toBeLessThan(gamesIdx);
  });
});
