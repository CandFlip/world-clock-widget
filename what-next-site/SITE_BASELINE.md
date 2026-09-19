# World Clock Site Baseline

Repository: https://github.com/CandFlip/world-clock-widget
Branch: codex/site-handoff
Live URL: https://world-clock-next.decent-rat-2368.chatgpt.site

Stack: TypeScript, React 19, vinext/Vite, Cloudflare Workers/D1, Firebase Auth, Drizzle ORM.
Deployment: OpenAI Sites project `appgprj_6a93513e73cc81919ae79c84f28dc030`; Cloudflare D1 binding `DB`.
Current publication: Sites version 19, source commit `13b584a9ccd2edcb242044cf31fe34b99fc14520`.

Current state:

- Windows download: `v1.1.106`, GitHub release `windows-v1.1.106`.
- The home page has a compact “Support the project and its author” row without a fundraising total or progress scale.
- “Why am I raising funds?” opens `/support`, which contains the hospital photos and a bilingual draft of the author's story.
- Voting, suggestions, authentication, payment methods, and the admin area are preserved.

Main frontend files: `app/page.tsx`, `app/support/page.tsx`, `app/layout.tsx`, `app/globals.css`.
Main backend/API files: `app/api/**/route.ts`, `lib/auth.ts`, `lib/roadmap.ts`, `lib/bybit-ledger.ts`, `db/schema.ts`.

Required env/secrets: `DB`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, `ADMIN_EMAIL`.
Optional Bybit integration: `BYBIT_API_KEY`, `BYBIT_API_SECRET`, `BYBIT_API_BASE`, `BYBIT_TARGET_ID`, `BYBIT_UID`, `BYBIT_USDT_TRC20_ADDRESS`.
