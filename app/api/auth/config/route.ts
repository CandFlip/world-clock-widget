import { env } from 'cloudflare:workers';

export async function GET() {
  const config = {
    apiKey: env.FIREBASE_API_KEY || '',
    authDomain: env.FIREBASE_AUTH_DOMAIN || '',
    projectId: env.FIREBASE_PROJECT_ID || '',
    appId: env.FIREBASE_APP_ID || '',
  };
  return Response.json(Object.values(config).every(Boolean) ? config : null, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
