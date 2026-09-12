import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';

import { IDEA_IDS as validOptions } from '@/lib/roadmap';

async function ensureTables() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS votes (
      visitor_id TEXT PRIMARY KEY,
      option_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_votes_option_id ON votes(option_id)'),
  ]);
}

async function totals(selected: string | null = null) {
  await ensureTables();
  const rows = await env.DB.prepare(
    'SELECT option_id, COUNT(*) AS count FROM votes GROUP BY option_id',
  ).all<{ option_id: string; count: number }>();
  const counts: Record<string, number> = {};
  for (const row of rows.results) {
    if (validOptions.has(row.option_id)) counts[row.option_id] = Number(row.count);
  }
  return Response.json({ counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0), selected });
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  let selected: string | null = null;
  if (user) {
    const row = await env.DB.prepare('SELECT option_id FROM votes WHERE visitor_id = ?').bind(user.id).first<{ option_id: string }>();
    selected = row?.option_id || null;
  }
  return totals(selected);
}

export async function POST(request: Request) {
  await ensureTables();
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: 'Sign in with Google to vote.' }, { status: 401 });
  const body = await request.json() as { optionId?: string };
  if (!body.optionId || !validOptions.has(body.optionId)) {
    return Response.json({ error: 'Invalid vote.' }, { status: 400 });
  }
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO votes (visitor_id, option_id, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(visitor_id) DO UPDATE SET option_id = excluded.option_id, updated_at = excluded.updated_at`)
    .bind(user.id, body.optionId, now, now)
    .run();
  return totals(body.optionId);
}
