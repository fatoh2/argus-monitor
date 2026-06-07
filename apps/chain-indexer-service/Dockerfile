FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY tsconfig.base.json tsconfig.json nest-cli.json ./
RUN yarn install --frozen-lockfile
RUN yarn build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist/apps/chain-indexer-service ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3001
CMD ["node", "dist/main"]
