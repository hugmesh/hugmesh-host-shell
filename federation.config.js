// HOST shell config. This repo is the native-federation HOST (the fe-gateway /**
// catch-all, snapdragon-systems-web). It exposes NOTHING — it only CONSUMES the
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
const { snapdragonHost } = require('./federation-base');

module.exports = snapdragonHost({ name: 'snapdragon-host' });
