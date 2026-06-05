# Frontend (Vite + React) — build context is the repo root
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
COPY packages/ ./packages/
COPY apps/frontend/ ./apps/frontend/
COPY tsconfig.base.json tsconfig.json ./
RUN yarn install --frozen-lockfile
# Vite bakes API URL at build time
ARG VITE_API_URL=http://localhost:3000
ARG VITE_WS_URL=ws://localhost:3000
ENV VITE_API_URL=\$VITE_API_URL
ENV VITE_WS_URL=\$VITE_WS_URL
WORKDIR /app/apps/frontend
RUN yarn build

FROM node:20-alpine AS runner
WORKDIR /app/apps/frontend
COPY --from=builder /app/apps/frontend/dist ./dist
COPY --from=builder /app/apps/frontend/package.json ./
COPY --from=builder /app/apps/frontend/vite.config.ts ./
COPY --from=builder /app/node_modules /app/node_modules
ENV PATH=/app/node_modules/.bin:$PATH
EXPOSE 5173
CMD ["vite", "preview", "--host", "0.0.0.0", "--port", "5173"]
