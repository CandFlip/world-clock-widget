import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const body = await request.json() as { title?: string; problem?: string; outcome?: string };
  const title = String(body.title || '').trim(), problem = String(body.problem || '').trim(), outcome = String(body.outcome || '').trim();
  if (title.length < 3 || title.length > 100 || problem.length < 10 || problem.length > 800 || outcome.length > 800) return Response.json({ error: 'Check the fields.' }, { status: 400 });
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO suggestions(id,visitor_id,title,problem,outcome,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), user.id, title, problem, outcome, 'pending', now, now).run();
  return Response.json({ ok: true });
}
