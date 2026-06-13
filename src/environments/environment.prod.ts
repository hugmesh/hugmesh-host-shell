export const environment = {
  production: true,
  /** PRODUCTION native-federation manifest: the fe-gateway public paths
   *  (`/login/remoteEntry.json`, `/social/matrix/remoteEntry.json`, …), NOT the
   *  dev localhost ports. Loaded by initFederation() in main.ts. This module is
   *  file-replaced in for the dev environment.ts by the production build's
   *  `fileReplacements`, which fixes the pre-existing bug where the dev
   *  localhost-ports manifest shipped in prod (fileReplacements cannot swap the
   *  static asset itself, only this module that names it). */
  federationManifest: 'assets/federation.manifest.prod.json',
  /** Same-origin in prod — the fe-gateway proxies /api/* to federation-api. */
  federationApiBase: '',
  /** DB-driven DYNAMIC manifest endpoint, fetched first by the bootstrap; on ANY
   *  failure it falls back to the BUNDLED `federationManifest` above (the static
   *  fe-gateway-paths json) so the prod shell always boots. Same-origin in prod —
   *  the fe-gateway proxies /api/* to federation-api with the session cookie. */
  federationManifestUrl: '/api/federation/manifest',
};
