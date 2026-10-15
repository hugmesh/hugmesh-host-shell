### STAGE 1: Build ###
#### PINNED BY DIGEST (the multi-arch index for node:lts-alpine, node 24.22.0 on
#### 2026-10-15; node:24-alpine is the same digest). A floating tag lets whoever
#### controls the next push to that tag change the toolchain that runs `npm ci`
#### and builds the bundle. This stage is NOT shipped, so a stale digest costs a
#### rebuild, not a runtime exposure. Dependabot is not configured for docker
#### here, so bumping is a deliberate edit: copy the new digest from
#### `docker buildx imagetools inspect node:lts-alpine`, keep the tag in front of
#### it, and the npm floor check below still gates the result.
FROM node:lts-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build

#### make the 'app' folder the current working directory
WORKDIR /usr/src/app

#### copy 'package.json', 'package-lock.json' (if available), and .npmrc — the
#### repo pins legacy-peer-deps=true here (some direct deps' peer ranges have
#### drifted from what's actually resolvable on the registry); without this
#### file the Docker build's install runs in strict-peer mode and can fail with
#### ERESOLVE even though local/CI installs outside Docker have always picked it
#### up automatically from the working tree. Still required now that the install
#### below is `npm ci`: the lockfile was RESOLVED under legacy-peer-deps, so the
#### tree it records is not one strict-peer mode would agree to build.
COPY package*.json .npmrc ./
COPY scripts/check-lockfile-sources.mjs scripts/check-lockfile-sources.mjs

#### FAIL THE BUILD on any dependency that is not an npm-registry tarball with an
#### integrity hash (git+ssh, URL, path, owner/repo specs, missing hash). This runs
#### BEFORE `npm ci` fetches anything. The lockfile once carried
#### node_modules/download -> git+ssh://git@github.com/garg3133/download.git#<sha>
#### with no integrity, which `npm ci` fetched from a personal fork unverified.
RUN node scripts/check-lockfile-sources.mjs

#### NO global @angular/cli. `npm run build` below resolves `ng` from the
#### devDependency in package-lock.json (node_modules/.bin/ng, put on PATH by
#### npm run), so a global `npm install -g @angular/cli` installed a SECOND,
#### unpinned, unlocked copy that the build never used. It is removed rather than
#### pinned (issue #55).
#
# HISTORY, kept because it explains why no override is injected here: an earlier
# revision pinned @softarc/native-federation here with
# `npm pkg set 'overrides…'=4.3.2`, injected by the generator's
# scripts/patch-stack-src.sh and then accidentally COMMITTED. It is removed
# because a hardcoded version in this file silently OVERWRITES whatever
# package.json resolved to, so the pin could only ever go stale downward — and
# it did: it held 4.3.2 while @angular-architects/native-federation@22.1.1
# began requiring ^4.4.0, and this build failed with
#   The requested module '@softarc/native-federation/internal' does not provide
#   an export named 'isUnderAnyDir'
# The override was then moved ONCE into package.json, and REMOVED there by #53:
# the only thing that ever produced a second copy was the dead
# @softarc/native-federation-node dependency (pinned EXACTLY 4.1.3, imported
# nowhere), now deleted, so the lockfile resolves one copy from
# @angular-architects/native-federation own range with no pin anywhere. The
# generator script still derives from the lockfile and re-injects only if two
# copies ever diverge again, which is the self-healing behaviour committing its
# output defeated.

