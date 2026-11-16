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
