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

Stop MongoDB with `docker compose down`. Data is retained in the `mongodb_data` volume.
