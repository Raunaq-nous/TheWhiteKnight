# syntax=docker/dockerfile:1

# ---- build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install native build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build the Next.js app. Environment variables that are baked in at build time
# (NEXT_PUBLIC_*) go here. All server-side vars are injected at runtime.
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache python3 make g++

# Copy only what next start needs
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./

# private/ is mounted as a volume at runtime — do not bake it into the image.
# The volume provides private/careeros.db and optionally private/admin-profile.json.
RUN mkdir -p /data/private

EXPOSE 3000

# CAREEROS_DB_PATH points to the mounted volume so data survives rebuilds.
ENV CAREEROS_DB_PATH=/data/private/careeros.db

CMD ["node_modules/.bin/next", "start", "-p", "3000"]
