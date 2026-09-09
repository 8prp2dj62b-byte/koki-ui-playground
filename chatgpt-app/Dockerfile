FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY src ./src
COPY tests ./tests
RUN npm run build && npm test

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist
RUN mkdir -p /data && chown node:node /data
EXPOSE 8787
USER node
CMD ["node", "server-dist/gateway.js"]
