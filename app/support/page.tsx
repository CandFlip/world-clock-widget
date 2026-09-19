'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Heart } from 'lucide-react';

const content = {
  ru: {
    back: 'На главную',
    kicker: 'Личная история',
    title: 'Почему я собираю поддержку',
    lead: 'В сентябре 2026 года у меня случился ишемический инсульт. Меня положили в больницу, провели обследования, лечение и, собственно, спасли.',
    paragraphs: [
      'Проблема в том, что всё это оказалось довольно дорогим. Больница, обследования, лекарства, дальнейшее лечение и восстановление. В итоге после больницы я вышел не только восстанавливаться, но ещё и разбираться с долгами, которые продолжают постепенно накапливаться.',
      'Поэтому здесь появилась возможность меня поддержать. Деньги пойдут в первую очередь на лечение, восстановление и на то, чтобы закрыть расходы, которые уже возникли из-за всей этой истории.',
      'Врачи при этом отдельно рекомендуют мне поменьше нервничать. Долги, как выяснилось, этому не очень способствуют.'
    ],
    captions: ['В больничной палате', 'Во время лечения', 'Снимок МРТ', 'Заключение МРТ', 'Перевод заключения врача'],
    note: 'Если вам полезен World Clock и хочется поддержать его автора, буду очень благодарен.',
    support: 'Поддержать проект'
  },
  en: {
    back: 'Back to the main page',
    kicker: 'A personal story',
    title: 'Why I am raising support',
    lead: 'In September 2026, I had an ischemic stroke. I was admitted to the hospital, examined, treated and, quite literally, saved.',
    paragraphs: [
      'The problem is that all of this turned out to be quite expensive: the hospital stay, examinations, medication, ongoing treatment and recovery. So when I left the hospital, I not only had to recover, but also deal with debts that continue to gradually pile up.',
      'That is why there is now a way to support me here. The money will go first and foremost toward treatment, recovery and covering the expenses that have already arisen because of all this.',
      'The doctors have also specifically advised me to avoid stress. As it turns out, debt does not help much with that.'
    ],
    captions: ['In the hospital room', 'During treatment', 'MRI scan', 'MRI report', 'Translation of the doctor\'s conclusion'],
    note: 'If World Clock is useful to you and you would like to support its author, I would be very grateful.',
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
