# BREECE CRM

BREECE CRM is a personal contact-management application prepared as a professional project showcase for JEECE. It helps users organize relationships, schedule follow-ups, and track network growth.

## Features

- Email/password registration and login, Google sign-in, password recovery, and persistent HttpOnly-cookie sessions.
- Private contact management with search, filters, details, and follow-up reminders.
- Contact-growth statistics, monthly objectives, and reminder notifications opted in per reminder.
- Personal-data export and account deletion.
- A separate demo environment with one synthetic account, 100 fictional contacts, six objectives, and 20 reminders.

## Stack and architecture

React 19 and Vite provide the browser UI. The UI sends `/api` requests through Vite to an Express 5 REST API on Node.js, which uses Mongoose with MongoDB 8. Docker Compose runs the local client, API, and database; the optional mailer uses SMTP, and Google sign-in uses OpenID Connect.

## Run the main application

Requirements: Docker Engine and the Docker Compose plugin. Create the ignored server environment file and set a strong, unique `JWT_SECRET` before startup:

```bash
cp server/.env.example server/.env
# Edit server/.env; never commit real credentials.
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1:5000/api/health
```

Open <http://localhost:5173>. The API health endpoint is also proxied at <http://localhost:5173/api/health>. The database is stored in the persistent `mongodb_data` volume. `docker compose down` stops the stack without deleting that data; do not use `down -v` unless intentionally erasing it.

Native development is also supported. With `server/.env` configured, run `docker compose up -d mongodb`, then in separate terminals run `npm run dev --prefix server` and `npm run dev --prefix client`. The client proxy targets `http://localhost:5000` by default.

## Isolated fictional demo

The demo has a separate Compose project, MongoDB database, and persistent volume. It does not mount or connect to the main database; its UI and API use localhost ports 5175 and 5002.

```bash
cp demo/.env.example demo/.env
# Set unique DEMO_JWT_SECRET and DEMO_USER_PASSWORD; use a DEMO_USER_EMAIL under example.test.
# Set DEMO_ANCHOR_DATE to a YYYY-MM-DD UTC date and keep it stable across seed reruns.
docker compose --env-file demo/.env -f compose.demo.yaml config --quiet
docker compose --env-file demo/.env -f compose.demo.yaml up -d --build
docker compose --env-file demo/.env -f compose.demo.yaml run --rm demo-seed node src/scripts/seedDemo.js --dry-run
DEMO_SEED_CONFIRM=breece_crm_demo docker compose --env-file demo/.env -f compose.demo.yaml run --rm demo-seed
docker compose --env-file demo/.env -f compose.demo.yaml ps
curl -f http://127.0.0.1:5002/api/health
```

Open <http://localhost:5175> and sign in using the demo email and password configured in `demo/.env`. The seed refuses other database targets, requires the explicit confirmation shown above for writes, and is repeatable. Demo contact emails use the reserved `example.test` domain; reminder email notifications are disabled. Stop only the demo with `docker compose --env-file demo/.env -f compose.demo.yaml down`; this preserves its data and leaves the main CRM untouched.

## Tests

```bash
npm test --prefix server
npm run build --prefix client
npm run test:e2e --prefix client
npm audit --prefix server
npm audit --prefix client
```

MongoDB-backed server tests need `MONGODB_URI` pointing to a disposable test database; never point tests at the main or demo database. Playwright browser tests require the configured browser and a running test application; its default base URL is `http://127.0.0.1:5174` and can be changed with `QA_BASE_URL`.

## Security and publication status

Authentication uses bcrypt hashes, JWTs in HttpOnly cookies, ownership checks, Google OAuth state/PKCE protections, single-use password-reset tokens, and rate limits on sensitive endpoints. Reminder emails are opt-in and addressed to the account owner.

The frontend audit currently reports **four high-severity package alerts propagated from one Picomatch advisory (CVE-2026-112366 / GHSA-fc5q-39xc-vjpf)** in the Vite development/build dependency tree. Picomatch 4.0.7 is affected and no patched release was verified; this is not resolved. The production dependency audit is clean, and the static frontend build does not ship Picomatch, but development/build environments remain exposed. Keep Vite's development server local; never expose it publicly. Production requires serving a static build over HTTPS and further deployment-specific security verification. Live Google OAuth and SMTP production checks remain outstanding.

No license is included. The owner's licensing decision and explicit JEECE publication authorization remain pending.
