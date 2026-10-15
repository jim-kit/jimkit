# syntax=docker/dockerfile:1.7
#
# Jimkit image. Every first-party addon is always built in; what differs is the system software installed next to the app.
#
#   docker build -f docker/Dockerfile --build-arg VARIANT=lite -t jimkit:lite .     no engines: text, hash, image editor, data conversion. ~400 MB
#   docker build -f docker/Dockerfile --build-arg VARIANT=full -t jimkit:full .     + ffmpeg, ImageMagick, LibreOffice, pandoc, poppler, rsvg. ~1.8 GB
#
# The full variant's package list is read from the addons' own manifests ("system.apt"), so a new addon that needs a program only
# has to say so. An addon whose programs are missing reports it at start-up and the UI shows what to install.
# Custom builds (third-party addons, a trimmed list): ADDONS="a,b,c" and/or APT_PACKAGES="...". `jimkit build --docker` helps.
ARG NODE_VERSION=22

# ── 1. every package.json in the workspace, so the dependency layer only changes when they do
# ── 0. which Debian packages does this variant need? (read from the manifests; the answer is a few lines of text, so the
#      expensive apt layer below is only rebuilt when the list itself changes)
FROM node:${NODE_VERSION}-bookworm-slim AS aptlist
ARG VARIANT=lite
ARG APT_PACKAGES=""
WORKDIR /w
COPY cli cli
COPY scripts scripts
COPY addons addons
# gen-addons.mjs (which `jimkit apt` runs) checks manifests with the SDK's bundle.mjs: without it the full variant cannot even list its packages
COPY packages/sdk/src/bundle.mjs packages/sdk/src/bundle.mjs
RUN if [ -n "$APT_PACKAGES" ]; then printf '%s\n' "$APT_PACKAGES" > /apt.txt; \
    elif [ "$VARIANT" = "full" ]; then node cli/jimkit.mjs apt --addons '*' > /apt.txt; \
    else : > /apt.txt; fi

FROM node:${NODE_VERSION}-bookworm-slim AS manifests
WORKDIR /src
COPY . .
# fixed order, owner and timestamps (find lists files in directory order): a fresh checkout has new mtimes, which would otherwise change the tar and re-run npm ci every time
RUN find . -name package.json -not -path "*/node_modules/*" -print0 | sort -z | tar --null --mtime=@0 --owner=0 --group=0 --numeric-owner -cf /manifests.tar --files-from=- package-lock.json

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY --from=manifests /manifests.tar /manifests.tar
RUN tar -xf /manifests.tar && rm /manifests.tar
RUN npm ci --no-audit --no-fund

# ── 2. build
# Which addons go into the build: "*" (all of them), or a list like "text,hash,image". Empty keeps jimkit.config.json as it is.
ARG ADDONS=""
FROM node:${NODE_VERSION}-bookworm-slim AS build
ARG ADDONS
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app ./
COPY . .
RUN if [ -n "$ADDONS" ]; then node -e 'require("fs").writeFileSync("jimkit.config.json", JSON.stringify({ addons: process.argv[1] === "*" ? "*" : process.argv[1].split(",") }))' "$ADDONS"; fi \
 && node scripts/gen-addons.mjs && npm run build -w apps/web \
 && mkdir -p /app/_scripts && cp scripts/hash-code.mjs /app/_scripts/ && (cp addons/*/scripts/*.mjs /app/_scripts/ 2>/dev/null || true)

# ── 3. run
FROM node:${NODE_VERSION}-bookworm-slim AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 JIMKIT_DATA_DIR=/data HOSTNAME=0.0.0.0
COPY --from=aptlist /apt.txt /tmp/apt.txt
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates $(cat /tmp/apt.txt) \
 && rm -rf /var/lib/apt/lists/* /tmp/apt.txt
# ImageMagick and pandoc are locked down (a policy allowing only the formats we convert; pandoc runs with --sandbox, which
# stops it loading its own templates, so the ones we need are generated once, here). Only done if those engines are installed.
COPY docker/imagemagick-policy.xml /opt/jimkit/imagemagick-policy.xml
RUN if [ -d /etc/ImageMagick-6 ]; then cp /opt/jimkit/imagemagick-policy.xml /etc/ImageMagick-6/policy.xml; fi \
 && if command -v pandoc >/dev/null 2>&1; then mkdir -p /opt/pandoc && cd /opt/pandoc \
      && pandoc --print-default-data-file reference.odt > reference.odt && pandoc -D html5 > default.html5 && pandoc -D latex > default.latex; fi
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
# the app reads its version from here (core/version.ts)
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/server.mjs /app/apps/web/next.config.mjs ./apps/web/
COPY --from=build /app/_scripts ./scripts
RUN mkdir -p /data /app/apps/web/.next/cache && chown -R node:node /data /app/apps/web/.next/cache
USER node
WORKDIR /app/apps/web
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.mjs"]
