import { getSessionUser } from '@/lib/auth';
import { env } from 'cloudflare:workers';
import { downloadStats } from '@/lib/download-analytics';

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user?.isAdmin) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  const config = await env.DB.prepare("SELECT value FROM site_settings WHERE key='download_version'").first<{value:string}>();
  const version = config?.value || 'v1.1.131';
  let github: Array<{ name: string; download_count: number }> | null = null;
  try {
    const response = await fetch(`https://api.github.com/repos/CandFlip/world-clock-widget/releases/tags/${encodeURIComponent(version)}`, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'WorldClockWidget-site' }, signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const release = await response.json() as { assets: Array<{name:string; download_count:number}> };
      github = release.assets.filter((asset) => /\.(exe|dmg)$/.test(asset.name)).map(({name,download_count}) => ({name,download_count}));
    }
  } catch { /* Report unavailable separately from zero. */ }
  return Response.json({ ...await downloadStats(), github, version }, { headers: { 'Cache-Control': 'no-store' } });
}
