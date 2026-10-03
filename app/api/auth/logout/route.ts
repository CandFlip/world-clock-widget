import { deleteSession } from '@/lib/auth';
import { sameOriginRequest } from '@/lib/auth-input';

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  const cookie = await deleteSession(request);
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
}
