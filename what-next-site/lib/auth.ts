import { env } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const SESSION_COOKIE = 'wc_session';
const SESSION_DAYS = 30;
const firebaseJwks = createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
));

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  picture: string;
  isAdmin: boolean;
};

export async function ensureAuthTables() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      picture TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)'),
  ]);
}

function adminEmail() {
  return (env.ADMIN_EMAIL || 'uuuraaaaa@gmail.com').toLowerCase();
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyFirebaseCredential(credential: string) {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Google sign-in is not configured.');
  const { payload } = await jwtVerify(credential, firebaseJwks, {
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });
  if (!payload.sub || typeof payload.email !== 'string' || payload.email_verified !== true) {
    throw new Error('Google account email is not verified.');
  }
  const name = typeof payload.name === 'string' ? payload.name : payload.email;
  const picture = typeof payload.picture === 'string' ? payload.picture : '';
  return {
    id: payload.sub,
    email: payload.email,
    name,
    picture,
  };
}

export async function upsertUser(profile: { id: string; email: string; name: string; picture: string }) {
  await ensureAuthTables();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO users (id, email, name, picture, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      picture = excluded.picture,
      last_seen = excluded.last_seen`)
    .bind(profile.id, profile.email, profile.name, profile.picture, now, now)
    .run();
}

export async function createSession(userId: string) {
  await ensureAuthTables();
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, userId, expires.toISOString(), now.toISOString())
    .run();
  return {
    token,
    cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`,
  };
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  await ensureAuthTables();
  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(`SELECT users.id, users.email, users.name, users.picture
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
    .bind(tokenHash, new Date().toISOString())
    .first<{ id: string; email: string; name: string; picture: string }>();
  if (!row) return null;
  return { ...row, isAdmin: row.email.toLowerCase() === adminEmail() };
}

export async function deleteSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    await ensureAuthTables();
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
  }
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function publicUser(user: SessionUser) {
  return { id: user.id, email: user.email, name: user.name, picture: user.picture, isAdmin: user.isAdmin };
}
