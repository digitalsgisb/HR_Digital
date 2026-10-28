#!/bin/sh
set -eu

export DATABASE_URL="$(node -e 'const password = process.env.POSTGRES_PASSWORD; if (!password) process.exit(1); process.stdout.write(`postgresql://hr_admin:${encodeURIComponent(password)}@database:5432/hr_training_tracker?schema=public`);')"

# Apply the nullable QR-token column/index explicitly on existing installations.
# Prisma db push otherwise stops on its unique-index warning before API startup.
# This does not bypass warnings for unrelated or destructive schema changes.
npx prisma db execute --schema server/prisma/schema.prisma --file server/prisma/attendance-token.sql
npx prisma db execute --schema server/prisma/schema.prisma --file server/prisma/workflow-upgrade.sql
npx prisma db push --schema server/prisma/schema.prisma
npx prisma db execute --schema server/prisma/schema.prisma --file server/prisma/evaluation-review-jobs.sql
exec npm --workspace server run start
