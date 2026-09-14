declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FIREBASE_API_KEY: string;
    FIREBASE_AUTH_DOMAIN: string;
    FIREBASE_PROJECT_ID: string;
    FIREBASE_APP_ID: string;
    ADMIN_EMAIL: string;
    BYBIT_API_KEY?: string;
    BYBIT_API_SECRET?: string;
    BYBIT_API_BASE?: string;
    BYBIT_TARGET_ID?: string;
    BYBIT_UID?: string;
    BYBIT_USDT_TRC20_ADDRESS?: string;
  }
}
