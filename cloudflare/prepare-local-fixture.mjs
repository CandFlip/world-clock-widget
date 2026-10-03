import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const now = new Date().toISOString();
const expires = new Date(Date.now() + 86400000).toISOString();
const quote = value => "'" + value.replaceAll("'", "''") + "'";
let sql = readFileSync('cloudflare/bootstrap.sql', 'utf8') + '\n';
for (const [id, email, token] of [
  ['qa-admin', 'uuuraaaaa@gmail.com', 'local-review-admin'],
  ['qa-user', 'qa@example.invalid', 'local-review-user'],
]) {
  const hash = createHash('sha256').update(token).digest('hex');
  sql += 'INSERT INTO users VALUES(' + [id, email, 'Local QA', '', now, now].map(quote).join(',') + ');\n';
  sql += 'INSERT INTO sessions VALUES(' + [hash, id, expires, now].map(quote).join(',') + ');\n';
}
writeFileSync('outputs/cloudflare-migration/local-fixture.sql', sql);
console.log('Local-only fixture ready.');
