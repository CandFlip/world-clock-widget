'use client';

import { useEffect, useRef, useState } from 'react';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

export type GoogleUser = { id: string; email: string; name: string; picture: string; isAdmin: boolean };
const appName = 'world-clock-site';

function signInError(reason: unknown, lang: 'ru' | 'en') {
  const code = typeof reason === 'object' && reason !== null && 'code' in reason ? String(reason.code) : '';
  const messages: Record<string, [string, string]> = {
    'auth/popup-blocked': ['Браузер заблокировал окно Google. Разрешите всплывающие окна для этого сайта и повторите вход.', 'Your browser blocked the Google window. Allow pop-ups for this site and try again.'],
    'auth/popup-closed-by-user': ['Окно Google было закрыто. Нажмите кнопку ещё раз, чтобы повторить вход.', 'The Google window was closed. Click the button to try again.'],
    'auth/unauthorized-domain': ['Этот адрес сайта не разрешён в настройках Google-входа. Сообщите владельцу сайта.', 'This site address is not allowed for Google sign-in. Please contact the site owner.'],
    'auth/operation-not-allowed': ['Google-вход не включён в настройках сайта. Сообщите владельцу сайта.', 'Google sign-in is not enabled for this site. Please contact the site owner.'],
    'auth/network-request-failed': ['Не удалось связаться с Google. Проверьте соединение и повторите попытку.', 'Could not reach Google. Check your connection and try again.'],
  };
  if (messages[code]) return messages[code][lang === 'ru' ? 0 : 1];
  return reason instanceof Error ? reason.message : lang === 'ru' ? 'Не удалось войти через Google.' : 'Google sign-in failed.';
}

export function GoogleSignIn({ onSignedIn, lang='ru' }: { onSignedIn: (user: GoogleUser) => void; lang?: 'ru'|'en' }) {
  const onSignedInRef = useRef(onSignedIn);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const configRef = useRef<{ apiKey: string; authDomain: string; projectId: string; appId: string } | null>(null);

  useEffect(() => {
    onSignedInRef.current = onSignedIn;
  }, [onSignedIn]);

  useEffect(() => {
    fetch('/api/auth/config').then(async (response) => {
      const config = await response.json() as typeof configRef.current;
      if (!config) throw new Error('Google sign-in is being configured. Please try again shortly.');
      configRef.current = config;
      setReady(true);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Google sign-in is unavailable.'));
  }, []);

  async function signIn() {
    if (!configRef.current || busy) return;
    setBusy(true);
    try {
      setError('');
      const app = getApps().find((item) => item.name === appName) || initializeApp(configRef.current, appName);
      const result = await signInWithPopup(getAuth(app), new GoogleAuthProvider());
      const credential = await result.user.getIdToken();
      const response = await fetch('/api/auth/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }),
      });
      const body = await response.json() as { user?: GoogleUser; error?: string };
      if (!response.ok || !body.user) throw new Error(body.error || 'Google sign-in failed.');
      onSignedInRef.current(body.user);
    } catch (reason) {
      setError(signInError(reason, lang));
    } finally {
      setBusy(false);
    }
  }

  return <div className="google-signin">
    <button type="button" className="google-button" disabled={!ready || busy} onClick={() => void signIn()}>
      <span className="google-g">G</span> {lang==='ru'?'Продолжить с Google':'Continue with Google'}
    </button>
    <output>{error}</output>
  </div>;
}
