# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first so this layer is cached unless deps change
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install all deps (including devDependencies for tsc + prisma CLI)
# No cache mounts — plain install avoids the EBUSY /app/node_modules/.cache issue
RUN npm ci

# Generate Prisma client against the installed engine
RUN npx prisma generate

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# ── Stage 2: production image ──────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Only production deps in the final image
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Prisma needs the schema and the generated client
COPY prisma ./prisma/
RUN npx prisma generate

# Compiled JS from the build stage
COPY --from=builder /app/dist ./dist/

EXPOSE 3001

# Push schema (creates/migrates tables) then start
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
