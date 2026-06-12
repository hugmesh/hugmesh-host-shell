import { initFederation } from '@angular-architects/native-federation';
import { environment } from './environments/environment';

// Native-federation HOST entrypoint. Resolve every remote's remoteEntry.json from
// the manifest BEFORE bootstrapping Angular, then hand off to ./bootstrap. The
// manifest maps remote name -> remoteEntry URL (dev: localhost ports; prod: the
// fe-gateway public paths). loadRemoteModule in app.routes.ts relies on this init.
//
// The manifest PATH comes from `environment` (file-replaced for production), NOT a
// hardcoded string: the dev/prod manifests are both static assets, and the
// production `fileReplacements` swap the environment MODULE (which names the
// manifest) — they cannot rewrite the copied static asset. Picking the path here
// is what makes the prod build ship the fe-gateway manifest, not dev localhost
// ports. The .catch is deliberately swallowed: a missing/empty/bad manifest still
// boots the shell DARK (no remotes) rather than hard-failing — graceful degrade.
initFederation(environment.federationManifest)
  .catch((err) => console.error(err))
  .then(() => import('./bootstrap'))
  .catch((err) => console.error(err));
