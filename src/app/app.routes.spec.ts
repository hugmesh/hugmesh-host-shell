import { Route } from '@angular/router';

import { routes, REMOTE_ROUTES, federationLoader } from './app.routes';
import { adminGuard } from './guards/admin.guard';
import { registeredGuard } from './guards/registration.guard';
import { modGuard } from './guards/mod.guard';
import { userGuard } from './guards/user.guard';
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
      jasmine.objectContaining({ path: 'admin/docs', remoteName: 'apidocs', exposed: './routes', routesConst: 'API_DOCS_ROUTES' }),
      jasmine.objectContaining({ path: 'admin', remoteName: 'admin', exposed: './routes', routesConst: 'ADMIN_ROUTES' }),
      jasmine.objectContaining({ path: 'mod', remoteName: 'mod', exposed: './routes', routesConst: 'MOD_ROUTES' }),
      jasmine.objectContaining({ path: 'user', remoteName: 'user', exposed: './routes', routesConst: 'USER_ROUTES' }),
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

  it('default ("") path is a pure AUTHGATE + role-home redirect (roleHomeGuard, no component)', () => {
    const root = routes.find((r) => r.path === '');
    expect(root?.canActivate).withContext('default route is guarded').toContain(roleHomeGuard);
    expect(root?.loadComponent).withContext('renders no host component at ""').toBeUndefined();
    expect(root?.loadChildren).toBeUndefined();
  });
});
