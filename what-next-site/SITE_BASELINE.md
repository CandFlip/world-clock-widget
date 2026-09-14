# World Clock Site Baseline

Repository: https://github.com/CandFlip/world-clock-widget
Branch: codex/site-handoff
Commit: 22e252eb981007ea90534db1f7ef3589bc214fd4
Site path: what-next-site/
Live URL: https://world-clock-next.decent-rat-2368.chatgpt.site

Stack: TypeScript, React 19, vinext/Vite, Cloudflare Workers/D1, Firebase Auth, Drizzle ORM.
Deployment: OpenAI Sites project `appgprj_6a93513e73cc81919ae79c84f28dc030`; Cloudflare D1 binding `DB`.
Local run/build: `npm ci`; `npm run dev`; `npm run build`.

Main frontend files: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/google-sign-in.tsx`.
Main backend/API files: `app/api/**/route.ts`, `lib/auth.ts`, `lib/roadmap.ts`, `lib/bybit-ledger.ts`, `db/schema.ts`.
Admin files: `app/admin/page.tsx`, `app/api/admin/overview/route.ts`, `app/api/admin/manage/route.ts`.

Data sources:

- app version/download URL: D1 `site_settings`; production route pins the published GitHub release `v1.1.78`.
- voting/ideas: static ideas in `lib/roadmap.ts`; D1 `votes` and `suggestions`.
- donations/payment data: D1 `contributions` and `support_methods`; optional Bybit read-only ledger sync.

Required env/secrets: `DB`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, `ADMIN_EMAIL`. Optional Bybit integration: `BYBIT_API_KEY`, `BYBIT_API_SECRET`, `BYBIT_API_BASE`, `BYBIT_TARGET_ID`, `BYBIT_UID`, `BYBIT_USDT_TRC20_ADDRESS`.

Known issues: None observed in the basic production smoke test. Authenticated vote/suggestion writes require a Firebase user and were not mutated during handoff; their live auth gates return `401` when signed out.
