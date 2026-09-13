import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user?.isAdmin) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  const body = await request.json() as Record<string, unknown>, now = new Date().toISOString();
  if (body.kind === 'suggestion' && typeof body.id === 'string' && ['pending','published','declined'].includes(String(body.status))) {
    await env.DB.prepare('UPDATE suggestions SET status=?,updated_at=? WHERE id=?').bind(body.status, now, body.id).run();
  } else if (body.kind === 'settings') {
    const allowed = ['author_goal_cents','author_story_ru','author_story_en','download_url','download_version'];
    const values = body.values && typeof body.values === 'object' ? body.values as Record<string,string> : {};
    const entries = Object.entries(values).filter(([key]) => allowed.includes(key));
    if (entries.length) await env.DB.batch(entries.map(([key,value]) => env.DB.prepare('INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key,String(value).slice(0,3000),now)));
  } else if (body.kind === 'method') {
    const id=typeof body.id==='string'&&body.id?body.id:crypto.randomUUID();
    await env.DB.prepare('INSERT INTO support_methods(id,label,url,instructions,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,url=excluded.url,instructions=excluded.instructions,active=excluded.active,updated_at=excluded.updated_at')
      .bind(id,String(body.label||'').slice(0,80),String(body.url||'').slice(0,1000),String(body.instructions||'').slice(0,1000),body.active===false?'0':'1',now,now).run();
  } else if (body.kind === 'manual-contribution') {
    const amount = Number(String(body.amount).replace(',', '.'));
    const target = body.target === 'author' ? 'author' : 'mobile-official';
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) return Response.json({ error: 'Invalid amount.' }, { status: 400 });
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO contributions(id,visitor_id,target_id,amount_cents,currency,reference,status,provider,provider_event_id,verified_at,created_at,updated_at) VALUES(?,NULL,?,?,?,?,'confirmed','admin-manual',?,?,?,?,?)")
      .bind(id,target,String(Math.round(amount*100)),'USD',String(body.reference||'Ручная запись').slice(0,300),id,now,now,now).run();
  } else return Response.json({ error: 'Invalid operation.' }, { status: 400 });
  return Response.json({ ok: true });
}
