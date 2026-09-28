'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Heart } from 'lucide-react';
import { content } from '@/lib/story';

const photos = ['/story/hospital-room.jpg', '/story/hospital-iv.jpg', '/story/mri-scan.jpg', '/story/mri-report.jpg', '/story/translated-result.jpg'];

export default function SupportStoryPage() {
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [siteContent, setSiteContent] = useState<Record<string, string>>({});

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('lang');
    const saved = localStorage.getItem('wc-lang');
    const next = requested === 'en' || (requested !== 'ru' && saved === 'en') ? 'en' : 'ru';
    setLang(next);
    document.documentElement.lang = next;
    void fetch('/api/site-content').then((response) => response.ok ? response.json() as Promise<Record<string, string>> : {}).then(setSiteContent).catch(() => {});
  }, []);

  const t = content[lang];
  const storyText = siteContent[`author_story_${lang}`]?.trim();
  const story = storyText ? storyText.split(/\n\s*\n/).filter(Boolean) : undefined;
  const title = siteContent[`story_title_${lang}`]?.trim() || t.title;
  const note = siteContent[`story_note_${lang}`]?.trim() || t.note;
  const lead = story?.[0] || t.lead;
  const paragraphs: readonly string[] = story?.slice(1) || t.paragraphs;
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
      <header className="story-intro"><p className="story-kicker">{t.kicker}</p><h1>{title}</h1><p className="story-lead">{lead}</p></header>
      <div className="story-copy">{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
      <div className="story-gallery">{photos.map((src, index) => <figure className="story-photo" key={src}><a href={src} target="_blank" rel="noreferrer"><img src={src} alt={t.captions[index]} /></a><figcaption>{t.captions[index]}</figcaption></figure>)}</div>
      <p className="story-note">{note}</p>
      <div className="story-cta"><a className="primary-action" href={`/?lang=${lang}#support`}><Heart />{t.support}</a></div>
    </article>
  </main>;
}
