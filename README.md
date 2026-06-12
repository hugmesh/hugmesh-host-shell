# snapdragon.systems — host shell

The **native-federation HOST shell** for a Snapdragon brand. This Angular 22
single-page app is the user-facing front door behind the gateway: it owns the
chrome (header / menu / footer / background, the accessible skip-link and the
shared profile modal), the authgate, the universal navigation, and the
role-home routing. It **exposes nothing** of its own feature surface — every
page under it is a separate repo loaded at runtime as a **native-federation
remote** (login, user, mod, admin, api-docs, matrix, mastodon).

In the platform's two service tiers this sits in the **architecture tier**
(core, always present) alongside the gateways, Casdoor + PKI, and the
federation API. Each brand/domain runs its **own instance** of this host (one
container image, one nginx) wired to that brand's gateway, Casdoor issuer and
remotes.

---

## What it is

- **Stack:** Angular 22 standalone components + signals, `@angular-architects/native-federation`
  (`@softarc/native-federation-node`), Bootstrap 5, Vanta background. Built to a
  static bundle and served by nginx (`Dockerfile`, `nginx.conf`) or by the tiny
  Express fallback (`server.js`).
- **Role:** the federation **host/consumer** only. `federation.config.js` (via
  the shared `federation-base.js` helper) declares the host with **no `exposes`
  block** — it solely `loadRemoteModule(...)`s the remotes named in
  `src/assets/federation.manifest.json`. The shared-deps surface (Angular +
  RxJS singletons, `strictVersion`, the RxJS skip list) lives in
  `federation-base.js` so the host and remotes can't drift into a
  "shared is not a function" runtime break.
- **Boot order:** `src/main.ts` runs `initFederation('assets/federation.manifest.json')`
  to resolve every remote's `remoteEntry.json` **before** Angular bootstraps in
  `src/bootstrap.ts`. Routing is **path-based** (no hash) so the host's paths
  line up with the fe-gateway prefixes and each remote's nginx.

The host keeps the original static marketing pages (`/home`, `/about`) as
public, unguarded routes; everything else is federated and gated.

---

## Where it sits — gateway, Casdoor, federation, multi-tenancy

```
browser ──▶ ingress (TLS) ──▶ fe-gateway ──▶ snapdragon.systems (this host)
                                   │                  │  loadRemoteModule(...)
                                   │                  ▼
                                   │           login · user · mod · admin
                                   │           api-docs · matrix · mastodon  (remotes)
                                   └──▶ be-gateway ──▶ role BFFs (/bff/*) ──▶ Casdoor / services
```

- **Gateways:** the host is the fe-gateway `/**` catch-all upstream. Its in-app
  paths (`/login`, `/social/matrix`, `/social/mastodon`, `/admin`, `/mod`,
  `/user`, `/admin/docs`) mirror the gateway path prefixes, and the **prod**
  federation manifest (`federation.manifest.prod.json`) points each remote at
  those same gateway-served paths (`/login/remoteEntry.json`, …).
