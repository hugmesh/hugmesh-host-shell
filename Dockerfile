### STAGE 1: Build ###
FROM node:lts-alpine AS build

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

#### install angular cli
# NOTE: an earlier revision pinned @softarc/native-federation here with
# `npm pkg set 'overrides…'=4.3.2`, injected by the generator's
# scripts/patch-stack-src.sh and then accidentally COMMITTED. It is removed
# because a hardcoded version in this file silently OVERWRITES whatever
# package.json resolved to, so the pin could only ever go stale downward — and
# it did: it held 4.3.2 while @angular-architects/native-federation@22.1.1
# began requiring ^4.4.0, and this build failed with
#   The requested module '@softarc/native-federation/internal' does not provide
#   an export named 'isUnderAnyDir'
# The override now lives ONCE, in package.json, where the lockfile records it
# and Dependabot can see it. The generator script derives its value from the
# lockfile and re-injects only when two copies actually diverge, which is the
# self-healing behaviour committing its output defeated.
RUN npm install -g @angular/cli

#### install project dependencies FROM THE LOCKFILE
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
# THIS LINE REQUIRES npm >= 11.3.0. The nested override
#   overrides["cucumber-html-reporter"]["@cucumber/cucumber"]["semver"]
# is placed differently by npm 10, which aborts with "Missing: semver@7.5.2 /
# lru-cache@6.0.0 / yallist@4.0.0 from lock file"; `npm install` never noticed
# because it simply re-resolves. node:lts-alpine satisfies the bound (node 24
# ships npm 11.6.1 .. 11.19.0) and node LTS only moves forward -- but node 22
# ships npm 10.9.x, so a base-image DOWNGRADE is the one change that breaks this
# line. `node -v && npm -v` is recorded in the build log for exactly that reason
# (same rationale as the CI job's "Record toolchain" step).
RUN node -v && npm -v && npm ci

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
