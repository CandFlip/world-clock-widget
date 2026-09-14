'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  Check,
  Clock3,
  ExternalLink,
  Lightbulb,
  LogIn,
  LogOut,
  MessageSquarePlus,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { GoogleSignIn, type GoogleUser } from '@/components/google-sign-in';

type Localized = {
  ru: string;
  en: string;
};

type Idea = {
  id: string;
  status: string;
  goalCents: number;
  title: Localized;
  description: Localized;
  cost: Localized;
};

type Roadmap = {
  ideas: Idea[];
  counts: Record<string, number>;
  funded: Record<string, number>;
  selected: string | null;
  settings: Record<string, string>;
  suggestions: Array<{
    id: string;
    title: string;
    problem: string;
    outcome: string;
  }>;
};

type Modal = null | 'auth' | 'suggest';

const defaults: Roadmap = {
  ideas: [],
  counts: {},
  funded: {},
  selected: null,
  settings: {},
  suggestions: [],
};

const CURRENT_VERSION = 'v1.1.82';
const CURRENT_DOWNLOAD =
  'https://github.com/CandFlip/world-clock-widget/releases/download/windows-v1.1.82/WorldClockWidget-Setup-v1.1.82.exe';

const strings = {
  ru: {
    navRoadmap: 'Что дальше?',
    navGithub: 'GitHub',
    signin: 'Войти',
    account: 'Кабинет',

    headline: 'Не считайте часовые пояса в голове.',
    intro:
      'World Clock — компактный виджет для Windows. Сдвиньте одну шкалу и сразу увидьте нужное время во всех городах.',
    heroExtra:
      'Выберите момент — и при необходимости поставьте напоминание.',
    download: 'Скачать для Windows',
    github: 'GitHub',

    benefit1Title: 'Один момент — все города',
    benefit1Copy:
      'Двигайте одну шкалу, и время меняется сразу везде.',
    benefit2Title: 'Поверх текущей работы',
    benefit2Copy:
      'Откройте виджет, посмотрите время и продолжайте работу.',
    benefit3Title: 'Посмотрели — поставили будильник',
    benefit3Copy:
      'Выбранный момент можно сразу превратить в напоминание.',

    roadmap: 'Что сделать следующим?',
    roadmapCopy: 'Выберите функцию или предложите свою.',
    vote: 'Голосовать',
    choice: 'Ваш выбор',
    ideaTitle: 'Предложить функцию',
    ideaCopy: 'Коротко опишите, что нужно добавить.',
    suggest: 'Предложить идею',
    community: 'Идеи сообщества',
    mobileGoal: 'Лицензии iOS и Android',

    independent: 'Независимый проект',
    supportWhy: 'Почему я собираю?',

    loginTitle: 'Войти',
    loginCopy: 'Вход нужен для голосования и предложений.',
    problem: 'Какую проблему это решит?',
    outcome: 'Как должен выглядеть результат?',
    send: 'Отправить',
    thanks: 'Спасибо. Запись отправлена.',
  },

  en: {
    navRoadmap: 'What next?',
    navGithub: 'GitHub',
    signin: 'Sign in',
    account: 'Account',

    headline: 'Stop doing time zone math in your head.',
    intro:
      'World Clock is a compact Windows widget. Move one timeline and instantly see the corresponding time in every city.',
    heroExtra:
      'Pick a moment and set a reminder when you need one.',
    download: 'Download for Windows',
    github: 'GitHub',

    benefit1Title: 'One moment, every city',
    benefit1Copy:
      'Move one timeline and every city updates together.',
    benefit2Title: 'Over whatever you’re doing',
    benefit2Copy:
      'Open the widget, check the time and get back to work.',
    benefit3Title: 'See it, set an alarm',
    benefit3Copy:
      'Turn the selected moment into a reminder immediately.',

    roadmap: 'What should I build next?',
    roadmapCopy: 'Vote for a feature or suggest your own.',
    vote: 'Vote',
    choice: 'Your choice',
    ideaTitle: 'Suggest a feature',
    ideaCopy: 'Briefly describe what should be added.',
    suggest: 'Suggest an idea',
    community: 'Community ideas',
    mobileGoal: 'iOS and Android licenses',

    independent: 'Independent project',
    supportWhy: 'Why I’m raising money',

    loginTitle: 'Sign in',
    loginCopy: 'Sign in to vote or suggest an idea.',
    problem: 'What problem would this solve?',
    outcome: 'What should the result look like?',
    send: 'Send',
    thanks: 'Thank you. Your message was sent.',
  },
};

