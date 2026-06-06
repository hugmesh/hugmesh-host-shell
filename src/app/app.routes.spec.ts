import { Route } from '@angular/router';

import { routes, REMOTE_ROUTES, federationLoader } from './app.routes';
import { adminGuard } from './guards/admin.guard';
import { registeredGuard } from './guards/registration.guard';
import { modGuard } from './guards/mod.guard';

/** These tests assert the FEDERATION WIRING: that each public path resolves its
 *  loadChildren via the native-federation loader using the correct remote name +
 *  exposed module + exported routes constant, and that the right guard protects
 *  each. The verbatim contract (login/matrix/mastodon/admin -> ./routes ->
 *  *_ROUTES) is declared in REMOTE_ROUTES and exercised end-to-end here. */
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
      jasmine.objectContaining({ path: 'admin', remoteName: 'admin', exposed: './routes', routesConst: 'ADMIN_ROUTES' }),
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

  it('/login is reachable by anyone (no guard)', () => {
    expect(routeFor('login').canActivate ?? []).toEqual([]);
  });

  it('/mod is a guarded placeholder (modGuard) that loadComponents — NOT a remote mount', () => {
    const mod = routeFor('mod');
    expect(mod.canActivate).toContain(modGuard);
    expect(mod.loadComponent).withContext('placeholder is a local component').toBeDefined();
    expect(mod.loadChildren).withContext('must NOT loadRemoteModule a mod remote').toBeUndefined();
  });

  it('default ("") path renders the role-aware landing component', () => {
    const root = routes.find((r) => r.path === '');
    expect(root?.loadComponent).toBeDefined();
    expect(root?.loadChildren).toBeUndefined();
  });
});
