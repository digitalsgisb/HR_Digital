FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json

RUN npm ci

COPY . .

RUN npm run prisma:generate && npm run build

ENV NODE_ENV=production
ENV SERVER_PORT=4000

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push --schema server/prisma/schema.prisma && npm --workspace server run start"]
