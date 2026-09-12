import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';
import { IDEA_IDS } from '@/lib/roadmap';

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const body = await request.json() as { targetId?: string; amount?: number; currency?: string; reference?: string };
  const target = String(body.targetId || ''), amount = Math.round(Number(body.amount) * 100), currency = String(body.currency || 'USD').toUpperCase(), reference = String(body.reference || '').trim();
  if (target !== 'author' && !IDEA_IDS.has(target)) return Response.json({ error: 'Unknown target.' }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 100 || amount > 100000000 || !/^[A-Z]{3,5}$/.test(currency) || reference.length > 300) return Response.json({ error: 'Check the contribution.' }, { status: 400 });
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO contributions(id,visitor_id,target_id,amount_cents,currency,reference,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), user.id, target, String(amount), currency, reference, 'pending', now, now).run();
  return Response.json({ ok: true });
}
