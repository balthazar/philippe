# Frontend lives in site/; this Dockerfile stays at the repo root so its
# build context (repo root) matches api/Dockerfile's, but every COPY is
# prefixed with site/ since nothing here sits at the repo root itself.
FROM node:24.19-alpine AS build
WORKDIR /app
ARG PRERENDER_API_URL
ARG SITE_URL=https://www.philippegronon.com
# Left unset here deliberately: prerender/index.js's unreachableApiOutcome
# fails the build (non-zero exit) by default when the API can't be reached,
# so a briefly-down API or an unresolvable Service mid-rollout can never
# ship a contentless SPA shell silently. Only pass
# --build-arg PRERENDER_OPTIONAL=1 for a local, no-API build-verification
# run (Task 23 brief, Step 4) -- never in the production build path or the
# deploy workflow, or this guard is defeated exactly where it matters most.
ARG PRERENDER_OPTIONAL
COPY site/package.json site/package-lock.json ./
RUN npm ci
COPY site/index.html site/vite.config.js site/jsconfig.json ./
COPY site/public ./public
COPY site/src ./src
COPY site/prerender ./prerender
# npm run build:prerender chains all three steps (client build, SSR build,
# prerender) via site/package.json, so this Dockerfile doesn't duplicate that
# sequencing. An API that answers but returns an implausibly small archive
# also fails the build rather than shipping a near-empty site (see
# prerender/index.js's checkFloor).
RUN PRERENDER_API_URL=$PRERENDER_API_URL SITE_URL=$SITE_URL PRERENDER_OPTIONAL=$PRERENDER_OPTIONAL npm run build:prerender

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
