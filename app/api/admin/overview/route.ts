import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  if (!user.isAdmin) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  const [users, suggestions, contributions, methods, settings] = await Promise.all([
    env.DB.prepare(`SELECT users.id,users.email,users.name,users.picture,users.first_seen,users.last_seen,votes.option_id vote,votes.updated_at voted_at FROM users LEFT JOIN votes ON votes.visitor_id=users.id ORDER BY users.last_seen DESC`).all(),
    env.DB.prepare(`SELECT suggestions.*,users.email,users.name FROM suggestions JOIN users ON users.id=suggestions.visitor_id ORDER BY suggestions.created_at DESC`).all(),
    env.DB.prepare(`SELECT contributions.*,users.email,users.name FROM contributions LEFT JOIN users ON users.id=contributions.visitor_id ORDER BY contributions.created_at DESC`).all(),
    env.DB.prepare('SELECT * FROM support_methods ORDER BY created_at').all(),
    env.DB.prepare('SELECT key,value FROM site_settings').all<{ key: string; value: string }>(),
  ]);
  const userRows = users.results as Array<Record<string, unknown>>;
  const contributionRows = contributions.results as Array<Record<string, unknown>>;
  return Response.json({
    metrics: { registered: userRows.length, voters: userRows.filter((row) => row.vote).length, suggestions: suggestions.results.length, pendingContributions: contributionRows.filter((row) => row.status === 'pending' && row.provider !== 'legacy-manual').length },
    users: userRows, suggestions: suggestions.results, contributions: contributionRows, methods: methods.results,
    settings: Object.fromEntries(settings.results.map((row) => [row.key, row.value])),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
