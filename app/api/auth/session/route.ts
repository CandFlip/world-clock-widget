import { createSession, publicUser, upsertUser, verifyFirebaseCredential } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { credential?: string };
    if (!body.credential || body.credential.length > 5000) {
      return Response.json({ error: 'Missing Google credential.' }, { status: 400 });
    }
    const profile = await verifyFirebaseCredential(body.credential);
    await upsertUser(profile);
    const session = await createSession(profile.id);
    const isAdmin = profile.email.toLowerCase() === 'uuuraaaaa@gmail.com';
    return Response.json(
      { user: publicUser({ ...profile, isAdmin }) },
      { headers: { 'Set-Cookie': session.cookie, 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google sign-in failed.';
    return Response.json({ error: message }, { status: 401 });
  }
}
