# Web project context

Scope: this website, not the installed World Clock Widget. Root release rules apply when changing the widget itself. Do not deploy without the user's production-deployment authorization.

- Stack: React 19 + TypeScript, Vinext/Vite, Cloudflare Workers/D1, Drizzle, Firebase browser auth, jose server token verification, Tailwind 4. Confirm current versions from package.json when changing dependencies.
- Entry points: `app/page.tsx`, `app/admin/page.tsx`, `components/google-sign-in.tsx`, `lib/auth.ts`, `app/api/auth/`, `app/api/admin/`, `lib/bybit-ledger.ts`.
- UI source: existing `components/ui` wrappers on MIT Base UI. Switch already exists in `components/ui/switch.tsx`: import and adapt that wrapper. Keep current tokens, spacing and typography. Do not add React Aria or rebuild pointer/keyboard mechanics for an existing component.
- Checks from this directory: `node node_modules/typescript/bin/tsc --noEmit --incremental false`; `npm run lint`; `npm run build`. Build uses local generated output. `npm run dev` / `npm run start` are local servers. Inspect bindings first; never use production D1 for tests. `db:generate` changes files and is not verification.
- Tiny UI edits: targeted type/syntax and keyboard/focus/visual check. Normal changes: affected tests, typecheck/lint/build. Auth/API/dependencies: token/permission/Origin/input boundary tests and vulnerability triage. Existing test suite was absent at baseline; add focused tests when behavior requires them.
- Baseline 2026-09-23: typecheck and lint already fail; dependency audit has high findings. Do not mark these gates passed or suppress errors just to achieve green output.
- Avoid production GET smoke on `/api/roadmap`: it triggers Bybit synchronization and DB writes, including a stale download-config reset. The main page fetches it too.
- Preserve pre-existing uncommitted changes. Never put API credentials in this repository, generated assets, frontend env, or logs.
