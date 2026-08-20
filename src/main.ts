import { initFederation } from '@angular-architects/native-federation';
import { planFederationBoot } from './app/federation/federation-bootstrap';
import { rememberRemoteEntries } from './app/federation/remote-registry';

// Native-federation HOST entrypoint. Resolve which remotes to register BEFORE
// bootstrapping Angular, then hand off to ./bootstrap. initFederation maps remote
// name -> remoteEntry URL; loadRemote() in app/federation/remote-registry.ts
// relies on it, and registers anything this boot deferred on first use.
//
// DYNAMIC-FIRST, STATIC-FLOOR. planFederationBoot() first fetches the DB-driven
// manifest (federation-api GET /api/federation/manifest) so new/disabled/
// kill-switched remotes land WITHOUT a host redeploy, carrying the session cookie
// when present so an already-authenticated reload gets its domain/visibility-scoped
// overlay. On dynamic SUCCESS it unions the bundled static manifest (the build-time
// FLOOR — every baked remote) with the dynamic overlay, so a successful read is
// never strictly worse than the static build even if the DB seed is incomplete. On
// ANY failure — including the 401 an ANONYMOUS pre-login caller gets from the
// `authenticated()` endpoint, plus network/5xx/parse/empty — it falls back to that
// bundled floor so the shell ALWAYS boots.
//
// EAGER vs DEFERRED (this is the part that keeps the console clean). initFederation
// FETCHES every remoteEntry.json it is handed. While logged OUT every gated remote
// can only answer 401, so an anonymous boot is handed the PUBLIC remotes only and
// the rest are merely REMEMBERED. rememberRemoteEntries() must therefore run for
// `all`, not `eager`: it is what lets loadRemote() register a deferred remote the
// moment a route actually needs it — including in a tab that adopted a sibling
// tab's sign-in without ever reloading. See federation-bootstrap.ts
// (planFederationBoot) and remote-registry.ts for the two halves of that contract.
//
// The trailing .catch is deliberately swallowed: an empty/bad manifest still boots
// the shell DARK (no remotes) rather than hard-failing — graceful degrade.
planFederationBoot()
  .then(({ eager, all }) => {
    rememberRemoteEntries(all);
    return initFederation(eager);
  })
  .catch((err) => console.error(err))
  .then(() => import('./bootstrap'))
  .catch((err) => console.error(err));
