'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Heart,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Method = {
  id: string;
  label: string;
  url: string;
  instructions: string;
};

type Roadmap = {
  funded: Record<string, number>;
  settings: Record<string, string>;
  methods: Method[];
};

const defaults: Roadmap = {
  funded: {},
  settings: {},
  methods: [],
};

const storyImages = [
  '/story/hospital-room.jpg',
  '/story/hospital-iv.jpg',
  '/story/mri-scan.jpg',
  '/story/mri-report.jpg',
  '/story/translated-result.jpg',
];

const strings = {
  ru: {
    back: 'На главную',
    title: 'Почему я собираю деньги',
    paragraph1:
      'Мне 32 года, и недавно я перенёс инсульт. Лечение и восстановление обошлись значительно дороже, чем я мог покрыть сам, поэтому сейчас часть этих расходов остаётся долгом.',
    paragraph2:
      'World Clock я продолжаю развивать самостоятельно. Если приложение оказалось вам полезно, вы можете помочь мне закрыть расходы после лечения и продолжить работу над проектом.',
    support: 'Поддержать',
    methodsTitle: 'Поддержать проект',
    methodsCopy: 'Выберите удобный способ.',
    noMethods: 'Способы поддержки пока не подключены.',
    copy: 'Копировать',
    copied: 'Скопировано',
    gallery: 'Документы и фотографии',
    galleryCopy:
      'Фотографии из больницы и медицинские документы — как контекст к истории выше.',
    openPhoto: 'Открыть изображение',
    previous: 'Предыдущее изображение',
    next: 'Следующее изображение',
    businessTitle: 'Есть задача в бизнесе?',
    businessCopy:
      'Я занимаюсь разбором процессов, интерфейсов и автоматизации. Если где-то теряются время, деньги или слишком много ручного труда, могу провести аудит и предложить практичный способ улучшения.',
  },

  en: {
    back: 'Back to home',
    title: 'Why I’m raising money',
    paragraph1:
      'I’m 32, and I recently had a stroke. Treatment and recovery cost substantially more than I could cover myself, so part of those expenses is now debt.',
    paragraph2:
      'I’m continuing to build World Clock independently. If the app is useful to you, you can help me cover the costs left after treatment and keep developing the project.',
    support: 'Support the project',
    methodsTitle: 'Support the project',
    methodsCopy: 'Choose a payment method.',
    noMethods: 'Support options have not been connected yet.',
    copy: 'Copy',
    copied: 'Copied',
    gallery: 'Documents and photos',
    galleryCopy:
      'Hospital photos and medical documents provide context for the story above.',
    openPhoto: 'Open image',
    previous: 'Previous image',
    next: 'Next image',
    businessTitle: 'Have a business problem?',
    businessCopy:
      'I work with processes, interfaces and automation. If a workflow is wasting time, money or too much manual effort, I can audit it and propose a practical way to improve it.',
  },
};

