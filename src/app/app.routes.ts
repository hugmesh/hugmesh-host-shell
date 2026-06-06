import { CanActivateFn, Route, Routes } from '@angular/router';
import { loadRemoteModule } from '@angular-architects/native-federation';
import { adminGuard } from './guards/admin.guard';
import { registeredGuard } from './guards/registration.guard';
import { modGuard } from './guards/mod.guard';

/**
 * Host shell routes. Every feature path is a native-federation REMOTE (its own
 * repo + nginx), loaded at runtime from the URLs in
 * `src/assets/federation.manifest.json`:
 *   login    -> snapdragon-login-ui     remote 'login'    exposes ./routes (LOGIN_ROUTES)
 *   matrix   -> snapdragon-matrix-ui    remote 'matrix'   exposes ./routes (MATRIX_ROUTES)
 *   mastodon -> snapdragon-mastodon-ui  remote 'mastodon' exposes ./routes (MASTODON_ROUTES)
 *   admin    -> snapdragon-admin-ui     remote 'admin'    exposes ./routes (ADMIN_ROUTES)
 * Paths mirror the fe-gateway: /login, /social/matrix, /social/mastodon, /admin.
 * Matrix/Mastodon require full registration; Admin requires the admin role.
 *
 * /mod is intentionally NOT a remote: snapdragon-mod-ui does not exist yet, so it
 * is a guarded TODO placeholder (modGuard), never a loadRemoteModule mount.
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

  // Federated remotes (data-driven from REMOTE_ROUTES above).
  ...REMOTE_ROUTES.map(remoteRoute),

  // Phase 10 ROLE_MOD entry: guarded placeholder for the FUTURE snapdragon-mod-ui
  // remote. Clearly a TODO, NOT a fake mount.
  {
    path: 'mod',
    canActivate: [modGuard],
    loadComponent: () =>
      import('./mod-placeholder/mod-placeholder.component').then(
        (m) => m.ModPlaceholderComponent,
      ),
  },

  // Default landing: the USER landing for authenticated users (link cards into
  // the Matrix + Mastodon remotes), or the public front page for anonymous users.
  // The component branches on the session; no guard is needed here.
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./landing/landing.component').then((m) => m.LandingComponent),
  },

  { path: '**', redirectTo: '' },
];
