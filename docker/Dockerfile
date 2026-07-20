FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

FROM deps AS api-build
COPY apps/api apps/api
COPY .env.example .env.example
RUN pnpm --filter @suvenir/api exec prisma generate
RUN pnpm --filter @suvenir/api run build

FROM deps AS web-build
COPY apps/web apps/web
COPY apps/api/prisma apps/api/prisma
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @suvenir/web run build

FROM node:22-alpine AS api
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/apps/api/dist ./apps/api/dist
COPY --from=api-build /app/apps/api/package.json ./apps/api/
COPY --from=api-build /app/apps/api/prisma ./apps/api/prisma
COPY --from=api-build /app/package.json ./
COPY --from=api-build /app/pnpm-workspace.yaml ./
RUN mkdir -p /app/uploads /app/data
EXPOSE 3001
CMD ["node", "apps/api/dist/src/main.js"]

FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=web-build /app/apps/web/.next/standalone ./
COPY --from=web-build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build /app/apps/web/public ./apps/web/public
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