export default function SupportPage() {
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [data, setData] = useState<Roadmap>(defaults);
  const [methodsOpen, setMethodsOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const [copiedMethod, setCopiedMethod] = useState<string | null>(null);

  const t = strings[lang];

  const load = useCallback(async () => {
    const response = await fetch('/api/roadmap');
    const roadmap = await response.json();

    setData({
      funded: roadmap.funded || {},
      settings: roadmap.settings || {},
      methods: roadmap.methods || [],
    });
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('wc-lang');

    if (saved === 'en') {
      setLang('en');
      document.documentElement.lang = 'en';
    }

    void load();
  }, [load]);

  useEffect(() => {
    if (selectedPhoto === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') changePhoto(-1);
      if (event.key === 'ArrowRight') changePhoto(1);
      if (event.key === 'Escape') setSelectedPhoto(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPhoto]);

  function chooseLang(value: 'ru' | 'en') {
    setLang(value);
    localStorage.setItem('wc-lang', value);
    document.documentElement.lang = value;
  }

  function changePhoto(direction: -1 | 1) {
    setSelectedPhoto((current) => {
      if (current === null) return null;

      return (
        current +
        direction +
        storyImages.length
      ) % storyImages.length;
    });
  }

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

  const authorRaised = data.funded.author || 0;
  const authorGoal = Number(
    data.settings.author_goal_cents || 300000,
  );

  const progress =
    authorGoal > 0
      ? Math.min(
          100,
          Math.max(0, (authorRaised / authorGoal) * 100),
        )
      : 0;

  return (
    <main className="support-page">
      <header className="support-header">
        <a href="/" className="support-back">
          <ArrowLeft />
          {t.back}
        </a>

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
      </header>

      <section className="support-intro">
        <p className="section-kicker">World Clock</p>
        <h1>{t.title}</h1>

        <div className="support-story-copy">
          <p>{t.paragraph1}</p>
          <p>{t.paragraph2}</p>
        </div>

        <div className="support-total">
          <strong>
            ${(authorRaised / 100).toFixed(0)} / $
            {(authorGoal / 100).toFixed(0)}
          </strong>

          <div className="support-progress">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        <button
          className="primary-action support-primary"
          onClick={() => setMethodsOpen(true)}
        >
          <Heart />
          {t.support}
        </button>
      </section>

      <section className="support-gallery-section">
        <header>
          <h2>{t.gallery}</h2>
          <p>{t.galleryCopy}</p>
        </header>

        <div className="support-gallery">
          {storyImages.map((src, index) => (
            <button
              key={src}
              className="support-gallery-item"
              aria-label={`${t.openPhoto} ${index + 1}`}
              onClick={() => setSelectedPhoto(index)}
            >
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      </section>

      <section className="business-support">
        <h2>{t.businessTitle}</h2>
        <p>{t.businessCopy}</p>
      </section>

      <footer className="support-footer">
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
        open={methodsOpen}
        onOpenChange={(open) => {
          setMethodsOpen(open);

          if (!open) {
            setCopiedMethod(null);
          }
        }}
      >
        <DialogContent className="modal">
          <DialogHeader>
            <DialogTitle>{t.methodsTitle}</DialogTitle>
            <DialogDescription>{t.methodsCopy}</DialogDescription>
          </DialogHeader>

          {data.methods.length ? (
            <div className="method-list">
              {data.methods.map((method) => (
                <div key={method.id}>
                  <strong>{method.label}</strong>

                  {method.id === 'bybit-usdt-trc20' &&
                    method.instructions && (
                      <QRCodeSVG
                        className="payment-qr"
                        value={method.instructions}
                        size={144}
                        level="M"
                        marginSize={2}
                      />
                    )}

                  {method.instructions && (
                    <code>{method.instructions}</code>
                  )}

                  {method.instructions && (
                    <button
                      onClick={() => void copyMethod(method)}
                    >
                      {copiedMethod === method.id ? (
                        <>
                          <Check />
                          {t.copied}
                        </>
                      ) : (
                        <>
                          <Copy />
                          {t.copy}
                        </>
                      )}
                    </button>
                  )}

                  {method.url && (
                    <a
                      href={method.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.support}
                      <ExternalLink />
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-note">{t.noMethods}</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedPhoto !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPhoto(null);
        }}
      >
        <DialogContent className="image-dialog">
          <DialogTitle className="sr-only">
            {t.gallery}
          </DialogTitle>

          {selectedPhoto !== null && (
            <>
              <div className="image-stage">
                <img
                  src={storyImages[selectedPhoto]}
                  alt=""
                />
              </div>

              <div className="image-controls">
                <button
                  aria-label={t.previous}
                  onClick={() => changePhoto(-1)}
                >
                  <ChevronLeft />
                </button>

                <span>
                  {selectedPhoto + 1} / {storyImages.length}
                </span>

                <button
                  aria-label={t.next}
                  onClick={() => changePhoto(1)}
                >
                  <ChevronRight />
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
