'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Heart } from 'lucide-react';

const content = {
  ru: {
    back: 'На главную',
    kicker: 'Личная история',
    title: 'Почему я собираю поддержку',
    lead: 'В сентябре 2026 года я внезапно оказался в больнице. Обычная жизнь остановилась за один день.',
    paragraphs: [
      'Всё началось с головной боли и головокружения. В больнице мне сделали МРТ. Исследование показало небольшой очаг в правом полушарии мозжечка.',
      'После повторной проверки врачи сказали, что с вероятностью 99% это инфаркт мозга. Это стало для меня неожиданным и тяжёлым событием.',
      'Сейчас я продолжаю восстановление и одновременно развиваю World Clock Widget. Поддержка помогает мне оплачивать лечение и сохранять возможность работать над проектом.'
    ],
    captions: ['В больничной палате', 'Во время лечения', 'Снимок МРТ', 'Заключение МРТ', 'Перевод заключения врача'],
    note: 'Любая поддержка — это помощь и мне, и проекту. Спасибо каждому, кто рядом.',
    support: 'Поддержать проект'
  },
  en: {
    back: 'Back to the main page',
    kicker: 'A personal story',
    title: 'Why I am raising support',
    lead: 'In September 2026, I suddenly ended up in hospital. Ordinary life stopped in a single day.',
    paragraphs: [
      'It began with a headache and dizziness. At the hospital, I had an MRI. The scan showed a small lesion in the right cerebellar hemisphere.',
      'After a follow-up examination, the doctors told me there was a 99% probability that it was a cerebral infarction. It was a sudden and difficult event for me.',
      'I am now continuing my recovery while developing World Clock Widget. Support helps me cover treatment costs and keep working on the project.'
    ],
    captions: ['In the hospital room', 'During treatment', 'MRI scan', 'MRI report', 'Translation of the doctor\'s conclusion'],
    note: 'Any contribution supports both me and the project. Thank you to everyone who is with me.',
    support: 'Support the project'
  }
} as const;

const photos = ['/story/hospital-room.jpg', '/story/hospital-iv.jpg', '/story/mri-scan.jpg', '/story/mri-report.jpg', '/story/translated-result.jpg'];

export default function SupportStoryPage() {
  const [lang, setLang] = useState<'ru' | 'en'>('ru');

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('lang');
    const saved = localStorage.getItem('wc-lang');
    const next = requested === 'en' || (requested !== 'ru' && saved === 'en') ? 'en' : 'ru';
    setLang(next);
    document.documentElement.lang = next;
  }, []);

  const t = content[lang];
  const chooseLang = (value: 'ru' | 'en') => {
    setLang(value);
    localStorage.setItem('wc-lang', value);
    document.documentElement.lang = value;
    window.history.replaceState(null, '', `/support?lang=${value}`);
  };

  return <main className="story-shell">
    <nav className="story-topbar">
      <a className="story-back" href={`/?lang=${lang}#support`}><ArrowLeft />{t.back}</a>
      <div className="language"><button className={lang === 'ru' ? 'active' : ''} onClick={() => chooseLang('ru')}>RU</button><button className={lang === 'en' ? 'active' : ''} onClick={() => chooseLang('en')}>EN</button></div>
    </nav>
    <article className="story-page">
      <header className="story-intro"><p className="story-kicker">{t.kicker}</p><h1>{t.title}</h1><p className="story-lead">{t.lead}</p></header>
      <div className="story-copy">{t.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
      <div className="story-gallery">{photos.map((src, index) => <figure className="story-photo" key={src}><a href={src} target="_blank" rel="noreferrer"><img src={src} alt={t.captions[index]} /></a><figcaption>{t.captions[index]}</figcaption></figure>)}</div>
      <p className="story-note">{t.note}</p>
      <div className="story-cta"><a className="primary-action" href={`/?lang=${lang}#support`}><Heart />{t.support}</a></div>
    </article>
  </main>;
}
