import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';

const limits = { context: 80, placement: 80, alertStyle: 80, typicalDuration: 80, notes: 600 } as const;

async function ensureTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS timer_feedback (
    visitor_id TEXT PRIMARY KEY,
    context TEXT NOT NULL,
    placement TEXT NOT NULL,
    alert_style TEXT NOT NULL,
    typical_duration TEXT NOT NULL,
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
}

export async function POST(request: Request) {
  await ensureTable();
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: 'Sign in with Google to send feedback.' }, { status: 401 });
  const body = await request.json() as Record<keyof typeof limits, unknown>;
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof body[key as keyof typeof limits] !== 'string' || (body[key as keyof typeof limits] as string).length > limit) {
      return Response.json({ error: 'Invalid feedback.' }, { status: 400 });
    }
  }
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO timer_feedback
    (visitor_id, context, placement, alert_style, typical_duration, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(visitor_id) DO UPDATE SET
      context = excluded.context,
      placement = excluded.placement,
      alert_style = excluded.alert_style,
      typical_duration = excluded.typical_duration,
      notes = excluded.notes,
      updated_at = excluded.updated_at`)
    .bind(user.id, body.context, body.placement, body.alertStyle, body.typicalDuration, body.notes, now, now)
    .run();
  return Response.json({ ok: true });
}