#### install project dependencies FROM THE LOCKFILE, WITHOUT LIFECYCLE SCRIPTS
# `--ignore-scripts`: no dependency's preinstall/install/postinstall/prepare runs
# during the image build. 12 locked packages declare an install script
# (@nightwatch/nightwatch-inspector, @parcel/watcher, @swc/core, chromedriver,
# core-js, core-js-pure, es5-ext, esbuild, fsevents, geckodriver, lmdb,
# msgpackr-extract). MEASURED: with scripts off, `npm ci` exits 0 and
# `npm run build` exits 0 and writes public/hugmesh.net (node v26.11.1 / npm 12.2.0
# on the dev box, not the image's 24.x; the committed lockfile), so the production bundle needs none of them. A
# dependency that does need its install script now fails the build step loudly
# instead of running code during `npm ci`. The e2e jobs still install WITH scripts
# because chromedriver/geckodriver download their driver binaries there.
# `npm ci`, NOT `npm install`. This stage builds the image users actually run
# (.gitlab-ci.yml `build:image`, default branch + tags), so leaving `npm install`
# here meant the shipped artifact was a fresh re-resolve while CI validated the
# LOCKED tree -- a CI-vs-artifact divergence that nothing gated.
# MEASURED in this exact base image (node:lts-alpine and node:24-alpine are the
# same digest today; node v24.19.0 / npm 11.17.0), with package.json pinned to
# @types/node 26.2.0 against a lockfile holding 26.4.0:
#   npm install -> exit 0, and it SILENTLY REWROTE package-lock.json to 26.2.0
#                  (md5 8c2de3af -> 3f9d9c0b). The image ships a tree nobody
#                  reviewed and the build says nothing.
#   npm ci      -> exit 1, EUSAGE, "lock file's @types/node@26.4.0 does not
#                  satisfy @types/node@26.2.0" -- names the package, and leaves
#                  package-lock.json byte-identical.
# On the committed tree `npm ci` here exits 0 with exactly one hoisted
# @softarc/native-federation@4.5.0, i.e. the same tree the CI job validates.
#
# THIS LINE REQUIRES npm >= 11.3.0, and the `node -e` below ENFORCES it. The
# nested override
#   overrides["cucumber-html-reporter"]["@cucumber/cucumber"]["semver"]
# is placed differently by npm 10, which aborts with the unhelpful "Missing:
# semver@7.5.2 / lru-cache@6.0.0 / yallist@4.0.0 from lock file" -- all three ARE
# in the committed lockfile, just at a different path. `npm install` never
# noticed because it simply re-resolves, so this floor arrives WITH `npm ci`.
# `node:lts-alpine` satisfies it today (it is the same digest as node:24-alpine,
# npm 11.17.0) and node LTS only moves forward -- but node 22 ships npm 10.9.x,
# so a base-image DOWNGRADE is the one change that breaks the install.
#
# A CHECK as well as the digest pin on the FROM line above. The pin fixes WHICH
# toolchain builds; this check names the cause when someone bumps the digest to
# an image whose npm is below the floor, instead of the unhelpful "Missing: ...
# from lock file". (An earlier revision refused a digest pin, because a hardcoded
# version goes stale downward -- the 4.3.2 override above. That is true of a
# package override that silently overwrites what the lockfile resolved; this
# stage's base image is not resolved by anything, and its staleness is bounded:
# it is the build stage, not the shipped image.)
# MUTATION-TESTED by running this exact program over a version table (the guard
# itself had never been exercised, only reasoned about). It rejects 8.19.4 /
# 9.9.4 / 10.8.2 / 10.9.4 / 10.9.8 / 11.0.0 / 11.2.9 and admits 11.3.0 / 11.17.0
# / 11.19.0 / 12.0.2 -- the same boundary `npm ci --dry-run` draws on the
# committed package-lock.json. `node -v && npm -v` is printed either way, so the
# versions a build used are never inferred (same rationale as the CI job's
# "Record toolchain" step).
# The Number.isInteger / `!(p[1]>=3)` spellings are the fail-CLOSED half: a
# version string this cannot parse ("unknown", "11.x") yields NaN, and a bare
# `NaN < 11` is FALSE, so the naive comparison would have waved an unreadable
# npm through. An empty `npm -v` was already caught (it parses to 0). A
# prerelease of the bound, "11.3.0-pre", still passes -- deliberate.
RUN node -v && npm -v && \
    node -e 'const v=process.argv[1],p=v.split(".").map(Number); if(!Number.isInteger(p[0])||p[0]<11||(p[0]===11&&!(p[1]>=3))){console.error("FATAL: npm "+v+" cannot read this repo lockfile; need >= 11.3.0 -- the base image tag has moved below the bound");process.exit(1)} console.log("npm "+v+" satisfies the >= 11.3.0 lockfile floor")' "$(npm -v)" && \
    npm ci --ignore-scripts

#### copy things
COPY . .

#### generate build --prod
RUN npm run build --prod

### STAGE 2: Run ###
FROM nginxinc/nginx-unprivileged

#### copy nginx conf
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

#### runtime THEME injection (login-ui 50-hug-theme.sh mechanism): writes
#### /usr/share/nginx/html/hug-theme.css from $SNAP_THEME_CSS at container
#### start — already-derived --sd-* token text from studio core/theme.py; zero
#### colour maths on this side. The nginx-unprivileged base image runs
#### /docker-entrypoint.d/*.sh before nginx forks, CMD override included.
#### COPY --chmod, NOT COPY+RUN chmod: this final stage runs as uid 101 (the
#### nginx-unprivileged base sets USER), and a RUN chmod on the root-owned
#### COPY output exits 1. --chmod needs BuildKit, which the stack always sets
#### (Makefile: DOCKER_BUILDKIT=1).
COPY --chmod=0755 docker-entrypoint.d/50-hug-theme.sh /docker-entrypoint.d/50-hug-theme.sh
#### The docroot is NOT writable for uid 101 on nginx-unprivileged, so the hook
#### writes to /tmp (its HUG_THEME_OUT seam) and nginx serves it through the
#### exact-match `location = /hug-theme.css` alias in nginx.conf. Without this
#### ENV the hook's docroot default hits Permission denied and `set -eu` takes
#### the whole container down with nginx exit 2 BEFORE nginx ever starts.
ENV HUG_THEME_OUT=/tmp/hug-theme.css

#### copy artifact build from the 'build environment'
COPY --from=build /usr/src/app/public/hugmesh.net/browser /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]
