import { env } from 'cloudflare:workers';
import { ensureAuthTables, getSessionUser } from '@/lib/auth';

async function ensureProductTables() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS votes (
      visitor_id TEXT PRIMARY KEY, option_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS timer_feedback (
      visitor_id TEXT PRIMARY KEY, context TEXT NOT NULL, placement TEXT NOT NULL,
      alert_style TEXT NOT NULL, typical_duration TEXT NOT NULL, notes TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
  ]);
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  if (!user.isAdmin) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  await ensureAuthTables();
  await ensureProductTables();
  const rows = await env.DB.prepare(`SELECT
      users.id, users.email, users.name, users.picture, users.first_seen, users.last_seen,
      votes.option_id AS vote, votes.updated_at AS voted_at,
      timer_feedback.context, timer_feedback.placement, timer_feedback.alert_style,
      timer_feedback.typical_duration, timer_feedback.notes
    FROM users
    LEFT JOIN votes ON votes.visitor_id = users.id
    LEFT JOIN timer_feedback ON timer_feedback.visitor_id = users.id
    ORDER BY users.last_seen DESC`).all();
  const users = rows.results;
  const metrics = {
    registered: users.length,
    voters: users.filter((row) => Boolean(row.vote)).length,
    timerResponses: users.filter((row) => Boolean(row.context)).length,
  };
  return Response.json({ metrics, users }, { headers: { 'Cache-Control': 'no-store' } });
}
