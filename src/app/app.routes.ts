import { CanActivateFn, Route, Routes } from '@angular/router';
import { federationLoader } from './federation/remote-loader';
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

/**
 * Host shell routes. Every feature path is a native-federation REMOTE (its own
 * repo + nginx), loaded at runtime from the URLs in
 * `src/assets/federation.manifest.json`:
 *   login    -> hugmesh-login-ui     remote 'login'    exposes ./routes (LOGIN_ROUTES)
 *   matrix   -> hugmesh-matrix-ui    remote 'matrix'   exposes ./routes (MATRIX_ROUTES)
 *   mastodon -> hugmesh-mastodon-ui  remote 'mastodon' exposes ./routes (MASTODON_ROUTES)
 *   admin    -> hugmesh-admin-ui     remote 'admin'    exposes ./routes (ADMIN_ROUTES)
 *   mod      -> hugmesh-mod-ui       remote 'mod'      exposes ./routes (MOD_ROUTES)
 *   user     -> hugmesh-user-ui      remote 'user'     exposes ./routes (USER_ROUTES)
 *                                                       AND ./profile (ProfileComponent, modal)
 *   apidocs  -> hugmesh-api-docs     remote 'apidocs'  exposes ./routes (API_DOCS_ROUTES)
 *                                                       AND ./DocsShell (DocsShellComponent)
 *   wiki     -> hugmesh-wiki-ui      remote 'wiki'     exposes ./Wiki    (WIKI_ROUTES)
 *   tube     -> hugmesh-tube-ui      remote 'tube'     exposes ./Tube    (TUBE_ROUTES)
 *   owncast  -> hugmesh-owncast-ui   remote 'owncast'  exposes ./Owncast (OWNCAST_ROUTES)
 *   games    -> hugmesh-games/games-ui remote 'games'  exposes ./routes (GAMES_ROUTES)
 *                                                       AND ./admin-routes (GAMES_ADMIN_ROUTES)
 * Paths mirror the fe-gateway: /login, /social/matrix, /social/mastodon, /admin,
 * /mod, /user, /admin/docs, /games, /games/admin. Matrix/Mastodon require full registration; Admin and
 * the admin-only API-docs console (/admin/docs) need the admin role; Mod needs
 * the mod role; User is any authenticated identity.
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
  // FORUM remote (hugmesh-forum-ui): exposes './routes' -> FORUM_ROUTES
  // (verified against forum-ui federation.config.js name:'forum' exposes
  // './routes' -> src/app/forum.routes.ts FORUM_ROUTES; forum.routes.ts's own
  // header even names /social/forum as the host mount). The platform generator
  // wires hugmesh-forum-ui at the gateway path /social/forum/** (generator
  // PR #362, merged 2026-07-16); this entry is the matching HOST mount that was
  // missing — its absence made the home-services 'forum' launcher card a dead
  // link (an 'enabled' card whose click fell through to the '**' redirect).
  // Guarded by forumGuard (any AUTHENTICATED identity — NOT registeredGuard):
  // the forum reuses our native federated identity, so it needs no per-service
  // registration, exactly matching the card (slug 'forum', no
  // requiresRegistration / requiresRole). Like wiki/tube/owncast, the remoteEntry
  // is supplied at runtime by the DYNAMIC federation manifest, so no static
  // floor edit is needed for an authed user to resolve it.
  { path: 'social/forum', remoteName: 'forum', exposed: './routes', routesConst: 'FORUM_ROUTES', canActivate: [forumGuard] },
  // admin/docs (the admin-only API-docs console) MUST precede 'admin': the more
  // specific path has to match before the admin remote's loadChildren swallows it.
  { path: 'admin/docs', remoteName: 'apidocs', exposed: './routes', routesConst: 'API_DOCS_ROUTES', canActivate: [adminGuard] },
  { path: 'admin', remoteName: 'admin', exposed: './routes', routesConst: 'ADMIN_ROUTES', canActivate: [adminGuard] },
  { path: 'mod', remoteName: 'mod', exposed: './routes', routesConst: 'MOD_ROUTES', canActivate: [modGuard] },
  { path: 'user', remoteName: 'user', exposed: './routes', routesConst: 'USER_ROUTES', canActivate: [userGuard] },
  // WIKI management remote (hugmesh-wiki-ui): exposes ./Wiki -> WIKI_ROUTES, NOT
  // the './routes' convention the role-homes use. Mounted at /wiki behind wikiGuard
  // (admin|superadmin|mod+ROLE_WIKI); the remote's own child guards then enforce the
  // per-view WIKI_READ/WRITE/MANAGE boundary. The remoteEntry is supplied at runtime
  // by the DYNAMIC federation manifest (federation-api wiki row #16, visibility
  // internal, requiresRole wiki) unioned over the static floor — no static-manifest
  // edit is needed for an authed role-holder to resolve it.
  { path: 'wiki', remoteName: 'wiki', exposed: './Wiki', routesConst: 'WIKI_ROUTES', canActivate: [wikiGuard] },
  // TUBE management remote (hugmesh-tube-ui): exposes ./Tube -> TUBE_ROUTES,
  // mirroring the wiki './Wiki' convention (NOT the './routes' of the role-homes).
  // Optional, DEFAULT-OFF, GPU-gated. Mounted at /tube behind tubeGuard
  // (admin|superadmin|ROLE_TUBE). The service is registered in the federation_modules
  // registry (slug='tube', enabled=false) and is greyed-out by the CapabilitiesService
  // when not installed (no GPU node + superadmin enable). The remote's own child guards
  // enforce per-view boundaries (user vs admin). The remoteEntry is supplied at runtime
  // by the DYNAMIC federation manifest (visibility internal, requiresRole TUBE) — no
  // static-manifest edit is needed for an authed role-holder to resolve it.
  { path: 'tube', remoteName: 'tube', exposed: './Tube', routesConst: 'TUBE_ROUTES', canActivate: [tubeGuard] },
  // OWNCAST management remote (hugmesh-owncast-ui): exposes ./Owncast ->
  // OWNCAST_ROUTES, mirroring the wiki './Wiki' convention. Optional, DEFAULT-OFF,
  // GPU-gated. Mounted at /owncast behind owncastGuard (admin|superadmin|ROLE_OWNCAST).
  // Registered in the federation_modules registry (slug='owncast', enabled=false).
  // Greyed-out when not installed (per-streamer Owncast Deployment provisioned by
  // ApplicationSet on grant flip; requires GPU node + superadmin per-domain enable). The
  // remoteEntry is supplied at runtime by the DYNAMIC federation manifest (visibility
  // internal, requiresRole OWNCAST) — kept OFF the static floor like wiki.
  { path: 'owncast', remoteName: 'owncast', exposed: './Owncast', routesConst: 'OWNCAST_ROUTES', canActivate: [owncastGuard] },
  // CHARACTER remotes (hugmesh-character-studio-ui, hugmesh-character-forge-bff-api/
  // frontend). Both expose './routes' (the role-home convention, NOT wiki's './Wiki').
  //
  // remoteName MUST be the kebab-case 'character-studio'/'character-forge', because
  // native-federation registers a remote under the `name` declared INSIDE its own
  // remoteEntry.json (and in its federation.config.js) — NOT under the key you give it
  // in the manifest. A camelCase manifest key registers fine and then throws
  // "Remote 'characterStudio' is not initialized" at loadRemoteModule time, with NO
  // failed request to point at, because the entry was already fetched under its real
  // name. Every other remote here happens to have key == name, which is why the
  // constraint had never surfaced.
  //
  // registeredGuard matches the gateway's own gate, measured live: a plain ROLE_USER
  // gets 200 on both paths and an anonymous caller gets 401, and there is no
  // per-service role, so gating tighter here would deny users the backend admits.
  { path: 'character-studio', remoteName: 'character-studio', exposed: './routes', routesConst: 'CHARACTER_STUDIO_ROUTES', canActivate: [registeredGuard] },
  { path: 'character-forge', remoteName: 'character-forge', exposed: './routes', routesConst: 'CHARACTER_FORGE_ROUTES', canActivate: [registeredGuard] },
  // GAMES remote (hugmesh-games/games-ui) — CROSS-REPO CONTRACT, games member +
  // games admin screens (2026-10-28). ONE native-federation remote, federation
  // name 'games' (the manifest key, this remoteName and the `name` inside the
  // remote's own remoteEntry.json MUST all be 'games' — see the character-*
  // note above for why a mismatched key fails only at loadRemoteModule time),
  // exposing TWO modules:
  //   './admin-routes' -> GAMES_ADMIN_ROUTES  (src/app/games-admin.routes.ts)
  //   './routes'       -> GAMES_ROUTES        (src/app/games.routes.ts)
  // Served under /games/ (remoteEntry.json + chunks live at /games/*, never
  // under /games/admin/, so the fe-gateway's '/games/admin/**' ROLE_GAMES_ADMIN
  // row keeps gating only the HTML path). Static floor: federation.manifest*.json
  // 'games'. Both mounts replaced the host-local TODO placeholders this repo
  // carried while no games UI existed (README "Routes, role-gates and remotes").
  //
  // ORDER MATTERS: 'games/admin' MUST precede 'games' (specific-before-general,
  // mirroring admin/docs -> admin) or the member mount's loadChildren swallows
  // the admin path. Guards unchanged: gamesGuard = games|admin|superadmin;
  // gamesAdminGuard = isGamesAdmin() (games AND (admin OR mod)) | superadmin.
  { path: 'games/admin', remoteName: 'games', exposed: './admin-routes', routesConst: 'GAMES_ADMIN_ROUTES', canActivate: [gamesAdminGuard] },
  { path: 'games', remoteName: 'games', exposed: './routes', routesConst: 'GAMES_ROUTES', canActivate: [gamesGuard] },
];

/** Resolve a remote's exported routes constant via native-federation.
 *
 *  Re-exported from federation/remote-loader.ts — the SAME holder object, so
 *  existing `spyOn(federationLoader, 'load')` call sites keep working — because
 *  the loader is no longer a detail of the route table. It now owns the
 *  DEFERRED-remote registry: a remote that was not initialized at boot is
 *  initialized from its remoteEntry URL on first load, which is what keeps the
 *  gated remotes from being fetched before a guard has admitted anyone. Route
 *  loadChildren and the profile modal share this one seam so neither can drift
 *  back onto the eager path alone. */
export { federationLoader };

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
  // remotes (admin/mod/user), the swappable social remotes and the games
  // member/admin mounts (games/admin before games) all mount here.
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
