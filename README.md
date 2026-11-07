# Finance Tracker

A full-stack personal finance platform for tracking accounts, transactions, budgets, savings goals, recurring payments, subscriptions, bills, transfers, and imported bank statements.

Built with **Next.js App Router, TypeScript, PostgreSQL, Prisma, Better Auth, Tailwind CSS, and Recharts**.

![Finance Tracker dashboard preview](public/product-preview.png)

## What it includes

- Email/password registration, login, logout, sessions, and protected routes
- User-owned financial accounts, opening balances, categories, and transactions
- Income, expenses, transfers, and credit-card repayments
- Monthly budgets, category limits, savings goals, and comparisons
- Recurring bills, subscription tracking, renewal estimates, and calendar views
- CSV/XLSX statement imports with duplicate detection, provenance, review states, and repeat-safe confirmation
- Merchant recognition and classification review for imported transactions
- CSV export, responsive layouts, charts, filters, pagination, and mobile overflow checks

## Engineering highlights

Money is stored as integer **paise**, so decimal amounts do not depend on floating-point arithmetic. Transaction dates are stored as PostgreSQL calendar dates and reports use Asia/Kolkata date rules.

Every finance read and mutation is scoped to the authenticated user. Update and delete operations use ownership-scoped queries. Composite foreign keys prevent cross-user account and category references. Forged IDs, cross-user mutations, invalid transaction types, and invalid import records are rejected on the server.

Statement imports preserve exact source references, dates, directions, amounts, descriptions, and running balances. Imports are bounded, validated, repeat-safe, and atomic. Ambiguous movements remain reviewable instead of being silently classified as income or expenses.

The application does not connect to banks, send payments, or make financial decisions. Subscription renewal dates are estimates, and imported classifications require user review when evidence is ambiguous.

## Architecture

```text
Next.js pages and server actions
        |
Better Auth sessions + shared Zod validation
        |
Prisma data access and ownership checks
        |
PostgreSQL migrations, constraints, and indexes
```

The main code is organized as:

- `src/app`: pages, layouts, API routes, and server actions
- `src/components`: forms, navigation, charts, dialogs, and import UI
- `src/lib`: authentication, money, validation, reports, schedules, imports, and queries
- `prisma/`: schema and additive migrations
- `tests/`: unit, smoke, and Playwright browser coverage
- `design/`: brand specification and fictional preview assets

## Run locally

Requirements:

- Node.js 24 LTS
- PostgreSQL 16 or newer

Install dependencies:

```sh
npm ci
```

Create a local environment file only if one does not exist:

```sh
cp .env.example .env
```

Set these values in `.env`:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/finance_tracker
BETTER_AUTH_SECRET=generate-a-long-random-secret
BETTER_AUTH_URL=http://localhost:3000
```

Create the database, then generate Prisma Client and apply migrations:

```sh
npm run db:generate
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and create a personal account.

Never commit `.env`, database credentials, statement files, or private backups. Do not put secrets in `NEXT_PUBLIC_` variables.

## Verification

The project has local coverage for:

```sh
npm run db:generate
npx prisma validate
npm run typecheck
npm run lint
npm test
npm run build
npm run test:smoke
npm run test:e2e
```

The documented verification includes:

- TypeScript, Prisma validation/client generation, ESLint, production builds, and HTTP smoke checks
- Unit coverage for money parsing, limits, dates, balances, transfers, budgets, schedules, imports, recognition, and reconciliation
- Playwright coverage for authentication, protected routes, CRUD flows, filters, pagination, mobile layout, cross-user isolation, forged-ID rejection, statement imports, transfers, schedules, bills, subscriptions, and classification review
- Database-backed tests using isolated temporary users whose records are cleaned up afterward

The latest implementation notes record **31 unit tests** for the statement and recognition milestone, plus browser and smoke verification across the earlier finance milestones. Run the commands above in your own environment to reproduce the current state.

Pull requests are checked by GitHub Actions with PostgreSQL using the type checker, ESLint,
unit tests, production build, smoke checks, and a separate Edge browser job. The workflow
uses isolated CI credentials and never requires personal finance data.

## Known limitations

- No production host, managed database, monitoring, or CI deployment is included.
- Browser automation was run with Microsoft Edge; Safari, Firefox, real mobile devices, full screen-reader audits, high-volume performance, and concurrent editing are not fully covered.
- Subscription renewal dates are estimates and do not charge users.
- Statement classification is evidence-based and finite; unknown or ambiguous merchants require review.
- The app does not provide bank connections, SMS/email notifications, payment execution, or investment advice.
- The dependency audit still reports moderate findings in ExcelJS and development lint dependency chains. Do not run `npm audit fix --force`; review upstream fixes before deploying.
- Personal statement files must remain outside the repository.

## Resume description

**Finance Tracker — Next.js, TypeScript, PostgreSQL, Prisma, Better Auth, Tailwind CSS**

- Built a full-stack personal finance platform for accounts, transactions, budgets, savings goals, recurring payments, subscriptions, transfers, and bank statement imports.
- Implemented secure multi-user data isolation with session authentication, ownership-scoped queries, composite foreign keys, server-side validation, and forged-ID rejection.
- Designed integer-paise money handling and date-safe financial reporting with dashboards, charts, filters, pagination, exports, recurring schedules, and mobile-responsive views.
- Added unit, smoke, and Playwright end-to-end coverage for authentication, CRUD workflows, cross-user isolation, statement imports, transfers, and financial balance calculations.

## Project status

This is a portfolio project with a working local application and documented verification. It should be described as a tested full-stack project, not as a production financial service or a source of financial advice.
