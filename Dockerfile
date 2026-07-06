# Multi-stage build for the DataC web/API server (Next.js standalone + Prisma).
# Produces a small runtime image; the database is a separate service.

# ---- base -----------------------------------------------------------------
FROM node:20-bookworm-slim AS base
# Prisma's query engine needs OpenSSL at runtime.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- deps -----------------------------------------------------------------
# Install full deps; postinstall runs `prisma generate` (needs the schema).
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- builder --------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---- migrator -------------------------------------------------------------
# One-shot image used by `docker compose run --rm migrate` to apply migrations.
FROM builder AS migrator
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- runner ---------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4321
ENV HOSTNAME=0.0.0.0
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

# Next.js standalone output + assets.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Generated Prisma client + engine (custom output dir) and schema/migrations.
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma

USER nextjs
EXPOSE 4321
CMD ["node", "server.js"]
