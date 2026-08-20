// HOST shell config. This repo is the native-federation HOST (the fe-gateway /**
// catch-all, hugmesh-host-shell). It exposes NOTHING — it only CONSUMES the
// login/matrix/mastodon/admin remotes at runtime via loadRemoteModule, resolving
// each remoteEntry.json from src/assets/federation.manifest.json.
//
// The shared-deps surface + RxJS skip list live in ./federation-base.js so a
// change to the federation contract lands in one file (games convention).
//
// NOTE: the remotes are currently built against an older Angular major while
// this host is ^22.0.0 — with strictVersion that mismatch fails at runtime. The
// remotes must be bumped (or this host pinned to their major) before a real
// mount succeeds. See the open issue tracked in the host shell PR.
const { hugmeshHost } = require('./federation-base');

module.exports = hugmeshHost({
  name: 'hugmesh-host',
  // three.js + Vanta are SKIPPED from the shared surface on purpose, exactly as
  // login-ui skips them (its federation.config.js carries the full rationale):
  // they exist only behind the background's dynamic import()s, and sharing them
  // would hoist 154 KB (gzipped) out of a lazily-fetched chunk into a bundle
  // listed in remoteEntry.json — paid for on every page of the mesh. Skipping
  // keeps esbuild's code splitting in charge, so the animation code is fetched
  // only when a theme actually declares a vanta-* effect. `vanta` additionally
  // cannot be shared as authored: its package main is unbuilt ESM with glslify
  // shader imports, which is why the effects are imported from its prebuilt
  // dist/ bundles.
  extraSkip: ['three', 'vanta'],
});
