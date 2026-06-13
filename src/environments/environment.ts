export const environment = {
  production: false,
  /** Native-federation remote manifest fetched by initFederation() in main.ts.
   *  DEV uses the localhost-ports manifest; the production build file-replaces
   *  this whole module with environment.prod.ts, which points at the
   *  fe-gateway-path manifest. (Static assets are copied wholesale by the
   *  `assets` glob and are NOT touched by `fileReplacements`, so the manifest
   *  must be SELECTED here — via the file-replaced environment — rather than
   *  swapped as an asset.) */
  federationManifest: 'assets/federation.manifest.json',
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
