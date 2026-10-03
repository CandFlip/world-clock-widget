import { readFileSync } from 'node:fs';
import { createDecipheriv } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Input arrives on stdin, never in process arguments or credential files.
let input = '';
if (process.stdin.isTTY) process.stdin.setRawMode(true);
console.log('Ready for encrypted import JSON on stdin (input is hidden).');
try {
  for await (const chunk of process.stdin) {
    input += chunk;
    if (/[\r\n]/.test(input)) break;
  }
} finally {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
}
const { key, bundlePath } = JSON.parse(input);
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
if (bundle.version !== 1) throw new Error('Unsupported encrypted bundle');
const bytes = Buffer.from(bundle.ciphertext, 'base64');
const decrypt = createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), Buffer.from(bundle.iv, 'base64'));
decrypt.setAuthTag(bytes.subarray(-16));
const values = JSON.parse(Buffer.concat([decrypt.update(bytes.subarray(0, -16)), decrypt.final()]).toString('utf8'));
const names = Object.keys(values);
if (names.some(name => !['BYBIT_API_KEY', 'BYBIT_API_SECRET'].includes(name)) ||
    names.length !== 2 || names.some(name => typeof values[name] !== 'string' || !values[name])) {
  throw new Error('Expected exactly two nonempty Bybit integration secrets');
}
const result = spawnSync(process.execPath,
  ['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk', '--config', 'dist/server/wrangler.json'],
  { input: JSON.stringify(values), encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
if (result.status !== 0) throw new Error('Cloudflare secret import failed; inspect the Cloudflare dashboard');
console.log('Both integration secrets imported into world-clock-next. No plaintext credentials saved.');
