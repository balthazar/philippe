# Frontend lives in site/; this Dockerfile stays at the repo root so its
# build context (repo root) matches api/Dockerfile's, but every COPY is
# prefixed with site/ since nothing here sits at the repo root itself.
FROM node:24.19-alpine AS build
WORKDIR /app
ARG PRERENDER_API_URL
ARG SITE_URL=https://philippe.natazar.org
COPY site/package.json site/package-lock.json ./
RUN npm ci
COPY site/index.html site/vite.config.js site/jsconfig.json ./
COPY site/public ./public
COPY site/src ./src
COPY site/prerender ./prerender
# npm run build:prerender chains all three steps (client build, SSR build,
# prerender) via site/package.json, so this Dockerfile doesn't duplicate that
# sequencing. An unreachable API degrades gracefully (prerender/index.js logs
# "prerender skipped" and exits 0, shipping the SPA shell); an API that
# answers but returns an implausibly small archive fails the build instead of
# shipping a near-empty site (see prerender/index.js's checkFloor).
RUN PRERENDER_API_URL=$PRERENDER_API_URL SITE_URL=$SITE_URL npm run build:prerender

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
