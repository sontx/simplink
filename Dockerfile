FROM node:22-alpine AS build
WORKDIR /app
RUN npm install --global pnpm@12.14.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 KB_DIR=/app/kb
RUN npm install --global pnpm@12.14.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/mcp/package.json ./packages/mcp/package.json
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/schemas ./packages/core/schemas
COPY --from=build /app/packages/mcp/dist ./packages/mcp/dist
# KB baked into the image; mount a volume at /app/kb to override (restart to reload).
COPY kb ./kb
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "packages/mcp/dist/http-bin.js"]
