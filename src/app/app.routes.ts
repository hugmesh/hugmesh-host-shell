import { CanActivateFn, Route, Routes } from '@angular/router';
import { loadRemoteModule } from '@angular-architects/native-federation';
import { adminGuard } from './guards/admin.guard';
import { registeredGuard } from './guards/registration.guard';
import { modGuard } from './guards/mod.guard';
import { userGuard } from './guards/user.guard';
import { roleHomeGuard } from './guards/role-home.guard';

/**
 * Host shell routes. Every feature path is a native-federation REMOTE (its own
 * repo + nginx), loaded at runtime from the URLs in
 * `src/assets/federation.manifest.json`:
 *   login    -> snapdragon-login-ui     remote 'login'    exposes ./routes (LOGIN_ROUTES)
 *   matrix   -> snapdragon-matrix-ui    remote 'matrix'   exposes ./routes (MATRIX_ROUTES)
 *   mastodon -> snapdragon-mastodon-ui  remote 'mastodon' exposes ./routes (MASTODON_ROUTES)
 *   admin    -> snapdragon-admin-ui     remote 'admin'    exposes ./routes (ADMIN_ROUTES)
 *   mod      -> snapdragon-mod-ui       remote 'mod'      exposes ./routes (MOD_ROUTES)
 *   user     -> snapdragon-user-ui      remote 'user'     exposes ./routes (USER_ROUTES)
 *                                                         AND ./profile (ProfileComponent, modal)
 * Paths mirror the fe-gateway: /login, /social/matrix, /social/mastodon, /admin,
 * /mod, /user. Matrix/Mastodon require full registration; Admin needs the admin
 * role; Mod needs the mod role; User is any authenticated identity.
 *
 * ROLE-HOME: the host's home is the federated remote for the signed-in user's
 * ROLE — admin -> /admin, mod -> /mod, user -> /user. The default ('') route is a
 * pure AUTHGATE + role redirect (roleHomeGuard): anonymous -> /login, otherwise
 * -> the matching role-home remote. The Home nav entry returns here.
 */

/** Declarative wiring for each federated remote, exported so tests can assert the
 *  contract (remote name -> exposed module -> exported routes constant -> guard)
 *  without spying the frozen native-federation ESM namespace. */
export interface RemoteRouteSpec {
  readonly path: string;
  readonly remoteName: string;
  readonly exposed: string;
  readonly routesConst: string;
  readonly canActivate?: readonly CanActivateFn[];
}

export const REMOTE_ROUTES: readonly RemoteRouteSpec[] = [
  { path: 'login', remoteName: 'login', exposed: './routes', routesConst: 'LOGIN_ROUTES' },
  { path: 'social/matrix', remoteName: 'matrix', exposed: './routes', routesConst: 'MATRIX_ROUTES', canActivate: [registeredGuard] },
  { path: 'social/mastodon', remoteName: 'mastodon', exposed: './routes', routesConst: 'MASTODON_ROUTES', canActivate: [registeredGuard] },
  { path: 'admin', remoteName: 'admin', exposed: './routes', routesConst: 'ADMIN_ROUTES', canActivate: [adminGuard] },
  { path: 'mod', remoteName: 'mod', exposed: './routes', routesConst: 'MOD_ROUTES', canActivate: [modGuard] },
  { path: 'user', remoteName: 'user', exposed: './routes', routesConst: 'USER_ROUTES', canActivate: [userGuard] },
];

/** Resolve a remote's exported routes constant via native-federation. Indirected
 *  through a holder so unit tests can stub the loader (the ESM namespace export
 *  itself is read-only and cannot be spied directly). */
export const federationLoader = {
  load: (remoteName: string, exposed: string): Promise<Record<string, unknown>> =>
    loadRemoteModule(remoteName, exposed) as Promise<Record<string, unknown>>,
};

function remoteRoute(spec: RemoteRouteSpec): Route {
  return {
    path: spec.path,
    ...(spec.canActivate ? { canActivate: [...spec.canActivate] } : {}),
    loadChildren: () =>
      federationLoader
        .load(spec.remoteName, spec.exposed)
        .then((m) => m[spec.routesConst] as Routes),
  };
}

export const routes: Routes = [
  // Public marketing pages (kept from the original static SPA).
  {
    path: 'home',
    loadComponent: () =>
      import('./home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./about/about.component').then((m) => m.AboutComponent),
  },

  // Federated remotes (data-driven from REMOTE_ROUTES above). The role-home
  // remotes (admin/mod/user) and the swappable social remotes all mount here.
  ...REMOTE_ROUTES.map(remoteRoute),

  // Default ('') is the AUTHGATE + role-home redirect: anonymous -> /login,
  // otherwise -> the signed-in user's role-home remote (/admin | /mod | /user).
  // No component renders at '' — roleHomeGuard always returns a UrlTree.
  {
    path: '',
    pathMatch: 'full',
    canActivate: [roleHomeGuard],
    children: [],
  },

  { path: '**', redirectTo: '' },
];
