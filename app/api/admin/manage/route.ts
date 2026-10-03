import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';
import { sameOriginRequest } from '@/lib/auth-input';
import { defaultSupportMethods } from '@/lib/support-methods';
import { parseIdeas } from '@/lib/roadmap';
import { strings } from '@/lib/site-strings';

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user?.isAdmin) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  if (!sameOriginRequest(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  let body: Record<string,unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid input.' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Invalid input.' }, { status: 400 });
  const now = new Date().toISOString();
  if (body.kind === 'suggestion' && typeof body.id === 'string' && ['pending','published','declined'].includes(String(body.status))) {
    await env.DB.prepare('UPDATE suggestions SET status=?,updated_at=? WHERE id=?').bind(body.status, now, body.id).run();
  } else if (body.kind === 'suggestion-delete' && typeof body.id === 'string') {
    await env.DB.prepare("UPDATE suggestions SET status='declined',updated_at=? WHERE id=?").bind(now,body.id).run();
  } else if (body.kind === 'settings') {
    const allowed = ['author_goal_cents','author_story_ru','author_story_en','story_title_ru','story_title_en','story_note_ru','story_note_en','download_url','download_version','roadmap_ideas','ui_copy_ru','ui_copy_en'];
    const values = body.values && typeof body.values === 'object' ? body.values as Record<string,unknown> : {};
    const entries = Object.entries(values).filter(([key]) => allowed.includes(key));
    if (entries.some(([,value]) => typeof value !== 'string')) return Response.json({ error: 'Неверные значения настроек.' }, { status: 400 });
    for (const key of ['download_url']) {
      const value = values[key];
      if (typeof value === 'string' && value && !/^https:\/\//i.test(value)) return Response.json({ error: 'Ссылки должны начинаться с https://.' }, { status: 400 });
    }
    for (const locale of ['ru','en'] as const) {
      const raw = values[`ui_copy_${locale}`];
      if (raw === undefined) continue;
      if (typeof raw !== 'string' || raw.length > 12000) return Response.json({ error: 'Слишком длинный текст интерфейса.' }, { status: 400 });
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return Response.json({ error: 'Неверный формат текста интерфейса.' }, { status: 400 }); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.entries(parsed).some(([key,value]) => !(key in strings[locale]) || typeof value !== 'string' || value.length > 1000)) return Response.json({ error: 'Проверьте тексты интерфейса.' }, { status: 400 });
    }
    const rawIdeas = values.roadmap_ideas;
    if (rawIdeas !== undefined) {
      if (typeof rawIdeas !== 'string' || rawIdeas.length > 30000) return Response.json({ error: 'Слишком длинный список планов.' }, { status: 400 });
      let parsed: unknown;
      try { parsed = JSON.parse(rawIdeas); } catch { return Response.json({ error: 'Неверный формат планов.' }, { status: 400 }); }
      const ideas = parseIdeas(rawIdeas);
      if (!Array.isArray(parsed) || ideas.length !== parsed.length || ideas.length > 30 || new Set(ideas.map((item) => item.id)).size !== ideas.length || ideas.some((item) => !/^[a-z0-9-]{3,64}$/.test(item.id) || (!item.title.ru.trim() && !item.title.en.trim()) || !['idea','funding','planned','building','done','hidden'].includes(item.status) || [item.title.ru,item.title.en].some((text) => text.length > 100) || [item.description.ru,item.description.en].some((text) => text.length > 1600) || !Number.isSafeInteger(item.goalCents) || item.goalCents < 0 || item.goalCents > 100000000)) return Response.json({ error: 'Проверьте карточки планов.' }, { status: 400 });
    }
    if (entries.length) await env.DB.batch(entries.map(([key,value]) => env.DB.prepare('INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key,(value as string).slice(0,key === 'roadmap_ideas' ? 30000 : key.startsWith('ui_copy_') ? 12000 : 3000),now)));
  } else if (body.kind === 'method') {
    const id=typeof body.id==='string'&&body.id?body.id:crypto.randomUUID();
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const image = typeof body.image === 'string' ? body.image : '';
    if (!label || label.length > 80 || instructions.length > 1000 || (url && (!/^https:\/\//i.test(url) || url.length > 1000)) ||
      (image && (!/^data:image\/(png|jpeg|webp|gif);base64,[a-z\d+/=]+$/i.test(image) || image.length > 700000))) {
      return Response.json({ error: 'Проверьте название, ссылку и изображение (до 500 КБ).' }, { status: 400 });
    }
    const imageKey = `support_method_image:${id}`;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO support_methods(id,label,url,instructions,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,url=excluded.url,instructions=excluded.instructions,active=excluded.active,updated_at=excluded.updated_at')
        .bind(id,label,url,instructions,body.active===false?'0':'1',now,now),
      image ? env.DB.prepare('INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(imageKey,image,now)
        : env.DB.prepare('DELETE FROM site_settings WHERE key=?').bind(imageKey),
    ]);
  } else if (body.kind === 'method-delete' && typeof body.id === 'string') {
    const imageKey = `support_method_image:${body.id}`;
    if (defaultSupportMethods().some((method) => method.id === body.id)) {
      const previous = defaultSupportMethods().find((method) => method.id === body.id)!;
      await env.DB.batch([
        env.DB.prepare('INSERT INTO support_methods(id,label,url,instructions,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET active=excluded.active,updated_at=excluded.updated_at')
          .bind(previous.id,previous.label,previous.url,previous.instructions,'-1',now,now),
        env.DB.prepare('DELETE FROM site_settings WHERE key=?').bind(imageKey),
      ]);
    } else await env.DB.batch([
      env.DB.prepare('DELETE FROM support_methods WHERE id=?').bind(body.id),
      env.DB.prepare('DELETE FROM site_settings WHERE key=?').bind(imageKey),
    ]);
  } else if (body.kind === 'manual-contribution') {
    const amount = Number(String(body.amount).replace(',', '.'));
    const ideasRow = await env.DB.prepare("SELECT value FROM site_settings WHERE key='roadmap_ideas'").first<{value:string}>();
    const target = typeof body.target === 'string' ? body.target : 'author';
    if (target !== 'author' && !parseIdeas(ideasRow?.value).some((idea) => idea.id === target && idea.goalCents > 0)) return Response.json({ error: 'Invalid target.' }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) return Response.json({ error: 'Invalid amount.' }, { status: 400 });
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO contributions(id,visitor_id,target_id,amount_cents,currency,reference,status,provider,provider_event_id,verified_at,created_at,updated_at) VALUES(?,NULL,?,?,?,?,'confirmed','admin-manual',?,?,?,?,?)")
      .bind(id,target,String(Math.round(amount*100)),'USD',(typeof body.reference === 'string' && body.reference ? body.reference : 'Ручная запись').slice(0,300),id,now,now,now).run();
  } else if (body.kind === 'manual-contribution-delete' && typeof body.id === 'string') {
    await env.DB.prepare("DELETE FROM contributions WHERE id=? AND provider='admin-manual'").bind(body.id).run();
  } else return Response.json({ error: 'Invalid operation.' }, { status: 400 });
  return Response.json({ ok: true });
}
