import { env } from 'cloudflare:workers';

type BybitRow = { id?: string; txID?: string; coin?: string; amount?: string; status?: number; successAt?: string; createdTime?: string };
type BybitResponse = { retCode: number; retMsg: string; result?: { rows?: BybitRow[]; nextPageCursor?: string } };

const textEncoder = new TextEncoder();

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function requestBybit(path: string, cursor = '') {
  const timestamp = String(Date.now()), recvWindow = '5000';
  const query = new URLSearchParams({ limit: '50' });
  if (cursor) query.set('cursor', cursor);
  const queryString = query.toString();
  const signature = await hmacHex(env.BYBIT_API_SECRET!, `${timestamp}${env.BYBIT_API_KEY!}${recvWindow}${queryString}`);
  const response = await fetch(`${env.BYBIT_API_BASE || 'https://api.bybit.com'}${path}?${queryString}`, {
    headers: { 'X-BAPI-API-KEY': env.BYBIT_API_KEY!, 'X-BAPI-SIGN': signature, 'X-BAPI-TIMESTAMP': timestamp, 'X-BAPI-RECV-WINDOW': recvWindow },
  });
  if (!response.ok) throw new Error(`Bybit HTTP ${response.status}`);
  const body = await response.json() as BybitResponse;
  if (body.retCode !== 0) throw new Error(`Bybit ${body.retCode}: ${body.retMsg}`);
  return body.result || {};
}

async function readPages(path: string) {
  const rows: BybitRow[] = [];
  let cursor = '';
  for (let page = 0; page < 5; page += 1) {
    const result = await requestBybit(path, cursor);
    rows.push(...(result.rows || []));
    if (!result.nextPageCursor || result.nextPageCursor === cursor) break;
    cursor = result.nextPageCursor;
  }
  return rows;
}

function usdCents(row: BybitRow) {
  if (!['USDT', 'USDC'].includes(String(row.coin || '').toUpperCase())) return null;
  const amount = Number(row.amount);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

export async function syncBybitLedger(force = false) {
  if (!env.BYBIT_API_KEY || !env.BYBIT_API_SECRET) return { enabled: false, imported: 0 };
  const syncState = await env.DB.prepare("SELECT value FROM site_settings WHERE key='bybit_sync_at'").first<{ value: string }>();
  if (!force && syncState && Date.now() - Number(syncState.value) < 60_000) return { enabled: true, imported: 0 };
  const [onchain, internal] = await Promise.all([
    readPages('/v5/asset/deposit/query-record'),
    readPages('/v5/asset/deposit/query-internal-record'),
  ]);
  const now = new Date().toISOString();
  const statements = [];
  let imported = 0;
  for (const [kind, rows] of [['onchain', onchain], ['internal', internal]] as const) {
    for (const row of rows) {
      const cents = usdCents(row), eventId = row.id || row.txID;
      if (!cents || !eventId) continue;
      const successful = kind === 'onchain' ? [3, 70012, 10012].includes(Number(row.status)) : Number(row.status) === 2;
      const providerEventId = `${kind}:${eventId}`;
      if (successful) {
        imported += 1;
        statements.push(env.DB.prepare("INSERT INTO contributions(id,visitor_id,target_id,amount_cents,currency,reference,status,provider,provider_event_id,verified_at,created_at,updated_at) VALUES(?,NULL,?,?,?,?,?,'bybit',?,?,?,?) ON CONFLICT(provider,provider_event_id) DO UPDATE SET amount_cents=excluded.amount_cents,status='confirmed',verified_at=excluded.verified_at,updated_at=excluded.updated_at")
          .bind(crypto.randomUUID(), env.BYBIT_TARGET_ID || 'author', String(cents), 'USD', `${row.coin} · ${kind}`, 'confirmed', providerEventId, now, now, now));
      } else if (kind === 'onchain' && [7, 70011, 70013].includes(Number(row.status))) {
        statements.push(env.DB.prepare("UPDATE contributions SET status='reversed',updated_at=? WHERE provider='bybit' AND provider_event_id=?").bind(now, providerEventId));
      }
    }
  }
  statements.push(env.DB.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES('bybit_sync_at',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(String(Date.now()), now));
  for (let start = 0; start < statements.length; start += 75) await env.DB.batch(statements.slice(start, start + 75));
  return { enabled: true, imported };
}
