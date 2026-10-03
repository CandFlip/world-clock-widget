export function sessionInputError(request: Request, body: unknown) {
  if (!sameOriginRequest(request)) return 'Invalid request origin.';
  if (!body || typeof body !== 'object' || !('credential' in body)) return 'Missing Google credential.';
  const credential = body.credential;
  if (typeof credential !== 'string' || !credential || credential.length > 5000) return 'Missing Google credential.';
  return null;
}

export function sameOriginRequest(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}
