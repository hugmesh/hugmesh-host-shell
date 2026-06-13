// The PRODUCTION static manifest as an OBJECT, imported at build time (no runtime
// fetch): the fe-gateway public paths, not the dev localhost ports. This is the
// FLOOR the dynamic overlay is unioned on top of in resolveFederationSource().
// resolveJsonModule is enabled in tsconfig.json.
import federationStaticManifest from '../assets/federation.manifest.prod.json';

export const environment = {
  production: true,
  /** PRODUCTION native-federation manifest PATH: the fe-gateway public paths
   *  (`/login/remoteEntry.json`, `/social/matrix/remoteEntry.json`, …), NOT the
   *  dev localhost ports. The documented fallback artifact. This module is
   *  file-replaced in for the dev environment.ts by the production build's
   *  `fileReplacements`, which fixes the pre-existing bug where the dev
   *  localhost-ports manifest shipped in prod (fileReplacements cannot swap the
   *  static asset itself, only this module that names it). */
  federationManifest: 'assets/federation.manifest.prod.json',
  /** The SAME prod static manifest as an in-memory OBJECT (build-time import): the
   *  brand-NEUTRAL platform-remote FLOOR unioned UNDER the dynamic overlay in
   *  resolveFederationSource(), so every baked fe-gateway remote is ALWAYS
   *  registered while the DB can still ADD remotes without a host redeploy. */
  federationStaticManifest: federationStaticManifest as Record<string, string>,
  /** Same-origin in prod — the fe-gateway proxies /api/* to federation-api. */
  federationApiBase: '',
  /** DB-driven DYNAMIC manifest endpoint, fetched first by the bootstrap; on ANY
   *  failure it falls back to the BUNDLED `federationManifest` above (the static
   *  fe-gateway-paths json) so the prod shell always boots. Same-origin in prod —
   *  the fe-gateway proxies /api/* to federation-api with the session cookie. */
  federationManifestUrl: '/api/federation/manifest',
};
