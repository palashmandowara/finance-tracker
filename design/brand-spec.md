# Finance Tracker — direction review

Status: direction B — Ledger approved and implemented across the public and private application.

## Skill and sources

Project-local skill: `.agents/skills/web-design-engineer/SKILL.md` from ConardLi/garden-skills, revision `2b9a89340b70f632d31c0f1c69fce94a7912423e`. Only this skill was installed. Its redesign protocol, design calibration, failure patterns, browser acceptance reference, and recipe index were read. The Python installer was unavailable; a sparse Git checkout supplied the skill files.

The user's two-preview-before-choice process takes precedence over the skill's earlier pre-preview confirmation and three-variant default. No full redesign until a direction is chosen.

## Existing product audit

Current / redirects to /dashboard. /login and /register use Better Auth. Registration has name/email/password but no confirmation; no setup or settings routes exist. Financial accounts, categories, transactions, charts, budgets, goals and comparisons are implemented. The current identity uses the Lucide AudioLines mark, Finance Tracker wordmark, #1ed760 green, #101211 background, #191d1a panels, 16px corners, pill buttons, and a sidebar. Preserve the name and mark, routes and finance behaviour, database records, paise/INR rules, validation, ownership and Better Auth.

After selection: add a public homepage, password visibility/confirmation, skippable first-account setup for newly registered users, and protected name editing/settings. Existing users must retain direct dashboard access. Do not advertise SMS, imports, subscriptions, splits, bank integrations or any unimplemented functionality. New public links must resolve to real routes or section anchors. No fake social proof or security claims.

## Positioning and calibration

Audience: students and individuals tracking personal finances manually. Home explains the product and invites registration; login is a focused returning-user task. Laptop and handheld viewing, 16px minimum body text and 44px controls. Capacity: one headline, a concise explanation and two actions in the hero, followed by a real application preview and only implemented features. Mobile stacks content without shrinking the form.

### A — Greenroom

Mode: redesign-preserve, custom system derived from existing green/black identity. Modern product-tool school; Spotify is a tonal reference inherited from the brief, not a source of copied brand assets.

Dials: variance 4 (one large asymmetric hero); motion 2 (state feedback only); density 5 (compact product proof); assets 4 (actual dashboard image); fidelity 9 (same name, mark, green and dark surfaces).

Palette: #101211 ground; #191d1a panels; #f4f6f4 text; #1ed760 action/accent. Secondary text #adb9b0. Typography: Bahnschrift display, Segoe UI body, sans-serif fallbacks; 72–88px desktop hero, 40px mobile, 16px body. Space: 8/16/24/32/48/64/96. Radius: 16px product frames, 10px inputs, pill primary actions. Shadow: subtle black under product preview only. Motion: 150ms color/focus transitions, respect reduced motion. Homepage: bold left-led headline and real product screenshot. Login: split dark/green brand panel and a clear form.

### B — Ledger

Mode: visual overhaul with all product/technical contracts preserved. Editorial/humanist school; custom palette using the product's green family rather than a borrowed brand recipe.

Dials: variance 5 (editorial headline and horizontal rules); motion 2; density 4 (more breathing room); assets 4; fidelity 6 (same name/mark, warmer surfaces).

Palette: #f5f2e9 paper; #172e23 ink/action; #537461 secondary; #d7dcd0 rules. Typography: Georgia display/italic emphasis, Segoe UI body; 70–80px desktop hero, 42px mobile, 16px body. Space: 8/16/24/32/48/72/96. Radius: 6px controls, 12px product frame. Shadow: none. Motion: 150ms focus/color transitions. Homepage: quiet editorial composition, a forest-green product panel and ruled feature list. Login: centered form on warm paper with a compact wordmark and supporting side note on desktop.

## Assets and previews

`previews/assets/finance-tracker-mark.svg`: the app's existing AudioLines mark, exported from its installed Lucide component. `previews/assets/product-preview.png`: screenshot of the real dashboard using an isolated temporary sample account, explicitly labelled sample data. Temporary user and records are cleaned up. No real account data appears in previews.

Preview routes are on a separate loopback-only server at port 3109; they are not app routes. Static visual forms never send credentials. No new functionality is claimed complete at this choice stage.

## Acceptance plan after selection

Reuse Playwright + Edge. Exercise homepage→registration→setup→dashboard, skip/resume setup, existing-user login, logout, protected routes, name updates, field errors, password visibility and keyboard navigation. Capture/inspect 390×844 and 1440×900 plus tablet/small laptop where layout changes. Run both milestone regression scenarios, unit tests, lint, TypeScript and production build. Use only isolated QA users and remove their records afterward. Report actual outcomes and remaining limitations.

## Delivered Ledger system

Shared surfaces, Georgia headings, local system body fonts, forest-green controls and chart colors are implemented in src/app/globals.css and the existing components. The application uses #24563b for primary buttons and #172e23 for ink, within the approved forest-green family. Existing finance functionality and database schema remain intact. The refreshed public/product-preview.png is a real Ledger dashboard capture from an isolated sample user.

Browser acceptance evidence is in design/qa. Homepage/login, registration, setup, dashboard and settings screenshots were visually reviewed. Automated responsive checks cover 390×844, 768×1024, 1280×720 and 1440×900. The transaction table retains intentional internal horizontal scrolling on small screens; its hidden accessibility label is now contained so the document does not overflow.
