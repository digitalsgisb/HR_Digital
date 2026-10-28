# HR Digital

HR Digital is the internal HR operations platform for Sugihara Grand Industries Sdn Bhd. It provides one workspace for employee records, training operations, automated learning follow-up, employee training notes, and company car usage.

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
- Dedicated usage history for each company car, with drivers, journeys, odometer evidence, inspection checklists, and retained records for archived vehicles
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

The production build includes a web app manifest, SGI browser/install icon, standalone display metadata, and a service worker. PWA installation and service workers require HTTPS, except when using `localhost` during testing. After HTTPS is configured, open the application in Chrome or Edge and use **Install HR Digital** from the browser menu.

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

The application container first applies the additive `server/prisma/attendance-token.sql` upgrade, then applies the checked-in Prisma schema with `prisma db push` before starting. The upgrade adds the nullable QR-token column and unique index to existing installations without deleting records; it is repeatable and skips fresh databases where Prisma has not created the tables yet. Duplicate non-null tokens stop the upgrade for review. Startup does not use `--accept-data-loss`. For later high-risk database changes, replace schema push with reviewed Prisma migrations.

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
SMTP_FROM="HR Digital <training@sugiharagrand.com>"
```

Never commit `.env`, passwords, API keys, database exports, or employee-uploaded documents.

## Employee spreadsheet import

Open **Employees → Import spreadsheet** and choose an `.xlsx` or `.csv` file. The SGI employment export is accepted directly: `Employee#` maps to Employee ID, `Name` to name, `Job Type` to role, and `Company`, `Base` and `Department` retain their values. Employee ID and Department are required. Save older `.xls` files as `.xlsx` first.

Review the sample rows and validation issues, then choose **Import employees**. Blank rows are ignored. Rows with missing required values, invalid statuses or duplicate IDs are excluded. Existing employees are updated by employee ID. Without a Status column, imported employees are marked Active. Supported statuses: `ACTIVE`, `INACTIVE`, `ON_LEAVE`, `RESIGNED`, `TERMINATED`.

The importer finds the header beneath optional title rows and locates the employee worksheet even when a cover sheet comes first. If multiple employee worksheets are found, upload a workbook containing only the intended employee sheet.

Company and Base require the updated Prisma schema. Existing production deployments apply it through the normal Docker startup (`prisma db push`); follow the backup and update steps above before deploying. Local development can apply it with `npm.cmd run prisma:migrate`. Preview works without a database; saving requires the API and PostgreSQL.

### Department cards and email lists

The Employees page groups people into collapsible department cards. Open a department to browse employee cards in pages of 12 using Previous and Next. Department expansion and employee page changes animate smoothly, and the page area keeps its height when the last page has fewer employees. Search by name, ID, role, base or email, and filter by department or email availability. Employees without email remain visible and editable.

After importing employee records, choose **Import emails** and upload the account export (`Display name`, `User principal name`). Unique full names are matched after normalising case, spaces and punctuation. Review every match, manually assign unmatched accounts, or leave shared/unrelated accounts out. Saving changes only employee email fields. Existing email addresses are retained unless **Replace existing email addresses** is selected. Duplicate employee selections, repeated addresses, invalid addresses and addresses owned by another employee are rejected or left for review. No emails are sent by importing addresses.

## Training calendar and planning

Employee summary cards filter the directory by active status or email availability. The Departments card resets those filters and focuses department selection.

The calendar starts on today's Malaysia date. Choose a month and year directly, use Previous/Next, or return with Today. Agenda and CSV export use the selected month. The built-in demo training sessions, employee training rows, training notes and fabricated summary counts have been removed. Existing saved training history is not deleted.

Training plans load active employees from the directory and save the course, schedule and participant records in one API transaction. Employees without email can be included. Venue, capacity and delivery method are stored on the session. New future plans queue invitations, training-day reminders and post-training follow-ups when participant emails are enabled.

