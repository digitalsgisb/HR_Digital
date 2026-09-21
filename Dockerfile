FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json

RUN npm ci

COPY . .

RUN chmod +x /app/docker-entrypoint.sh

RUN DATABASE_URL="postgresql://hr_admin:build-only@127.0.0.1:5432/hr_training_tracker?schema=public" \
    npm run prisma:generate && npm run build

ENV NODE_ENV=production
ENV SERVER_PORT=4000

EXPOSE 4000

USER node

CMD ["/app/docker-entrypoint.sh"]
