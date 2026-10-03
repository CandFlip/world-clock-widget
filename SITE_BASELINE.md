# Production website baseline — 2026-10-04

Production: https://world-clock-next.uuuraaaaa.workers.dev
Admin: https://world-clock-next.uuuraaaaa.workers.dev/admin
Hosting: user's Cloudflare account, Worker `world-clock-next`.
D1: `world-clock-next-db`, binding `DB`, ID `948bcf52-34d5-429d-af74-2c88f5f0cef6`.
Checkout: `site-cloudflare`, branch `codex/cloudflare-migration`.

The former ChatGPT Sites address redirects to this production origin (Sites v35).
Its database remains intact for rollback. The `.openai/hosting.json` in this
checkout is historical provenance, not the production deployment target.
Do not deploy this application to Sites by default.

Build: `node cloudflare/build.mjs`.
Deploy: `node node_modules/wrangler/bin/wrangler.js deploy --config dist/server/wrangler.json`.
Cloudflare secrets: FIREBASE_API_KEY, BYBIT_API_KEY, BYBIT_API_SECRET.
Never save their plaintext values in source or artifacts.
Google Firebase project remains world-clock-roadmap; the new production domain
is authorized. Existing users, settings, votes and contributions were migrated.
Old sessions were intentionally excluded; sign in with Google on the new origin.

The installed Windows widget v1.1.118 was not changed by this website migration.
