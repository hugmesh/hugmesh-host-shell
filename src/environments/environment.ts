// The bundled static manifest as an OBJECT, imported at build time (no runtime
// fetch). Shape is the flat { remoteName: remoteEntryUrl } map native-federation
// consumes — identical to RemotesMap. Used as the FLOOR the dynamic overlay is
// unioned ON TOP of, so a successful DB read is never strictly worse than the
// baked set. resolveJsonModule is enabled in tsconfig.json. DEV imports the
// localhost-ports manifest; the prod build file-replaces this module with
// environment.prod.ts, which imports the fe-gateway-path manifest instead.
import federationStaticManifest from '../assets/federation.manifest.json';

export const environment = {
  production: false,
  /** Native-federation remote manifest PATH (the bundled static asset URL). Kept
   *  as the documented fallback artifact / for any code that consumes the path.
   *  DEV uses the localhost-ports manifest; the production build file-replaces
   *  this whole module with environment.prod.ts, which points at the
   *  fe-gateway-path manifest. (Static assets are copied wholesale by the
   *  `assets` glob and are NOT touched by `fileReplacements`, so the manifest
   *  must be SELECTED here — via the file-replaced environment — rather than
   *  swapped as an asset.) */
  federationManifest: 'assets/federation.manifest.json',
  /** The SAME static manifest as an in-memory OBJECT (build-time import, no fetch).
   *  This is the brand-NEUTRAL platform-remote FLOOR: resolveFederationSource()
   *  unions the dynamic overlay over it so every baked remote is ALWAYS registered,
   *  while the DB can still ADD new remotes (e.g. a future wiki) without a host
   *  redeploy. Route guards + BFF authz still do all gating — this only maps
   *  name -> public entry URL, exactly as the static-for-everyone build did. */
  federationStaticManifest: federationStaticManifest as Record<string, string>,
  /** Base URL for the federation-api PUBLIC reads (capabilities). Same-origin in
   *  prod (the fe-gateway proxies /api/* to federation-api); empty here means the
   *  host issues a relative request that the dev proxy / gateway routes. */
  federationApiBase: '',
  /** DB-driven DYNAMIC manifest endpoint (federation-api GET /api/federation/manifest).
   *  The bootstrap fetches THIS first and feeds its remotes into initFederation, so
   *  new/disabled/kill-switched remotes land WITHOUT redeploying the host shell.
   *  Relative so the id/fe-gateway routes /api/* to federation-api with the session
   *  cookie (dev proxy + prod gateway alike); `federationApiBase` is '' (same-origin)
   *  today but kept configurable for a future cross-origin host. On ANY failure the
   *  bootstrap falls back to the BUNDLED static `federationManifest` above so the
   *  shell always boots — the static json is the documented fallback artifact. */
  federationManifestUrl: '/api/federation/manifest',
};
