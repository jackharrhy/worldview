FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/worldview/package.json packages/worldview/package.json
COPY packages/worldview-editor/package.json packages/worldview-editor/package.json
COPY packages/worldview-protocol/package.json packages/worldview-protocol/package.json
COPY apps/editor/package.json apps/editor/package.json
COPY apps/worldview-service/package.json apps/worldview-service/package.json
COPY apps/compiler-service/package.json apps/compiler-service/package.json
COPY apps/collaboration-service/package.json apps/collaboration-service/package.json
RUN npm ci --ignore-scripts
COPY packages/worldview packages/worldview
COPY packages/worldview-editor packages/worldview-editor
COPY packages/worldview-protocol packages/worldview-protocol
COPY apps/editor apps/editor
COPY apps/worldview-service apps/worldview-service
COPY apps/compiler-service apps/compiler-service
COPY apps/collaboration-service apps/collaboration-service
COPY scripts/deploy-celld-azurite.mjs scripts/deploy-celld-azurite.mjs
ARG WORLDVIEW_COLLABORATION_ENDPOINT
ENV VITE_WORLDVIEW_COLLABORATION_ENDPOINT=$WORLDVIEW_COLLABORATION_ENDPOINT
RUN npm run build -w @jackharrhy/worldview \
  && npm run build -w @jackharrhy/worldview-editor \
  && npm run build -w @worldview/protocol \
  && npm run build -w @worldview/editor \
  && npm run build -w @worldview/service \
  && npm run build -w @worldview/compiler-service

FROM node:24-bookworm-slim AS collaboration-deployer
WORKDIR /app
ENV CELLD_BIN=/usr/local/bin/celld
COPY --from=ghcr.io/denoland/celld:0.4.0 /usr/local/bin/celld /usr/local/bin/celld
COPY --from=build /app /app
CMD ["node", "scripts/deploy-celld-azurite.mjs"]

FROM node:24-bookworm-slim AS app
WORKDIR /app
ENV NODE_ENV=production WORLDVIEW_STATIC_ROOT=/app/apps/editor/dist WORLDVIEW_DATA_ROOT=/data
COPY package.json ./
COPY --from=build /app/apps/editor/dist apps/editor/dist
COPY --from=build /app/apps/worldview-service/dist apps/worldview-service/dist
COPY --from=build /app/apps/compiler-service/dist apps/compiler-service/dist
# The service's shared protocol is intentionally external to its plain ESM build. Retain the
# three package entrypoints it resolves at runtime while leaving renderer-only dependencies behind.
COPY --from=build /app/packages/worldview/package.json packages/worldview/package.json
COPY --from=build /app/packages/worldview/dist packages/worldview/dist
COPY --from=build /app/packages/worldview-editor/package.json packages/worldview-editor/package.json
COPY --from=build /app/packages/worldview-editor/dist packages/worldview-editor/dist
COPY --from=build /app/packages/worldview-protocol/package.json packages/worldview-protocol/package.json
COPY --from=build /app/packages/worldview-protocol/dist packages/worldview-protocol/dist
# The service build is plain ESM, so retain only its non-Node runtime dependencies instead of
# copying the monorepo's complete development installation into the production image.
COPY --from=build /app/node_modules/zod node_modules/zod
COPY --from=build /app/node_modules/@sindresorhus/slugify node_modules/@sindresorhus/slugify
COPY --from=build /app/node_modules/@sindresorhus/transliterate node_modules/@sindresorhus/transliterate
COPY --from=build /app/node_modules/escape-string-regexp node_modules/escape-string-regexp
COPY --from=build /app/apps/worldview-service/node_modules/nanoid apps/worldview-service/node_modules/nanoid
RUN mkdir -p node_modules/@jackharrhy node_modules/@worldview \
  && ln -s ../../packages/worldview node_modules/@jackharrhy/worldview \
  && ln -s ../../packages/worldview-editor node_modules/@jackharrhy/worldview-editor \
  && ln -s ../../packages/worldview-protocol node_modules/@worldview/protocol
EXPOSE 8789
CMD ["node", "apps/worldview-service/dist/server.js"]
