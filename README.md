# CEEABEM Treasury Management System

Production-oriented treasury management application for CEEABEM, replacing a manual spreadsheet workflow with import, categorization, review, closing, reporting, and audit workflows.

## Stack

- Next.js App Router
- TypeScript
- Prisma ORM
- SQLite for local development
- PostgreSQL-ready Prisma schema for production
- Tailwind CSS
- shadcn-style UI primitives
- React Hook Form
- Zod

## Local Setup

```bash
npm install
cp .env.example .env
npm run db:push
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

Seeded local login:

```text
admin@ceeabem.local
ChangeMe123!
```

## Core Workflows

- Import CSV/XLSX bank exports
- Prevent duplicate transactions
- Auto-categorize transactions from rules
- Manually review and approve transactions
- Lock transactions through monthly closings
- Generate monthly PDF/XLSX reports
- Generate annual reports
- Log edits, imports, approvals, closings, and email attempts

## Production Notes

SQLite is local-development only. For Vercel production, configure a hosted PostgreSQL database and set `DATABASE_URL` in Vercel environment variables.

Required production environment variables:

```text
DATABASE_URL
SESSION_SECRET
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
REVIEWER_EMAIL
TREASURER_EMAIL
```

## Quality Checks

Run these before merging:

```bash
npm run build
npm audit --omit=dev
```
