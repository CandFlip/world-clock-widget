import { env } from 'cloudflare:workers';
import { sameOriginRequest } from '@/lib/auth-input';

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  let body: { platform?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid input.' }, { status: 400 }); }
  if (!body || typeof body.platform !== 'string' || !['windows', 'mac'].includes(body.platform)) return Response.json({ error: 'Invalid platform.' }, { status: 400 });
  // Store coarse aggregates only, never IP addresses, accounts or visitor IDs.
  const cf = (request as Request & { cf?: { country?: string; region?: string } }).cf;
  const country = cf?.country?.slice(0, 2) || 'Unknown';
  const region = cf?.region?.slice(0, 100) || '';
  await env.DB.prepare(`INSERT INTO download_daily(day,platform,country,region,clicks) VALUES(?,?,?,?,1)
    ON CONFLICT(day,platform,country,region) DO UPDATE SET clicks=clicks+1`)
    .bind(new Date().toISOString().slice(0, 10), body.platform, country, region).run();
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
