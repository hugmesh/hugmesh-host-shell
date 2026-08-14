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
# ── injected by scripts/patch-stack-src.sh (LOCAL stack build) ───────────────
# This lock resolves two copies of @softarc/native-federation; the hoisted one
# is older than the copy @angular-architects/native-federation nests, so the
# orchestrator typings fail to compile (TS2724 DenseSharedInfo). Collapse them
# onto the nested version — read from this repo's own lockfile.
RUN npm pkg set 'overrides.@softarc/native-federation'=4.3.2
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

#### runtime THEME injection (login-ui 50-snap-theme.sh mechanism): writes
#### /usr/share/nginx/html/snap-theme.css from $SNAP_THEME_CSS at container
#### start — already-derived --sd-* token text from studio core/theme.py; zero
#### colour maths on this side. The nginx-unprivileged base image runs
#### /docker-entrypoint.d/*.sh before nginx forks, CMD override included.
#### COPY --chmod, NOT COPY+RUN chmod: this final stage runs as uid 101 (the
#### nginx-unprivileged base sets USER), and a RUN chmod on the root-owned
#### COPY output exits 1. --chmod needs BuildKit, which the stack always sets
#### (Makefile: DOCKER_BUILDKIT=1).
COPY --chmod=0755 docker-entrypoint.d/50-snap-theme.sh /docker-entrypoint.d/50-snap-theme.sh
#### The docroot is NOT writable for uid 101 on nginx-unprivileged, so the hook
#### writes to /tmp (its SNAP_THEME_OUT seam) and nginx serves it through the
#### exact-match `location = /snap-theme.css` alias in nginx.conf. Without this
#### ENV the hook's docroot default hits Permission denied and `set -eu` takes
#### the whole container down with nginx exit 2 BEFORE nginx ever starts.
ENV SNAP_THEME_OUT=/tmp/snap-theme.css

#### copy artifact build from the 'build environment'
COPY --from=build /usr/src/app/public/hugmesh.net/browser /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]
