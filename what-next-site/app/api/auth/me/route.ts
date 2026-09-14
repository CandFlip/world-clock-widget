import { getSessionUser, publicUser } from '@/lib/auth';

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  return Response.json({ user: user ? publicUser(user) : null }, { headers: { 'Cache-Control': 'no-store' } });
}
