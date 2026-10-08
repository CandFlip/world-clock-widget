2026-10-08: Production Worker version b4def2d2-b06d-4df0-9268-dab48adfe634 serves GitHub release v1.1.136 links for Windows and macOS. D1 download_version and download_url both point to v1.1.136. Typecheck and Cloudflare build passed; production homepage returns HTTP 200 with both v1.1.136 links and no old Windows link. Both release assets return HTTP 200. The previous v1.1.135 settings can be restored for rollback.

2026-10-07: Production Worker version 4ea5751c-e82e-49fe-b990-92f828c08ad9 serves GitHub release v1.1.135 links for Windows and macOS. D1 download_version and download_url both point to v1.1.135. Typecheck and Cloudflare build passed; production homepage contains both v1.1.135 links and the release link, and both assets return HTTP 200. The previous v1.1.134 settings can be restored for rollback. Existing repository-wide lint findings remain.

2026-10-07: Production Worker version 79f79532-1d0b-465a-a75e-e25c9111fa79 serves GitHub release v1.1.134 links for Windows and macOS. D1 download_version and download_url both point to v1.1.134. Typecheck and Cloudflare build passed; production homepage contains both v1.1.134 links and the release link, all returning HTTP 200. The previous v1.1.131 settings can be restored for rollback. Existing repository-wide lint findings remain.

2026-10-07: Production Worker version e1a2f648-ac31-4c3d-a90f-67d0b64a0d4f serves GitHub release v1.1.131 links for Windows and macOS. D1 download_version and download_url both point to v1.1.131. Typecheck and Cloudflare build passed; deployment succeeded. Both GitHub assets returned HTTP 200. Existing repository-wide lint findings remain.

2026-10-07: Production Worker version 65ec1a4f-2e1a-4375-8c30-f89cfcb879a1 served GitHub release v1.1.130 links for Windows and macOS. D1 download_version and download_url both pointed to v1.1.130. Typecheck and Cloudflare build passed; deployment succeeded. Existing repository-wide lint findings remained.

2026-10-07: Production Worker version 536e5209-e82b-41d0-8b02-fb878a21e957 serves GitHub release v1.1.129 links for Windows and macOS. D1 download_version and download_url both point to v1.1.129. Typecheck and Cloudflare build passed; deployment succeeded. Existing repository-wide lint findings remain.

# Production website baseline — 2026-10-06

2026-10-06: Production Worker version 4742dd68-6d33-4485-ac5e-126ba5697c4e serves GitHub release v1.1.128 links for Windows and macOS. D1 site_settings download_version and download_url were updated to v1.1.128. Typecheck and Cloudflare build passed; production homepage returned HTTP 200 with both links. The Cloudflare OAuth login was refreshed with Workers Script and D1 write scopes.

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
