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
# LibreOffice headless — DOCX -> PDF resume export (lib/server/resume-pdf-pipeline.ts).
# libreoffice-writer alone (not the full apk libreoffice meta-package) keeps
# this to just the component that actually does the conversion.
RUN apk add --no-cache libreoffice-writer

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

# CAREEROS_PRIVATE_DIR points to the mounted volume so both the DB and the
# admin-profile.json seed are found in the same place at runtime.
ENV CAREEROS_PRIVATE_DIR=/data/private

CMD ["node_modules/.bin/next", "start", "-p", "3000"]
