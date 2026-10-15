# The website as a container of plain static files behind nginx.
#
#   docker build -f apps/site/deploy/Dockerfile -t jimkit-site \
#     --build-arg SITE_URL=https://example.org --build-arg REPO_URL=https://github.com/you/jimkit .
#
# Run from the repository root: the site renders the repository's own docs and reads its addon manifests while it builds.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY . .
# what the pages say about their own address (canonical links, the sitemap, social cards), and an optional link to the repository
ARG SITE_URL=https://jimkit.thejimmy.dev
ARG REPO_URL=https://github.com/jim-kit/jimkit
ARG GOOGLE_VERIFICATION=
ARG BING_VERIFICATION=
ENV NEXT_PUBLIC_SITE_URL=$SITE_URL NEXT_PUBLIC_REPO_URL=$REPO_URL NEXT_PUBLIC_GOOGLE_VERIFICATION=$GOOGLE_VERIFICATION NEXT_PUBLIC_BING_VERIFICATION=$BING_VERIFICATION NEXT_TELEMETRY_DISABLED=1
RUN npm ci --no-audit --no-fund && npm run build:site

FROM nginx:1.27-alpine
COPY apps/site/deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/site/out /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/robots.txt >/dev/null || exit 1
