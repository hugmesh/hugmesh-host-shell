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

#### copy artifact build from the 'build environment'
COPY --from=build /usr/src/app/public/snapdragon.systems/browser /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]