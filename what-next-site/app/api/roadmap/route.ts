import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';
import { IDEAS } from '@/lib/roadmap';
import { syncBybitLedger } from '@/lib/bybit-ledger';

const FALLBACK_VERSION = 'v1.1.82';

const FALLBACK_DOWNLOAD =
  'https://github.com/CandFlip/world-clock-widget/releases/download/windows-v1.1.82/WorldClockWidget-Setup-v1.1.82.exe';

export async function GET(request: Request) {
  await syncBybitLedger().catch((error) =>
    console.error('Bybit ledger sync failed', error),
  );

  const user = await getSessionUser(request);

  const [votes, funding, settings, methods, suggestions] =
    await Promise.all([
      env.DB
        .prepare(
          'SELECT option_id, COUNT(*) count FROM votes GROUP BY option_id',
        )
        .all<{ option_id: string; count: number }>(),

      env.DB
        .prepare(
          "SELECT target_id, SUM(CAST(amount_cents AS INTEGER)) amount FROM contributions WHERE status='confirmed' AND provider_event_id IS NOT NULL GROUP BY target_id",
        )
        .all<{ target_id: string; amount: number }>(),

      env.DB
        .prepare('SELECT key, value FROM site_settings')
        .all<{ key: string; value: string }>(),

      env.DB
        .prepare(
          "SELECT id,label,url,instructions FROM support_methods WHERE active='1' ORDER BY created_at",
        )
        .all(),

      env.DB
        .prepare(
          "SELECT id,title,problem,outcome,created_at FROM suggestions WHERE status='published' ORDER BY created_at DESC LIMIT 20",
        )
        .all(),
    ]);

  const counts = Object.fromEntries(
    IDEAS.map((idea) => [idea.id, 0]),
  );

  for (const row of votes.results) {
    if (row.option_id in counts) {
      counts[row.option_id] = Number(row.count);
    }
  }

  const funded: Record<string, number> = {};

  for (const row of funding.results) {
    funded[row.target_id] = Number(row.amount || 0);
  }

  const config = Object.fromEntries(
    settings.results.map((row) => [row.key, row.value]),
  );

  if (!config.download_version) {
    config.download_version = FALLBACK_VERSION;
  }

  if (!config.download_url) {
    config.download_url = FALLBACK_DOWNLOAD;
  }

  const selected = user
    ? await env.DB
        .prepare(
          'SELECT option_id FROM votes WHERE visitor_id=?',
        )
        .bind(user.id)
        .first<{ option_id: string }>()
    : null;

  const supportMethods = [
    ...methods.results,
  ] as Array<{
    id: string;
    label: string;
    url: string;
    instructions: string;
  }>;

  if (env.BYBIT_USDT_TRC20_ADDRESS) {
    supportMethods.unshift({
      id: 'bybit-usdt-trc20',
      label: 'USDT · TRC20',
      url: '',
      instructions: env.BYBIT_USDT_TRC20_ADDRESS,
    });
  }

  if (env.BYBIT_UID) {
    supportMethods.unshift({
      id: 'bybit-internal',
      label: 'Bybit · UID',
      url: '',
      instructions: env.BYBIT_UID,
    });
  }

  return Response.json(
    {
      ideas: IDEAS,
      counts,
      funded,
      selected: selected?.option_id || null,
      settings: config,
      methods: supportMethods,
      suggestions: suggestions.results,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
