import { createSession, isAdminEmail, publicUser, upsertUser, verifyFirebaseCredential } from '@/lib/auth';
import { sessionInputError } from '@/lib/auth-input';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { credential?: string };
    const inputError = sessionInputError(request, body);
    if (inputError) return Response.json({ error: inputError }, { status: 400 });
    const profile = await verifyFirebaseCredential(body.credential!);
    await upsertUser(profile);
    const session = await createSession(profile.id);
    const isAdmin = isAdminEmail(profile.email);
    return Response.json(
      { user: publicUser({ ...profile, isAdmin }) },
      { headers: { 'Set-Cookie': session.cookie, 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: 'Google sign-in failed.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
}
