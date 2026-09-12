'use client';

import { useEffect, useRef, useState } from 'react';
import { getApps, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';

export type GoogleUser = { id: string; email: string; name: string; picture: string; isAdmin: boolean };

export function GoogleSignIn({ onSignedIn, lang='ru' }: { onSignedIn: (user: GoogleUser) => void; lang?: 'ru'|'en' }) {
  const onSignedInRef = useRef(onSignedIn);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [email,setEmail]=useState(''),[password,setPassword]=useState('');
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
    if (!configRef.current) return;
    try {
      setError('');
      const app = getApps()[0] || initializeApp(configRef.current);
      const result = await signInWithPopup(getAuth(app), new GoogleAuthProvider());
      const credential = await result.user.getIdToken();
      const response = await fetch('/api/auth/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }),
      });
      const body = await response.json() as { user?: GoogleUser; error?: string };
      if (!response.ok || !body.user) throw new Error(body.error || 'Google sign-in failed.');
      onSignedInRef.current(body.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Google sign-in failed.');
    }
  }

  async function finishFirebase(user: import('firebase/auth').User) {
    const credential = await user.getIdToken();
    const response = await fetch('/api/auth/session', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential}) });
    const body = await response.json() as { user?: GoogleUser; error?: string };
    if(!response.ok||!body.user) throw new Error(body.error||'Sign-in failed.');
    onSignedInRef.current(body.user);
  }

  async function emailSignIn(create=false){
    if(!configRef.current||!email||password.length<6)return;
    try{setError('');const app=getApps()[0]||initializeApp(configRef.current);const auth=getAuth(app);const result=create?await createUserWithEmailAndPassword(auth,email,password):await signInWithEmailAndPassword(auth,email,password);await finishFirebase(result.user);}
    catch(reason){setError(reason instanceof Error?reason.message:'Sign-in failed.');}
  }

  return <div className="google-signin">
    <button type="button" className="google-button" disabled={!ready} onClick={() => void signIn()}>
      <span className="google-g">G</span> {lang==='ru'?'Продолжить с Google':'Continue with Google'}
    </button>
    <div className="auth-divider"><span>{lang==='ru'?'или':'or'}</span></div>
    <input type="email" autoComplete="email" placeholder="Email" value={email} onChange={event=>setEmail(event.target.value)}/>
    <input type="password" autoComplete="current-password" placeholder={lang==='ru'?'Пароль от 6 символов':'Password, 6+ characters'} value={password} onChange={event=>setPassword(event.target.value)}/>
    <div className="email-actions"><button disabled={!ready||!email||password.length<6} onClick={()=>void emailSignIn(false)}>{lang==='ru'?'Войти':'Sign in'}</button><button disabled={!ready||!email||password.length<6} onClick={()=>void emailSignIn(true)}>{lang==='ru'?'Создать аккаунт':'Create account'}</button></div>
    <output>{error}</output>
  </div>;
}
