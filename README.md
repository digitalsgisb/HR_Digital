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
- Employee profile management with create/edit controls, employment statuses, and audit-safe removal that retains training history
- Separate vehicle registry with car photos, create/edit controls, and audit-safe removal that retains trip history
- Company-car usage tracking with per-vehicle QR access, before/after inspections, odometer-photo evidence, local OCR, mileage, utilisation, servicing, and trip tracking
- System administration for platform preferences, feature controls, access, sessions, and server status
- Installable Progressive Web App (PWA) shell with offline access to previously loaded interface assets

## Technology

- React 19, TypeScript, Vite, Recharts, and Lucide
- Node.js, Express, and Zod
- PostgreSQL with Prisma ORM
- Docker Compose for the Linux AI PC deployment

## Local development on Windows

Requirements: Node.js 22+, npm, and PostgreSQL 16 or newer.

1. Copy `server/.env.example` to `server/.env`.
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

### First deployment in `/srv/apps/hr`

The production baseline assumes:

- Public address: `https://hr.sugidigital.org`
- Tunnel service/origin: `http://localhost:4000`
- Checkout directory: `/srv/apps/hr`
- The tunnel has an authenticated access policy for authorised HR users

Port `4000` is bound to `127.0.0.1` by default. This deliberately makes the application reachable from the tunnel process on the AI PC without exposing the container port directly to other network devices.

```bash
sudo mkdir -p /srv/apps/hr
sudo chown -R "$USER":"$USER" /srv/apps/hr
cd /srv/apps/hr
git clone https://github.com/digitalsgisb/HR_Digital.git .
cp .env.example .env
nano .env
chmod 600 .env
docker compose up -d --build
docker compose ps
curl http://localhost:4000/api/health
```

The `git clone ... .` form requires `/srv/apps/hr` to be empty. If the folder already contains files, inspect and move them before cloning rather than deleting them blindly.

At minimum, replace `POSTGRES_PASSWORD` in `.env` with a long, unique password. Keep `CLIENT_ORIGIN` equal to the final public HTTPS address. Add SMTP values only when real training-email delivery is ready.

### Optional on-prem odometer vision

The vehicle form always includes bundled browser OCR, so no cloud service is required. For better results on full-dashboard photos such as displays containing both **ODO** and **Trip A/B**, the API can first ask a vision model running in Ollama on the AI PC and then fall back to bundled OCR.

Install a vision-capable model on the host (choose a model that fits the AI PC), then set these values in `/srv/apps/hr/.env`:

```env
OLLAMA_BASE_URL="http://host.docker.internal:11434"
OLLAMA_VISION_MODEL="qwen2.5vl:7b"
```

Restart only the application container after changing these values:

```bash
docker compose up -d --build app
docker compose logs --tail=100 app
```

`host.docker.internal` is mapped to the Linux Docker host by `docker-compose.yml`. If Ollama runs elsewhere, use its private LAN URL instead. Do not expose Ollama through the public tunnel. n8n is not required for OCR; it can later consume low-confidence or mileage-mismatch events for admin review without placing it in the driver's critical path.

Validate Compose without printing resolved secrets:

```bash
docker compose config --quiet
```

Avoid pasting the full output of `docker compose config` into tickets or chats because it expands passwords and other environment values.

### Tunnel route

Create one published-application route using these values:

| Setting | Value |
| --- | --- |
| Destination | `hr.sugidigital.org` |
| Type | Published application |
| Service | `http://localhost:4000` |

Keep the tunnel and Docker Compose on the same AI PC. The service uses trusted proxy headers in production so the application can correctly recognise the original HTTPS request.

Before making the route available to employees, require authentication in the tunnel access policy and restrict it to the appropriate HR/admin group. The current application interface does not yet provide a production identity provider, so it must not be published as an anonymous public application.

After the route is active, verify both the private origin and public tunnel:

```bash
curl --fail http://localhost:4000/api/health
curl --head https://hr.sugidigital.org/api/health
```

Open `https://hr.sugidigital.org`. Do not use the AI PC's LAN IP for normal access; the application port is intentionally loopback-only.

### PWA installation

The production build includes a web app manifest, SGI browser/install icon, standalone display metadata, and a service worker. PWA installation and service workers require HTTPS, except when using `localhost` during testing. After HTTPS is configured, open the application in Chrome or Edge and use **Install Human Resource Digital** from the browser menu.

The cached application shell helps the interface reopen after a temporary connection interruption. Live employee, training, email, and vehicle data still requires the AI PC API and database to be reachable.

The notification bell can request device permission and send a test notification in both a desktop browser and the installed PWA. Notifications require HTTPS (or `localhost`) and must be allowed by the user in the browser or operating-system settings. The service worker can display Push API payloads and focuses the existing HR Digital window when an alert is opened; continuous server-originated push delivery requires a production push subscription and VAPID-enabled notification service.

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
cd /srv/apps/hr
git pull --ff-only origin main
docker compose build --pull app
docker compose run --rm app npm test
docker compose up -d
docker compose ps
curl http://localhost:4000/api/health
curl --head https://hr.sugidigital.org/api/health
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
- Before/after odometer photos are compressed in the browser and stored with their vehicle trip records; include the database in retention sizing and backups.
- Employee notes should be moved to durable object or network storage before production uploads are enabled.
- The interface uses demonstration fallback data when `DATABASE_URL` is unavailable.
- Real authentication, SMTP delivery, and document storage must be configured before exposing the platform outside the trusted company network.
