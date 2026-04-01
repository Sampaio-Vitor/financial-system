# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- Stage 2: Build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG API_URL=http://backend:8000
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
ENV API_URL=${API_URL}
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
RUN npm run build

# ---- Stage 3: Production ----
FROM node:20-alpine AS production
WORKDIR /app
RUN adduser -D appuser
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER appuser
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]

# ---- Stage 4: Development ----
FROM node:20-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN adduser -D appuser
COPY . .
USER appuser
CMD ["npm", "run", "dev"]
