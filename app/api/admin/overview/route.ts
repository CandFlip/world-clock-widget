import { env, waitUntil } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';
import { mergeSupportMethods, type SupportMethod } from '@/lib/support-methods';

import { publicIdeas, type Suggestion } from '@/lib/public-ideas';
import { syncBybitLedger } from '@/lib/bybit-ledger';

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  if (!user.isAdmin) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  waitUntil(syncBybitLedger().catch((error) => console.error('Bybit ledger sync failed', error)));
  const [users, suggestions, contributions, methods, settings] = await Promise.all([
    env.DB.prepare(`SELECT users.id,users.email,users.name,users.picture,users.first_seen,users.last_seen,votes.option_id vote,votes.updated_at voted_at FROM users LEFT JOIN votes ON votes.visitor_id=users.id ORDER BY users.last_seen DESC`).all(),
    env.DB.prepare(`SELECT suggestions.*,users.email,users.name FROM suggestions JOIN users ON users.id=suggestions.visitor_id ORDER BY suggestions.created_at DESC`).all(),
    env.DB.prepare(`SELECT contributions.*,users.email,users.name FROM contributions LEFT JOIN users ON users.id=contributions.visitor_id ORDER BY contributions.created_at DESC`).all(),
    env.DB.prepare('SELECT id,label,url,instructions,active FROM support_methods ORDER BY created_at').all<Omit<SupportMethod, 'image'>>(),
    env.DB.prepare('SELECT key,value FROM site_settings').all<{ key: string; value: string }>(),
  ]);
  const userRows = users.results as Array<Record<string, unknown>>;
  const contributionRows = contributions.results as Array<Record<string, unknown>>;
  const publicOptions = new Set(publicIdeas(settings.results.find((row) => row.key === 'roadmap_ideas')?.value, (suggestions.results as Suggestion[]).filter((item) => item.status === 'published')).map((idea) => idea.id));
  return Response.json({
    metrics: { registered: userRows.length, voters: userRows.filter((row) => typeof row.vote === 'string' && publicOptions.has(row.vote)).length, suggestions: suggestions.results.length, pendingContributions: contributionRows.filter((row) => row.status === 'pending' && row.provider !== 'legacy-manual').length },
    users: userRows, suggestions: suggestions.results, contributions: contributionRows,
    methods: mergeSupportMethods(methods.results.map((row) => ({ ...row, image: settings.results.find((setting) => setting.key === `support_method_image:${row.id}`)?.value || '' })), true),
    settings: Object.fromEntries(settings.results.filter((row) => !row.key.startsWith('support_method_image:')).map((row) => [row.key, row.value])),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