Apply the updated Prisma schema before deploying this change. Production Docker startup applies it through the documented backup/update procedure above; local development can use `npm.cmd run prisma:migrate`. Demo seeding is disabled by default. Populate an isolated development database with examples only by explicitly setting `SEED_DEMO_DATA=true` when running `prisma:seed`.

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
- Employee and training views use saved API records and report connection errors instead of substituting demonstration records.
- Real authentication, SMTP delivery, and document storage must be configured before exposing the platform outside the trusted company network.

### Developer email tests

Open Training → Email automation. Choose a template, enter your test recipient, then use **Check connection** and **Capture test email**. The default EMAIL_TRANSPORT=preview generates a message in the local test inbox without contacting a mail server. The preview uses sample details and does not change employee records or enable scheduled sending. The most recent 20 tests are kept in memory and reset when the server restarts.

To deliver to your own mailbox, configure the server environment (server/.env for local development or the root .env for Docker):

```dotenv
EMAIL_TRANSPORT=smtp
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM="HR Digital <your-verified-sender@company.com>"
SMTP_TEST_RECIPIENTS=your-name@company.com
```

Restart the server after changing settings (recreate the app container for Docker). For port 465 use SMTP_SECURE=true. Use your provider's verified sender and credentials. Multiple permitted test addresses may be separated by commas; each test sends to one address. Credentials stay on the server. SMTP acceptance does not guarantee inbox delivery; check spam and your provider's logs. The test endpoints use the same workspace access controls as the rest of the app, so keep the app behind the existing authenticated tunnel.

### Gmail / Google Workspace setup

1. Turn on 2-Step Verification for the sending Google account. Create an App Password named **HR Digital** at https://myaccount.google.com/apppasswords. Use this App Password instead of the normal account password. If the option is unavailable for your Workspace account, ask the Workspace administrator about the permitted SMTP authentication or relay method.
2. From the project directory on Windows, run:

```powershell
npm run smtp:setup:gmail
```

The wizard asks for a sender, a test recipient (defaults to the sender), and a hidden App Password. It sets smtp.gmail.com:587 with STARTTLS, and writes only SMTP keys to the ignored server/.env file, preserving other settings. To prepare the Docker root .env instead, run `npm run smtp:setup:gmail -- -Target docker` on the deployment checkout. Keep environment files private and out of Git.

3. Restart the API and run `npm run smtp:check` to check authentication without sending mail. For Docker, recreate the app with `docker compose up -d --build app` and use the **Check connection** button instead.
4. Open **Training → Email automation**, check the preview, and send one test to the configured address.

The templates use the existing Sugihara logo as a CID inline attachment in sent messages and a data image in browser previews. The HTML uses tables and inline styles, and includes a plain-text alternative. Developer tests use sample details and link to the HR Digital home page; no employee action is submitted.

