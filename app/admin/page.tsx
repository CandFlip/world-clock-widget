'use client';
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { parseIdeas, type Idea } from '@/lib/roadmap';
import { content as storyDefaults } from '@/lib/story';
import { siteCopy } from '@/lib/site-strings';

type Locale = 'ru' | 'en';
type Panel = 'overview' | 'content' | 'plans' | 'suggestions' | 'support' | 'users';
type Method = { id: string; label: string; instructions: string; image: string; url: string; active: string };
type Row = Record<string, string | null>;
type Data = { metrics: {registered:number;voters:number;suggestions:number;pendingContributions:number}; users:Row[]; suggestions:Row[]; contributions:Row[]; methods:Method[]; settings:Record<string,string> };
type Analytics = { started:string|null; totals:Array<{platform:string;clicks:number}>; regions:Array<{country:string;region:string;platform:string;clicks:number}>; days:Array<{day:string;platform:string;clicks:number}>; github:Array<{name:string;download_count:number}>|null; version:string };
const blankMethod = (): Method => ({id:'',label:'',instructions:'',image:'',url:'',active:'1'});
const essentialCopy = ['headline','intro','downloadNote','supportTitle','whySupport'] as const;

export default function AdminPage() {
  const [locale,setLocale] = useState<Locale>('ru');
  const [panel,setPanel] = useState<Panel>('overview');
  const [data,setData] = useState<Data|null>(null);
  const [analytics,setAnalytics] = useState<Analytics|null>(null);
  const [analyticsError,setAnalyticsError] = useState('');
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [saving,setSaving] = useState(false);
  const [method,setMethod] = useState<Method>(blankMethod);
  const [methodOpen,setMethodOpen] = useState(false);
  const [manual,setManual] = useState({amount:'',target:'author',reference:''});
  const [settings,setSettings] = useState<Record<string,string>>({});
  const [ideas,setIdeas] = useState<Idea[]>([]);
  const [copy,setCopy] = useState<{ru:Record<string,string>;en:Record<string,string>}>({ru:{},en:{}});
  const [baseline,setBaseline] = useState<{settings:Record<string,string>;ideas:Idea[];copy:{ru:Record<string,string>;en:Record<string,string>};method:Method}|null>(null);
  const dirty = Boolean(baseline && (JSON.stringify(ideas) !== JSON.stringify(baseline.ideas) || JSON.stringify(copy) !== JSON.stringify(baseline.copy) || ['ru','en'].some((lang) => ['story_title','author_story','story_note'].some((key) => settings[`${key}_${lang}`] !== baseline.settings[`${key}_${lang}`])) || (methodOpen && JSON.stringify(method) !== JSON.stringify(baseline.method))));
  const [suggestionFilter,setSuggestionFilter] = useState('pending');
  const tr = (ru:string,en:string) => locale === 'ru' ? ru : en;
  const load = useCallback(async (syncForms = true) => {
    const response = await fetch('/api/admin/overview');
    const body = await response.json() as Data & {error?:string};
    if (!response.ok) throw new Error(body.error || 'Не удалось загрузить данные / Could not load data');
    setData(body);
    if (syncForms) {
      const next = {...body.settings};
      for (const lang of ['ru','en'] as const) {
        next[`story_title_${lang}`] ??= storyDefaults[lang].title;
        next[`author_story_${lang}`] ??= [storyDefaults[lang].lead,...storyDefaults[lang].paragraphs].join('\n\n');
        next[`story_note_${lang}`] ??= storyDefaults[lang].note;
      }
      setSettings(next); setIdeas(parseIdeas(body.settings.roadmap_ideas));
      const nextCopy = {ru:siteCopy('ru',body.settings.ui_copy_ru),en:siteCopy('en',body.settings.ui_copy_en)};
      setCopy(nextCopy);setBaseline({settings:next,ideas:parseIdeas(body.settings.roadmap_ideas),copy:nextCopy,method:blankMethod()});
    }
    setError('');
  },[]);
  const loadAnalytics = useCallback(async () => {
    setAnalyticsError('');
    try {
      const response = await fetch('/api/admin/downloads');
      if (!response.ok) throw new Error('Statistics unavailable');
      setAnalytics(await response.json() as Analytics);
    } catch { setAnalyticsError('Статистика временно недоступна / Statistics temporarily unavailable'); }
  },[]);
  useEffect(() => {
    const saved = localStorage.getItem('wc-lang'); if (saved === 'en') queueMicrotask(() => setLocale('en'));
    queueMicrotask(() => {void load().then(() => loadAnalytics()).catch((e:Error) => setError(e.message));});
  },[load,loadAnalytics]);
  useEffect(() => {
    const warn = (event:BeforeUnloadEvent) => { if (dirty) {event.preventDefault();} };
    window.addEventListener('beforeunload',warn); return () => window.removeEventListener('beforeunload',warn);
  },[dirty]);
  function chooseLocale(next:Locale) {setLocale(next);localStorage.setItem('wc-lang',next);document.documentElement.setAttribute('lang',next);}
  async function manage(body:Record<string,unknown>) {
    setSaving(true);setNotice('');
    try {
      const response = await fetch('/api/admin/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result = await response.json() as {error?:string};
      if (!response.ok) throw new Error(result.error || tr('Не удалось сохранить','Could not save'));
      setBaseline((current) => {
        if (!current) return current;
        if (body.kind === 'settings') {
          const values = body.values as Record<string,string>;
          return {...current,settings:{...current.settings,...values},ideas:values.roadmap_ideas ? parseIdeas(values.roadmap_ideas) : current.ideas,copy:{ru:values.ui_copy_ru ? siteCopy('ru',values.ui_copy_ru) : current.copy.ru,en:values.ui_copy_en ? siteCopy('en',values.ui_copy_en) : current.copy.en}};
        }
        return body.kind === 'method' ? {...current,method:{...method}} : current;
      });
      await load(false);setNotice(tr('Сохранено. Изменения доступны на сайте.','Saved. Changes are available on the site.'));return true;
    } catch(e) {setNotice(e instanceof Error ? e.message : tr('Ошибка сохранения','Save failed'));return false;}
    finally {setSaving(false);}
  }
  function editIdea(id:string,change:Partial<Idea>) {setIdeas((items) => items.map((item) => item.id === id ? {...item,...change} : item));}
  function editSetting(key:string,value:string) {setSettings((current) => ({...current,[key]:value}));}
  async function imageChanged(file?:File) {
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type) || file.size > 500000) {setNotice(tr('Нужен PNG, JPEG, WebP или GIF до 500 КБ.','Use PNG, JPEG, WebP or GIF under 500 KB.'));return;}
    const reader = new FileReader();reader.onload = () => {setMethod((current) => ({...current,image:typeof reader.result === 'string' ? reader.result : ''}));};reader.readAsDataURL(file);
  }
  const status = (value:string|null) => ({pending:tr('На проверке','Pending review'),published:tr('Опубликовано','Published'),declined:tr('Скрыто','Hidden'),idea:tr('Идея','Idea'),funding:tr('Сбор средств','Funding'),planned:tr('Запланировано','Planned'),building:tr('В работе','In progress'),done:tr('Готово','Done'),hidden:tr('Скрыто','Hidden')} as Record<string,string>)[value || ''] || value;
  if (error) return <main className="admin-shell"><div className="admin-error" role="alert">{error}<p><a href="/">{tr('Вернуться на сайт и войти','Return to the site and sign in')}</a></p></div></main>;
  if (!data) return <main className="admin-shell"><p className="admin-loading">{tr('Загрузка…','Loading…')}</p></main>;
  const pending = data.suggestions.filter((item) => item.status === 'pending').length;
  const titles = {overview:tr('Обзор','Overview'),content:tr('Контент','Content'),plans:tr('Планы','Roadmap'),suggestions:tr('Предложения','Suggestions'),support:tr('Поддержка','Support'),users:tr('Пользователи','Users')};
  const copyLabels = {headline:tr('Главный заголовок','Main headline'),intro:tr('Вступление','Introduction'),downloadNote:tr('Примечание к скачиванию','Download note'),supportTitle:tr('Заголовок поддержки','Support heading'),whySupport:tr('Ссылка на историю','Story link')};
  return <main className="admin-shell admin-workspace">
    <header className="admin-header"><a href="/">{tr('На сайт','View site')}</a><strong>World Clock · {tr('Управление','Admin')}</strong><div className="language" aria-label={tr('Язык редактирования','Editing language')}>{(['ru','en'] as const).map((lang) => <button key={lang} aria-pressed={locale === lang} className={locale === lang ? 'active' : ''} onClick={() => chooseLocale(lang)}>{lang.toUpperCase()}</button>)}</div></header>
    <div className="admin-layout"><aside className="admin-sidebar"><nav aria-label={tr('Разделы админки','Admin sections')}>{(Object.keys(titles) as Panel[]).map((item) => <button key={item} aria-current={panel === item ? 'page' : undefined} onClick={() => {setPanel(item);setNotice('');}}>{titles[item]}{item === 'suggestions' && pending > 0 && <span>{pending}</span>}</button>)}</nav><p>{tr('Редактирование: русский','Editing: English')}<br />{tr('Переводы сохраняются отдельно.','Translations are saved separately.')}</p></aside>
    <div className="admin-main"><div className="admin-page-heading"><h1>{titles[panel]}</h1>{dirty && <span className="admin-badge">{tr('Есть несохранённые изменения','Unsaved changes')}</span>}</div><output className="admin-status" aria-live="polite">{notice}</output>
    {panel === 'overview' && <>
      <section className="metric-grid"><article><strong>{data.metrics.registered}</strong><p>{tr('пользователей','users')}</p></article><article><strong>{data.metrics.voters}</strong><p>{tr('голосов','votes')}</p></article><article><strong>{pending}</strong><p>{tr('идей на проверке','ideas awaiting review')}</p></article><article><strong>{analytics ? analytics.totals.reduce((sum,row) => sum+Number(row.clicks),0) : '—'}</strong><p>{tr('нажатий «Скачать»','download clicks')}</p></article></section>
      <Card title={tr('Скачивания','Downloads')}><div className="admin-form"><p className="admin-note">{tr('Клики на кнопки сайта; повторные нажатия учитываются. Это не число людей или установок.','Clicks on this site’s buttons, including repeated clicks. This is not a count of people or installations.')}</p>{analyticsError && <p role="alert">{analyticsError}</p>}<button disabled={saving} onClick={() => void loadAnalytics()}>{tr('Обновить статистику','Refresh statistics')}</button>
      {analytics && <><p>{tr('Учёт на сайте с','Site tracking since')} {analytics.started ? new Date(analytics.started).toLocaleString(locale) : '—'}</p><div className="metric-grid">{['windows','mac'].map((platform) => <article key={platform}><strong>{Number(analytics.totals.find((item) => item.platform === platform)?.clicks || 0)}</strong><p>{platform === 'windows' ? 'Windows' : 'Mac'}</p></article>)}</div>
      <h3>{tr('Страны и регионы','Countries and regions')}</h3><p className="admin-note">{tr('Приблизительно по сети посетителя; VPN может изменить регион. Если география недоступна, показано «Не определено». IP и имена посетителей не сохраняются.','Approximate network location; VPNs can change it. Unavailable location is marked “Unknown”. IP addresses and visitor names are not stored.')}</p><div className="admin-table-wrap"><table><thead><tr><th>{tr('Страна / регион','Country / region')}</th><th>{tr('Кнопка','Button')}</th><th>{tr('Клики','Clicks')}</th></tr></thead><tbody>{analytics.regions.map((row) => <tr key={`${row.country}-${row.region}-${row.platform}`}><td>{row.country === 'Unknown' ? tr('Не определено','Unknown') : row.country}{row.region ? ` · ${row.region}` : ''}</td><td>{row.platform === 'mac' ? 'Mac' : 'Windows'}</td><td>{row.clicks}</td></tr>)}</tbody></table>{!analytics.regions.length && <p>{tr('Пока нет нажатий.','No clicks recorded yet.')}</p>}</div>
      <details><summary>{tr('По дням за последние 30 дней (UTC)','Daily clicks over the last 30 days (UTC)')}</summary><div className="admin-table-wrap"><table><thead><tr><th>{tr('Дата','Date')}</th><th>{tr('Кнопка','Button')}</th><th>{tr('Клики','Clicks')}</th></tr></thead><tbody>{analytics.days.map((row) => <tr key={`${row.day}-${row.platform}`}><td>{row.day}</td><td>{row.platform === 'mac' ? 'Mac' : 'Windows'}</td><td>{row.clicks}</td></tr>)}</tbody></table></div></details>
      <h3>GitHub · {analytics.version}</h3><p className="admin-note">{tr('Существующие счётчики файлов GitHub включают скачивания из всех источников. Их нельзя складывать с кликами сайта; географии и числа уникальных людей в них нет.','Existing GitHub file counters include all sources. Do not add them to site clicks; they provide neither geography nor unique people.')}</p>{analytics.github === null ? <p>{tr('GitHub временно недоступен.','GitHub is temporarily unavailable.')}</p> : analytics.github.map((asset) => <div className="admin-stat-row" key={asset.name}><span>{asset.name}</span><strong>{asset.download_count}</strong></div>)}</>}
      </div></Card>
      <Card title={tr('Следующее действие','Next action')}><div className="admin-form"><p>{pending ? tr(`${pending} предложений ждут проверки. После публикации они появятся в общем голосовании.`,`${pending} suggestions await review. Publishing adds them to the voting list.`) : tr('Новых предложений на проверке нет.','No suggestions awaiting review.')}</p><button onClick={() => setPanel('suggestions')}>{tr('Открыть предложения','Open suggestions')}</button></div></Card>
    </>}
    {panel === 'content' && <>
      <Card title={tr('Главная страница','Home page')}><div className="admin-form"><p className="admin-note">{tr('Здесь только содержательные тексты. Подписи кнопок и служебные сообщения управляются интерфейсом.','Only editorial content is shown here. Button labels and service messages are handled by the interface.')}</p>{essentialCopy.map((key) => <Field key={key} label={copyLabels[key]}><textarea maxLength={1000} value={copy[locale][key] || ''} onChange={(e) => {setCopy({...copy,[locale]:{...copy[locale],[key]:e.target.value}});}} /></Field>)}<button disabled={saving} onClick={async () => {await manage({kind:'settings',values:{[`ui_copy_${locale}`]:JSON.stringify(copy[locale])}}); }}>{tr('Сохранить тексты','Save text')} · {locale.toUpperCase()}</button></div></Card>
      <Card title={tr('История автора','Author’s story')}><div className="admin-form">{[['story_title',tr('Заголовок','Title')],['author_story',tr('История','Story')],['story_note',tr('Заключение','Closing note')]].map(([key,label]) => <Field key={key} label={label}>{key === 'story_title' ? <input maxLength={200} value={settings[`${key}_${locale}`] || ''} onChange={(e) => editSetting(`${key}_${locale}`,e.target.value)} /> : <textarea rows={key === 'author_story' ? 10 : 3} maxLength={3000} value={settings[`${key}_${locale}`] || ''} onChange={(e) => editSetting(`${key}_${locale}`,e.target.value)} />}</Field>)}<button disabled={saving} onClick={async () => {await manage({kind:'settings',values:Object.fromEntries(['story_title','author_story','story_note'].map((key) => [`${key}_${locale}`,settings[`${key}_${locale}`] || '']))}); }}>{tr('Сохранить историю','Save story')} · {locale.toUpperCase()}</button></div></Card>
    </>}
    {panel === 'plans' && <Card title={tr('Карточки общего голосования','Voting cards')}><div className="admin-form"><p className="admin-note">{tr('У всех карточек одинаковые поля. Цель сбора необязательна. Скрытие сохраняет голоса; карточку можно вернуть. Если перевод ещё не заполнен, сайт показывает имеющийся текст.','All cards use the same fields. A funding goal is optional. Hiding preserves votes, so cards can be restored. Missing translations fall back to the available text.')}</p>
      {ideas.map((idea,index) => <details className="admin-idea" key={idea.id}><summary><strong>{idea.title[locale] || idea.title.ru || idea.title.en || tr('Новая карточка','New card')}</strong><span>{status(idea.status)}</span></summary><div className="admin-form">
        <Field label={tr('Название','Title')}><input maxLength={100} value={idea.title[locale]} onChange={(e) => editIdea(idea.id,{title:{...idea.title,[locale]:e.target.value}})} /></Field><Field label={tr('Описание','Description')}><textarea maxLength={1600} value={idea.description[locale]} onChange={(e) => editIdea(idea.id,{description:{...idea.description,[locale]:e.target.value}})} /></Field>
        <Field label={tr('Статус','Status')}><select value={idea.status} onChange={(e) => editIdea(idea.id,{status:e.target.value})}>{['idea','funding','planned','building','done','hidden'].map((value) => <option key={value} value={value}>{status(value)}</option>)}</select></Field>
        <details><summary>{tr('Цель сбора (необязательно)','Funding goal (optional)')}</summary><Field label={tr('Цель, USD · 0 — без сбора','Goal, USD · 0 for no funding')}><input type="number" min="0" max="1000000" step="1" value={idea.goalCents/100} onChange={(e) => editIdea(idea.id,{goalCents:Math.max(0,Math.round(Number(e.target.value)*100))})} /></Field></details>
        <div className="admin-actions"><button disabled={index === 0} aria-label={tr('Переместить выше','Move up')} onClick={() => {const next=[...ideas];[next[index-1],next[index]]=[next[index],next[index-1]];setIdeas(next);}}>{tr('Выше','Move up')}</button><button disabled={index === ideas.length-1} onClick={() => {const next=[...ideas];[next[index+1],next[index]]=[next[index],next[index+1]];setIdeas(next);}}>{tr('Ниже','Move down')}</button><button onClick={() => editIdea(idea.id,{status:idea.status === 'hidden' ? 'idea' : 'hidden'})}>{idea.status === 'hidden' ? tr('Вернуть','Restore') : tr('Скрыть','Hide')}</button></div>
      </div></details>)}
      <div className="admin-actions"><button onClick={() => {setIdeas([...ideas,{id:`idea-${crypto.randomUUID()}`,status:'idea',goalCents:0,title:{ru:'',en:''},description:{ru:'',en:''},cost:{ru:'',en:''}}]);}}>{tr('Добавить карточку','Add card')}</button><button disabled={saving} onClick={async () => {await manage({kind:'settings',values:{roadmap_ideas:JSON.stringify(ideas)}}); }}>{tr('Сохранить планы','Save roadmap')}</button></div>
    </div></Card>}
    {panel === 'suggestions' && <Card title={tr('Модерация предложений','Suggestion moderation')}><div className="admin-form"><p className="admin-note">{tr('Публикация добавляет идею в общий список с голосованием. Скрытие убирает её из списка, сохраняя идею и голоса. Автор видит статус своего предложения.','Publishing adds an idea to the voting list. Hiding removes it from the list while preserving its content and votes. Authors can see their suggestion’s status.')}</p><Field label={tr('Показать','Show')}><select value={suggestionFilter} onChange={(e) => setSuggestionFilter(e.target.value)}><option value="pending">{status('pending')}</option><option value="published">{status('published')}</option><option value="declined">{status('declined')}</option><option value="all">{tr('Все','All')}</option></select></Field></div><div className="response-list">{data.suggestions.filter((item) => suggestionFilter === 'all' || item.status === suggestionFilter).map((item) => <div className="response-row" key={item.id}><div><strong>{item.title}</strong><p>{item.problem}</p>{item.outcome && <p>{item.outcome}</p>}<small>{item.name} · {item.email}</small></div><span>{status(item.status)}</span><div className="admin-actions"><button disabled={saving || item.status === 'published'} onClick={() => void manage({kind:'suggestion',id:item.id,status:'published'})}>{tr('Опубликовать','Publish')}</button><button disabled={saving || item.status === 'declined'} onClick={() => void manage({kind:'suggestion',id:item.id,status:'declined'})}>{tr('Скрыть','Hide')}</button><button disabled={saving || item.status === 'pending'} onClick={() => void manage({kind:'suggestion',id:item.id,status:'pending'})}>{tr('На проверку','Review again')}</button></div></div>)}</div>{!data.suggestions.some((item) => suggestionFilter === 'all' || item.status === suggestionFilter) && <p className="admin-empty">{tr('В этом разделе пока нет предложений.','No suggestions in this view.')}</p>}</Card>}
    {panel === 'support' && <>
      <Card title={tr('Способы поддержки','Support methods')}><div className="response-list">{data.methods.map((item) => <div className="response-row" key={item.id}><div><strong>{item.label}</strong><p>{item.instructions}</p></div><span>{item.active === '1' ? tr('На сайте','Visible') : tr('Скрыт','Hidden')}</span><div className="admin-actions"><button disabled={saving} onClick={() => {setMethod({...item});setBaseline((current) => current ? {...current,method:{...item}} : current);setMethodOpen(true);}}>{tr('Изменить','Edit')}</button><button disabled={saving} onClick={() => void manage({kind:'method',...item,active:item.active !== '1'})}>{item.active === '1' ? tr('Скрыть','Hide') : tr('Показать','Show')}</button></div></div>)}</div><div className="admin-form"><button onClick={() => {setMethod(blankMethod());setBaseline((current) => current ? {...current,method:blankMethod()} : current);setMethodOpen(true);}}>{tr('Добавить способ','Add method')}</button></div>
      {methodOpen && <div className="admin-form"><h3>{method.id ? tr('Редактировать способ','Edit method') : tr('Новый способ','New method')}</h3><Field label={tr('Название','Name')}><input maxLength={80} value={method.label} onChange={(e) => {setMethod({...method,label:e.target.value});}} /></Field><Field label={tr('Реквизиты','Payment details')}><textarea maxLength={1000} value={method.instructions} onChange={(e) => {setMethod({...method,instructions:e.target.value});}} /></Field><Field label={tr('QR-фото (до 500 КБ)','QR image (up to 500 KB)')}><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => void imageChanged(e.target.files?.[0])} /></Field>{method.image && <div className="admin-image"><Image unoptimized width={120} height={120} src={method.image} alt={tr('QR-код','QR code')} /><button onClick={() => {setMethod({...method,image:''});}}>{tr('Убрать фото','Remove image')}</button></div>}<Field label={tr('Ссылка (необязательно)','Link (optional)')}><input type="url" value={method.url} onChange={(e) => {setMethod({...method,url:e.target.value});}} /></Field><div className="admin-actions"><button disabled={saving || !method.label.trim()} onClick={async () => {if (await manage({kind:'method',...method,active:method.active === '1'})) {setMethodOpen(false);}}}>{tr('Сохранить','Save')}</button><button onClick={() => setMethodOpen(false)}>{tr('Закрыть редактор','Close editor')}</button>{method.id && <button disabled={saving} onClick={() => {if (window.confirm(tr('Удалить этот способ поддержки?','Delete this support method?'))) void manage({kind:'method-delete',id:method.id}).then((ok) => {if (ok) setMethodOpen(false);});}}>{tr('Удалить','Delete')}</button>}</div></div>}
      </Card>
      <Card title={tr('Полученные переводы','Received contributions')}><div className="admin-form"><details><summary>{tr('Добавить перевод вручную','Record a contribution manually')}</summary><div className="admin-form"><p className="admin-note">{tr('Только для денег, которые уже поступили.','Only record money already received.')}</p><Field label={tr('Сумма, USD','Amount, USD')}><input inputMode="decimal" value={manual.amount} onChange={(e) => setManual({...manual,amount:e.target.value})} /></Field><Field label={tr('Назначение','Target')}><select value={manual.target} onChange={(e) => setManual({...manual,target:e.target.value})}><option value="author">{tr('Поддержка автора','Support the author')}</option>{ideas.filter((idea) => idea.goalCents > 0).map((idea) => <option key={idea.id} value={idea.id}>{idea.title[locale] || idea.title.ru || idea.title.en}</option>)}</select></Field><Field label={tr('Комментарий','Reference')}><input value={manual.reference} onChange={(e) => setManual({...manual,reference:e.target.value})} /></Field><button disabled={saving || !manual.amount} onClick={async () => {if (await manage({kind:'manual-contribution',...manual})) setManual({...manual,amount:'',reference:''});}}>{tr('Записать перевод','Record contribution')}</button></div></details></div>
      <div className="response-list">{data.contributions.map((item) => <div className="response-row" key={item.id}><div><strong>${Number(item.amount_cents)/100} · {item.target_id === 'author' ? tr('Автор','Author') : ideas.find((idea) => idea.id === item.target_id)?.title[locale] || item.target_id}</strong><p>{item.provider} · {item.reference}</p></div><span>{item.status}</span><div><small>{item.verified_at ? new Date(item.verified_at).toLocaleString(locale) : tr('Не подтверждён','Unconfirmed')}</small>{item.provider === 'admin-manual' && <button disabled={saving} onClick={() => {if (window.confirm(tr('Удалить вручную добавленный перевод?','Delete this manually recorded contribution?'))) void manage({kind:'manual-contribution-delete',id:item.id});}}>{tr('Удалить запись','Delete record')}</button>}</div></div>)}</div>{!data.contributions.length && <p className="admin-empty">{tr('Переводов пока нет.','No contributions yet.')}</p>}
      </Card>
    </>}
    {panel === 'users' && <Card title={tr('Пользователи и выбор','Users and votes')}><div className="response-list">{data.users.map((item) => <div className="response-row" key={item.id}><div><strong>{item.name}</strong><p>{item.email}</p></div><span>{item.vote ? ideas.find((idea) => idea.id === item.vote)?.title[locale] || data.suggestions.find((idea) => `suggestion-${idea.id}` === item.vote)?.title || tr('Скрытая карточка','Hidden card') : tr('Без голоса','No vote')}</span><small>{item.last_seen && new Date(item.last_seen).toLocaleString(locale)}</small></div>)}</div></Card>}
    </div></div>
  </main>;
}
function Card({title,children}:{title:string;children:React.ReactNode}) {return <section className="responses-card"><header className="responses-heading"><h2>{title}</h2></header>{children}</section>;}
function Field({label,children}:{label:string;children:React.ReactNode}) {return <label>{label}{children}</label>;}
