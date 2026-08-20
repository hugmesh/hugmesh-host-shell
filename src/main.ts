import { bootFederation } from './app/federation/federation-boot';

// Native-federation HOST entrypoint. Resolve the remote manifest and initialize
// federation BEFORE bootstrapping Angular, then hand off to ./bootstrap.
//
// DYNAMIC-FIRST, STATIC-FLOOR. The manifest is read from the DB-driven endpoint
// (federation-api GET /api/federation/manifest) so new/disabled/kill-switched
// remotes land WITHOUT a host redeploy, carrying the session cookie so an
// already-authenticated reload gets its domain/visibility-scoped overlay, unioned
// OVER the bundled static manifest (the build-time FLOOR). On ANY failure —
// including the 401 an ANONYMOUS pre-login caller gets from that `authenticated()`
// endpoint — it falls back to the bundled static manifest, so the shell always
// boots. See app/federation/federation-bootstrap.ts for that contract.
//
// DEFERRED, NOT EAGER. The resolved remotes are PARKED, not handed to
// initFederation. initFederation fetches every remoteEntry.json it is given in a
// Promise.all barrier before Angular may bootstrap, so passing the full manifest
// made every boot request all thirteen remotes no matter who was asking. The gated
// ones (/admin, /mod, /wiki, /tube, …) answer 401 to anyone without the role, and
// because `strictRemoteEntry` defaults to false native-federation merely logs
// "skipping init" and DISCARDS them — so a logged-out boot spent twelve round
// trips, and twelve console errors, to learn nothing and keep nothing. Each remote
// is now initialized from its entry URL when a route guard actually admits the
// user to it. See app/federation/federation-boot.ts.
//
// The swallowed .catch is deliberate: a broken manifest still boots the shell DARK
// (no remotes) rather than hard-failing — graceful degrade over a white screen.
bootFederation()
  .catch((err) => console.error(err))
  .then(() => import('./bootstrap'))
  .catch((err) => console.error(err));