export default function Home() {
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [data, setData] = useState<Roadmap>(defaults);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [pendingVote, setPendingVote] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  const [suggestion, setSuggestion] = useState({
    title: '',
    problem: '',
    outcome: '',
  });

  const t = strings[lang];

  const load = useCallback(async () => {
    const [roadmap, auth] = await Promise.all([
      fetch('/api/roadmap').then((r) => r.json()),
      fetch('/api/auth/me').then((r) => r.json()),
    ]);

    setData(roadmap);
    setUser(auth.user || null);
    setBusy(false);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('wc-lang');

    if (saved === 'en') {
      setLang('en');
      document.documentElement.lang = 'en';
    }

    void load().catch(() => setBusy(false));
  }, [load]);

  const chooseLang = (value: 'ru' | 'en') => {
    setLang(value);
    localStorage.setItem('wc-lang', value);
    document.documentElement.lang = value;
  };

  /*
   * v1.1.78 is still being forced by the current roadmap API.
   * Until that legacy fallback is removed, use the actual current release.
   */
  const apiVersion = data.settings.download_version;
  const apiDownload = data.settings.download_url;

  const version =
    apiVersion && apiVersion !== 'v1.1.78'
      ? apiVersion
      : CURRENT_VERSION;

  const download =
    apiVersion &&
    apiVersion !== 'v1.1.78' &&
    apiDownload
      ? apiDownload
      : CURRENT_DOWNLOAD;

  const mobileRaised = data.funded['mobile-official'] || 0;

  const authorRaised = data.funded.author || 0;
  const authorGoal = Number(data.settings.author_goal_cents || 300000);

  const supportProgress =
    authorGoal > 0
      ? Math.min(100, Math.max(0, (authorRaised / authorGoal) * 100))
      : 0;

  async function saveVote(id: string) {
    setBusy(true);

    const response = await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId: id }),
    });

    if (response.ok) {
      await load();
    } else {
      setMessage(
        lang === 'ru'
          ? 'Не удалось сохранить голос.'
          : 'Could not save the vote.',
      );
    }

    setBusy(false);
  }

  async function vote(id: string) {
    if (!user) {
      setPendingVote(id);
      setModal('auth');
      return;
    }

    await saveVote(id);
  }

  function signedIn(next: GoogleUser) {
    setUser(next);
    setModal(null);

    if (pendingVote) {
      const id = pendingVote;
      setPendingVote(null);
      void saveVote(id);
    }
  }

  async function sendSuggestion() {
    const response = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(suggestion),
    });

    if (response.status === 401) {
      setModal('auth');
      return;
    }

    if (response.ok) {
      setSuggestion({
        title: '',
        problem: '',
        outcome: '',
      });

      setMessage(t.thanks);
      setModal(null);
    } else {
      setMessage(
        lang === 'ru'
          ? 'Проверьте заполнение формы.'
          : 'Please check the form.',
      );
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }

  return (
    <main className="site-shell">
      <nav className="topbar">
        <a className="brand" href="#top">
          <span className="brand-mark">
            <Clock3 />
          </span>
          <span>World Clock</span>
        </a>

        <div className="nav-links">
          <a href="#roadmap">{t.navRoadmap}</a>

          <a
            href="https://github.com/CandFlip/world-clock-widget"
            target="_blank"
            rel="noreferrer"
          >
            {t.navGithub}
          </a>

          <a className="nav-download" href={download}>
            {lang === 'ru' ? 'Скачать' : 'Download'}
          </a>
        </div>

        <div className="account-area">
          <div className="language">
            <button
              className={lang === 'ru' ? 'active' : ''}
              onClick={() => chooseLang('ru')}
            >
              RU
            </button>

            <button
              className={lang === 'en' ? 'active' : ''}
              onClick={() => chooseLang('en')}
            >
              EN
            </button>
          </div>

          {user ? (
            <>
              {user.isAdmin ? (
                <a className="account-link" href="/admin">
                  {t.account}
                </a>
              ) : (
                <span className="user-chip">{user.name}</span>
              )}

              <button onClick={logout} aria-label="Sign out">
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <button
              className="signin-link"
              onClick={() => setModal('auth')}
            >
              <LogIn size={15} />
              {t.signin}
            </button>
          )}
        </div>
      </nav>

      <section className="hero" id="top">
        <h1>{t.headline}</h1>

        <p className="hero-copy">{t.intro}</p>
        <p className="hero-extra">{t.heroExtra}</p>

        <div className="hero-actions">
          <a className="primary-action" href={download}>
            <ArrowDownToLine />
            {t.download}
            <span>{version}</span>
          </a>

          <a
            className="text-action"
            href="https://github.com/CandFlip/world-clock-widget"
            target="_blank"
            rel="noreferrer"
          >
            {t.github}
            <ExternalLink />
          </a>
        </div>
      </section>

      <section className="benefits-section">
        <article className="benefit-card">
          <h2>{t.benefit1Title}</h2>
          <p>{t.benefit1Copy}</p>
        </article>

        <article className="benefit-card">
          <h2>{t.benefit2Title}</h2>
          <p>{t.benefit2Copy}</p>
        </article>

        <article className="benefit-card">
          <h2>{t.benefit3Title}</h2>
          <p>{t.benefit3Copy}</p>
        </article>
      </section>

      <section className="roadmap-section" id="roadmap">
        <header className="section-heading">
          <div>
            <h2>{t.roadmap}</h2>
            <p>{t.roadmapCopy}</p>
          </div>

          <button
            className="secondary-action"
            onClick={() => setModal('suggest')}
          >
            <MessageSquarePlus />
            {t.suggest}
          </button>
        </header>

        <div className="idea-list">
          {data.ideas.map((idea) => {
            const votes = data.counts[idea.id] || 0;
            const selected = data.selected === idea.id;

            return (
              <article className="idea-card" key={idea.id}>
                <div className="idea-copy">
                  <h3>{idea.title[lang]}</h3>
                  <p>{idea.description[lang]}</p>

                  {idea.id === 'mobile-official' && (
                    <div className="license-line">
                      <span>{t.mobileGoal}</span>
                      <strong>
                        ${(mobileRaised / 100).toFixed(0)} / $124
                      </strong>
                    </div>
                  )}
                </div>

                <div className="idea-actions">
                  <button
                    className={selected ? 'selected' : ''}
                    onClick={() => vote(idea.id)}
                    disabled={busy}
                  >
                    {selected ? <Check /> : <Lightbulb />}
                    {selected ? t.choice : t.vote}
                    <span>{votes}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {data.suggestions.length > 0 && (
          <div className="community">
            <p className="section-kicker">{t.community}</p>

            {data.suggestions.map((item) => (
              <article key={item.id}>
                <h3>{item.title}</h3>
                <p>{item.problem}</p>
                {item.outcome && <small>{item.outcome}</small>}
              </article>
            ))}
          </div>
        )}

        <output className="status-message">{message}</output>
      </section>

      <section className="support-strip">
        <div className="support-strip-copy">
          <span className="section-kicker">{t.independent}</span>

          <strong>
            ${(authorRaised / 100).toFixed(0)} / $
            {(authorGoal / 100).toFixed(0)}
          </strong>
        </div>

        <div className="support-progress" aria-hidden="true">
          <span style={{ width: `${supportProgress}%` }} />
        </div>

        <a className="support-link" href="/support">
          {t.supportWhy}
        </a>
      </section>

      <footer>
        <span>World Clock Widget</span>

        <a
          href="https://github.com/CandFlip/world-clock-widget"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
          <ExternalLink />
        </a>
      </footer>

      <Dialog
        open={modal === 'auth'}
        onOpenChange={(open) => !open && setModal(null)}
      >
        <DialogContent className="modal">
          <DialogHeader>
            <DialogTitle>{t.loginTitle}</DialogTitle>
            <DialogDescription>{t.loginCopy}</DialogDescription>
          </DialogHeader>

          <GoogleSignIn lang={lang} onSignedIn={signedIn} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={modal === 'suggest'}
        onOpenChange={(open) => !open && setModal(null)}
      >
        <DialogContent className="modal">
          <DialogHeader>
            <DialogTitle>{t.ideaTitle}</DialogTitle>
            <DialogDescription>{t.ideaCopy}</DialogDescription>
          </DialogHeader>

          <label>
            <span>
              {lang === 'ru' ? 'Короткое название' : 'Short title'}
            </span>

            <input
              maxLength={100}
              value={suggestion.title}
              onChange={(e) =>
                setSuggestion({
                  ...suggestion,
                  title: e.target.value,
                })
              }
            />
          </label>

          <label>
            <span>{t.problem}</span>

            <Textarea
              maxLength={800}
              value={suggestion.problem}
              onChange={(e) =>
                setSuggestion({
                  ...suggestion,
                  problem: e.target.value,
                })
              }
            />
          </label>

          <label>
            <span>{t.outcome}</span>

            <Textarea
              maxLength={800}
              value={suggestion.outcome}
              onChange={(e) =>
                setSuggestion({
                  ...suggestion,
                  outcome: e.target.value,
                })
              }
            />
          </label>

          <button
            className="primary-action"
            onClick={sendSuggestion}
          >
            {t.send}
          </button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
