# Multi-stage production image for NestJS + Prisma
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

COPY nest-cli.json tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev \
  && npx prisma generate \
  && npm cache clean --force \
  && chown -R node:node /app

COPY --from=builder --chown=node:node /app/dist ./dist

EXPOSE 3000
USER node

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
