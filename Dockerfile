FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/worldview/package.json packages/worldview/package.json
COPY packages/worldview-editor/package.json packages/worldview-editor/package.json
COPY apps/editor/package.json apps/editor/package.json
COPY apps/worldview-service/package.json apps/worldview-service/package.json
RUN npm ci --ignore-scripts
COPY packages/worldview packages/worldview
COPY packages/worldview-editor packages/worldview-editor
COPY apps/editor apps/editor
COPY apps/worldview-service apps/worldview-service
ARG WORLDVIEW_COLLABORATION_ENDPOINT
ENV VITE_WORLDVIEW_COLLABORATION_ENDPOINT=$WORLDVIEW_COLLABORATION_ENDPOINT
RUN npm run build -w @jackharrhy/worldview \
  && npm run build -w @jackharrhy/worldview-editor \
  && npm run build -w @worldview/editor \
  && npm run build -w @worldview/service

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production WORLDVIEW_STATIC_ROOT=/app/apps/editor/dist WORLDVIEW_DATA_ROOT=/data
COPY package.json ./
COPY --from=build /app/apps/editor/dist apps/editor/dist
COPY --from=build /app/apps/worldview-service/dist apps/worldview-service/dist
EXPOSE 8789
CMD ["node", "apps/worldview-service/dist/server.js"]
