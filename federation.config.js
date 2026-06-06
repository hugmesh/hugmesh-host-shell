const { withNativeFederation, shareAll } = require('@angular-architects/native-federation/config');

// HOST shell config. This repo is the native-federation HOST (the fe-gateway /**
// catch-all, snapdragon-systems-web). It declares NO `name` and exposes NOTHING —
// it only CONSUMES the login/matrix/mastodon/admin remotes at runtime via
// loadRemoteModule, resolving each remoteEntry.json from src/assets/federation.manifest.json.
module.exports = withNativeFederation({
  // Share Angular (+ everything else) as singletons so the host and every remote
  // run against ONE copy. strictVersion enforces the shared-dependency contract.
  // NOTE: the remotes are currently built against Angular ^18.2.0 while this host
  // is ^22.0.0 — with strictVersion that mismatch fails at runtime. The remotes
  // must be bumped to 22 (or this host pinned to their major) before a real mount
  // succeeds. See the open issue tracked in the host shell PR.
  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
  },

  skip: [
    'rxjs/ajax',
    'rxjs/fetch',
    'rxjs/testing',
    'rxjs/webSocket',
  ],
});
