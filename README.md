# BREECE CRM

Minimal MERN foundation for a personal contact management application.

## Prerequisites

- Node.js and npm
- Docker with Docker Compose

## Setup

```bash
cp server/.env.example server/.env
npm install
npm run install:all
```

## Run

### Docker Compose

```bash
docker compose up -d --build
docker compose ps
docker compose logs
```

Open http://localhost:5173. The backend is available at http://localhost:5000. Stop with `docker compose down`; this preserves the existing `mongodb_data` volume. Never use `docker compose down -v`.

### Native development

Start MongoDB:

```bash
docker compose up -d mongodb
```

In one terminal, start the backend:

```bash
npm run dev --prefix server
```

In another terminal, start the frontend:

```bash
npm run dev --prefix client
```

Open http://localhost:5173. The frontend checks `GET /api/health` through the Vite proxy.

### Authentication configuration

Copy `server/.env.example` to `server/.env` and set `JWT_SECRET`. Google OAuth requires this callback URL:

`http://localhost:5000/api/auth/google/callback`

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL`. Password recovery requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`. Live Google and SMTP verification requires real credentials.

Stop MongoDB with `docker compose down`. Data is retained in the `mongodb_data` volume.

### Cookies and sessions

The application uses only essential cookies: the HttpOnly `session` cookie (7-day JWT session), a readable `csrfToken` cookie for CSRF headers, and a short-lived HttpOnly `oauth_state` cookie during Google sign-in. Cookies are `Secure` in production, use `SameSite=Strict` for the application session (Lax for OAuth), and are cleared on logout or account deletion. No analytics, advertising, tracking, or optional cookies are used, so no optional consent is requested.

### Security deployment notes

The Express API and Vite development server send baseline security headers. The Docker client is a development server and its CSP permits only the Vite development websocket plus the minimal React development allowances; production frontend hosting must send its own restrictive CSP because browser document headers come from the frontend server. Local HTTP uses `TRUST_PROXY=0` and `ENABLE_HSTS=false`. Behind a trusted HTTPS reverse proxy, set `NODE_ENV=production`, `TRUST_PROXY=1` only when the deployment has exactly one trusted proxy hop, and enable HSTS only after HTTPS is enforced end-to-end. Do not expose the development Vite server publicly.
