declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FIREBASE_API_KEY: string;
    FIREBASE_AUTH_DOMAIN: string;
    FIREBASE_PROJECT_ID: string;
    FIREBASE_APP_ID: string;
    ADMIN_EMAIL: string;
  }
}
