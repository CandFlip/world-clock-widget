import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';
import { publicIdeas, type Suggestion } from '@/lib/public-ideas';
import { mergeSupportMethods, type SupportMethod } from '@/lib/support-methods';

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  const [votes, funding, settings, methods, suggestions, ownSuggestions] = await Promise.all([
    env.DB.prepare('SELECT option_id, COUNT(*) count FROM votes GROUP BY option_id').all<{ option_id: string; count: number }>(),
    env.DB.prepare("SELECT target_id, SUM(CAST(amount_cents AS INTEGER)) amount FROM contributions WHERE status='confirmed' AND provider_event_id IS NOT NULL GROUP BY target_id").all<{ target_id: string; amount: number }>(),
    env.DB.prepare('SELECT key, value FROM site_settings').all<{ key: string; value: string }>(),
    env.DB.prepare('SELECT id,label,url,instructions,active FROM support_methods ORDER BY created_at').all<Omit<SupportMethod, 'image'>>(),
    env.DB.prepare("SELECT id,title,problem,outcome,created_at FROM suggestions WHERE status='published' ORDER BY created_at DESC").all(),
    user ? env.DB.prepare("SELECT id,title,status FROM suggestions WHERE visitor_id=? AND status!='published' ORDER BY created_at DESC LIMIT 20").bind(user.id).all() : Promise.resolve({results: []}),
  ]);
  const config = Object.fromEntries(settings.results.filter((row) => !row.key.startsWith('support_method_image:')).map((row) => [row.key, row.value]));
  const ideas = publicIdeas(config.roadmap_ideas, suggestions.results as Suggestion[]);
  const counts = Object.fromEntries(ideas.map((idea) => [idea.id, 0]));
  for (const row of votes.results) if (row.option_id in counts) counts[row.option_id] = Number(row.count);
  const funded: Record<string, number> = {};
  for (const row of funding.results) funded[row.target_id] = Number(row.amount || 0);
  const selected = user ? await env.DB.prepare('SELECT option_id FROM votes WHERE visitor_id=?').bind(user.id).first<{ option_id: string }>() : null;
  const supportMethods = mergeSupportMethods(methods.results.map((row) => ({ ...row, image: settings.results.find((setting) => setting.key === `support_method_image:${row.id}`)?.value || '' })));
  return Response.json({ ideas, counts, funded, selected: ideas.some((idea) => idea.id === selected?.option_id) ? selected!.option_id : null, settings: config, methods: supportMethods, suggestions: suggestions.results, ownSuggestions: ownSuggestions.results }, { headers: { 'Cache-Control': 'no-store' } });
}
