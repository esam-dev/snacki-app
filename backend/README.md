# Snacki Backend

Base API for Snacki authentication and tenant management.

## Stack
- Node.js + TypeScript
- Fastify
- Prisma + PostgreSQL
- JWT auth

## Setup

1. Copy env file:
   ```bash
   cp .env.example .env
   ```
2. Start PostgreSQL (Docker):
   ```bash
   docker compose up -d postgres
   ```
3. Install deps and generate Prisma client:
   ```bash
   npm install
   npm run prisma:generate
   ```
4. Run migrations and seed:
   ```bash
   npm run prisma:migrate
   npm run prisma:seed
   ```
5. Start dev server:
   ```bash
   npm run dev
   ```

API base URL: `http://localhost:3000/api`

## Endpoints
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token)
- `GET /api/tenants`
- `POST /api/tenants` (Bearer token, role `comercio`)
