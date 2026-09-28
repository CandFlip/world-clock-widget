export function sessionInputError(request: Request, body: unknown) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return 'Invalid request origin.';
  if (!body || typeof body !== 'object' || !('credential' in body)) return 'Missing Google credential.';
  const credential = body.credential;
  if (typeof credential !== 'string' || !credential || credential.length > 5000) return 'Missing Google credential.';
  return null;
}
