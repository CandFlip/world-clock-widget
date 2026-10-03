import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const bin = resolve('node_modules/vinext/dist/cli.js');
const result = spawnSync(process.execPath, [bin, 'build'], {
  stdio: 'inherit', env: { ...process.env, WC_HOSTING: 'cloudflare',
    PUBLIC_SITE_URL: 'https://world-clock-next.uuuraaaaa.workers.dev' },
});
process.exit(result.status ?? 1);
