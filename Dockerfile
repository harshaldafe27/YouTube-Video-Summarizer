# ==========================================
# Multi-stage Dockerfile for YVS Full-Stack
# Deployable to Docker, Cloud Run, Render, Railway, Fly.io, AWS ECS
# ==========================================

# Stage 1: Build the frontend
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install ffmpeg for optional audio normalization
RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled frontend and application code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/yvs-frontend ./yvs-frontend
COPY yvs-backend ./yvs-backend
COPY server.js ./server.js
COPY vite.config.js ./vite.config.js

# Default port
EXPOSE 3000
CMD ["node", "server.js"]
