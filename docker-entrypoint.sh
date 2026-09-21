#!/bin/sh
set -eu

export DATABASE_URL="$(node -e 'const password = process.env.POSTGRES_PASSWORD; if (!password) process.exit(1); process.stdout.write(`postgresql://hr_admin:${encodeURIComponent(password)}@database:5432/hr_training_tracker?schema=public`);')"

npx prisma db push --schema server/prisma/schema.prisma
exec npm --workspace server run start
