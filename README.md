# ShiftBridge

ShiftBridge is a small full-stack shift-exchange application for structured coworker coverage requests. It gives employees a clear path to post and claim shifts while keeping manager approval, schedule conflicts, and claim history visible.

TypeScript · React · NestJS · PostgreSQL · Prisma · Docker

## Why ShiftBridge?

Hourly teams often coordinate shift changes in chats or spreadsheets. That makes double claims, schedule conflicts, and approval status hard to track. ShiftBridge keeps the workflow intentionally small and explicit.

## Features

### Employee workflow

- View assigned shifts and post a future shift for coverage.
- Add one-off availability windows.
- Browse and claim open coworker shifts.
- Receive database-backed in-app approval and rejection notifications.

### Manager workflow

- Import schedules from CSV.
- Review pending claims and approve or reject them.
- Review a chronological audit history.

### Reliability and correctness

- PostgreSQL transaction-safe claiming with row locking.
- Availability containment and assigned-shift overlap validation.
- JWT authentication and employee/manager role checks.

## Architecture

```text
React + Vite
     |
 NestJS API
     |
 Prisma ORM
     |
 PostgreSQL
```

React provides the role-aware demonstration UI. NestJS owns authentication, RBAC, validation, workflows, notifications, and audit records. Prisma maps the application to PostgreSQL.

## Shift exchange lifecycle

```text
ASSIGNED SHIFT → OPEN POSTING → PENDING APPROVAL → APPROVED / REJECTED
```

An employee posts one of their own future shifts. A qualified coworker claim moves the posting to `PENDING_APPROVAL`. A manager approval transfers the assignment and completes the posting; rejection reopens it for another claim.

## Concurrency safety

Two coworkers can try to claim the same shift at nearly the same time. ShiftBridge uses a PostgreSQL interactive transaction at serializable isolation and locks the target `ShiftPosting` row with `SELECT ... FOR UPDATE`. The request rechecks that the posting is `OPEN` while holding the lock before it creates a claim and changes the posting state. The PostgreSQL integration test issues two concurrent claims and proves that exactly one succeeds.

## Conflict detection

Availability must fully contain the target shift:

```text
availability.startAt <= shift.startAt
availability.endAt >= shift.endAt
```

Assigned-shift conflicts use this overlap rule:

```text
existing.startAt < target.endAt
AND existing.endAt > target.startAt
```

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React, Vite, TypeScript |
| API | NestJS, TypeScript, JWT |
| Data | PostgreSQL, Prisma |
| Local stack | Docker Compose |

## Running locally

The quickest way to run all three services is Docker:

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- API: http://localhost:3000
- PostgreSQL: localhost:5432

The backend container applies migrations and runs the demo seed on startup. To run the backend outside Docker, copy `.env.example` to `.env`, start PostgreSQL, then run:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

For the frontend outside Docker:

```bash
cd frontend
npm install
npm run dev
```

## Demo accounts

**Demo only — all accounts use `demo-password`.**

| User | Email | Role |
| --- | --- | --- |
| Employee A | `employee.a@shiftbridge.demo` | Employee |
| Employee B | `employee.b@shiftbridge.demo` | Employee |
| Manager | `manager@shiftbridge.demo` | Manager |

## CSV format

The manager import accepts rows without a header:

```csv
employee.a@shiftbridge.demo,2026-10-08T09:00:00Z,2026-10-08T17:00:00Z
```

The expected order is `employeeEmail,startAt,endAt`.

## Quick demo

1. Sign in as Employee A and post the October 5 shift.
2. Sign out and sign in as Employee B; the seeded availability covers that shift.
3. Claim the available shift.
4. Sign in as Manager and approve the pending claim.
5. Sign in as either employee to inspect notifications; inspect manager audit history as Manager.

## Testing

```bash
npm run prisma:generate
npm run build
npm test
```

The full suite has 12 focused backend tests, including a PostgreSQL integration test. To run the real concurrency test against the supplied isolated database:

```bash
docker compose -f docker-compose.test.yml up -d
npm run prisma:migrate:test
npm run test:integration
docker compose -f docker-compose.test.yml down
```

## Project structure

```text
backend/       NestJS API, Prisma schema, migration, seed, tests
frontend/      React + Vite application
docker-compose.yml
README.md
```

## Design decisions

- PostgreSQL transactions and row locks make claiming atomic without distributed locks.
- Notifications are stored in the database, keeping the demo observable without email, SMS, or queues.
- RBAC is deliberately simple: JWT roles are checked by a NestJS guard.
- Availability is one-off windows, which keeps the data model and UI compact.

## Scope and limitations

ShiftBridge intentionally excludes payroll, external HR integrations, email/SMS, recurring availability, and multi-company tenancy. It is a focused portfolio implementation of the shift-exchange workflow rather than a workforce-management suite.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