- **Casdoor / session:** the host does **not** speak OAuth itself. The login
  remote completes the Casdoor flow and writes the canonical `snap.session`
  object to `localStorage`; `SessionService` (`src/app/session.service.ts`)
  reads it. That session carries the Casdoor `roles` plus the per-service
  tokens (`bffToken`, `matrix`, `mastodon`) and `registrationComplete`. The
  host and each remote each hold their own `SessionService` over the same
  storage key and stay in sync via a same-document `snap-session-change`
  broadcast and cross-tab `storage` events (so the login remote finishing
  registration immediately unlocks the host's social nav).
- **Federation:** routes are loaded from remotes via `loadRemoteModule` —
  see `REMOTE_ROUTES` in `src/app/app.routes.ts`, the single declarative table
  of `path → remote name → exposed module → exported routes constant → guard`.
- **Multi-tenancy:** this repo is brand-agnostic. Per-brand instances are
  provisioned from a handlebars-rendered repo (ArgoCD-reconciled), each pointed
  at its own gateway / Casdoor issuer / remote manifest. Domain scoping is
  enforced at the gateway and the role BFFs (issuer-keyed `DOMAIN_<x>`); the
  host only renders the role-gated chrome for the brand it was deployed into.

---

## Routes, role-gates and remotes

Routing is data-driven from `REMOTE_ROUTES` in `src/app/app.routes.ts`. Each
feature path is its own repo + nginx, mounted via `loadChildren →
loadRemoteModule(remote, './routes')`:

| Path | Remote | Guard | Gate |
|---|---|---|---|
| `/login` | `login` (`snapdragon-login-ui`) | — | public (the Casdoor login + registration flow) |
| `/user` | `user` (`snapdragon-user-ui`) | `userGuard` | any authenticated identity (the USER role-home; also exposes `./profile`) |
| `/mod` | `mod` (`snapdragon-mod-ui`) | `modGuard` | Casdoor `mod` role |
| `/admin` | `admin` (`snapdragon-admin-ui`) | `adminGuard` | Casdoor `admin` role |
| `/admin/docs` | `apidocs` (`snapdragon-api-docs`) | `adminGuard` | admin-only OpenAPI/API-docs console (listed **before** `/admin` so the more specific path wins) |
| `/social/matrix` | `matrix` (`snapdragon-matrix-ui`) | `registeredGuard` | requires full registration |
| `/social/mastodon` | `mastodon` (`snapdragon-mastodon-ui`) | `registeredGuard` | requires full registration |

Guards live in `src/app/guards/` and read `SessionService`:

- **`roleHomeGuard`** — the default `''` route is a pure **authgate + role
  redirect**, no component of its own: anonymous → `/login`, otherwise → the
  signed-in user's role-home (`/admin` ▸ `/mod` ▸ `/user`). Role precedence
  `admin > mod > user` is computed in `SessionService.role()`.
- **`adminGuard` / `modGuard`** — gate `/admin` (+ `/admin/docs`) and `/mod` on
  the matching Casdoor role; everyone else is bounced to `/login`.
- **`userGuard`** — every authenticated identity is a baseline `ROLE_USER`, so
  this only blocks anonymous visitors.
- **`registeredGuard`** — Matrix/Mastodon are usable only after the login
  remote mints the per-service tokens (`registrationComplete === true`).

The **menu** (`src/app/menu/menu.component.ts`) mirrors these gates in the
chrome: a universal `Home | Mastodon | Matrix` menubar (Mastodon/Matrix
visible-but-disabled until fully registered) plus a profile dropdown whose
**Admin**, **API docs** and **Moderation** entries show only for the matching
role. The **profile modal** (`src/app/profile-modal/`) lazy-loads the user
remote's `./profile` editor via `loadRemoteModule('user', './profile')` and
applies the locked accessible-dialog contract (focus move/restore, focus trap,
Escape/backdrop dismiss).

---

## Host-owned features

Almost everything is delegated to remotes; the host shell itself owns only the
cross-cutting surface:

- **Authgate + role-home routing + universal nav + profile modal** (above).
- **Home announcements banner** (`src/app/announcements/`) — the logged-in home
  top banner. `AnnouncementsService` GETs the same-origin admin-bff endpoint
  **`/bff/announcements/home`** (routed `/bff/*` → BFF by the id-gateway, with
  the session cookie/JWT), renders only active, home-targeted announcements in
  server-supplied priority order, and supports **dismiss-once** (persisted to
  `localStorage`). Each announcement's server-sanitized `body_html` is rendered
  inside a **sandboxed null-origin `srcdoc` iframe** (no `allow-scripts`, no
  `allow-same-origin`) as a second line of defence — never via raw `innerHTML`.
  The banner is a labelled `aria-live="polite"` region.
- **Accessibility baseline** — a skip-link that moves focus (not just scroll)
  to `#maincontent` per WCAG 2.4.1, the WAI-ARIA menubar roving-tabindex
  pattern, and the modal dialog contract above.

---

## Build, deploy, CI

- **Local dev:** `npm run start-dev` (`ng serve`). The dev federation manifest
  (`federation.manifest.json`) points each remote at a `localhost:420x` port;
  run the remotes you need alongside the host.
- **Full stack:** `docker compose up -d` brings up the
  **snapdragon-id-gateway** (Spring Cloud Gateway, OAuth2 login client + JWT
  resource server) in front of this frontend, plus **Casdoor** (issuer) and a
  **Cassandra** keyspace (`snapdragon_systems_gateway`) for the gateway's
  revocation list / URL registry / resource-access cache. The frontend is not
  exposed directly — the gateway is the public entry point. See
  [`docs/games-stack-adoption.md`](docs/games-stack-adoption.md).
- **Container:** multi-stage `Dockerfile` builds the prod bundle and serves it
  from `nginxinc/nginx-unprivileged` on `:8080` with SPA `try_files` fallback.
- **CI:** GitLab (`.gitlab-ci.yml`) — the GitHub repo is pull-mirrored into the
  in-cluster GitLab, which builds + pushes this service's image to the
  in-cluster registry on push of the default branch / a tag. **No keys ship in
  the image** — key material is supplied from the operator key-USB at first
  boot. (GitHub Actions are intentionally not used.)

| Script | What |
|---|---|
| `npm run start-dev` | `ng serve` dev server |
| `npm run build` | production bundle (`public/snapdragon.systems/browser`) |
| `npm test` / `npm run coverage` | Karma/Jasmine unit tests (+ coverage) |
| `npm run e2e` | Nightwatch e2e (role authgate / nav / profile-modal suites) |
| `npm run dockerBuild` / `dockerRun` | build + run the container image |

---

## Layout

```
src/app/
  app.routes.ts            REMOTE_ROUTES table + authgate/role-home + federationLoader
  session.service.ts       snap.session reader; role precedence + registration gate
  guards/                  roleHome · admin · mod · user · registration (authgate + role-gates)
  menu/                    universal nav + role-gated profile dropdown (a11y menubar)
  profile-modal/           host modal mounting the user remote's ./profile editor
  announcements/           /bff/announcements/home banner (sandboxed srcdoc, dismiss-once)
  header/ footer/ background/ home/ about/   chrome + public marketing pages
src/main.ts                initFederation(manifest) → ./bootstrap
src/assets/federation.manifest{,.prod}.json  remote name → remoteEntry URL (dev ports / gateway paths)
federation.config.js + federation-base.js    host federation config (consumer; shared-deps surface)
```

## Related repos

Gateways `snapdragon-gateway` / `snapdragon-id-gateway` · identity **Casdoor** ·
federation `snapdragon-federation-api` + `snapdragon-remote-fragment` · the
remotes `snapdragon-{login,user,mod,admin}-ui`, `snapdragon-{matrix,mastodon}-ui`,
`snapdragon-api-docs` · role BFFs `snapdragon-{user,mod,admin}-bff-api` ·
cross-realm sync `snapdragon-actions` · games stack `snapdragon.games`.
