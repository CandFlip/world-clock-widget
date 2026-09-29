'use client';

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, Check, Clock3, ExternalLink, Heart, Lightbulb, LogIn, LogOut, MessageSquarePlus } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { GoogleUser } from '@/components/google-sign-in';
import { siteCopy } from '@/lib/site-strings';

const GoogleSignIn = lazy(() => import('@/components/google-sign-in').then((module) => ({ default: module.GoogleSignIn })));

type Localized = { ru: string; en: string };
type Idea = { id: string; status: string; goalCents: number; title: Localized; description: Localized; cost: Localized };
type Method = { id: string; label: string; url: string; instructions: string; image: string };
type Roadmap = { ideas: Idea[]; counts: Record<string, number>; funded: Record<string, number>; selected: string | null; settings: Record<string, string>; methods: Method[]; suggestions: Array<{ id: string; title: string; problem: string; outcome: string }> };
type Modal = null | 'auth' | 'suggest' | 'support';

const defaults: Roadmap = { ideas: [], counts: {}, funded: {}, selected: null, settings: {}, methods: [], suggestions: [] };
const currentDownload = 'https://github.com/CandFlip/world-clock-widget/releases/download/v1.1.117/WorldClockWidget-Setup-v1.1.117.exe';
const macDownload = 'https://github.com/CandFlip/world-clock-widget/releases/download/v1.1.117/WorldClockWidget-macOS-v1.1.117.dmg';
export default function Home() {
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [data, setData] = useState<Roadmap>(defaults);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [pendingVote, setPendingVote] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [copiedMethod, setCopiedMethod] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [suggestion, setSuggestion] = useState({ title: '', problem: '', outcome: '' });
  const t = siteCopy(lang, data.settings[`ui_copy_${lang}`]);

  const loadRoadmap = useCallback(async () => {
    try {
      const response = await fetch('/api/roadmap');
      if (!response.ok) throw new Error('Roadmap unavailable');
      setData(await response.json() as Roadmap);
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('wc-lang');
    if (saved === 'en') setLang('en');
    void loadRoadmap().catch(() => setMessage('Не удалось загрузить данные сайта. Обновите страницу.'));
    void fetch('/api/auth/me').then(async (response) => {
      if (!response.ok) throw new Error('Session unavailable');
      const auth = await response.json() as { user?: GoogleUser };
      setUser(auth.user || null);
    }).catch(() => {}).finally(() => setAuthLoaded(true));
  }, [loadRoadmap]);

  const chooseLang = (value: 'ru' | 'en') => {
    setLang(value);
    localStorage.setItem('wc-lang', value);
    document.documentElement.lang = value;
  };
  const version = data.settings.download_version || 'v1.1.117';
  const download = version === data.settings.download_version && data.settings.download_url ? data.settings.download_url : currentDownload;
  const mobileRaised = data.funded['mobile-official'] || 0;

  async function saveVote(id: string) {
    setBusy(true);
    const response = await fetch('/api/votes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optionId: id }) });
    if (response.ok) await loadRoadmap();
    else setMessage(lang === 'ru' ? 'Не удалось сохранить голос.' : 'Could not save the vote.');
    setBusy(false);
  }
  async function vote(id: string) {
    if (!user) { setPendingVote(id); setModal('auth'); return; }
    await saveVote(id);
  }
  function signedIn(next: GoogleUser) {
    setUser(next);
    setAuthLoaded(true);
    setModal(null);
    if (pendingVote) { const id = pendingVote; setPendingVote(null); void saveVote(id); }
  }
  async function sendSuggestion() {
    const response = await fetch('/api/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(suggestion) });
    if (response.status === 401) { setModal('auth'); return; }
    if (response.ok) { setSuggestion({ title: '', problem: '', outcome: '' }); setMessage(t.thanks); setModal(null); }
    else setMessage(lang === 'ru' ? 'Проверьте заполнение формы.' : 'Please check the form.');
  }
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); setUser(null); setAuthLoaded(true); }
  async function copyMethod(method: Method) {
    try {
      await navigator.clipboard.writeText(method.instructions);
    } catch {
      const field = document.createElement('textarea');
      field.value = method.instructions;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setCopiedMethod(method.id);
  }
  return <main className="site-shell">
    <nav className="topbar">
      <a className="brand" href="#top"><span className="brand-mark"><Clock3 /></span><span>World Clock</span></a>
      <div className="nav-links"><a href="#roadmap">{t.navRoadmap}</a><button onClick={() => setModal('suggest')}>{t.navIdeas}</button><a href="#support">{t.navSupport}</a></div>
      <div className="account-area">
        <div className="language"><button className={lang === 'ru' ? 'active' : ''} onClick={() => chooseLang('ru')}>RU</button><button className={lang === 'en' ? 'active' : ''} onClick={() => chooseLang('en')}>EN</button></div>
        {!authLoaded ? <span className="user-chip" aria-label={lang === 'ru' ? 'Проверка входа' : 'Checking sign-in'}>…</span> : user ? <>{user.isAdmin ? <a className="admin-link" href="/admin">{t.admin}</a> : <span className="user-chip">{user.name}</span>}<button onClick={logout} aria-label="Sign out"><LogOut size={16} /></button></> : <button className="signin-link" onClick={() => setModal('auth')}><LogIn size={15} />{t.signin}</button>}
      </div>
    </nav>

    <section className="hero" id="top">
      <h1>{t.headline}</h1><p className="hero-copy">{t.intro}</p>
      <div className="hero-actions"><a className="primary-action" href={download}><ArrowDownToLine />{t.download}<span>{version}</span></a><a className="primary-action" href={macDownload}><ArrowDownToLine />{t.downloadMac}<span>Beta</span></a><a className="text-action" href="https://github.com/CandFlip/world-clock-widget/releases/tag/v1.1.117" target="_blank" rel="noreferrer">{t.source}<ExternalLink /></a></div>
      <p className="download-note">{t.downloadNote}</p>
    </section>

    <section className="roadmap-section" id="roadmap">
      <header className="section-heading"><div><h2>{t.roadmap}</h2><p>{t.roadmapCopy}</p></div><button className="secondary-action" onClick={() => setModal('suggest')}><MessageSquarePlus />{t.suggest}</button></header>
      <div className="idea-list">{data.ideas.map((idea) => {
        const votes = data.counts[idea.id] || 0;
        const selected = data.selected === idea.id;
        return <article className="idea-card" key={idea.id}><div className="idea-copy"><h3>{idea.title[lang]}</h3><p>{idea.description[lang]}</p>{idea.id === 'mobile-official' && idea.goalCents > 0 && <div className="license-line"><span>{t.mobileGoal}</span><strong>${(mobileRaised / 100).toFixed(0)} / ${(idea.goalCents / 100).toFixed(0)}</strong></div>}</div><div className="idea-actions"><button className={selected ? 'selected' : ''} onClick={() => vote(idea.id)} disabled={busy || !authLoaded}>{selected ? <Check /> : <Lightbulb />}{selected ? t.choice : t.vote}<span>{votes}</span></button></div></article>;
      })}</div>
      {data.suggestions.length > 0 && <div className="community"><p className="section-kicker">{t.community}</p>{data.suggestions.map((item) => <article key={item.id}><h3>{item.title}</h3><p>{item.problem}</p>{item.outcome && <small>{item.outcome}</small>}</article>)}</div>}
      <output className="status-message">{message}</output>
    </section>

    <section className="support-section" id="support">
      <h2>{t.supportTitle}</h2>
      <div className="support-actions"><button className="support-action" onClick={() => setModal('support')}><Heart />{t.support}</button><a className="support-action support-story-link" href={`/support?lang=${lang}`}>{t.whySupport}</a></div>
    </section>

    <footer><span>World Clock Widget</span><a href="https://github.com/CandFlip/world-clock-widget" target="_blank" rel="noreferrer">GitHub <ExternalLink /></a></footer>

    <Dialog open={modal === 'auth'} onOpenChange={(open) => !open && setModal(null)}><DialogContent className="modal"><DialogHeader><DialogTitle>{t.loginTitle}</DialogTitle><DialogDescription>{t.loginCopy}</DialogDescription></DialogHeader><Suspense fallback={<p>{lang === 'ru' ? 'Подготовка входа…' : 'Preparing sign-in…'}</p>}><GoogleSignIn lang={lang} onSignedIn={signedIn} /></Suspense></DialogContent></Dialog>
    <Dialog open={modal === 'suggest'} onOpenChange={(open) => !open && setModal(null)}><DialogContent className="modal"><DialogHeader><DialogTitle>{t.ideaTitle}</DialogTitle><DialogDescription>{t.ideaCopy}</DialogDescription></DialogHeader><label><span>{lang === 'ru' ? 'Короткое название' : 'Short title'}</span><input maxLength={100} value={suggestion.title} onChange={(e) => setSuggestion({ ...suggestion, title: e.target.value })} /></label><label><span>{t.problem}</span><Textarea maxLength={800} value={suggestion.problem} onChange={(e) => setSuggestion({ ...suggestion, problem: e.target.value })} /></label><label><span>{t.outcome}</span><Textarea maxLength={800} value={suggestion.outcome} onChange={(e) => setSuggestion({ ...suggestion, outcome: e.target.value })} /></label><button className="primary-action" onClick={sendSuggestion}>{t.send}</button></DialogContent></Dialog>
    <Dialog open={modal === 'support'} onOpenChange={(open) => { if (!open) { setModal(null); setCopiedMethod(null); } }}><DialogContent className="modal"><DialogHeader><DialogTitle>{t.methods}</DialogTitle><DialogDescription>{t.paymentNote}</DialogDescription></DialogHeader>{data.methods.length ? <div className="method-list">{data.methods.map((method) => <div key={method.id}><strong>{method.label}</strong>{method.image ? <Image unoptimized width={144} height={144} className="payment-qr" src={method.image} alt={`QR-код: ${method.label}`} /> : method.id === 'bybit-usdt-trc20' && method.instructions ? <QRCodeSVG className="payment-qr" value={method.instructions} size={144} level="M" marginSize={2} /> : null}{method.instructions && <code>{method.instructions}</code>}{method.instructions && <button onClick={() => void copyMethod(method)}>{copiedMethod === method.id ? t.copied : t.copy}</button>}{method.url && <a href={method.url} target="_blank" rel="noreferrer">{t.support}<ExternalLink /></a>}</div>)}</div> : <p className="empty-note">{t.noMethods}</p>}</DialogContent></Dialog>
  </main>;
}
