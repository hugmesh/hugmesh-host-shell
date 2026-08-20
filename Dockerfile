### STAGE 1: Build ###
FROM node:lts-alpine AS build

#### make the 'app' folder the current working directory
WORKDIR /usr/src/app

#### copy 'package.json', 'package-lock.json' (if available), and .npmrc — the
#### repo pins legacy-peer-deps=true here (some direct deps' peer ranges have
#### drifted from what's actually resolvable on the registry); without this
#### file the Docker build's npm install runs in strict-peer mode and can fail
#### with ERESOLVE even though local/CI installs outside Docker have always
#### picked it up automatically from the working tree.
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

#### install project dependencies
RUN npm install

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
