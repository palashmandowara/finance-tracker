# Finance Tracker

A college full-stack project built with Next.js App Router, TypeScript, Tailwind CSS, PostgreSQL, Prisma, and Better Auth. The responsive interface uses a simple green-and-black theme. Recharts is installed for later chart work.

Implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Prisma 7](https://www.prisma.io/docs/orm/v7), and [Better Auth with Next.js](https://better-auth.com/docs/integrations/next).

## This machine's local setup

The local database is configured in Docker container `finance-tracker-postgres`, using the existing PostgreSQL 16 image. Its data lives in the separate persistent volume `finance-tracker-pgdata`, and PostgreSQL is bound only to `127.0.0.1:5432`. Other projects' containers and volumes were not modified. The initial migration has been applied.

`.env` now exists with locally generated database credentials and a secure auth secret. It is gitignored. Do not replace it with `.env.example`, print its contents, or commit it. The auth origin is `http://localhost:3000`.

Open **http://localhost:3000** while the development server is running. Register your own account; browser-test accounts are removed after the tests. After restarting your computer, open Docker Desktop and wait for its engine to start. Then use PowerShell in this folder:

```powershell
$env:PATH = "$pwd\.tools\node-v24.22.2-win-x64;$env:PATH"
docker start finance-tracker-postgres
npm.cmd run dev
```

If port 3000 is already in use by this app, open the existing app instead of starting another copy. Never remove the database volume to restart the app.

## Start locally

1. Install **Node.js 24 LTS** and **PostgreSQL 16 or newer**. Git is optional for running the app. Restart your terminal after installing Node.
2. Open a terminal in this folder and run `npm ci`.
3. Only if `.env` does not already exist, copy `.env.example` to `.env` (PowerShell: `if (!(Test-Path .env)) { Copy-Item .env.example .env }`).
4. Create an empty PostgreSQL database named `finance_tracker` using pgAdmin, or run `CREATE DATABASE finance_tracker;` in PostgreSQL. A hosted PostgreSQL database also works.
5. Edit `.env`:
   - `DATABASE_URL`: your PostgreSQL connection string, for example `postgresql://postgres:YOUR_PASSWORD@localhost:5432/finance_tracker`. Replace username, password, host, port, and database as needed. URL-encode special characters in credentials. For hosted databases, use the provider's direct PostgreSQL URL and SSL settings.
   - `BETTER_AUTH_SECRET`: generate a private random value with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and paste it here.
   - `BETTER_AUTH_URL`: leave as `http://localhost:3000` for local use. Set the real HTTPS origin when deploying.
6. Run `npm run db:generate`, then `npm run db:migrate`. This creates the authentication and finance tables from the included migration.
7. Run `npm run dev` and open **http://localhost:3000**.
8. Create an account on the registration screen. Add a financial account and categories, then record transactions.

Do not put secrets in `NEXT_PUBLIC_` variables. `.env` files, local tools, generated clients, and build output are ignored by Git; `.env.example` contains placeholders only. No secret or database account is supplied by this repository.

If using the portable Node runtime downloaded during implementation, add its directory to PATH in the current PowerShell session before running npm: `$env:PATH = "$pwd\.tools\node-v24.22.2-win-x64;$env:PATH"`. Use `npm.cmd` if PowerShell blocks `npm.ps1`. A normal Node LTS installation is recommended for ongoing work.

## Milestone features

- Email/password registration, login, logout, database sessions, and protected pages.
- Financial accounts with name, type, and opening balance, plus derived current balances.
- User-owned income and expense categories.
- Create, edit, and delete income/expense transactions, with date, type, account, and category filters and 20-row pagination.
- All-time dashboard totals, recent activity, and category spending bars, calculated from PostgreSQL records.
- Shared Zod validation on client and server; Better Auth validates authentication requests.

## Financial rules and security

Amounts are stored as PostgreSQL `INTEGER` paise. Decimal inputs are parsed as strings, avoiding floating-point multiplication. Each transaction must be positive and at most ₹2,14,74,836.47. Opening balances can be negative (for debt). Totals are displayed in INR. Dates are calendar dates, stored as PostgreSQL `DATE`; default entry dates use India time.

Balance = opening balances + income − expenses. Opening balances are never counted as income. All recorded dates are included in the all-time totals. Dashboard filters do not change these totals.

Transfers and card repayments are now available through Transactions → Transfers & card repayments. They are separate linked records, never income or expenses. See milestone 3 below.

Every finance read and mutation checks the authenticated session and scopes data by user ID. Update/delete use ownership-scoped queries. Composite foreign keys additionally ensure a transaction cannot reference another user's account/category or a category of the wrong type. The migration adds amount, name, and description checks. Authentication is handled by Better Auth; passwords are never stored in finance tables. Next.js Server Actions and Better Auth handle origin protection. Auth rate limiting is enabled; its default in-memory storage is per process, so a distributed deployment needs shared rate-limit storage.

## Checks

```sh
npm run db:generate
npx prisma validate
npm run typecheck
npm run lint
npm test
npm run build
npm run test:smoke
```

Unit tests cover integer-paise parsing, limits, date validation, transfer rejection, and balance arithmetic. They do not connect to PostgreSQL.

`test:smoke` requires a completed production build and an unused port 3108. It starts and stops a local server, uses temporary test-only environment values, checks the public login/registration pages, and verifies signed-out redirects on every dashboard route. It does not test a database connection. Run `npm run format` to format source files.

Initial implementation checks on 2 November 2026 with portable Node 24.22.2 passed: Prisma schema validation and client generation, TypeScript, ESLint, all 5 unit tests, the production build, and all 6 HTTP smoke checks. At that stage no database was configured. The subsequent local setup connected PostgreSQL and applied the migration successfully.

The database-backed browser test now passes in headless Microsoft Edge. It verifies registration, password login, logout and protected redirects; account/category creation; transaction creation, editing and deletion; combined date/account/category/type filtering; integer-paise persistence; and an opening balance of ₹5,000 + ₹2,000 income − ₹500 expense = ₹6,500 in both the account and dashboard. It checks separate users' views and rejects forged transaction IDs and foreign account/category IDs. It also checks for horizontal page overflow at a 390px mobile width and uncaught browser errors. Only the test's randomly generated users and their records are removed afterward.

To repeat this test, start the configured local app on port 3000, ensure Microsoft Edge is installed, and run `npm run test:e2e`. Test configuration is in `playwright.config.ts`. Traces, screenshots, and video recording are disabled to avoid recording test credentials. This is one end-to-end scenario with multiple verified steps; it is not exhaustive browser, accessibility, pagination, or production-deployment coverage.

The production dependency audit reported 0 vulnerabilities. The full audit reported 15 moderate findings in development lint dependencies, stemming from transitive `minimatch` versions. ESLint was updated to the supported version accepted by the Next.js configuration, but upstream lint plugins still include affected dependencies. Do not run `npm audit fix --force`: its suggested downgrades break the current tooling. Recheck upstream fixes before sharing a CI service with untrusted lint inputs.

After configuring a database, verify these integration flows:

1. Register and log out; direct visits to every dashboard route should redirect to login.
2. Log in, create bank account with ₹1,000 opening balance, and add income and expense categories.
3. Add ₹500 income and ₹125.50 expense. Expect ₹1,374.50 balance, ₹500 income, ₹125.50 expenses.
4. Edit the expense to ₹100; expect ₹1,400. Delete it; expect ₹1,500.
5. Exercise each filter and combined filters, inclusive date boundaries, and pagination.
6. Register a second user. Confirm no first-user data is visible. Attempt first-user transaction IDs and foreign account/category IDs in mutations; they must be rejected and leave records unchanged.
7. Check narrow mobile and desktop layouts, dialog keyboard navigation, and logout.

Database integration results must be recorded separately after these steps actually run. Missing database credentials do not prevent Prisma generation, type checking, linting, unit tests, or compilation.

## Milestone 2: charts and planning

- **Dashboard:** Recharts expense donut for a selected month and income/expense bars for the six months ending there. Text values accompany charts, and empty months have clear empty states. The all-time summary cards and recent transactions retain their existing meaning; the month selector affects charts only.
- **Budgets:** an overall expense limit and optional category limits for each month. Set a scope again to update it, or expand Edit budget. Each shows spent, remaining (or overage), and percentage used. Warnings begin at exactly 80%, distinguish exactly 100%, and report over-budget spending. Overall usage counts each expense once; category limits are not added to the overall limit. Budgets do not roll over automatically.
- **Savings goals:** create/edit/delete a target with an optional deadline. Add/remove allocations, view progress, and see overdue or reached targets. Allocations are a separate table: they do not reserve actual funds, change account balances, or become income/expenses. Overfunding is allowed and remaining is shown as zero once the target is reached. Deleting a goal deletes its allocations, never its financial transactions.
- **Comparisons:** choose a selected month and baseline month. Income, expense, net income and category spending show absolute and percentage changes. The current month is explicitly month-to-date; prior months are complete months, not matching day-count periods. A zero baseline shows an explanation instead of an invalid percentage; negative net-income baselines use their absolute value for the denominator.

All monetary sums and differences remain integer paise. Division is used only for formatting INR or displaying percentages. Transaction dates are PostgreSQL `DATE` values representing the calendar date the user entered. They are not timestamps: month filtering uses the first day inclusively and the next month exclusively without shifting those stored dates. Asia/Kolkata determines today's date and the current month. Current-month reports include today and exclude future-dated records; planned future budgets have zero usage until their month begins. The existing all-time cards still include all recorded dates.

Reports explicitly allow only `INCOME` and `EXPENSE`. Transfers and credit-card repayments use the separate Transfer model introduced in milestone 3 and cannot enter the income/expense transaction form. A transaction manually mislabelled as an ordinary expense cannot be automatically identified from its description or category, so correct such records rather than entering account movements as expenses. Savings allocations never enter the transaction ledger.

The additive `20261103000000_planning` migration creates only `Budget`, `SavingsGoal`, and `GoalContribution`, with positive-money checks, unique monthly budget scopes, and ownership foreign keys. Existing tables/records are unchanged. Run `npm run db:generate` and `npm run db:migrate` on another installation. Restart an already-running dev server after generating the new Prisma client. This machine's migration was applied after a private backup in the ignored `.tools` directory; fingerprints confirmed existing financial accounts, categories and transactions were unchanged.

Milestone 2 adds unit coverage for Kolkata midnight/month boundaries, leap months, budget thresholds, money validation, and zero/negative-baseline comparisons. `npm run test:e2e` runs both milestone suites using isolated test users. The planning suite uses only its own users' records, verifies chart/budget updates after transaction edits/deletion, checks goal allocations against unchanged transaction totals, and exercises forged cross-user budget/goal/contribution IDs. Existing real accounts are never seeded with demo data.

Verified on **3 November 2026**: Prisma schema validation/client generation, additive migration application, TypeScript, ESLint, all **11 unit tests**, the milestone 1 browser regression scenario, the milestone 2 browser scenario, the production build, and all **9 production HTTP smoke checks** passed. The first planning-browser attempt needed a test-selector correction because Recharts legend icons also use the chart's SVG class; the corrected scenario passed. Database fingerprints matched again after test cleanup, confirming the existing financial accounts, categories, and transactions remained unchanged. The app and PostgreSQL were confirmed running after verification.

Remaining verification limits: browser tests ran in headless Microsoft Edge, with a 390px mobile-width overflow check; other browsers, exhaustive accessibility, high-volume performance, concurrent editing, and production deployment were not tested. The allocation model deliberately does not verify whether money is available in a financial account. No new production dependencies were added for this milestone; the previously documented development-tool audit findings remain unresolved.

## Structure and future scope

`src/app` contains pages, auth handlers, and server actions; `src/components` contains forms and UI; `src/lib` contains validation, money helpers, session protection, and queries. `prisma/schema.prisma` and `prisma/migrations` define the database.

Better Auth's `Account` model represents login credentials; `FinancialAccount` represents money accounts. They are intentionally distinct. Balances are derived from transactions instead of mutable cached totals. Stable record IDs, ownership fields, date indexes, and typed categories provide a foundation for future work.

Future scope: shared expenses and settlements. Subscription tracking and the bills calendar are implemented in milestone 4. PDF and SMS imports are outside the implemented scope.

## Ledger design and user journey

The public homepage is now at /; signed-in visitors get an Open dashboard action. Login and registration use the existing Better Auth service. Registration includes password confirmation and both forms support showing/hiding the password, loading feedback and errors. Passwords require 8–128 characters.

New registrations go to /setup to create a manually tracked INR account. Skip for now goes directly to the dashboard. Returning users always log in to the dashboard; no existing user is forced through setup. Accounts can be added later from Accounts, or via Complete account setup in Settings when none exist. An existing account makes /setup redirect to the dashboard. No migration or database reset is needed for this update.

Settings displays the signed-in user's email and supports name changes (trimmed, 1–80 characters). The protected server action derives ownership from the session, ignoring any submitted user ID. Logout remains beside the profile in navigation. The public Better Auth name-update endpoint also validates name length. Email changes, password reset, social login and bank connections are not part of this release. SMS features are removed from scope.

The approved Ledger direction uses warm cream surfaces, forest-green actions, Georgia headings and Segoe UI body text with local fallbacks. Shared controls, navigation, charts and all existing finance screens use this palette. The homepage screenshot comes from an isolated temporary sample user and is explicitly labelled; it contains no real-user financial records.

Run locally: start the existing PostgreSQL container with `docker start finance-tracker-postgres`, then `npm run dev` and open http://localhost:3000. If Node is not on PATH in PowerShell, first run `$env:PATH = "$pwd\.tools\node-v24.22.2-win-x64;$env:PATH"`. Keep your existing .env; do not replace it or commit it. Standard fresh-install setup remains above.

The Ledger browser scenario in tests/e2e/journey.spec.ts uses randomly generated users and removes only their records. It exercises registration/confirmation, setup and skip/resume, profile persistence/ownership, login/logout, protected pages, errors, keyboard access and responsive layouts. Browser screenshots are stored in design/qa; no password-filled screenshots, video or traces are recorded.

Ledger verification on 3 November 2026: ESLint, TypeScript, all 11 unit tests, both existing database-backed finance browser scenarios, the new Ledger journey browser scenario, the production build and all 12 production HTTP smoke checks passed. The journey suite passed after fixing a real mobile table overflow and two test synchronization/selector issues. It also verifies that returning users with no financial accounts are not forced into setup, direct invalid name updates are rejected by Better Auth, and forged user IDs cannot modify another profile. Screenshots were reviewed for desktop and mobile appearance. Private before/after fingerprints matched for financial accounts, categories, transactions, budgets, goals and contributions after temporary-user cleanup. Existing records were preserved; no migration was required.

Verification limits: browser automation ran in headless Microsoft Edge, with keyboard checks and four viewport sizes. Safari/Firefox, real mobile devices, full screen-reader audits, concurrent onboarding submissions and production hosting were not tested. The homepage image is a labelled static sample preview. Existing finance constraints and previously documented development dependency audit findings still apply.

## Milestone 3: statements, exports and transfers

From **Transactions**, choose **Import statement**, **Export CSV**, or **Transfers & card repayments**. The Ledger design, existing authentication and finance records are preserved. The additive migration `20261103010000_statements` adds Transfer, ImportBatch and MerchantRule tables plus an optional transaction reference; it does not reset or rewrite old financial records. Run `npm run db:generate` and `npm run db:migrate` when updating another installation, then restart the app. This laptop's migration was preceded by a private backup under ignored .tools.

### Desktop demonstration

1. Create a bank account with ₹5,000 opening balance and expense/income categories (for example Groceries and Salary). The opening balance must be from **before the imported period**. Never use a closing balance for the same transactions: that would double-count them. Import never overwrites the opening balance.
2. Download the fictional CSV or XLSX from the import page (also in public/samples). These are files only, never preloaded database records. Both contain a ₹500 expense, ₹2,000 income, a duplicate expense and a closing-balance row.
3. Upload, select the destination account, then explicitly map the date, description, debit, credit and reference columns. Choose Not used for amount and type. Confirm DD/MM/YYYY, Separate debit/credit, and the signed convention (used only in signed mode). Click Review import.
4. Check suggested categories, choose any missing categories and leave the duplicate and closing-balance rows skipped. Corrections are editable. Confirm import: two records are saved, two rows skipped and the bank balance becomes ₹6,500. The date in the downloadable sample is 2 November 2026; change preview dates if demonstrating another month.
5. Open the dashboard, then filter Transactions. Export CSV downloads **all matching income/expense transactions across pagination**, with date, account, type, category, description and positive INR amount (type conveys direction). Transfers are listed separately and are not included in this income/expense export. Text is quoted, embedded quotes/newlines are escaped, and spreadsheet formula prefixes receive a protective apostrophe.

### Import rules and limits

- CSV: UTF-8 comma-delimited, first row is the column header. XLSX: one worksheet, first row is the header. Maximum 2 MB compressed/upload size, 500 data rows, 40 columns, 500 characters per cell; XLSX expansion is bounded to 20 MB and 200 ZIP entries. Legacy .xls, encrypted workbooks, PDF and SMS are not supported. Use plain values; formulas/rich cells are not interpreted as amounts or dates. Excel date cells are presented as YYYY-MM-DD; choose YMD for those files. Text dates support DMY, MDY and YMD with four-digit years and /, - or . separators.
- Debit and credit columns require exactly one positive value per transaction. Signed mode requires an explicit positive/negative convention. An optional transaction-type column accepts income/credit/CR or expense/debit/DR and must agree. Optional reference is retained for reconciliation. Amounts are parsed into integer paise with no floating-point money multiplication.
- Recognised opening/closing balances, totals and repeated headings are excluded. Other malformed rows remain visible for review; unfamiliar statement layouts may need cleaning first. The app does not infer a statement's opening balance. You must review source descriptions/dates rather than assume every row is a transaction.
- Suggested categories use a small conservative keyword list and only categories that already exist in your account. Unknown or ambiguous default matches remain uncategorised. A correction is remembered only when explicitly checked and supplied with a merchant keyword from the description. Rules are saved only for imported rows; skipped/invalid rows do not teach rules. These rules belong to the signed-in user and take precedence over defaults. Rule matching uses normalised, whole-phrase keywords; it is not machine learning. No automatic category creation or rule-management screen is included.
- Review is editable, including amount, date, description, direction, category, reference and transfer classification. Invalid selected rows are reported separately while valid selected rows are saved atomically. You can skip invalid rows or import a corrected file afterwards. The result reports imported, skipped, invalid and reconciled counts. Reconciled is a subset of skipped.
- Duplicate candidates are scoped to the selected account and user. Amount/direction must agree; a matching nonempty reference or matching date and normalised description flags a candidate. Rows earlier in the upload are checked too. Possible matches show up to five existing record details per row and default to Skip. Keep both is an explicit override and creates another record. Records are never automatically merged or deleted. Candidate matching is conservative, not proof that transactions are identical.
- Import confirmation is durable and idempotent per batch: repeated submissions return its original report. User-level database locking serializes confirmed imports, and duplicate candidates are checked again at save time. A new upload is a new batch and is reconciled against current records; explicit Keep both can intentionally repeat records. Unconfirmed drafts are stored in the user's ImportBatch; confirmed batches discard raw rows and retain the result for replay safety. Closing/reloading the wizard requires another upload; draft resumption is not implemented.

### Transfers and card repayments

A Transfer has one amount, date, owner, source and destination. Both accounts must belong to that owner and must differ. The source balance decreases and the destination increases by the same integer-paise amount. Deleting the linked transfer reverses both effects; no transaction is silently deleted or merged. Account balances are opening + income − expense + incoming transfers − outgoing transfers. Across all owned accounts transfers cancel, so dashboard income/expenses, budgets, goals and comparisons stay unchanged.

A credit card uses **negative balance = debt**, zero = paid off, positive = credit in your favour. For example a card opening at −₹1,000 plus a ₹500 purchase becomes −₹1,500. Paying ₹1,000 from the bank decreases the bank by ₹1,000 and brings the card to −₹500; the ₹500 purchase remains the expense. Record repayments from the paying bank account to the card, not as a second expense.

Import descriptions containing transfer/repayment/card-payment phrases are flagged for review. Select Transfer / card repayment and the other owned account, or skip. Money out means destination statement account → other account; money in means other account → statement account. Matching existing transfers are shown as possible movements, including same-date/amount/direction matches when descriptions differ. Import / reconcile reuses a matching movement by skipping a second write; leaving Skip is also safe. Keep both deliberately overrides this protection and should be used only for a truly separate movement. Fees must be recorded as separate expenses. FX, automatic discovery of hidden transfers from arbitrary bank narration, fuzzy date windows and opening-balance reconciliation are not implemented.

### Checks

Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`. With the app on port 3000, `npx playwright test tests/e2e/statements.spec.ts` runs the desktop-only demo using isolated temporary users and cleans up their imports, rules, transfers and finance records. Existing historical suites remain available; milestone 3 does not require additional mobile or cross-browser QA.

Parser references: [ExcelJS documentation](https://github.com/exceljs/exceljs#reading-xlsx) and [CSV Parse](https://csv.js.org/parse/). ExcelJS is pinned to 4.4.0; CSV Parse was upgraded to patched 7.0.3 after dependency auditing. The installed ExcelJS dependency tree still has moderate audit findings (archiving/glob and uuid dependencies), alongside the pre-existing lint-tool findings. No forced major-version downgrade was applied. Do not expose this local college demo as an untrusted public upload service without revisiting parser dependencies and deployment limits.

Milestone 3 actual results: the additive migration and Prisma client generation passed; all 19 unit tests passed; the isolated desktop browser scenario passed (CSV upload/mapping/editing/confirmation, XLSX repeat import, learned rules, within-upload and existing duplicates, explicit Keep both, idempotent replay, invalid rows, card purchases/repayments, opposite-side transfer reconciliation, linked deletion, unchanged budget expense totals, filtered export across pagination and cross-user rejection). TypeScript, ESLint, production build and all 15 production HTTP smoke checks passed. The import review was visually inspected in the desktop browser. Test users and all their records were removed, and private fingerprints for existing accounts, categories, transactions, budgets, goals and contributions matched the pre-migration snapshot. No additional mobile or cross-browser QA was performed. The final production dependency audit reports 9 moderate findings; the unresolved parser dependency limitations are described above.

## Milestone 4: subscriptions, bills and financial calendar

Use **Subscriptions**, **Bills** and **Calendar** in the sidebar. The existing Ledger design and all financial models are retained. The additive `20261104000000_schedules` migration creates subscriptions, dismissals, bill schedules, individual occurrences and payment history. It also adds database triggers that invalidate a bill-payment link when the corresponding expense or transfer is changed/deleted. It does not alter old financial values. A private backup and before/after financial fingerprints are used for the local migration and tests. On another installation, run `npm run db:generate`, `npm run db:migrate`, then restart the app.

### Desktop demo steps

1. In Subscriptions, add a monthly plan or an annual plan with its amount and next renewal date. Account and expense category are optional. Active totals show **estimated monthly equivalent** and **estimated annualised cost**, never posted expenses. Annual plans are divided by 12 and rounded to the nearest paise for display. Open a subscription to edit, pause/resume or delete it.
2. A monthly anchor on January 31 renews on February's last day and then March 31. A February 29 yearly anchor uses February 28 in non-leap years and returns to February 29 in leap years. The entered next-renewal date remains the anchor; future dates are projected without creating charges.
3. Possible subscriptions show their supporting expense dates, descriptions and amounts. Confirm to create a tracked subscription, or Dismiss. Both actions are explicit. Matching uses up to the latest 2,000 past/present expenses, normalised merchant descriptions, an amount tolerance of 5% or ₹1 (whichever is larger), and three monthly payments 26–35 days apart or two annual payments 350–380 days apart. Tracked, paused, deleted/dismissed merchants are suppressed. These are suggestions, not proof of a subscription; unrelated similar purchases can match.
4. In Bills, create rent, EMI, utility, other or credit-card statement bills. Choose one-off, monthly or yearly recurrence and enter the amount/due date yourself. For card bills, the optional account is the **card**, not the paying bank. The current card debt is never substituted for the statement amount.
5. Open a bill occurrence. To demonstrate no double-counting, first create a matching expense through Transactions, then choose **Link payment** on the bill. Linking changes the bill's status but adds no transaction. Alternatively, **Record full payment** explicitly records one expense in the chosen account/category. For card statements it creates one linked transfer from a non-card paying account to the card; the original purchases remain the expenses.
6. Example: a card balance of −₹1,500 with a manually entered ₹700 statement bill becomes −₹800 after a ₹700 repayment. The bank decreases by ₹700, and income/expense totals and budgets do not change. Only full payments are supported: the existing/new payment must equal the occurrence amount exactly. Partial payments, overpayments, fees and settlement allocations are not supported here.
7. Edit or delete a linked expense using Transactions, or delete a repayment under Transfers. Changing amount, transaction type, account/destination or payment date invalidates its link; the occurrence becomes unpaid and retains the old payment history with a review note. Description/category-only expense edits leave a financially matching link valid. Relink an appropriate record when ready. Individual unpaid occurrence amount/due date can be edited without creating another occurrence for the original scheduled date.
8. Open Calendar, use Previous month / Next month / Today, and click an item to open its details. The month grid distinguishes Paid, Upcoming, Due today and Overdue bills; renewals are clearly estimates. Dashboard and calendar reminder lists show unpaid bills and upcoming renewals. Dates and “today” consistently use Asia/Kolkata. There are no email, SMS, push or background notifications.
9. To track subscription payments as bills, use **Track as bill** on that subscription. Its linked bill occurrences replace the standalone subscription events, so the same renewal is not shown twice. Edit the linked schedule from the subscription. Pause/delete cancels future unpaid linked occurrences, while paid and overdue history remains. Separate manually entered schedules are independent and are not automatically merged.

### Payment and schedule safeguards

Ownership, full amount, expense/transfer type, relevant accounts and expense category are checked on the server. A payment record can be actively linked to only one occurrence. User-level transaction locks and a database unique active-payment constraint prevent repeated clicks/replayed payment requests from creating a second payment. Linking locks the selected financial record while validating it. Obvious matching new-payment attempts are rejected with instructions to link the existing record. All monetary arithmetic remains integer paise; schedules themselves never enter financial totals.

Bill schedule edits update future unpaid occurrences, cancelling future dates no longer in the schedule. Paid and overdue occurrence snapshots remain unchanged. Changing one occurrence's date retains its original schedule identity, preventing it from being regenerated on the old date. Recurrence materialisation happens when pages are read, normally about 12 months ahead or through a requested calendar month; this creates schedule rows only. Supported schedule/calendar dates are 2000–2100. Bills and subscription suggestions are intentionally simple: no automatic price updates, renewal charging, bank connections, dismissal-management screen, payment unlink command, or background scheduler. To change an already-paid bill amount, first correct the underlying payment; its link will require review. Large-history performance has not been benchmarked.

### Dependency audit review

Before this milestone, npm reported 23 moderate findings: 9 in the production/runtime dependency tree and 14 additional development-tool findings. A non-forced `npm audit fix --ignore-scripts` adjusted compatible transitive dependencies, including the rimraf resolution within the existing major range. It removed one reported runtime finding. The final audit reports **22 moderate findings: 8 runtime and 14 additional development findings**, with no high or critical findings. These counts include dependent-package chains, not 22 independent root vulnerabilities.

Runtime findings are under ExcelJS: archiving/glob/minimatch dependencies and uuid. Development findings are in ESLint/Next lint plugins and their minimatch dependency chains. The remaining advisory roots concern minimatch denial of service from pattern expansion and uuid buffer bounds in v3/v5/v6. The inspected ExcelJS code uses uuid v4, and the statement importer reads bounded buffers rather than accepting glob patterns, but those facts do not make the dependency audit clean. npm's remaining recommendations require major downgrades of ExcelJS/ESLint/Next lint configuration or incompatible transitive majors, so they were not forced. CSV/XLSX parsing and the desktop import flow are regression-tested after the compatible change.

### Focused checks

Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`. With PostgreSQL and the app running on port 3000, run `npx playwright test tests/e2e/schedules.spec.ts tests/e2e/statements.spec.ts` for the new desktop scenario and statement/transfer regression. Each uses isolated random test users and removes only its own data. No demo records are added to an existing user. Mobile and cross-browser testing are outside this laptop-demo milestone.

Milestone 4 actual verification (4 November 2026): additive migration/client generation, all 24 unit tests, TypeScript, ESLint, production build, both focused desktop browser scenarios and all 20 production HTTP smoke checks passed. The schedule scenario covers confirmation/dismissal, subscription create/edit/pause/resume/delete, monthly/yearly dates, month-end handling, linked-subscription calendar deduplication, calendar navigation/statuses, existing-expense linking, new full expenses and card repayments, repeated submissions, payment invalidation/history after edits/deletions, schedule edits preserving paid history, and foreign-user rejection. The statement/import/transfer scenario passed again after the compatible dependency change. The desktop calendar was visually reviewed. Two regression issues were repaired: subscription deletion now redirects after completion, and character-encoding damage in existing UI text was corrected.

Data verification: all milestone test users and their records were cleaned up. The pre-migration financial-table baseline contained no rows. During implementation, one non-test financial account and one non-test import draft appeared; these were retained untouched rather than removed to make fingerprints match. All other checked table fingerprints matched. The additive migration did not rewrite financial values. The private backup remains in the ignored .tools directory, and .env remains gitignored. No mobile or cross-browser testing was added. Remaining limitations and the 8 runtime / 14 development moderate audit findings are documented above.

## Automatic Slice statements

Open **Transactions → Import statement**, choose the account represented by the statement, and upload its CSV/XLSX. Slice is recognised from the seven column labels, anywhere in the sheet; XLSX prefers the **Statement** worksheet. You get a compact summary and an **Import statement** button. Column mapping and individual approval are unnecessary for valid rows. Full details and category corrections are optional. Other statement formats retain the existing mapping workflow.

- Reads all transaction rows dynamically: dates such as `01 Apr '26`, exact text references (including leading zeros/whitespace), separate debit/credit, and post-transaction balance. Metadata above the header is discarded. No sample account, date, filename, transaction count or amount is hardcoded.
- Limits: 2 MB, 5,000 Slice transaction rows, 5,200 worksheet rows including metadata, 40 columns, 500 characters per cell, 20 MB expanded XLSX. Generic imports remain limited to 500 rows. Formula cells, unsafe numeric references, conflicting debit/credit and broken running balances block confirmation; correct the source file and re-upload. Dates must be ascending; same-day source order is retained. Two-digit years mean 2000–2099.
- Opening = first balance − first credit + first debit. Every subsequent unique source row is checked in integer paise. An exact repeated source row is flagged and excluded from movement totals/balance advancement; the transaction count includes repeated source rows.
- Incoming/outgoing are statement cash movements, not claims about earned income or consumption. Unknown movements use **Uncategorised** with pending-review status; their cash effect is retained without assuming income/spending. Existing merchant rules still supply suggestions. Review genuinely ambiguous own-account transfers and choose the other owned account, explicitly confirm its purpose, or retain the movement pending review. New bank movements cannot be skipped.
- Duplicate matching is scoped to the signed-in user and destination account. Import provenance keeps a hashed exact reference/date/direction/amount identity; reference-free identities also include normalised description and running balance. Existing manual records use reference evidence or date/description/amount/direction. Duplicates default to skip; overlapping ranges and repeat confirmation do not create another record. Matched existing transfers are reconciled, including their other side, using reference or matching description/date/amount evidence. No amount-only transfer match.
- Explicit UPI reversal credits require an embedded labelled UPI/UTR/RRN reference, full matching amount, same owned account, original debit on/before the credit and within 90 days, and exactly one unmatched candidate. Both records and cash effects remain. Refunds reduce the original category's spending **on the credit date**, rather than income, in totals, budgets, charts and comparisons. Ambiguous, partial or unmatched reversals must remain pending until there is enough evidence; they are never paired by amount alone. Negative net category spending is listed but excluded from the pie slices.
- Matched reversal pairs protect amount, direction, account and ordering dates from incompatible edits. Description/category edits remain possible. Delete the credit reversal first before deleting/changing the original debit. Historical generic imports are not automatically reclassified.
- For an empty account with a zero opening balance, a single checkbox offers the inferred opening balance. The server checks emptiness again when saving. Existing openings are never overwritten. The result and Accounts page show the dated statement closing separately from the tracked balance; missing periods, skipped rows, opening differences, and activity outside the statement dates can explain discrepancies. Slice debit/credit statements target bank/wallet/cash accounts; repayments to credit-card accounts use the existing transfer flow.
- Import confirmation is atomic and repeat-safe. Raw workbook bytes and customer metadata are not retained. Parsed draft transaction rows remain in the private database until confirmation; confirmed batches retain aggregate summaries and provenance, not the original workbook.

### Privacy and local verification

Put personal statements only in the ignored `private-statements/` folder (or another private location outside the repository). Never place them in `public/` or committed fixtures. All new tests construct fictional workbooks in memory. To inspect aggregate results without importing anything:

```powershell
npm run verify:slice -- private-statements/your-statement.xlsx
```

This prints only row count, date range, money totals, inferred balances and validation errors. The original attachment was not available in the workspace during implementation, so its sample-specific expectations—544 transactions, opening ₹26,083.69 and closing ₹44,936.40—have **not** been verified against that file. They are not importer rules.

The additive migration is `20261104010000_slice`. On another checkout run `npm run db:generate` and `npm run db:migrate`, then restart the app. The existing local database was backed up privately before applying it. No reset or real-account demo inserts are used.

### Slice verification results — 4 November 2026

- 31 unit tests passed, including shifted headers, strict dates/amounts, exact references, running-balance failures, in-file duplicates, evidence-based reversal matching and a variable 573-row workbook.
- Focused desktop Edge scenario passed: automatic upload/summary/import, uncategorised rows, explicit opening confirmation, exact reference preservation, reversal accounting, card repayment, repeated confirmation, repeat/overlapping uploads, cross-user replay/account rejection, server rejection of a forced invalid import, net monthly budget spending, existing transfer's incoming-side reconciliation, filtered export and Accounts closing-balance display. An actual 573-row import completed with the expected ₹8,421.27 balance. Fictional users/data were cleaned up afterward.
- Existing milestone 3 imports/exports and milestone 4 schedules/calendar desktop regression scenarios passed. No mobile/cross-browser tests were added or run. The screenshot `design/qa/slice-summary-desktop.png` contains fictional data only and was visually reviewed.
- TypeScript, ESLint, production build and all 20 HTTP/public/protected-route smoke checks passed.
- Private before/after fingerprints verified the pre-existing accounts and financial records were unchanged. The original personal Slice attachment was not available, so its 544-row/opening/closing expectations remain untested.

## Accounting reconciliation and merchant recognition repair

The earlier Slice flow could omit unresolved credits and still label an import complete. That understated the saved balance even when the inferred opening was correct. The repair keeps cash direction separate from financial purpose and does **not** repair discrepancies by overwriting opening balances. Existing financial records are not automatically changed.

### Recovering an incomplete import

1. Keep the original workbook in the ignored `private-statements/` directory or another private location. Open **Transactions → Import statement**, choose the same account, and upload it again.
2. Existing matched movements are skipped; missing movements are proposed. Matching older entries can gain missing source metadata when you confirm, without overwriting their financial values/classifications.
3. For unclear reversals/transfers, select the other owned account when known, or **Keep movement · review later**. This preserves the credit/debit while excluding unresolved financial purpose from income/spending. Non-duplicate bank movements cannot be skipped.
4. The preview shows the projected balance at the statement end. Confirmation recomputes the saved balance through that date and rolls back everything if it differs from the statement. Later activity is excluded from this comparison, but remains in the account's current tracked balance. Existing opening balances and earlier transactions are included exactly once.
5. Do not increase the opening balance to conceal omitted credits. Missing source descriptions/references cannot be reconstructed safely from totals alone.

### Classification and corrections

Recognition parses Slice's bank envelope, payee name, UPI identifier and remarks separately. It uses exact merchant aliases, normalised names, UPI payee matches, user keyword rules, direction-aware financial-purpose patterns, and per-user corrected identities. Corrected identities override defaults in their recorded cash direction. The local catalogue includes the requested merchants plus additional travel, grocery and utility merchants; no AI API is used.

Brand identity is distinct from financial purpose: Instamart is groceries; Amazon Pay balance loads are pending own-account movements; a payment provider in a person's UPI address does not make that person Amazon; refunds and mandate/test payments remain reviewable. Evidence labels (HIGH/MEDIUM/LOW/USER) describe the recognition source, not invented accuracy percentages. Unknown entities stay pending.

New imports retain exact original descriptions/references, bank transaction type, direction, paise amounts, date and running balance in provenance. The ledger stores the recognised merchant, financial purpose, category/subcategory, evidence and review status. Cash movements always affect balances. Only recognised/confirmed income and expenses affect reports; linked refunds offset original spending on the credit date when the original debit was counted as spending. Own transfers and card repayments use the existing two-account transfer model.

For older imports, open **Transactions → Review imported classifications**. Inspect the complete proposed plan, then explicitly confirm. It applies recognised categories and marks uncertain rows pending without changing cash amounts, dates, references, descriptions or opening balances. This does not restore missing statement rows. Individual **Review classification** controls let you confirm purpose/category/subcategory, remember a merchant/UPI correction, or explicitly convert an ordinary record to a linked transfer. Bill-linked and reversal-linked records have additional guards. No bulk review has been applied automatically to the real account.

Limits: the catalogue is deliberately finite; unsupported/ambiguous payees need review. Partial/ambiguous refunds are not automatically linked. An unmatched refund is kept pending, not invented income. Personal transfers and investments are non-income/non-spending allocations unless the owner explicitly chooses another supported purpose. Cash withdrawals need a cash account for a linked transfer, or remain an identified cash movement. Existing legacy classifications remain until owner confirmation.

The additive migration is `20261104020000_recognition`; run `npm run db:generate`, `npm run db:migrate`, then restart the app on another checkout. A private backup was made before applying it locally.
