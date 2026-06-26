# Contributing

## Branching

Use short-lived feature branches:

```text
feature/import-preview
fix/csv-amount-parsing
chore/vercel-deploy
```

Keep `main` deployable at all times.

## Pull Request Standard

Every PR should include:

- What changed
- Why it changed
- Screenshots for UI changes
- Verification commands
- Notes about database or environment changes

## Engineering Principles

- Prefer small, reviewable changes over broad rewrites.
- Keep server actions thin and domain logic in `lib/`.
- Keep generated files, secrets, local SQLite databases, and scratch files out of git.
- Preserve auditability for all financial mutations.
- Use Prisma schema changes intentionally and document production migration impact.
- Do not merge changes that break `npm run build`.

## Deployment

Deploy from GitHub through Vercel. Production should use hosted PostgreSQL, not local SQLite.
