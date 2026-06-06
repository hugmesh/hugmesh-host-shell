import { initFederation } from '@angular-architects/native-federation';

// Native-federation HOST entrypoint. Resolve every remote's remoteEntry.json from
// the manifest BEFORE bootstrapping Angular, then hand off to ./bootstrap. The
// manifest maps remote name -> remoteEntry URL (dev: localhost ports; prod: the
// fe-gateway public paths). loadRemoteModule in app.routes.ts relies on this init.
initFederation('assets/federation.manifest.json')
  .catch((err) => console.error(err))
  .then(() => import('./bootstrap'))
  .catch((err) => console.error(err));
