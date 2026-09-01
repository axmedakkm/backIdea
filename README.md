# 🏠 ESCA Estate Marketplace — Backend API

A production-ready REST API for a real estate marketplace, built with **NestJS**, **PostgreSQL**,
**Prisma**, **Socket.IO** and **Swagger/OpenAPI**.

The service covers the full marketplace lifecycle: authentication with refresh-token rotation,
role-based authorization, property listings with search and moderation, image upload, favourites,
side-by-side comparison, viewing appointments, real-time messaging, notifications, agent reviews,
abuse reports and an administrative dashboard.

This repository is **backend only**. It is designed to be consumed by a separate frontend
(for example a Next.js application) over HTTP and WebSockets.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Prisma commands](#prisma-commands)
- [Seed data](#seed-data)
- [Running the application](#running-the-application)
- [API documentation (Swagger)](#api-documentation-swagger)
- [Response format](#response-format)
- [Authentication](#authentication)
- [Roles and authorization](#roles-and-authorization)
- [API endpoints](#api-endpoints)
- [Search, filtering, pagination and sorting](#search-filtering-pagination-and-sorting)
- [File uploads](#file-uploads)
- [Socket.IO](#socketio)
- [Security](#security)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project structure](#project-structure)

---

## Features

| Area | What it does |
| --- | --- |
| **Authentication** | Registration, login, refresh-token rotation with replay detection, logout, email verification, password reset |
| **Users** | Self-service profile, avatar, phone, email change and password change |
| **Agents** | Public agent directory with company details, average rating, review count and listing count |
| **Properties** | Full CRUD with ownership rules, slug lookup, view counting, draft/moderation workflow |
| **Search** | Free-text search plus 16 filters, pagination and sorting, backed by database indexes |
| **Images** | Multi-file upload to Cloudinary, with a local-disk fallback for development |
| **Categories & locations** | Admin-managed taxonomy with published-listing counts |
| **Favorites** | Saved listings, duplicate-proof via a database unique constraint |
| **Comparison** | Compare 2–4 listings side by side in the requested order |
| **Appointments** | Viewing requests with a PENDING → CONFIRMED/CANCELLED/COMPLETED lifecycle |
| **Messaging** | REST + Socket.IO conversations, restricted to participants |
| **Notifications** | Eight notification types, persisted and pushed in real time |
| **Reviews** | One review per user per agent, 1–5 stars, with live average recalculation |
| **Reports** | Abuse reports against properties, agents, users or reviews |
| **Admin** | Dashboard, user suspension, listing approval/rejection/featuring, moderation queue |

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 20+ |
| Framework | NestJS 11 |
| Language | TypeScript 5.8 (strict null checks, no implicit `any`) |
| Database | PostgreSQL 14+ |
| ORM | Prisma 6 |
| Authentication | Passport JWT, bcrypt |
| Validation | class-validator, class-transformer |
| Real time | Socket.IO 4 |
| Documentation | Swagger / OpenAPI 3 |
| Security | Helmet, CORS, `@nestjs/throttler` |
| Testing | Jest, Supertest |

---

## Architecture

A modular NestJS application. Every feature module owns its controller, service, DTOs and
entities; cross-cutting concerns live in `common/`.

```
HTTP request
  → ThrottlerGuard        rate limiting
  → JwtAuthGuard          authentication (skipped on @Public routes)
  → RolesGuard            authorization (@Roles)
  → ValidationPipe        DTO validation, whitelisting, transformation
  → Controller            routing and Swagger documentation only
  → Service               business logic and authorization decisions
  → PrismaService         database access
  → ResponseInterceptor   wraps the result in the standard envelope
  → AllExceptionsFilter   converts any error into the standard error envelope
```

Three deliberate design decisions worth knowing about:

**Controllers contain no business logic.** They route, document and delegate. Every
authorization decision that depends on data (listing ownership, conversation participation,
appointment involvement) is made in the service, because only the service has the record.

**The realtime gateway and the feature services do not depend on each other.** The gateway needs
`ConversationsService` to handle inbound events, and the services need to broadcast outbound
events. Rather than a circular import, services depend on a small `RealtimeEmitter` that holds the
Socket.IO server; the gateway hands the server to the emitter on init.

**Deletion is soft where history matters.** Users, properties, appointments, conversations,
messages, reviews, categories and locations carry `deletedAt`. A deleted listing keeps its
appointments and conversations valid; a deleted user keeps their message history referentially
intact while releasing their email address for reuse.

---

## Installation

**Prerequisites:** Node.js 20+, npm 10+, and a running PostgreSQL 14+ server.

```bash
git clone <repository-url>
cd esca-estate-backend
npm install
cp .env.example .env      # then fill in the values described below
```

---

## Environment variables

Copy `.env.example` to `.env`. **Never commit `.env`** — it is already in `.gitignore`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |
| `PORT` | no | `3000` | HTTP port |
| `DATABASE_URL` | **yes** | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | **yes** | — | Access-token signing key, min 32 characters |
| `JWT_REFRESH_SECRET` | **yes** | — | Refresh-token signing key, min 32 characters, must differ from the access secret |
| `JWT_ACCESS_EXPIRES_IN` | no | `15m` | Access-token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | no | `7d` | Refresh-token lifetime |
| `FRONTEND_URL` | no | `http://localhost:3000` | Comma-separated list of allowed CORS origins |
| `BCRYPT_SALT_ROUNDS` | no | `12` | Password hashing cost (10–15) |
| `THROTTLE_TTL` | no | `60` | Rate-limit window in seconds |
| `THROTTLE_LIMIT` | no | `120` | Requests allowed per window |
| `CLOUDINARY_CLOUD_NAME` | no | — | Leave blank to use local disk storage |
| `CLOUDINARY_API_KEY` | no | — | |
| `CLOUDINARY_API_SECRET` | no | — | |
| `MAX_FILE_SIZE_MB` | no | `5` | Per-file upload limit |
| `MAX_FILES_PER_UPLOAD` | no | `10` | Files per upload request |
| `SEED_ADMIN_EMAIL` | no | `admin@esca-estate.com` | Seed administrator email |
| `SEED_ADMIN_PASSWORD` | for seeding | — | Seed administrator password |
| `SEED_AGENT_PASSWORD` | for seeding | — | Password shared by seeded agents |
| `SEED_USER_PASSWORD` | for seeding | — | Password shared by seeded users |

Every variable is validated at boot by `src/config/env.validation.ts`. A missing or malformed
value fails the process immediately with a readable message, rather than surfacing as an
`undefined` error inside a request handler later.

Generate strong secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Database setup

Create a database and a role for the application:

```sql
CREATE ROLE esca_app WITH LOGIN PASSWORD 'choose-a-strong-password';
CREATE DATABASE esca_estate OWNER esca_app;
```

Prisma Migrate needs permission to create its shadow database during development:

```sql
ALTER ROLE esca_app CREATEDB;
```

> This is a development-only requirement. In production use `prisma migrate deploy`, which does
> not need a shadow database, and the `CREATEDB` grant can be revoked.

Then set the connection string in `.env`:

```env
DATABASE_URL=postgresql://esca_app:choose-a-strong-password@localhost:5432/esca_estate?schema=public
```

Apply the schema:

```bash
npx prisma migrate dev
```

### Data model

15 models with UUID primary keys, foreign keys, unique constraints, indexes and timestamps:

`User`, `Agent`, `Property`, `PropertyImage`, `PropertyFeature`, `Category`, `Location`,
`Favorite`, `Appointment`, `Conversation`, `ConversationParticipant`, `Message`, `Notification`,
`Review`, `Report`.

Notable constraints:

- `Favorite(userId, propertyId)` unique — makes duplicate favourites impossible at the database level
- `Review(agentId, authorId)` unique — one review per user per agent
- `Report(reporterId, targetType, targetId)` unique — one report per user per target
- `ConversationParticipant(conversationId, userId)` unique
- `Location(country, city, district)` unique
- `PropertyFeature(propertyId, name)` unique

`Property` carries composite indexes matching the common filter combinations
(`status + isPublished + deletedAt`, `purpose + propertyType + status`, `city + district`) plus
single-column indexes on `price`, `area`, `bedrooms`, `bathrooms` and the foreign keys.

---

## Prisma commands

```bash
npx prisma generate          # regenerate the client after editing the schema
npx prisma migrate dev       # create and apply a migration in development
npx prisma migrate deploy    # apply pending migrations in production
npx prisma db seed           # populate development data
npx prisma studio            # browse the database in a GUI
npm run db:reset             # drop, re-migrate and re-seed (destructive)
```

---

## Seed data

```bash
npm run prisma:seed
```

Creates 1 administrator, 3 agents, 6 users, 5 categories, 8 locations, 14 properties (12 approved,
1 pending moderation, 1 draft), 56 images, 39 features, 11 favourites, 5 appointments, 7 reviews,
a conversation with messages, and notifications.

Seed passwords are read from `SEED_ADMIN_PASSWORD`, `SEED_AGENT_PASSWORD` and `SEED_USER_PASSWORD`
— **no credentials are hardcoded**. The script refuses to run when `NODE_ENV=production`.

Seeded accounts:

| Role | Email |
| --- | --- |
| ADMIN | `admin@esca-estate.com` (or `SEED_ADMIN_EMAIL`) |
| AGENT | `jordan.rivera@esca-estate.com`, `leila.haddad@esca-estate.com`, `tomas.serrano@esca-estate.com` |
| USER | `sofia.almeida@example.com` and five others |

---

## Running the application

```bash
npm run start:dev     # watch mode
npm run build         # compile to dist/
npm run start:prod    # run the compiled build
npm run lint          # eslint --fix
npm run format        # prettier
```

On startup the service logs its API base URL and Swagger URL.

---

## API documentation (Swagger)

With the server running:

```
http://localhost:3000/api/docs          Swagger UI
http://localhost:3000/api/docs-json     raw OpenAPI 3 document
```

**79 operations across 15 tags, every one documented** with a summary, description, request body,
response schemas, path/query parameters, authentication requirements and error responses.

To call a protected endpoint from the UI: run `POST /auth/login`, copy `data.accessToken`, click
**Authorize**, and paste the token. It persists across page reloads.

---

## Response format

Every successful response uses the same envelope:

```json
{
  "success": true,
  "message": "Property created successfully",
  "data": { }
}
```

List endpoints add `meta`:

```json
{
  "success": true,
  "message": "Properties retrieved successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

Errors are uniform, and never leak stack traces, SQL or connection details:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": ["price must be greater than zero"],
  "path": "/api/v1/properties",
  "timestamp": "2026-08-29T10:15:00.000Z"
}
```

| Status | Meaning |
| --- | --- |
| `400` | Validation failed, or a malformed/unknown field was sent |
| `401` | Missing, expired or invalid token |
| `403` | Authenticated but not permitted (wrong role, or someone else's resource) |
| `404` | Not found, or deliberately hidden from you |
| `409` | Conflict — duplicate email, favourite, review or report |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error (details logged server-side only) |

> Some resources answer `404` instead of `403` when you are not entitled to them — conversations,
> appointments and other users' notifications. This is intentional: `403` would confirm that the
> ID exists, which allows enumeration.

---

## Authentication

JWT access tokens plus rotating refresh tokens.

```http
POST /api/v1/auth/register          create an account, returns a session
POST /api/v1/auth/login             sign in
POST /api/v1/auth/refresh           exchange a refresh token for a new pair
POST /api/v1/auth/logout            revoke the refresh token
POST /api/v1/auth/forgot-password   request a reset token
POST /api/v1/auth/reset-password    set a new password
POST /api/v1/auth/verify-email      confirm an email address
```

Send the access token as `Authorization: Bearer <accessToken>`.

**Refresh tokens are single-use.** Each successful refresh issues a new pair and invalidates the
old one. Presenting an already-rotated token is treated as a replay and ends the session entirely,
forcing a fresh sign-in.

Implementation notes worth knowing if you modify this area:

- Passwords are hashed with **bcrypt**; the plaintext is never stored or logged.
- Refresh tokens are stored as a **SHA-256 digest, not a bcrypt hash**. bcrypt truncates its input
  at 72 bytes, and every JWT issued to a given user shares an identical first 72 bytes (fixed
  header plus the `sub` claim) — bcrypt would therefore make any of that user's tokens compare
  equal, silently defeating rotation and replay detection. A refresh token is already high-entropy
  random material, so a fast digest with a constant-time comparison is the correct primitive.
- Refresh tokens carry a random `jti`, so two tokens signed in the same second are never identical.
- Email-verification and password-reset tokens are stored hashed; only the raw value is sent to
  the user, and each is single-use with an expiry (24 hours and 1 hour respectively).
- `POST /auth/forgot-password` returns an identical response whether or not the email exists, and
  login compares against a dummy hash for unknown emails so response timing does not reveal
  which addresses are registered.
- Outside production, `register` and `forgot-password` include the raw token in the response so
  the flows are testable without an email provider. This never happens when `NODE_ENV=production`.

---

## Roles and authorization

```prisma
enum UserRole { USER  AGENT  ADMIN }
```

| Role | Can do |
| --- | --- |
| `USER` | Browse, favourite, compare, book viewings, message agents, review agents, file reports |
| `AGENT` | Everything a USER can, plus create and manage **their own** listings and images |
| `ADMIN` | Everything, plus moderation, user suspension and the dashboard |

Authorization is layered:

```ts
@Roles(UserRole.ADMIN)                 // role gate, enforced by RolesGuard
@Public()                              // opt out of the global JwtAuthGuard
@CurrentUser() actor: AuthenticatedUser // the authenticated principal
```

Role checks alone are not enough for ownership, so services verify the record itself. An `AGENT`
reaching `PATCH /properties/:id` passes the role gate, then `findOwnedOrThrow` confirms the listing
belongs to them before anything is written.

`ADMIN` accounts **cannot be created through the API** — not by registration and not by profile
update. They are provisioned by seeding or directly in the database.

Two further deliberate limits:

- Administrators **cannot read private conversations**. Moderation works through reports instead.
- Agents cannot approve, reject or feature their own listings, and cannot set moderation statuses.

---

## API endpoints

All routes are prefixed `/api/v1`. 🔓 public · 🔑 authenticated · 👤 AGENT · 🛡️ ADMIN

### Auth
| | Endpoint |
| --- | --- |
| 🔓 | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` |
| 🔓 | `POST /auth/forgot-password` · `POST /auth/reset-password` · `POST /auth/verify-email` |
| 🔑 | `POST /auth/logout` |

### Users
| | Endpoint |
| --- | --- |
| 🔑 | `GET /users/me` · `PATCH /users/me` · `DELETE /users/me` |
| 🔑 | `PATCH /users/me/password` · `PATCH /users/me/email` |

### Properties
| | Endpoint |
| --- | --- |
| 🔓 | `GET /properties` · `GET /properties/:id` · `GET /properties/slug/:slug` · `GET /properties/compare?ids=` |
| 👤 | `POST /properties` · `PATCH /properties/:id` · `DELETE /properties/:id` |

### Property images
| | Endpoint |
| --- | --- |
| 🔓 | `GET /properties/:propertyId/images` |
| 👤 | `POST /properties/:propertyId/images` · `PATCH /properties/:propertyId/images/:imageId/primary` · `DELETE /properties/:propertyId/images/:imageId` |

### Agents
| | Endpoint |
| --- | --- |
| 🔓 | `GET /agents` · `GET /agents/:id` · `GET /agents/:id/properties` |
| 🔓 | `GET /agents/:agentId/reviews` · `GET /agents/:agentId/rating` |
| 👤 | `PATCH /agents/:id` |

### Categories & locations
| | Endpoint |
| --- | --- |
| 🔓 | `GET /categories` · `GET /categories/:id` · `GET /locations` · `GET /locations/:id` |
| 🛡️ | `POST`, `PATCH`, `DELETE` on `/categories` and `/locations` |

### Favorites
| | Endpoint |
| --- | --- |
| 🔑 | `GET /favorites` · `POST /favorites/:propertyId` · `DELETE /favorites/:propertyId` |

### Appointments
| | Endpoint |
| --- | --- |
| 🔑 | `POST /appointments` · `GET /appointments` · `GET /appointments/:id` · `PATCH /appointments/:id` · `DELETE /appointments/:id` |

### Conversations
| | Endpoint |
| --- | --- |
| 🔑 | `POST /conversations` · `GET /conversations` · `GET /conversations/:id` |
| 🔑 | `GET /conversations/:id/messages` · `POST /conversations/:id/messages` · `PATCH /conversations/:id/read` |

### Notifications
| | Endpoint |
| --- | --- |
| 🔑 | `GET /notifications` · `GET /notifications/unread-count` |
| 🔑 | `PATCH /notifications/:id/read` · `PATCH /notifications/read-all` · `DELETE /notifications/:id` |

### Reviews & reports
| | Endpoint |
| --- | --- |
| 🔓 | `GET /reviews/:id` |
| 🔑 | `POST /reviews` · `PATCH /reviews/:id` · `DELETE /reviews/:id` |
| 🔑 | `POST /reports` · `GET /reports/mine` |

### Admin
| | Endpoint |
| --- | --- |
| 🛡️ | `GET /admin/dashboard` · `GET /admin/users` · `GET /admin/agents` · `GET /admin/properties` |
| 🛡️ | `GET /admin/appointments` · `GET /admin/reviews` · `GET /admin/reports` · `GET /admin/reports/:id` |
| 🛡️ | `PATCH /admin/properties/:id/approve` · `PATCH /admin/properties/:id/reject` · `PATCH /admin/properties/:id/feature` |
| 🛡️ | `PATCH /admin/users/:id/status` · `PATCH /admin/agents/:id/verify` · `PATCH /admin/reports/:id` |

### Health
| | Endpoint |
| --- | --- |
| 🔓 | `GET /health` — uptime and database connectivity (no `/api/v1` prefix) |

---

## Search, filtering, pagination and sorting

```http
GET /api/v1/properties?purpose=SALE&propertyType=APARTMENT&minPrice=100000&maxPrice=300000&bedrooms=3&page=1&limit=20
```

| Parameter | Notes |
| --- | --- |
| `search` | Case-insensitive across title, description, address, city, district |
| `city`, `district`, `country` | Exact, case-insensitive |
| `propertyType` | `APARTMENT` `HOUSE` `VILLA` `TOWNHOUSE` `OFFICE` `COMMERCIAL` `LAND` `SHOP` `WAREHOUSE` |
| `purpose` | `SALE` `RENT` |
| `status` | `DRAFT` `PENDING` `APPROVED` `REJECTED` `SOLD` `RENTED` (honoured for owners and admins) |
| `minPrice`, `maxPrice`, `minArea`, `maxArea` | Inclusive ranges |
| `bedrooms`, `bathrooms` | Interpreted as **at least** N |
| `agentId`, `categoryId`, `locationId` | UUID filters |
| `isFeatured` | Boolean |
| `page`, `limit` | Defaults 1 and 20; `limit` capped at 100 |
| `sortBy` | `createdAt` `price` `area` `bedrooms` `viewCount` `title` |
| `sortOrder` | `asc` `desc` |

`sortBy` is restricted to an allow-list, so the sort field can never be used to reach arbitrary
columns.

**Visibility is applied on top of every filter**, and is not something the client can opt out of:

| Caller | Sees |
| --- | --- |
| Anonymous / `USER` | Approved, published listings only |
| `AGENT` | The above, plus **all of their own** listings at any status |
| `ADMIN` | Everything |

Sending a token to `GET /properties` is optional but useful: it populates `isFavorited` on each
result.

---

## File uploads

```http
POST /api/v1/properties/:propertyId/images
Content-Type: multipart/form-data
Authorization: Bearer <accessToken>

files: <binary> (one or more)
```

- Accepted types: `image/jpeg`, `image/png`, `image/webp`, `image/avif`
- Per-file limit `MAX_FILE_SIZE_MB` (default 5 MB); per-request limit `MAX_FILES_PER_UPLOAD`
  (default 10); a listing holds at most 30 images
- MIME type, size and count are validated before anything is stored
- Stored in **Cloudinary** when credentials are configured, otherwise written to `./uploads` and
  served from `/uploads/*` — a development convenience, not a production strategy
- **Only the URL is stored in PostgreSQL**; binaries never touch the database
- The first image on an empty listing becomes the cover; deleting the cover promotes the next
- If the database insert fails after upload, the stored files are removed again, so storage and
  database cannot drift apart

---

## Socket.IO

Namespace `/realtime`. **Authentication is mandatory** — a socket without a valid access token is
disconnected immediately.

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/realtime', {
  auth: { token: accessToken },     // or an Authorization: Bearer header
  transports: ['websocket'],
});
```

### Client → server

| Event | Payload | Notes |
| --- | --- | --- |
| `joinConversation` | `{ conversationId }` | Rejected unless you are a participant |
| `leaveConversation` | `{ conversationId }` | |
| `sendMessage` | `{ conversationId, content, type?, mediaUrl? }` | Persists and broadcasts |
| `typing` / `stopTyping` | `{ conversationId }` | Relayed to the room, excluding you |
| `messageRead` | `{ conversationId }` | Marks the other party's messages read |

### Server → client

| Event | Payload |
| --- | --- |
| `newMessage` | The created message with its sender |
| `typing` / `stopTyping` | `{ conversationId, userId }` |
| `messageRead` | `{ conversationId, readerId, readAt, count }` |
| `userOnline` / `userOffline` | `{ userId, at }` |
| `notification` | A new notification for you |
| `joinedConversation` / `leftConversation` | `{ conversationId }` |
| `exception` | Emitted when a handler rejects your event |

Message types: `TEXT`, `IMAGE`, `VOICE` (the latter two require `mediaUrl`).

Notification types: `NEW_MESSAGE`, `NEW_APPOINTMENT`, `APPOINTMENT_CONFIRMED`,
`APPOINTMENT_CANCELLED`, `PROPERTY_APPROVED`, `PROPERTY_REJECTED`, `NEW_REVIEW`,
`PROPERTY_FAVORITED`.

Three behaviours worth relying on:

- **Participation is re-checked on every event**, not just at join time, so a socket cannot hold a
  stale room membership.
- The `sendMessage` socket path and the `POST /conversations/:id/messages` REST path call the same
  service method, so both enforce identical authorization and produce identical side effects.
- `userOnline` and `userOffline` fire once per user, not once per socket, so multiple browser tabs
  do not produce duplicate presence events.

---

## Security

| Control | Implementation |
| --- | --- |
| Helmet | Security headers on every response |
| CORS | Restricted to the origins in `FRONTEND_URL` |
| Rate limiting | Global default 120 req/min; `register` 5/min, `login` 10/min, `forgot-password` 3/min |
| Validation | Global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted` |
| Password hashing | bcrypt, configurable cost |
| Token storage | Refresh, reset and verification tokens stored hashed, never in plaintext |
| SQL injection | Prevented by Prisma's parameterised queries |
| Mass assignment | Unknown request fields are rejected outright with 400 |
| Error hygiene | Stack traces, SQL and connection details never leave the server |

Never returned by any endpoint: password hashes, JWT secrets, database credentials, refresh
tokens (outside the auth flow that issues them), or other users' private data. This is enforced by
explicit `select` clauses and an explicit projection in `AuthService.toProfile`, and is covered by
tests that assert no `$2b$` hash appears in auth or admin responses.

Rate limiting is automatically disabled when `NODE_ENV=test` so the e2e suite is not throttled; it
is always active in development and production.

### Before deploying to production

- Set strong, distinct `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values
- Set `NODE_ENV=production` — this also stops dev-only tokens appearing in auth responses
- Configure Cloudinary rather than relying on local disk storage
- Restrict `FRONTEND_URL` to your real origins
- Wire `forgot-password` and `verify-email` to a real email provider
- Revoke the `CREATEDB` grant and deploy migrations with `prisma migrate deploy`

---

## Testing

```bash
npm test           # unit tests
npm run test:e2e   # end-to-end tests against a real database
npm run test:cov   # coverage report
```

**169 tests, all passing** — 48 unit and 121 end-to-end.

Unit tests cover the auth service (registration, login, token rotation, replay detection, password
recovery), the roles guard, and the pagination and slug utilities. End-to-end tests run the real
application against PostgreSQL and cover:

- Registration, login, refresh rotation, replay detection, logout, password reset, email verification
- JWT protection, including rejecting a refresh token used as an access token
- Role authorization across all three roles, on every admin route
- Property creation, ownership enforcement, cross-agent modification attempts, moderation statuses
- Listing visibility for anonymous, other-agent, owner and admin callers
- Search, filtering, pagination, sorting, and rejection of unknown sort fields
- Property comparison, including ordering and error cases
- Favourites, including the duplicate constraint and `isFavorited` isolation between users
- Appointments through the full lifecycle, including who may perform each transition
- Reviews, rating bounds, one-per-agent enforcement and average recalculation
- Admin moderation, and assertions that no password or token material appears in responses

The e2e suite creates its own accounts with unique emails and cleans them up afterwards, so it is
safe to run repeatedly against a seeded database.

---

## Deployment

```bash
npm ci
npx prisma migrate deploy
npm run build
npm run start:prod
```

Set every required environment variable in the target environment. Point your platform's health
check at `GET /health`, which reports process uptime and database connectivity.

The application enables Nest shutdown hooks and disconnects Prisma cleanly on `SIGTERM`, so
rolling restarts do not drop connections. `trust proxy` is enabled so rate limiting sees real
client IPs behind a load balancer.

---

## Project structure

```
esca-estate-backend/
├── prisma/
│   ├── migrations/            SQL migration history
│   ├── schema.prisma          15 models, 10 enums, indexes and constraints
│   └── seed.ts                development seed (passwords from env)
├── src/
│   ├── main.ts                bootstrap: helmet, CORS, prefix, pipes, filters, Swagger
│   ├── app.module.ts          module wiring and global guards
│   ├── admin/                 dashboard, moderation, user management
│   ├── agents/                agent directory and profiles
│   ├── appointments/          viewing requests
│   ├── auth/                  JWT strategy, guards, auth flows
│   ├── categories/            property categories
│   ├── common/                DTOs, decorators, guards, filters, interceptors, utils
│   ├── config/                typed config, env validation, Swagger setup
│   ├── conversations/         messaging REST layer
│   ├── favorites/             saved listings
│   ├── health/                health probe
│   ├── locations/             countries, cities, districts
│   ├── notifications/         in-app notifications
│   ├── prisma/                PrismaService and global module
│   ├── properties/            listings, search, images, agent listings
│   ├── realtime/              Socket.IO gateway and emitter
│   ├── reports/               abuse reports
│   ├── reviews/               agent reviews and ratings
│   ├── uploads/               Cloudinary and local-disk storage
│   └── users/                 self-service profile
├── test/
│   ├── setup-app.ts           shared e2e bootstrap
│   ├── auth.e2e-spec.ts
│   ├── authorization.e2e-spec.ts
│   └── jest-e2e.json
├── .env.example
├── nest-cli.json
├── package.json
├── tsconfig.json
└── README.md
```

---

## License

UNLICENSED — private project.
