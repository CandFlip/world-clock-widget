import { env } from 'cloudflare:workers';

export async function downloadStats() {
  const [totals, regions, days, first] = await Promise.all([
    env.DB.prepare('SELECT platform,SUM(clicks) clicks FROM download_daily GROUP BY platform').all(),
    env.DB.prepare('SELECT country,region,platform,SUM(clicks) clicks FROM download_daily GROUP BY country,region,platform ORDER BY clicks DESC LIMIT 100').all(),
    env.DB.prepare("SELECT day,platform,SUM(clicks) clicks FROM download_daily WHERE day >= date('now','-29 days') GROUP BY day,platform ORDER BY day DESC").all(),
    env.DB.prepare("SELECT value FROM site_settings WHERE key='download_tracking_started'").first<{value:string}>(),
  ]);
  return { totals: totals.results, regions: regions.results, days: days.results, started: first?.value || null };
}
