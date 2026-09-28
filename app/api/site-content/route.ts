import { env } from 'cloudflare:workers';

export async function GET() {
  const rows = await env.DB.prepare("SELECT key,value FROM site_settings WHERE key IN ('author_story_ru','author_story_en','story_title_ru','story_title_en','story_note_ru','story_note_en')").all<{ key: string; value: string }>();
  return Response.json(Object.fromEntries(rows.results.map((row) => [row.key, row.value])), { headers: { 'Cache-Control': 'no-store' } });
}
