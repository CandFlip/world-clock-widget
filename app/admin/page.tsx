'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { parseIdeas, type Idea } from '@/lib/roadmap';
import { content as storyDefaults } from '@/lib/story';
import { siteCopy, strings } from '@/lib/site-strings';

type Method = { id: string; label: string; instructions: string; image: string; url: string; active: string };
type Row = Record<string, string | null>;
type Data = { metrics: { registered: number; voters: number; suggestions: number; pendingContributions: number }; users: Row[]; suggestions: Row[]; contributions: Row[]; methods: Method[]; settings: Record<string, string> };
const blankMethod = (): Method => ({ id: '', label: '', instructions: '', image: '', url: '', active: '1' });

export default function AdminPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState<Method>(blankMethod);
  const [manual, setManual] = useState({ amount: '', target: 'mobile-official', reference: '' });
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [copy, setCopy] = useState<{ ru: Record<string, string>; en: Record<string, string> }>({ ru: {}, en: {} });
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/overview');
    const body = await response.json() as Data & { error?: string };
    if (!response.ok) throw new Error(body.error || 'Не удалось загрузить данные');
    setData(body);
    setSettings({
      ...body.settings,
      story_title_ru: body.settings?.story_title_ru ?? storyDefaults.ru.title,
      story_title_en: body.settings?.story_title_en ?? storyDefaults.en.title,
      author_story_ru: body.settings?.author_story_ru ?? [storyDefaults.ru.lead, ...storyDefaults.ru.paragraphs].join('\n\n'),
      author_story_en: body.settings?.author_story_en ?? [storyDefaults.en.lead, ...storyDefaults.en.paragraphs].join('\n\n'),
      story_note_ru: body.settings?.story_note_ru ?? storyDefaults.ru.note,
      story_note_en: body.settings?.story_note_en ?? storyDefaults.en.note,
    });
    setIdeas(parseIdeas(body.settings?.roadmap_ideas));
    setCopy({ ru: siteCopy('ru', body.settings?.ui_copy_ru), en: siteCopy('en', body.settings?.ui_copy_en) });
    setError('');
  }, []);
  useEffect(() => { void load().catch((e) => setError(e.message)); }, [load]);
  async function manage(body: Record<string, unknown>) {
    setSaving(true); setNotice('');
    try {
      const response = await fetch('/api/admin/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Не удалось сохранить');
      await load();
      setNotice('Сохранено');
      return true;
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Ошибка сохранения'); return false; }
    finally { setSaving(false); }
  }
  async function imageChanged(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 500_000) { setNotice('Нужен PNG, JPEG, WebP или GIF размером до 500 КБ.'); return; }
    const reader = new FileReader();
    reader.onload = () => setMethod((current) => ({ ...current, image: typeof reader.result === 'string' ? reader.result : '' }));
    reader.readAsDataURL(file);
  }
  if (error) return <main className="admin-shell"><div className="admin-error">{error}<br /><Link href="/">Вернуться и войти</Link></div></main>;
  if (!data) return <main className="admin-shell"><div className="admin-loading">Загрузка…</div></main>;
  return <main className="admin-shell">
    <header className="admin-header"><Link href="/">← На сайт</Link><strong>World Clock · Админка</strong></header>
    <section className="admin-intro"><p className="section-kicker">Закрытый раздел</p><h1>Управление сайтом</h1><p>Настройки публикации, способы поддержки и предложения пользователей.</p></section>
    <section className="metric-grid"><article><strong>{data.metrics.registered}</strong><p>зарегистрировано</p></article><article><strong>{data.metrics.voters}</strong><p>проголосовало</p></article><article><strong>{data.metrics.suggestions}</strong><p>идей</p></article><article><strong>{data.metrics.pendingContributions}</strong><p>платежей обрабатывается</p></article></section>
    <output className="admin-status">{notice}</output>
    <Card title="Тексты главной страницы"><p className="admin-note">Подписи, заголовки и сообщения редактируются отдельно для двух языков.</p><div className="admin-form"><div className="admin-copy-grid">{Object.keys(strings.ru).map((key) => <div className="admin-copy-row" key={key}><strong>{strings.ru[key as keyof typeof strings.ru]}</strong>{(['ru', 'en'] as const).map((locale) => <label key={locale}>{locale.toUpperCase()}<input maxLength={1000} value={copy[locale][key] || ''} onChange={(e) => setCopy({ ...copy, [locale]: { ...copy[locale], [key]: e.target.value } })} /></label>)}</div>)}</div><button disabled={saving} onClick={() => void manage({ kind: 'settings', values: { ui_copy_ru: JSON.stringify(copy.ru), ui_copy_en: JSON.stringify(copy.en) } })}>Сохранить тексты</button></div></Card>
    <Card title="История автора"><p className="admin-note">Текст страницы «Почему я собираю?». Каждый абзац отделяйте пустой строкой.</p><div className="admin-form">
      {(['ru', 'en'] as const).map((locale) => <div className="admin-story-fields" key={locale}><h3>{locale === 'ru' ? 'Русский' : 'English'}</h3><label>Заголовок<input value={settings[`story_title_${locale}`] || ''} onChange={(e) => setSettings({ ...settings, [`story_title_${locale}`]: e.target.value })} /></label><label>История<textarea rows={8} value={settings[`author_story_${locale}`] || ''} onChange={(e) => setSettings({ ...settings, [`author_story_${locale}`]: e.target.value })} /></label><label>Заключение<textarea rows={3} value={settings[`story_note_${locale}`] || ''} onChange={(e) => setSettings({ ...settings, [`story_note_${locale}`]: e.target.value })} /></label></div>)}
      <button disabled={saving} onClick={() => void manage({ kind: 'settings', values: { author_story_ru: settings.author_story_ru || '', author_story_en: settings.author_story_en || '', story_title_ru: settings.story_title_ru || '', story_title_en: settings.story_title_en || '', story_note_ru: settings.story_note_ru || '', story_note_en: settings.story_note_en || '' } })}>Сохранить историю</button>
    </div></Card>
    <Card title="Планы и голосование"><p className="admin-note">Изменения карточек сохраняются вместе. Голоса удалённой карточки перестанут показываться.</p><div className="admin-form">
      {ideas.map((idea, index) => <div className="admin-idea" key={idea.id}><div className="admin-idea-heading"><strong>{index + 1}. {idea.title.ru || 'Новая карточка'}</strong><div className="admin-actions"><button disabled={index === 0} onClick={() => setIdeas((items) => { const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>↑</button><button disabled={index === ideas.length - 1} onClick={() => setIdeas((items) => { const next = [...items]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })}>↓</button><button onClick={() => { if (window.confirm(`Удалить «${idea.title.ru}»?`)) setIdeas(ideas.filter((item) => item.id !== idea.id)); }}>Удалить</button></div></div>
        {(['ru', 'en'] as const).map((locale) => <div className="admin-idea-fields" key={locale}><label>Название · {locale.toUpperCase()}<input value={idea.title[locale]} onChange={(e) => setIdeas(ideas.map((item) => item.id === idea.id ? { ...item, title: { ...item.title, [locale]: e.target.value } } : item))} /></label><label>Описание · {locale.toUpperCase()}<textarea value={idea.description[locale]} onChange={(e) => setIdeas(ideas.map((item) => item.id === idea.id ? { ...item, description: { ...item.description, [locale]: e.target.value } } : item))} /></label></div>)}
        {idea.id === 'mobile-official' && <label>Цель для лицензий, USD<input type="number" min="0" step="1" value={idea.goalCents / 100} onChange={(e) => setIdeas(ideas.map((item) => item.id === idea.id ? { ...item, goalCents: Math.max(0, Math.round(Number(e.target.value) * 100)) } : item))} /></label>}
      </div>)}<div className="admin-actions"><button onClick={() => setIdeas([...ideas, { id: `idea-${crypto.randomUUID()}`, status: 'idea', goalCents: 0, title: { ru: '', en: '' }, description: { ru: '', en: '' }, cost: { ru: '', en: '' } }])}>Добавить карточку</button><button disabled={saving} onClick={() => void manage({ kind: 'settings', values: { roadmap_ideas: JSON.stringify(ideas) } })}>Сохранить планы</button></div>
    </div></Card>
    <Card title="Способы поддержки"><p className="admin-note">Название, реквизиты и QR-фото появятся в окне «Поддержать». Ссылку можно добавить при необходимости.</p>
      <div className="response-list">{data.methods.map((item) => <div className="response-row" key={item.id}><div><strong>{item.label}</strong><p>{item.instructions || 'Без реквизитов'}</p><small>{item.active === '1' ? 'Показан на сайте' : 'Скрыт'}{item.image ? ' · QR-фото' : ''}</small></div><span>{item.url || ''}</span><div className="admin-actions"><button disabled={saving} onClick={() => { setMethod({ ...item }); setNotice('Редактирование: ' + item.label); document.getElementById('method-editor')?.scrollIntoView({ behavior: 'smooth' }); }}>Изменить</button><button disabled={saving} onClick={() => void manage({ kind: 'method', ...item, active: item.active !== '1' })}>{item.active === '1' ? 'Скрыть' : 'Показать'}</button><button disabled={saving} onClick={() => { if (window.confirm(`Удалить «${item.label}»?`)) void manage({ kind: 'method-delete', id: item.id }); }}>Удалить</button></div></div>)}</div>
      <div className="admin-form" id="method-editor"><h3>{method.id ? 'Изменить способ' : 'Добавить способ'}</h3>
        <label>Название<input maxLength={80} placeholder="Банк или способ оплаты" value={method.label} onChange={(e) => setMethod({ ...method, label: e.target.value })} /></label>
        <label>Номер или реквизиты<textarea maxLength={1000} placeholder="Номер карты, кошелёк или инструкция" value={method.instructions} onChange={(e) => setMethod({ ...method, instructions: e.target.value })} /></label>
        <label>QR-фото (необязательно)<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => void imageChanged(e.target.files?.[0])} /></label>
        {method.image && <div className="admin-image"><Image unoptimized width={120} height={120} src={method.image} alt="QR-код способа оплаты" /><button onClick={() => setMethod({ ...method, image: '' })}>Убрать фото</button></div>}
        <label>Ссылка на оплату (необязательно)<input type="url" value={method.url} onChange={(e) => setMethod({ ...method, url: e.target.value })} /></label>
        <div className="admin-actions"><button disabled={saving || !method.label.trim()} onClick={async () => { if (await manage({ kind: 'method', ...method, active: method.active === '1' })) setMethod(blankMethod()); }}>{method.id ? 'Сохранить' : 'Добавить'}</button>{method.id && <button onClick={() => setMethod(blankMethod())}>Отмена</button>}</div>
      </div>
    </Card>
    <Card title="Добавить полученный перевод"><p className="admin-note">Только для денег, которые уже поступили.</p><div className="admin-form admin-form-inline"><label>Сумма, USD<input inputMode="decimal" value={manual.amount} onChange={(e) => setManual({ ...manual, amount: e.target.value })} /></label><label>Назначение<select value={manual.target} onChange={(e) => setManual({ ...manual, target: e.target.value })}><option value="mobile-official">Лицензии iOS и Android</option><option value="author">Поддержка автора</option></select></label><label>Комментарий<input value={manual.reference} onChange={(e) => setManual({ ...manual, reference: e.target.value })} /></label><button disabled={saving} onClick={async () => { if (await manage({ kind: 'manual-contribution', ...manual })) setManual({ ...manual, amount: '', reference: '' }); }}>Добавить</button></div></Card>
    <Card title="Предложения пользователей"><div className="response-list">{data.suggestions.length ? data.suggestions.map((item) => <div className="response-row" key={item.id}><div><strong>{item.title}</strong><p>{item.name} · {item.email}</p><p>{item.problem}</p><small>{item.outcome}</small></div><strong>{item.status}</strong><div className="admin-actions"><button disabled={saving} onClick={() => void manage({ kind: 'suggestion', id: item.id, status: 'published' })}>Опубликовать</button><button disabled={saving} onClick={() => void manage({ kind: 'suggestion', id: item.id, status: 'declined' })}>Скрыть</button><button disabled={saving} onClick={() => { if (window.confirm('Удалить предложение?')) void manage({ kind: 'suggestion-delete', id: item.id }); }}>Удалить</button></div></div>) : <p className="admin-loading">Пока нет идей</p>}</div></Card>
    <Card title="Платёжный журнал"><div className="response-list">{data.contributions.length ? data.contributions.map((item) => <div className="response-row" key={item.id}><div><strong>${Number(item.amount_cents || 0) / 100} → {item.target_id}</strong><p>{item.provider}</p><small>{item.reference}</small></div><strong>{item.status}</strong><div><small>{item.verified_at ? new Date(item.verified_at).toLocaleString() : 'не подтверждён'}</small>{item.provider === 'admin-manual' && <button disabled={saving} onClick={() => { if (window.confirm('Удалить вручную добавленный перевод?')) void manage({ kind: 'manual-contribution-delete', id: item.id }); }}>Удалить запись</button>}</div></div>) : <p className="admin-loading">Пока нет платежей</p>}</div></Card>
    <Card title="Пользователи"><div className="response-list">{data.users.map((item) => <div className="response-row" key={item.id}><div><strong>{item.name}</strong><p>{item.email}</p></div><span>{item.vote || 'Без голоса'}</span><small>{item.last_seen && new Date(item.last_seen).toLocaleString()}</small></div>)}</div></Card>
  </main>;
}
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <section className="responses-card"><header className="responses-heading"><h2>{title}</h2></header>{children}</section>; }
