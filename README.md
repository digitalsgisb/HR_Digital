# Human Resource Digital

Human Resource Digital is the internal HR operations platform for Sugihara Grand Industries Sdn Bhd. It provides one workspace for employee records, training operations, automated learning follow-up, employee training notes, and company car usage.

## Current modules

- Dashboard with workforce readiness, upcoming training, HR actions, and fleet status
- Employee database and CSV/Excel import preview
- Training calendar with session and participant drill-down
- Training planning and employee assignment
- Employee training requirement matrix
- Email automation journey with branded responsive templates
- Searchable employee training-notes library
- Company vehicle mileage, utilisation, servicing, and trip tracking
- System administration for platform preferences, feature controls, access, sessions, and server status
- Installable Progressive Web App (PWA) shell with offline access to previously loaded interface assets

## Technology

- React 19, TypeScript, Vite, Recharts, and Lucide
- Node.js, Express, and Zod
- PostgreSQL with Prisma ORM
- Docker Compose for the Linux AI PC deployment

## Local development on Windows

Requirements: Node.js 22+, npm, and PostgreSQL 16 or newer.

1. Copy `.env.example` to `server/.env`.
2. Update `DATABASE_URL` for the local PostgreSQL instance.
3. Install and prepare the database:

   ```powershell
   npm.cmd install
   npm.cmd run prisma:generate
   npm.cmd run prisma:migrate
   npm.cmd run prisma:seed
   ```

4. Start the development servers:

   ```powershell
   npm.cmd run dev
   ```

- Interface: `http://localhost:5173`
- API health: `http://localhost:4000/api/health`

PowerShell blocks `npm.ps1` on the original development PC, so the examples use `npm.cmd`.

## AI PC deployment on Linux

Recommended baseline: Ubuntu Server 24.04 LTS, Docker Engine 27+, Docker Compose v2, at least 4 CPU cores, 8 GB RAM, and a persistent SSD volume.

### First deployment

```bash
git clone https://github.com/digitalsgisb/HR_Digital.git
cd HR_Digital
cp .env.example .env
nano .env
docker compose up -d --build
docker compose ps
curl http://localhost:4000/api/health
```

At minimum, replace `POSTGRES_PASSWORD` in `.env` with a strong unique password. Set `CLIENT_ORIGIN` to the final HTTPS origin. Add SMTP values only when real training-email delivery is ready.

Open `http://<AI-PC-IP>:4000`. For company-network use, place a reverse proxy such as Nginx or Caddy in front of port 4000 and terminate HTTPS there.

### PWA installation

The production build includes a web app manifest, SGI browser/install icon, standalone display metadata, and a service worker. PWA installation and service workers require HTTPS, except when using `localhost` during testing. After HTTPS is configured, open the application in Chrome or Edge and use **Install Human Resource Digital** from the browser menu.

The cached application shell helps the interface reopen after a temporary connection interruption. Live employee, training, email, and vehicle data still requires the AI PC API and database to be reachable.

### Long-running service behavior

Both the application and PostgreSQL use Docker's `restart: unless-stopped` policy. They restart after a process failure or AI PC reboot and continue running indefinitely until an administrator explicitly stops them:

```bash
docker compose stop
```

To terminate and remove the running containers while preserving the PostgreSQL volume:

```bash
docker compose down
```

Do not add `-v` to `docker compose down` unless the database volume is intentionally being deleted.

### Logs

Follow application logs continuously until the administrator exits with `Ctrl+C`:

```bash
docker compose logs -f app
```

Follow all services:

```bash
docker compose logs -f
```

Leaving the log viewer does not stop the application.

## Updating the AI PC

Create a database backup before every production update:

```bash
mkdir -p backups
docker compose exec -T database pg_dump -U hr_admin hr_training_tracker > "backups/hr_training_tracker_$(date +%F_%H%M).sql"
```

Pull, validate, rebuild, and restart:

```bash
git pull --ff-only origin main
docker compose build --pull app
docker compose run --rm app npm test
docker compose up -d
docker compose ps
curl http://localhost:4000/api/health
```

The application container applies the checked-in Prisma schema with `prisma db push` before starting. For later high-risk database changes, replace this with reviewed Prisma migrations.

### Rollback

```bash
git log --oneline -10
git checkout <last-known-good-commit>
docker compose up -d --build
```

Restore a database backup only when the release changed data incompatibly.

## Email delivery

The product includes the UI, automation journey, and responsive branded email template. Outbound delivery remains disabled until these server-side values are configured:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="Human Resource Digital <training@sugiharagrand.com>"
```

Never commit `.env`, passwords, API keys, database exports, or employee-uploaded documents.

## Quality checks

Run before merging or deploying:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

GitHub Actions runs the same type checking, tests, and production build for every push and pull request to `main`.

## Data and backup notes

- PostgreSQL data lives in the Docker named volume `hr_training_data`.
- Employee notes should be moved to durable object or network storage before production uploads are enabled.
- The interface uses demonstration fallback data when `DATABASE_URL` is unavailable.
- Real authentication, SMTP delivery, and document storage must be configured before exposing the platform outside the trusted company network.
