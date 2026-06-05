FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json yarn.lock ./
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY tsconfig.base.json tsconfig.json nest-cli.json ./
RUN yarn install --frozen-lockfile
RUN yarn build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/apps/api-service/prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/apps/api-service/src/main"]