Google references: [SMTP setup](https://support.google.com/a/answer/176600?hl=en) · [App Passwords](https://support.google.com/accounts/answer/185833?hl=en).

### Automatic training emails and deleting training

Future plans created after this update have **Send participant emails automatically** enabled by default. Invitations are queued as part of the same database transaction that saves the plan. Each participant with a valid email gets their own message; employees without email remain in the plan. Turn the checkbox off to save without sending.

- Invitation: after saving (processed immediately or on the next worker tick).
- Reminder: 08:00 Asia/Kuala_Lumpur on the training day; for earlier sessions, 30 minutes before the start. Plans created after reminder time get only the invitation immediately.
- Follow-up: two hours after the recorded end time, requesting training notes. Employees marked absent, excused, not required, or no longer active are skipped at delivery time.

The API worker checks every minute and handles up to 50 queued messages per pass. It runs on the AI PC; the browser can be closed. Jobs survive restarts. Delivery requires EMAIL_TRANSPORT=smtp and valid SMTP settings. EMAIL_AUTOMATION_ENABLED defaults to true; set it to false to pause sending. SMTP_TEST_RECIPIENTS restricts manual developer tests only; automatic emails go to the selected employees. Existing plans are not backfilled. Invitations/reminders expire at the start; follow-ups expire seven days after the end to avoid stale mail after a prolonged outage.

Failures retry with backoff, up to five attempts. HR can inspect counts and retry failed messages under **Training → Email automation**. A stable Message-ID and atomic job lease prevent normal duplicate claims; SMTP cannot guarantee exactly-once delivery after an interrupted handoff, so a rare duplicate remains possible after a process/network failure. SMTP acceptance does not guarantee inbox delivery. Changing a participant’s saved email affects future pending messages.

Use **Delete training** on a calendar session or training-record row for either upcoming or past training. The confirmation removes the session from active calendars, attendance views and training-hour reports, and cancels pending/failed emails. The database retains the session, attendance and email history with archivedAt for administrative recovery. Sent or in-flight SMTP messages cannot be recalled. This uses the app’s existing workspace access controls; restrict tunnel access to authorised HR staff. A date change through the legacy session API is rejected for plans with email schedules; delete and recreate the plan so participants receive a fresh invitation.

For the Linux AI PC: follow the database backup/update procedure above, then rebuild the app with `docker compose up -d --build app`. Startup applies the new TrainingEmailJob table and TrainingSession.archivedAt field before starting the worker. Keep the existing working Gmail credentials. No separate cron service or n8n workflow is required.

### Internal training / OJT QR attendance

1. In **Plan training**, choose **Internal training / OJT** or **On-the-job**, set the start/end times, select employees, and save. QR attendance is enabled automatically for these methods.
2. Open the session in **Training calendar → Attendance / QR**. Display or download the QR image, or copy the check-in link. For an existing instructor-led plan, use **Enable QR attendance** in the same panel.
3. Trainees scan with a phone camera and enter their employee ID and full name as recorded by HR. They must be active selected participants. An email account or HR login is not required by the check-in form. The public page shows only the session details, never an employee directory.
4. The window opens 30 minutes before the start and closes two hours after the end, using Malaysia time. Repeated submissions retain the original timestamp. **Close check-in** invalidates the link; **Regenerate QR** invalidates the previous QR while retaining saved attendance. Deleting a session also makes its QR unavailable.
5. HR sees check-in timestamps and can export the attendance list as CSV. The panel refreshes every 10 seconds. Checked-in REQUIRED records become COMPLETED after the scheduled end, with hours calculated from start/end; this worker runs independently of SMTP every minute. Missing check-ins do not earn hours. Existing manually completed/absent/excused records are not overwritten by finalization. Per-employee training history and dashboard totals use these same completion records.

Deployment requires the new attendanceEnabled/attendanceToken session fields and checkedInAt/attendanceSource completion fields. Back up the database, pull the published update and run `docker compose up -d --build app`; the existing startup applies the schema. No employee records are deleted or seeded.

**Trainee access through the tunnel:** If the current Access application permits only HR users, configure a separate path-scoped guest application for **hr.sugidigital.org/attendance/** and its subpaths. For Cloudflare Access this is a narrowly scoped Bypass policy (Include Everyone) on that path only. Leave the main HR application, **/api/**, and other paths protected by the existing HR policy. The attendance page, JavaScript and check-in POST all live under **/attendance/**; no SPA assets need guest access. Cloudflare documents this pattern under [Bypass a public endpoint](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/common-policies/#bypass-a-public-endpoint). These code changes do not modify the tunnel policy; test the QR from an incognito phone browser after applying the path rule.

Production QR links default to CLIENT_ORIGIN. Set optional ATTENDANCE_BASE_URL to the HTTPS origin routed to the same service if a different origin is needed (no path prefix). Local development defaults to http://localhost:SERVER_PORT, since the guest form is served directly by the API.


### Production sections and Conversion roster

Production employees have a Section (Conversion or Roll Making). Conversion also records Line / unit and Group. Roll Making uses a single section; saving its profile clears line/group. These fields appear in profiles, directory filters, participant selection (including Select all filtered), and training records. Record filters describe the employee's current assignment, not their assignment on the historical training date.

Under Employees, open **Conversion line & group roster** and upload `Conversion Attd 2026.xlsx`. Preview reads only `OKT 2026` or `OCT 2026`; no old tabs are imported. It reads the main `Section :` labels, since some Attendance Section headings are inconsistent. Review all names/IDs before applying. Only matched employees already in Production are updated. Missing IDs are reported and skipped; create/correct their master records and preview again. The import updates only section, line and group, retaining names, roles, email, status and training history. Vacant slots and attendance totals are ignored. LM & SA and Supervisor have no group in the source and remain ungrouped. No remaining Production employee is automatically assigned to Roll Making; set that section explicitly in the employee profile.

Apply the updated Prisma schema before using these fields. Docker startup applies the additive nullable section/group columns through the normal documented backup/update procedure (`prisma db push`). For local development use the existing Prisma migration workflow. No roster is imported automatically at startup.

### Training follow-ups, shared car QR and maintenance (23 October 2026)

New training plans enable attendance for every delivery method. The invitation button opens a mobile training-details page; the training-day button opens the same check-in URL as the session QR. Both emails CC the HOD email entered in **Employees → Edit employee**. The existing check-in window still applies. If HR closes or rotates a QR, older email links follow the same invalidation rules. Enable attendance manually on older plans that did not already have it enabled.

Two hours after training, participants receive their own summary form. They can save drafts, describe learning/application/feedback, write detailed notes, and attach up to three PDF, DOCX, text, PNG or JPEG files of 2 MB each. Summary reminders run at training end + 3 days, + 6 days, + 9 days and so on, until submission. Missed reminders are coalesced after downtime rather than sent in a burst. Drafts do not stop reminders. Submission stores the summary and queues its content and attachments for the participant's HOD. Missing HOD email leaves delivery pending with a visible reason and a daily retry; update the employee profile to resolve it. **Training → Notes library** now displays saved summaries, drafts, notes, attachments, missing HOD mappings and delivery status separately from attendance. Notifications remain opt-out when planning; historical plans are not automatically backfilled with emails.

Training details and summary pages, their stylesheet, JavaScript and form POST are under **/training/**. As with attendance, employees must be able to reach these routes through the deployed access policy. Keep **/api/** and the HR workspace protected. Summary URLs contain participant-specific bearer tokens; do not publish them or CC them to the HOD. The HOD receives the submitted contents instead. These source changes do not change tunnel policies.

**Company cars → Fleet QR** produces one permanent URL (`/?fleet=1`) for the key collection point. Old per-car URLs also open the shared flow. Employees enter their employee ID; the form automatically fills their saved name for confirmation, then finds their open trip or lets them choose an available car. The mobile form has a sticky HR Digital header and a car selector showing the saved car photo, plate and model. Reservation records destination, purpose and expected return, holds the car, and displays a confirmation for the key custodian. After collecting the key, the employee takes a fresh starting-odometer photo, confirms the reading and inspection, and starts driving. The same QR finds their trip when returning and requires an ending photo, mileage and return checks. Starting mileage differences are flagged; decreasing readings are rejected. Open reservations, overdue returns and differences remain visible to HR. Reservations can be cancelled before departure. Key release is a physical procedure: the custodian checks the confirmation before handing over the key. Reservations are not automatically expired because a key may already have been collected.

**Manage cars → Maintenance records and servicing** records maintenance type, date, odometer, workshop, work performed, RM cost, invoice/receipt, and next service mileage/date. Records remain attached to the car. Mark cars **Out of service** through Edit details while work is in progress. Maintenance cannot be recorded against an open trip. On completion, HR may clear the car for use; overdue service targets keep it unavailable. Mileage/date service checks also run when reserving a car. Before-departure trip mileage is only the last recorded reference until departure evidence is submitted.

Deployment: back up the database, then rebuild the app with `docker compose up -d --build app`. Startup runs **server/prisma/workflow-upgrade.sql** before schema push to add/backfill unique details and summary tokens without removing history; schema push adds summary, HOD, reservation and maintenance fields/tables. For a non-Docker deployment, run the attendance and workflow upgrade SQL files with `prisma db execute`, then `prisma db push`, `npm run prisma:generate` and `npm run build` against the intended database before restarting. No live database or SMTP deployment is performed by editing these files. Backups and retention sizing must include summary attachments and maintenance invoices stored in the database.

### Current car usage cards and removing records

**Company cars → Car usage** now shows current-usage cards for reserved and in-progress trips, including the driver, destination, expected return, mileage and status. **Trip history** also shows the selected car's current usage separately from past journeys. Use **Remove usage** on a card or past record, enter a reason, and confirm the car is no longer in use and its key has been returned when removing an open trip. Removing an open trip closes it and updates availability; service and safety restrictions remain enforced. Removing a past record excludes it from normal history and usage totals without changing the saved odometer. The database retains its photos, previous status, reason and removal timestamp for administrative recovery. This is an HR workspace action under the existing access policy; employee QR cancellation remains limited to their own pre-departure reservations.

Apply the additive VehicleTrip archivedAt/removalReason/removedFromStatus fields and archivedAt index before starting the updated API. Docker startup applies them through the existing schema-push step; use the normal database backup and rebuild procedure. There is no permanent deletion or mileage rollback, and this update does not remove any existing usage automatically.

### Fleet sidebar pages

Company cars now separates **Car usage** (current trips and checkout/return), **Fleet QR** (one shared printable code), **Vehicle status** (availability, mileage and service targets), **Manage cars**, and **Trip history**. Vehicle-status cards and current-usage cards use black backgrounds with light text. The printable QR sheet stays white for scanning, and the company logo keeps its original colours. This layout update requires an app rebuild only; it adds no database fields.


### Vehicle details, maintenance and training evaluation (FR-HR-002 Rev 2)

- Company cars → Vehicle status: click a car card or its View / edit details button to edit its photo, registration, model, pool, mileage, service target/date and operational status. Trip controls remain separate actions.
- Company cars → Maintenance history: select a car, add servicing/repair details, cost, invoice and next service targets, and browse its history. Existing maintenance records stay in place.
- Training → Department HODs: set the department's default HOD name/email. Employee HOD email overrides take precedence. Employees → Edit also stores the immediate superior's name/email; the three-month review uses that email, falling back to the resolved HOD.
- Training → Email automation: check SMTP readiness, scheduled delivery counts and errors. Actual delivery requires server SMTP configuration and EMAIL_AUTOMATION_ENABLED enabled. Local preference toggles in Settings do not configure the server worker.
- The participant form implements Section A of the supplied FR-HR-002 revision 2 evaluation: company, superior/vendor, pre-course briefing and feelings, job relevance (1–4), learning, application opportunity/reason, areas of application, confidence (1–4) and assistance, plus optional notes/materials. It opens after training, requests submission within seven days, and keeps three-day reminders until submission. Drafts do not stop reminders. Submission queues the full answers and attachments to the HOD.
- Section A submission queues an immediate-superior review three calendar months after the training end (Malaysia time, clamped at month end). Its private email link collects Sections B–D: application, performance/skill ratings, improvement areas, review acknowledgements, feedback discussion and skills-map update. Save drafts between stages, then submit when all are complete. Names record acknowledgements, not cryptographically verified signatures. Three-day reviewer reminders stop on submission.
- Training → Evaluations & notes shows participant answers, later review status/answers and editable HR comments. Historical summaries submitted before this feature remain readable without retroactively demanding Section A answers.

Deployment: rebuild the Docker application. The entrypoint backfills unique review tokens before Prisma db push adds the nullable department HOD, employee superior, evaluation/review and HR-comment fields. It then runs server/prisma/evaluation-review-jobs.sql to queue reviews for previously submitted summaries, once per participant/session. Existing data is retained. With a manual/non-Docker deployment, run workflow-upgrade.sql, prisma db push, then evaluation-review-jobs.sql in that order before starting the new server. Back up the database using the normal deployment procedure. No production migration or real email delivery was performed during local development.


### HR email editing and CC/BCC controls

Open Training → Email automation → Edit automated emails. HR can customise each of the six automated email types: invitation, training-day reminder, evaluation request, outstanding evaluation reminder, submitted evaluation to HOD, and three-month superior review. Edit the subject, heading, message and button label; set CC/BCC addresses, whether to CC the participant's HOD, and an optional reply-to address. These are defaults per email type and apply across training plans; primary recipients remain selected automatically from the participant/HOD/superior records.

Use {{employee_name}}, {{training_name}}, {{training_date}}, {{training_time}}, {{venue}} and {{trainer}} to personalise the wording. Dates, venue details, full submitted evaluations/attachments and the correct form links are inserted by the system. Plain text messages retain line breaks and are escaped in HTML. The original company logo and branded layout remain in place.

Preview shows the current draft without saving or sending. Test uses that draft with sample details; it excludes CC/BCC and can only use SMTP_TEST_RECIPIENTS in SMTP mode. Preview-mode tests stay in the local inbox. Restore defaults loads the original template into the editor; Save applies it. Saved changes are read when each queued email is sent, including recurring reminders; already sent messages are not resent. Unsaved drafts are kept when switching email types in the current editor session and are lost if the page is reloaded.

CC/BCC accept up to 20 email addresses each, separated by commas, semicolons or new lines. Duplicate addresses are removed across To, CC and BCC, with CC taking precedence over BCC. Copies receive the full email, including evaluation details and attachments where applicable. Reply-to changes where responses go; the sender remains the configured company SMTP account.

Deployment requires rebuilding the Docker app so Prisma db push creates TrainingEmailTemplate. Existing schedules, recipients and submitted evaluations remain intact; without saved overrides the existing default messages and invitation/reminder HOD copying continue. Local validation uses synthetic records and a local mail fixture, with no production settings changed or real messages sent.


### Assign department HODs from employee records

Employees → department card → Assign HOD / Change HOD opens the employee selector. Search by name, employee ID, email or department, select an active employee from any department, then save. The same employee can be selected for multiple departments. Training → Department HODs uses the same selector. Choosing No HOD assigned clears the assignment and the old manual department contact.

Department.hodEmployeeId links to Employee; the email worker reads that employee's current name, email and employment status at delivery time. Updating their employee profile or importing their new email therefore updates HOD routing for every department they lead. An assigned HOD without an email can be saved, but the UI highlights the missing address and HOD deliveries wait for it. Inactive HODs must be reassigned; the worker does not send to their old address or fall back to a stale manual department contact.

Existing employee-specific HOD overrides retain priority. Leave those fields blank to follow the department HOD. Existing manually entered department contacts remain readable and usable until HR replaces or clears them; this update does not guess employee matches from emails.

Deployment: rebuild the Docker app and let the existing Prisma db push add the nullable HOD employee link, foreign key and non-unique index. The non-unique relationship allows one person to lead multiple departments. Existing employees, department memberships, manual contacts and training records are retained. Local tests and browser checks use synthetic records only.


### Visual email editing for HR

Training → Email automation now opens a visual email template. HR clicks the subject, heading, message or button text directly inside the branded email, selects copy recipients and saves. Company branding, greeting, training details, action links and submitted evaluation content remain automatic. Saved wording from the previous editor is retained.

The main recipient is shown as a plain-language role appropriate to the email type: participant, HOD or immediate superior (with HOD fallback). Cc shortcuts select HOD, immediate superior (with HOD fallback), and/or participant. Choose other employees searches the existing employee directory; their addresses are resolved from current profiles when messages are sent. Only active employees with emails can be newly selected; employees who later become inactive or lose their email are not copied. Duplicate addresses across To/Cc/Bcc are removed.

Add a detail inserts a labelled chip such as Training name or Participant name into the text being edited. HR never needs to type merge-variable syntax; the editor stores the existing supported placeholders behind the scenes. Pasted text is treated as plain text. More options contains existing external Cc addresses, Bcc, reply-to, restore-original and sample sending. Delivery diagnostics are collapsed under Delivery settings (system administrator). Sample sending still excludes every Cc/Bcc shortcut and employee copy.

Deployment requires rebuilding the app and applying the normal Prisma db push, which adds ccSuperior, ccParticipant and ccEmployeeIds with empty/false defaults. Existing ccHod, manual Cc/Bcc, reply-to settings and email wording are preserved. No production recipients or messages were changed during development.
