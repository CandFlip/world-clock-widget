const trashIcon = `<svg class="trash-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><g class="trash-lid"><path d="M4 6h16M9 6V4h6v2"/></g><path d="M6 6l1 14h10l1-14M10 10v6M14 10v6"/></svg>`;
const quickAlarmIcon = `<svg class="quick-alarm-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="13" r="7"/><path d="M12 9v4l2.5 1.5M5.5 3.5 2.5 6.5M18.5 3.5l3 3M7 20l-1.5 2M17 20l1.5 2"/></svg>`;
const cityReminderIcon = `<svg class="city-reminder-glyph" viewBox="0 0 14 14" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round" aria-hidden="true" focusable="false"><path class="alarm-bells" d="M.5 3A2.5 2.5 0 0 1 3 .5L4 1.5 1.5 4ZM11 .5A2.5 2.5 0 0 1 13.5 3L12.5 4 10 1.5Z"/><circle cx="7" cy="8" r="5.5"/><path class="alarm-hands" d="M7 4V8H11" fill="none" stroke="#0b0e14" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const quickChevronIcon = `<svg class="quick-chevron-glyph" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m3 6 5 5 5-5"/></svg>`;
const copyIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/></svg>`;
const checkUpdateIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.8 9A7 7 0 0 1 18 6.8L20 12M4 12l2 5.2A7 7 0 0 0 18.2 15"/></svg>`;
const downloadUpdateIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/></svg>`;
const meetingOutlineSvg = `<svg class="meeting-outline" aria-hidden="true" focusable="false"><rect x="1" y="1" width="100%" height="100%" rx="8" ry="8"/></svg>`;
function sunGlyph(horizon = false) {
  const radius = 4;
  const upperRays = '<path d="M12 2v3M5 5l2 2M17 7l2-2"/>';
  const sideRays = '<path d="M2 12h3M19 12h3"/>';
  // Lower the horizon by 15% of the glyph's 20-unit height; keep the sun and water fixed.
  const waterline = 12 + radius * .2 + (22 - 2) * .15;
  const halfChord = Math.sqrt(radius * radius - (waterline - 12) ** 2);
  const disc = horizon ? `<path d="M${12-halfChord} ${waterline}a${radius} ${radius} 0 1 1 ${halfChord*2} 0"/>` : `<circle cx="12" cy="12" r="${radius}"/>`;
  const lower = horizon ? `<path d="M2 ${waterline}h20M5 22h14"/>` : '<path d="M12 19v3M17 17l2 2M5 19l2-2"/>';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><g>${disc}${upperRays}${sideRays}${lower}</g></svg>`;
}
const sunIcon = sunGlyph();
const horizonIcon = sunGlyph(true);
const host = window.chrome?.webview;
const send = message => host?.postMessage(message);
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const catalogKey = key => (key || 'Etc/UTC').split('~~')[0];
const zoneOf = key => catalogKey(key).split('@@')[0];
const defaultAvailability = Object.freeze({okayStart:'07:00',workingStart:'09:00',workingEnd:'18:00',dndStart:'22:00'});
const baseScheduleKey = '__base_schedule__';

const defaults = {
  timezones: ['Europe/Moscow', 'Asia/Vladivostok', 'Asia/Almaty'],
  favorites: ['Asia/Tokyo', 'America/New_York', 'Europe/London', 'Asia/Dubai', 'Australia/Sydney', 'Europe/Berlin'],
  settings: {
    top_clock_mode: 'auto', manual_top_timezone: 'Asia/Ho_Chi_Minh', base_timezone: '',
    overlay_direction: 'right', time_format: 'system', theme: 'system', language: 'ru', interface_scale: 100, interface_scale_default: true,
    availabilityDefault: {...defaultAvailability}, baseAvailabilityOverride: null,
    reminder_intervals: [15, 30, 60], autostart: true,
  },
  cityContext: {},
  window: {},
};

let config = structuredClone(defaults);
let reminders = {lead: 15, entries: []};
let version = 'native';
const updateState = {checking:false, release:null};
const updateCheckKey = 'worldClockLastUpdateCheck';
const updateReleaseKey = 'worldClockLatestRelease';
const updateCheckPeriod = 24 * 60 * 60 * 1000;
let offset = 0;
let quickAtNowOpen = false;
let meetingMode = false;
let meetingSelected = new Set();
let meetingResult = null;
let meetingEarlier = null;
let meetingShowingEarlier = false;
let meetingWindowCache = {key:'', minutes:0};
let liveOffset = null;
let pendingLead = null;
let cityDragIndex = -1;
let expandedCityKey = null;
let expandedBase = false;
let suppressCityClick = false;
let alertId = null;
let lastBeep = 0;
let alarmAudio = null;
let alarmSoundGeneration = 0;
let soundLibrary = [];
let soundLibraryReady = Promise.resolve();
const soundUrls = new Map();
const alarmSoundDatabase = 'WorldClockWidgetAlarmSound';

function soundDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(alarmSoundDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sounds');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function soundStorage(action, key, value) {
  const db = await soundDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('sounds', ['get','getAll'].includes(action) ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('sounds');
      const request = action === 'put' ? store.put(value, key) : action === 'getAll' ? store.getAll() : store[action](key);
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('aborted'));
    });
  } finally { db.close(); }
}

async function loadSoundLibrary() {
  try {
    const legacy = await soundStorage('get', 'alarm');
    if (legacy && !legacy.id) {
      const migrated = {id:'imported-legacy', name:config.settings.alarm_sound_name || 'Audio', favorite:true, blob:legacy};
      await soundStorage('put', migrated.id, migrated);
      config.settings.alarm_sound_id ||= migrated.id;
      delete config.settings.alarm_sound_name;
      saveConfig();
      await soundStorage('delete', 'alarm');
    }
    soundLibrary = (await soundStorage('getAll')).filter(sound => sound?.id && sound.blob);
  } catch { console.warn('Reminder sound library could not be loaded'); }
}

function defaultSoundId() {
  const id = config.settings.alarm_sound_id;
  return soundLibrary.some(sound => sound.id === id) ? id : 'system';
}
function resolvedSoundId(entry) {
  const id = entry?.sound_id && entry.sound_id !== 'default' ? entry.sound_id : defaultSoundId();
  return id === 'system' || soundLibrary.some(sound => sound.id === id) ? id : 'system';
}
function soundName(id) {
  if (id === 'default') return lang() === 'ru' ? 'Общий звук' : 'Default sound';
  if (id === 'system') return lang() === 'ru' ? 'Звук системы' : 'System sound';
  return soundLibrary.find(sound => sound.id === id)?.name || soundName('system');
}
function stopAlarmSound() {
  alarmSoundGeneration++;
  if (alarmAudio) { alarmAudio.pause(); alarmAudio.currentTime = 0; alarmAudio = null; }
  send('stopBeep');
}
async function playAlarmSound(entry) {
  stopAlarmSound();
  const generation = alarmSoundGeneration;
  await soundLibraryReady;
  if (generation !== alarmSoundGeneration) return;
  const id = resolvedSoundId(entry);
  if (id === 'system') { send('systemBeep'); return; }
  const sound = soundLibrary.find(sound => sound.id === id);
  if (!sound) { send('systemBeep'); return; }
  try {
    if (!soundUrls.has(id)) soundUrls.set(id, URL.createObjectURL(sound.blob));
    const audio = new Audio(soundUrls.get(id));
    alarmAudio = audio;
    audio.volume = 1;
    audio.onerror = () => { if (generation === alarmSoundGeneration) { alarmAudio = null; send('systemBeep'); } };
    await audio.play();
  } catch {
    if (generation === alarmSoundGeneration) { alarmAudio = null; send('systemBeep'); }
  }
}
function soundChoicesHtml(selected = 'default') {
  if (selected === 'builtin') selected = 'system';
  const options = ['default','system', ...soundLibrary.filter(sound => sound.favorite || sound.id === selected).map(sound => sound.id)];
  return options.map(id => `<button type="button" class="sound-choice ${id === selected ? 'selected' : ''}" data-sound-choice="${esc(id)}" aria-pressed="${id === selected}">${esc(soundName(id))}</button>`).join('');
}
function bindSoundChoices(root, selected = 'default') {
  root.dataset.soundId = selected === 'builtin' ? 'system' : selected;
  root.querySelectorAll('[data-sound-choice]').forEach(button => button.onclick = () => {
    root.dataset.soundId = button.dataset.soundChoice;
    root.querySelectorAll('[data-sound-choice]').forEach(tab => {
      const active = tab === button;
      tab.classList.toggle('selected', active); tab.setAttribute('aria-pressed', String(active));
    });
  });
}
let detailId = null;
let applyingRemoteSync = false;
let platform = 'windows';
const defaultHotkeyForPlatform = () => ({modifiers: 1, key: 32});
let activeHotkey = {...defaultHotkeyForPlatform()};
let pendingHotkey = null;
let pendingHotkeyMode = null;
let hotkeySelection = 'default';
let capturingHotkey = false;
let candidateHotkey = null;
let capturedModifiers = 0;
const specialHotkeyKeys = {
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Space: 32,
  PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Insert: 45, Delete: 46,
  NumpadMultiply: 106, NumpadAdd: 107, NumpadSubtract: 109,
  NumpadDecimal: 110, NumpadDivide: 111, NumpadEnter: 108,
  Semicolon: 186, Equal: 187, Comma: 188, Minus: 189, Period: 190,
  Slash: 191, Backquote: 192, BracketLeft: 219, Backslash: 220,
  BracketRight: 221, Quote: 222,
};
const hotkeyNames = Object.fromEntries(Object.entries(specialHotkeyKeys).map(([name, key]) => [key, name.replace('Arrow', '').replace('Numpad', 'Num ')]));
Object.assign(hotkeyNames, {32:'Space', 186:';', 187:'=', 188:',', 189:'−', 190:'.', 191:'/', 192:'`', 219:'[', 220:'\\', 221:']', 222:"'", 1001:'Mouse 4', 1002:'Mouse 5'});
const macHotkeyNames = {
  8: 'Delete', 9: 'Tab', 13: 'Return', 27: 'Escape', 32: 'Space',
  33: 'Page Up', 34: 'Page Down', 35: 'End', 36: 'Home',
  37: 'Left Arrow', 38: 'Up Arrow', 39: 'Right Arrow', 40: 'Down Arrow',
  46: 'Forward Delete', 106: 'Keypad Multiply', 107: 'Keypad Plus',
  108: 'Keypad Enter', 109: 'Keypad Minus', 110: 'Keypad Decimal', 111: 'Keypad Divide',
  186:';', 187:'=', 188:',', 189:'−', 190:'.', 191:'/', 192:'`', 219:'[', 220:'\\', 221:']', 222:"'", 1001:'Mouse 4', 1002:'Mouse 5',
};

function hotkeyFromEvent(event) {
  if ((event.metaKey && platform !== 'macos') || event.getModifierState?.('AltGraph')) return null;
  const code = event.code;
  if (platform === 'macos' && code === 'Insert') return null;
  let key = specialHotkeyKeys[code];
  if (/^Key[A-Z]$/.test(code)) key = code.charCodeAt(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.charCodeAt(5);
  else if (/^Numpad[0-9]$/.test(code)) key = 96 + Number(code.slice(6));
  else if (/^F([1-9]|1[01]|1[3-9]|20)$/.test(code)) key = 111 + Number(code.slice(1));
  if (!key) return null;
  const modifiers = (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.shiftKey ? 4 : 0) | (event.metaKey ? 8 : 0);
  if (!modifiers && [8,9,13,27,32,33,34,35,36,37,38,39,40,45,46].includes(key)) return null;
  return {modifiers, key};
}

function hotkeyLabel(hotkey = activeHotkey) {
  const key = hotkey.key;
  const name = (key >= 48 && key <= 90) ? String.fromCharCode(key) :
    (key >= 96 && key <= 105) ? `${platform === 'macos' ? 'Keypad' : 'Num'} ${key - 96}` :
    (key >= 112 && key <= 131) ? `F${key - 111}` : (platform === 'macos' ? macHotkeyNames[key] : hotkeyNames[key]) || '?';
  const modifiers = platform === 'macos'
    ? [(hotkey.modifiers & 2) && '⌃', (hotkey.modifiers & 1) && '⌥', (hotkey.modifiers & 4) && '⇧', (hotkey.modifiers & 8) && '⌘']
    : [(hotkey.modifiers & 2) && 'Ctrl', (hotkey.modifiers & 1) && 'Alt', (hotkey.modifiers & 4) && 'Shift'];
  return [...modifiers, name].filter(Boolean).join('+');
}
function modifierLabel(modifiers) {
  return (platform === 'macos'
    ? [(modifiers & 2) && '⌃', (modifiers & 1) && '⌥', (modifiers & 4) && '⇧', (modifiers & 8) && '⌘']
    : [(modifiers & 2) && 'Ctrl', (modifiers & 1) && 'Alt', (modifiers & 4) && 'Shift']).filter(Boolean).join('+');
}
const availabilityGradientCache = new Map();
const solarZoneAliases = new Map([
  ['Asia/Saigon', 'Asia/Ho_Chi_Minh'],
  ['Asia/Calcutta', 'Asia/Kolkata'],
  ['Asia/Katmandu', 'Asia/Kathmandu'],
  ['Europe/Kiev', 'Europe/Kyiv'],
  ['America/Godthab', 'America/Nuuk'],
  ['Pacific/Truk', 'Pacific/Chuuk'],
  ['Pacific/Ponape', 'Pacific/Pohnpei'],
]);

const catalog = (window.CITIES || []).map(row => ({
  key: row[0], en: row[1], ru: row[2], cc: row[3], aliases: row[4] || '', pop: row[5] || 0,
  lat: Number.isFinite(+row[6]) ? +row[6] : null, lon: Number.isFinite(+row[7]) ? +row[7] : null,
}));
const byKey = new Map(catalog.map(city => [city.key, city]));
const zoneFallback = new Map();
for (const city of catalog) {
  const zone = zoneOf(city.key);
  const old = zoneFallback.get(zone);
  const canonical = zone.split('/').pop().replaceAll('_', ' ').toLocaleLowerCase();
  const exact = city.en.toLocaleLowerCase() === canonical;
  if (!old || (exact && !old._exact) || (exact === Boolean(old._exact) && city.pop > old.pop)) {
    zoneFallback.set(zone, {...city, _exact: exact});
  }
}

const strings = {
  ru: {
    title: 'Мировое время', cities: 'Города', add: 'Добавить город', reminders: 'Напоминания', none: 'Пока нет',
    settings: 'Настройки', theme: 'Тема', systemTheme: 'Системная', dark: 'Тёмная', light: 'Светлая', language: 'Язык', base: 'Базовый город',
    timeFormat: 'Формат времени', systemFormat: 'Системный', hour24: '24-часовой', hour12: '12-часовой',
    typicalSchedule: 'Общий график', citySettings: 'Имена и графики городов', defaultSchedule: 'График по умолчанию', addedCities: 'ДОБАВЛЕННЫЕ ГОРОДА', baseTimeSection: 'БАЗОВОЕ ВРЕМЯ', nameAndSchedule: 'Имя и график',
    working: 'Рабочее время', okay: 'Можно связаться', dnd: 'Не беспокоить', daylight: 'Светло', twilight: 'Сумерки', night: 'Темно',
    schedule: 'График', makeBase: 'Сделать базовым', remove: 'Удалить', useDefault: 'Использовать общий график', displayLabel: 'Имя человека или клиента', baseContactHours: 'Часы связи базового времени',
    alarmAction: 'Напоминание', changeCity: 'Сменить город', contactHours: 'Часы связи',
    intervals: 'Интервалы напоминания', autostart: 'Запускать вместе с Windows', favorites: 'ИЗБРАННЫЕ ГОРОДА',
    results: 'РЕЗУЛЬТАТЫ ПОИСКА', search: 'Поиск города...', system: 'Время Windows', from: 'от базы', now: 'Сейчас',
    save: 'Сохранить', choose: 'Выберите город', got: 'Понятно', snooze: 'Повторить через 5 минут', alarm: 'Напоминание',
    edit: 'Изменить напоминание', newReminder: 'Новое напоминание', create: 'Создать', delete: 'Удалить напоминание', cancel: 'Отмена', target: 'Конечное время',
    remindBefore: 'Смещение напоминания (минуты)', moveFuture: 'Сдвиньте шкалу на будущее время', left: 'Осталось',
    whatsNext: 'Что дальше?',
  },
  en: {
    title: 'World time', cities: 'Cities', add: 'Add city', reminders: 'Reminders', none: 'None yet',
    settings: 'Settings', theme: 'Theme', systemTheme: 'System', dark: 'Dark', light: 'Light', language: 'Language', base: 'Base city',
    timeFormat: 'Time format', systemFormat: 'System', hour24: '24-hour', hour12: '12-hour',
    typicalSchedule: 'Shared schedule', citySettings: 'City names and schedules', defaultSchedule: 'Default schedule', addedCities: 'ADDED CITIES', baseTimeSection: 'BASE TIME', nameAndSchedule: 'Name and schedule',
    working: 'Working', okay: 'Okay to contact', dnd: 'Do not disturb', daylight: 'Daylight', twilight: 'Twilight', night: 'Night',
    schedule: 'Schedule', makeBase: 'Make base', remove: 'Remove', useDefault: 'Use default schedule', displayLabel: 'Person or client name', baseContactHours: 'Base clock contact hours',
    alarmAction: 'Reminder', changeCity: 'Change city', contactHours: 'Contact hours',
    intervals: 'Reminder intervals', autostart: 'Start with Windows', favorites: 'FAVORITE CITIES',
    results: 'SEARCH RESULTS', search: 'Search city...', system: 'Windows time', from: 'from base', now: 'Now',
    save: 'Save', choose: 'Choose a city', got: 'Got it', snooze: 'Remind again in 5 minutes', alarm: 'Reminder',
    edit: 'Edit reminder', newReminder: 'New reminder', create: 'Create', delete: 'Delete reminder', cancel: 'Cancel', target: 'Target time',
    remindBefore: 'Reminder offset (minutes)', moveFuture: 'Move the timeline to a future time', left: 'Left',
    whatsNext: "What's next?",
  },
};

const lang = () => config.settings.language === 'en' ? 'en' : 'ru';
const platformStrings = {
  ru: {macos: {autostart: 'Запускать при входе в macOS', system: 'Время Mac'}},
  en: {macos: {autostart: 'Open at login on macOS', system: 'Mac time'}},
};
const t = key => platformStrings[lang()]?.[platform]?.[key] || strings[lang()][key] || key;
function systemBadge() {
  if (platform === 'macos') return `<span class="system-badge" aria-label="${esc(t('system'))}">Mac</span>`;
  return '<svg class="windows-icon" viewBox="0 0 16 16" aria-label="Windows"><path fill="currentColor" d="M0 2l7-1v6H0zm8-1l8-1v7H8zM0 8h7v6l-7-1zm8 0h8v8l-8-1z"/></svg>';
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function item(key) {
  return byKey.get(catalogKey(key)) || zoneFallback.get(zoneOf(key)) || {
    key, en: zoneOf(key).split('/').pop().replaceAll('_', ' '), ru: '', cc: '',
  };
}

function createCityKey(key) {
  return `${catalogKey(key)}~~${crypto.randomUUID()}`;
}

function uniqueCityKey(key, used = config.timezones) {
  return used.includes(key) ? createCityKey(key) : key;
}

function cityCaption(key) {
  const name = cityContext(key).label;
  return name ? `${name} · ${cityName(key)}` : cityName(key);
}

function cityName(key) {
  const city = item(key);
  return lang() === 'ru' && (city.ru || '').trim() ? city.ru : city.en;
}

function label(key) {
  const city = item(key);
  const custom = cityContext(key).label;
  return `${custom ? `${esc(custom)} · ` : ''}${esc(cityName(key))}${city.cc ? ` <span class="region">(${esc(city.cc)})</span>` : ''}`;
}

function zonedParts(date, zone) {
  try {
    return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map(part => [part.type, part.value]));
  } catch {
    return zonedParts(date, 'UTC');
  }
}

function resolvedTimeFormat() {
  const value = config.settings.time_format;
  if (value === '12' || value === '24') return value;
  const parts = new Intl.DateTimeFormat(undefined, {hour:'numeric'}).resolvedOptions();
  return parts.hourCycle === 'h11' || parts.hourCycle === 'h12' ? '12' : '24';
}

function timeAt(date, zone) {
  const parts = zonedParts(date, zone);
  if (resolvedTimeFormat() === '24') return `${parts.hour}:${parts.minute}`;
  const hour = +parts.hour;
  return `${hour % 12 || 12}:${parts.minute} ${hour < 12 ? 'AM' : 'PM'}`;
}

function displayDate(date, zone) {
  return new Intl.DateTimeFormat(lang() === 'ru' ? 'ru-RU' : 'en-GB', {
    timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(date);
}

function copyDate(date, zone) {
  const parts = zonedParts(date, zone);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const ru = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const en = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const index = weekdays.indexOf(parts.weekday);
  const weekday = index < 0 ? parts.weekday.slice(0, 2) : (lang() === 'ru' ? ru : en)[index];
  return `${weekday}, ${parts.day}.${parts.month}.${parts.year}`;
}

function baseZone() {
  return config.settings.top_clock_mode === 'auto'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : zoneOf(config.settings.manual_top_timezone || config.settings.base_timezone);
}

function systemCities() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zone === 'Asia/Saigon') return lang() === 'ru' ? 'Бангкок, Джакарта, Ханой' : 'Bangkok, Jakarta, Hanoi';
  const names = catalog.filter(city => zoneOf(city.key) === zone)
    .sort((a, b) => b.pop - a.pop).slice(0, 3)
    .map(city => lang() === 'ru' && city.ru ? city.ru : city.en);
  return names.length ? [...new Set(names)].join(', ') : zone.replaceAll('_', ' ');
}

function offsetHours(zone, at) {
  const local = zonedParts(at, zone);
  const utc = zonedParts(at, 'UTC');
  const localStamp = Date.UTC(+local.year, +local.month - 1, +local.day, +local.hour, +local.minute);
  const utcStamp = Date.UTC(+utc.year, +utc.month - 1, +utc.day, +utc.hour, +utc.minute);
  return (localStamp - utcStamp) / 36e5;
}

function inputAt(timestamp, zone) {
  const parts = zonedParts(new Date(timestamp), zone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function epochAt(value, zone) {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let pass = 0; pass < 3; pass += 1) {
    guess = Date.UTC(year, month - 1, day, hour, minute) - offsetHours(zone, new Date(guess)) * 36e5;
  }
  return guess;
}

function referenceTimestamp() {
  if (offset === 0) return Date.now();
  const zone = baseZone();
  const parts = zonedParts(new Date(), zone);
  const wholeHour = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`;
  return epochAt(wholeHour, zone) + offset * 36e5;
}

function until(target, now = Date.now()) {
  const difference = target - now;
  if (Math.abs(difference) < 1000) return t('now');
  const future = difference > 0;
  let minutes = future ? Math.ceil(difference / 60000) : Math.floor(Math.abs(difference) / 60000);
  if (!minutes) return future
    ? (lang() === 'ru' ? '+ < 1 мин' : '+ < 1 min')
    : (lang() === 'ru' ? '< 1 мин назад' : '< 1 min ago');
  const hours = Math.floor(minutes / 60);
  minutes %= 60;
  const duration = [
    hours && (lang() === 'ru' ? `${hours} ч` : `${hours} h`),
    minutes && (lang() === 'ru' ? `${minutes} мин` : `${minutes} min`),
  ].filter(Boolean).join(' ');
  if (lang() === 'ru') return future ? `+ ${duration}` : `${duration} назад`;
  return future ? `+ ${duration}` : `${duration} ago`;
}

function intervalValue(value) {
  const rounded = Math.round(Number(value));
  return Number.isSafeInteger(rounded) ? rounded : 0;
}

function intervalCaption(minutes, target = referenceTimestamp()) {
  if (minutes === 0) return timeAt(new Date(target), baseZone());
  const magnitude = Math.abs(minutes);
  const duration = magnitude >= 60 && magnitude % 60 === 0
    ? (lang() === 'ru' ? `${magnitude / 60} ч` : `${magnitude / 60} h`)
    : (lang() === 'ru' ? `${magnitude} мин` : `${magnitude} min`);
  return `${minutes > 0 ? '+' : '−'}${duration}`;
}

function alarmTimestamp(target, lead) { return target + lead * 60000; }

function validAlarm(target, lead) {
  const alarm = alarmTimestamp(target, lead);
  return Number.isSafeInteger(lead) && Number.isFinite(new Date(alarm).getTime()) && alarm > Date.now();
}

function invalidAlarmMessage() {
  return lang() === 'ru' ? 'Время напоминания должно быть в будущем' : 'Reminder time must be in the future';
}

function originCaption() {
  return timeAt(new Date(), baseZone());
}

function timelineHour(hoursAhead, now = new Date(), zone = baseZone()) {
  const hour = +zonedParts(new Date(now.getTime() + hoursAhead * 3600000), zone).hour;
  return resolvedTimeFormat() === '24'
    ? String(hour).padStart(2, '0')
    : `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
}
const sameHotkey = (a, b) => a?.modifiers === b?.modifiers && a?.key === b?.key;
const currentHotkeyMode = () => sameHotkey(activeHotkey, defaultHotkeyForPlatform()) ? 'default' : 'custom';

function timelineCaption(hoursAhead, now = new Date(), zone = baseZone()) {
  const value = timeAt(new Date(now.getTime() + hoursAhead * 3600000), zone);
  return value.replace(/:(\d{2})/, '<small class="timeline-minutes">:$1</small>');
}

function baseSolarKey() {
  const key = config.settings.top_clock_mode === 'manual' ? config.settings.manual_top_timezone : baseZone();
  return solarZoneAliases.get(zoneOf(key)) || key;
}

function shiftCaption(value) {
  if (value === 0) return t('now');
  const minutes = Math.round(value * 60);
  if (minutes % 60 === 0) return `+${minutes / 60} ${lang() === 'ru' ? 'ч' : 'h'}`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return `+${hours ? `${hours} ${lang() === 'ru' ? 'ч ' : 'h '}` : ''}${rest} ${lang() === 'ru' ? 'мин' : 'min'}`;
}

function minuteOfDay(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return NaN;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60 ? hour * 60 + minute : NaN;
}

function normalizeSchedule(value) {
  const schedule = {...defaultAvailability, ...(value || {})};
  const points = ['okayStart','workingStart','workingEnd','dndStart'].map(key => minuteOfDay(schedule[key]));
  if (points.some(point => !Number.isFinite(point))) return {...defaultAvailability};
  const distance = point => (point - points[0] + 1440) % 1440;
  const ordered = points.map(distance);
  if (!(ordered[1] > 0 && ordered[2] > ordered[1] && ordered[3] > ordered[2])) return {...defaultAvailability};
  return schedule;
}

function scheduleIsValid(value) {
  const points = ['okayStart','workingStart','workingEnd','dndStart'].map(key => minuteOfDay(value?.[key]));
  if (points.some(point => !Number.isFinite(point))) return false;
  const relative = points.map(point => (point - points[0] + 1440) % 1440);
  return relative[1] > 0 && relative[2] > relative[1] && relative[3] > relative[2];
}

function availabilityAt(schedule, minute) {
  const normalized = normalizeSchedule(schedule);
  const start = minuteOfDay(normalized.okayStart);
  const position = (minute - start + 1440) % 1440;
  const workingStart = (minuteOfDay(normalized.workingStart) - start + 1440) % 1440;
  const workingEnd = (minuteOfDay(normalized.workingEnd) - start + 1440) % 1440;
  const dndStart = (minuteOfDay(normalized.dndStart) - start + 1440) % 1440;
  if (position < workingStart) return 'okay';
  if (position < workingEnd) return 'working';
  if (position < dndStart) return 'okay';
  return 'dnd';
}

function cityContext(key) {
  const value = config.cityContext?.[key];
  return value && typeof value === 'object' ? value : {};
}

function scheduleFor(key) {
  return normalizeSchedule(cityContext(key).availabilityOverride || config.settings.availabilityDefault);
}

function baseSchedule() {
  return normalizeSchedule(config.settings.baseAvailabilityOverride || config.settings.availabilityDefault);
}

const meetingLengthMinutes = 30;
function meetingMembers() {
  const members = config.timezones.filter(key => meetingSelected.has(key)).map(key => ({key, zone:zoneOf(key), schedule:scheduleFor(key)}));
  if (meetingSelected.has(baseScheduleKey)) members.unshift({key:baseScheduleKey, zone:baseZone(), schedule:baseSchedule()});
  return members;
}

function copyTimeMembers() {
  return meetingMode ? meetingMembers() : [
    {key:baseScheduleKey, zone:baseZone()},
    ...config.timezones.map(key => ({key, zone:zoneOf(key)})),
  ];
}

function meetingQuality(at, members, durationMinutes = meetingLengthMinutes) {
  let yellow = 0;
  for (const member of members) {
    let memberYellow = false;
    for (let minute = 0; minute < durationMinutes; minute += 15) {
      const local = localMinute(new Date(at + minute * 60000), member.zone);
      const availability = availabilityAt(member.schedule, local);
      if (availability === 'dnd') return null;
      if (availability === 'okay') memberYellow = true;
    }
    if (memberYellow) yellow += 1;
  }
  return yellow;
}

function meetingWindowMinutes(at, members) {
  const key = `${Math.floor(at / 60000)}|${members.map(member => `${member.zone}:${JSON.stringify(member.schedule)}`).join('|')}`;
  if (meetingWindowCache.key === key) return meetingWindowCache.minutes;
  const first = meetingQuality(at, members, 15);
  if (first === null || !members.length) {
    meetingWindowCache = {key, minutes:0};
    return 0;
  }
  let minutes = 0;
  for (; minutes < 24 * 60; minutes += 15) {
    const quality = meetingQuality(at + minutes * 60000, members, 15);
    if (quality === null || (first === 0 && quality !== 0)) break;
  }
  if (minutes < 24 * 60) {
    for (let minute = Math.max(0, minutes - 15); minute < minutes; minute++) {
      const quality = meetingQuality(at + minute * 60000, members, 1);
      if (quality === null || (first === 0 && quality !== 0)) {
        minutes = minute;
        break;
      }
    }
  }
  meetingWindowCache = {key, minutes};
  return minutes;
}

function meetingDurationText(minutes) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (lang() !== 'ru') return [hours ? `${hours} h` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ');
  const word = hours % 10 === 1 && hours % 100 !== 11 ? 'час' : hours % 10 >= 2 && hours % 10 <= 4 && (hours % 100 < 12 || hours % 100 > 14) ? 'часа' : 'часов';
  return [hours ? `${hours} ${word}` : '', rest ? `${rest} мин` : ''].filter(Boolean).join(' ');
}

function findMeetingTimes(members, now = Date.now()) {
  if (members.length < 2) return {best:null, earlier:null};
  let green = null, mixed = null;
  const step = 15 * 60000, duration = meetingLengthMinutes * 60000;
  for (let at = Math.ceil(now / step) * step; at + duration <= now + 24 * 3600000; at += step) {
    const yellow = meetingQuality(at, members);
    if (yellow === 0 && !green) green = {at, yellow};
    else if (yellow !== null && yellow > 0 && !mixed) mixed = {at, yellow};
    if (green && mixed) break;
  }
  return {best:green || mixed, earlier:green && mixed && mixed.at < green.at ? mixed : null};
}

function meetingOffsetAt(at) {
  const zone = baseZone(), parts = zonedParts(new Date(), zone);
  const hour = epochAt(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`, zone);
  return clamp(Math.round((at - hour) / 900000) / 4, 0, 24);
}

function meetingStatusText() {
  const count = meetingMembers().length;
  if (count < 2) return lang() === 'ru' ? 'Выберите минимум два времени' : 'Choose at least two clocks';
  if (!meetingResult) return lang() === 'ru' ? 'Нет общего времени в ближайшие 24 ч' : 'No shared time in the next 24 h';
  const at = referenceTimestamp(), members = meetingMembers();
  const quality = meetingQuality(at, members, 15), minutes = meetingWindowMinutes(at, members);
  if (!minutes) return lang() === 'ru' ? 'Нет окна' : 'No window';
  const prefix = quality ? (lang() === 'ru' ? 'Можно связаться' : 'Okay to contact') : (lang() === 'ru' ? 'Все в рабочее время' : 'All within working hours');
  return `${prefix} · ${timeAt(new Date(at), baseZone())} · ${meetingDurationText(minutes)}`;
}

function syncMeetingChoiceToOffset() {
  if (!meetingMode || !meetingEarlier || !meetingResult) return;
  const quality = meetingQuality(referenceTimestamp(), meetingMembers(), 15);
  if (quality !== null) meetingShowingEarlier = quality > 0;
}

function updateMeetingUI() {
  document.body.classList.toggle('meeting-mode', meetingMode);
  const button = $('#meetingToggle');
  if (button) { button.classList.toggle('active', meetingMode); button.setAttribute('aria-pressed', String(meetingMode)); }
  const copy = $('#meetingCopy');
  if (copy) copy.disabled = copyTimeMembers().length === 0;
  const status = $('#meetingStatus');
  if (status) {
    status.hidden = !meetingMode;
    if (meetingMode) {
      const at = referenceTimestamp(), members = meetingMembers();
      const minutes = meetingResult && members.length >= 2 ? meetingWindowMinutes(at, members) : 0;
      const yellow = !!meetingQuality(at, members, 15);
      const markup = `${minutes ? `<span class="meeting-period-icon">${yellow ? horizonIcon : sunIcon}</span><span class="meeting-duration">${esc(meetingDurationText(minutes))}</span>` : `<span class="meeting-message">${esc(meetingStatusText())}</span>`}${meetingEarlier ? `<button id="meetingEarlier" class="period-switch" type="button" role="switch"><i class="period-thumb"></i><span>${sunIcon}</span><span>${horizonIcon}</span></button>` : ''}${config.timezones.some(key => !meetingSelected.has(key)) ? `<button id="meetingAll" type="button">${lang() === 'ru' ? 'Все' : 'All'}</button>` : ''}`;
      // Keep the switch node alive while only the selected state changes, so its thumb can animate.
      if (status.dataset.markup !== markup) {
        const previous = $('#meetingEarlier');
        const focused = previous && document.activeElement === previous;
        status.innerHTML = markup;
        if (previous && $('#meetingEarlier')) $('#meetingEarlier').replaceWith(previous);
        if (focused) previous.focus({preventScroll:true});
        status.dataset.markup = markup;
      }
      status.classList.toggle('period-yellow', yellow);
      status.title = meetingStatusText();
      const periodSwitch = $('#meetingEarlier');
      if (periodSwitch) {
        periodSwitch.getBoundingClientRect();
        periodSwitch.classList.toggle('earlier', meetingShowingEarlier);
        periodSwitch.setAttribute('aria-checked', String(meetingShowingEarlier));
        periodSwitch.setAttribute('aria-label', lang() === 'ru' ? 'Более раннее время' : 'Earlier time');
        periodSwitch.title = meetingShowingEarlier ? (lang() === 'ru' ? 'Выбрать лучшее время' : 'Choose the best time') : (lang() === 'ru' ? 'Выбрать более раннее время' : 'Choose an earlier time');
      }
      const duration = status.querySelector('.meeting-duration');
      if (duration) duration.textContent = meetingDurationText(minutes);
      if (duration && status.scrollWidth > status.clientWidth + 1) {
        duration.textContent = lang() === 'ru' ? meetingDurationText(minutes).replace(/час(?:а|ов)?/g, 'ч').replace('мин', 'м') : meetingDurationText(minutes).replace('min', 'm');
      }
    }
    const all = $('#meetingAll');
    if (all) all.onclick = () => { meetingSelected = new Set(config.timezones); recalculateMeeting(); };
    const periodSwitch = $('#meetingEarlier');
    if (periodSwitch) periodSwitch.onclick = () => {
      meetingShowingEarlier = !meetingShowingEarlier;
      setOffset(meetingOffsetAt((meetingShowingEarlier ? meetingEarlier : meetingResult).at));
      updateMeetingUI();
    };
  }
  $('#baseClock')?.classList.toggle('meeting-selected', meetingSelected.has(baseScheduleKey));
  $$('.city-card').forEach(card => {
    card.classList.toggle('meeting-selected', meetingSelected.has(card.dataset.zone));
    const remove = card.querySelector('.delete');
    if (remove) { remove.inert = meetingMode; remove.setAttribute('aria-hidden', String(meetingMode)); }
  });
  const rail = $('#meetingRange');
  if (rail) {
    const minutes = meetingMode && meetingResult ? meetingWindowMinutes(referenceTimestamp(), meetingMembers()) : 0;
    rail.hidden = !minutes;
    if (!rail.hidden) {
      rail.style.background = meetingRangeGradient(referenceTimestamp(), meetingMembers(), minutes);
      rail.style.left = `${sliderPosition(offset, $('#sliderArea').clientWidth)}px`;
      rail.style.width = `${Math.max(3, $('#sliderArea').clientWidth - 20) * (minutes / 60) / 24}px`;
    }
  }
}

let meetingRangeCache = {key:'', gradient:''};
function meetingRangeGradient(at, members, minutes) {
  if (!minutes || !members.length) return 'none';
  const key = `${Math.floor(at / 60000)}|${minutes}|${members.map(member => `${member.zone}:${JSON.stringify(member.schedule)}`).join('|')}`;
  if (meetingRangeCache.key === key) return meetingRangeCache.gradient;
  const stops = [];
  let start = 0, previous;
  for (let minute = 0; minute <= minutes; minute++) {
    const quality = minute < minutes ? meetingQuality(at + minute * 60000, members, 1) : undefined;
    const color = quality === undefined ? undefined : quality === null ? 'transparent' : quality === 0 ? 'var(--availability-working)' : 'var(--availability-okay)';
    if (minute && color !== previous) {
      stops.push(`${previous} ${start * 100 / minutes}% ${minute * 100 / minutes}%`);
      start = minute;
    }
    previous = color;
  }
  const gradient = `linear-gradient(to right,${stops.join(',')})`;
  meetingRangeCache = {key, gradient};
  return gradient;
}

function recalculateMeeting() {
  const found = findMeetingTimes(meetingMembers());
  meetingResult = found.best;
  meetingEarlier = found.earlier;
  meetingShowingEarlier = false;
  if (meetingResult) setOffset(meetingOffsetAt(meetingResult.at));
  updateMeetingUI();
}

function toggleMeeting() {
  meetingMode = !meetingMode;
  meetingSelected = meetingMode ? new Set(config.timezones) : new Set();
  meetingResult = null; meetingEarlier = null; meetingShowingEarlier = false;
  expandedBase = false; expandedCityKey = null;
  applyExpandedBaseState(); applyExpandedCityState();
  updateQuickVisibility();
  if (meetingMode) recalculateMeeting(); else updateMeetingUI();
}

function toggleMeetingMember(key) {
  if (meetingSelected.has(key)) meetingSelected.delete(key); else meetingSelected.add(key);
  recalculateMeeting();
}

function meetingCopyText(at = referenceTimestamp(), members = copyTimeMembers()) {
  const date = new Date(at);
  return members.map(member => {
    const name = member.key === baseScheduleKey
      ? `${lang() === 'ru' ? 'Моё время' : 'My time'} (${config.settings.top_clock_mode === 'auto' ? systemCities() : cityName(config.settings.manual_top_timezone)})`
      : `${cityContext(member.key).label ? `${cityContext(member.key).label} · ` : ''}${cityName(member.key)}`;
    return `${copyDate(date, member.zone)} · ${timeAt(date, member.zone)} — ${name}`;
  }).join('\n');
}

function gradientFor(sample, cssPrefix, steps = 96) {
  const stops = [];
  let previous = sample(0), start = 0;
  for (let index = 1; index <= steps; index += 1) {
    const state = index === steps ? null : sample(index * 1440 / steps);
    if (state !== previous) {
      const from = start * 100 / steps, to = index * 100 / steps;
      stops.push(`var(--${cssPrefix}-${previous}) ${from}%`, `var(--${cssPrefix}-${previous}) ${to}%`);
      previous = state; start = index;
    }
  }
  return `linear-gradient(to right,${stops.join(',')})`;
}

function availabilityGradient(schedule) {
  const cacheKey = JSON.stringify(schedule);
  if (!availabilityGradientCache.has(cacheKey)) availabilityGradientCache.set(cacheKey, gradientFor(minute => availabilityAt(schedule, minute), 'availability'));
  return availabilityGradientCache.get(cacheKey);
}

function solarStateAt(date, latitude, longitude) {
  if (!window.SunCalc || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'night';
  const altitude = window.SunCalc.getPosition(date, latitude, longitude).altitude;
  if (altitude >= 0) return 'daylight';
  return altitude >= -Math.PI / 30 ? 'twilight' : 'night';
}

function localMinute(selected, zone) {
  const parts = zonedParts(selected, zone);
  return +parts.hour * 60 + +parts.minute;
}

function temporalContext(selected, key) {
  const zone = zoneOf(key), minute = localMinute(selected, zone);
  const availability = availabilityAt(scheduleFor(key), minute);
  const city = item(key);
  const solar = solarStateAt(selected, city.lat, city.lon);
  return {availability, solar, marker: minute / 14.4,
    availabilityGradient: availabilityGradient(scheduleFor(key))};
}

function relativeDateContext(selected, zone) {
  const city = zonedParts(selected, zone), base = zonedParts(selected, baseZone());
  const cityDate = `${city.year}-${city.month}-${city.day}`, baseDate = `${base.year}-${base.month}-${base.day}`;
  if (cityDate > baseDate) return lang() === 'ru' ? 'Завтра' : 'Tomorrow';
  if (cityDate < baseDate) return lang() === 'ru' ? 'Вчера' : 'Yesterday';
  return '';
}

function contextAccessibility(context) {
  return `${t(context.availability)}; ${t(context.solar)}`;
}

function solarGlyph(state) { return state === 'daylight' ? sunIcon : state === 'twilight' ? horizonIcon : '☾'; }
function availabilityGlyph(state) { return solarGlyph(state === 'working' ? 'daylight' : state === 'okay' ? 'twilight' : 'night'); }

function temporalBandHtml(selected, key) {
  const context = temporalContext(selected, key);
  const description = t(context.availability);
  return `<div class="temporal-band" role="img" aria-label="${esc(description)}" title="${esc(description)}" style="--temporal-marker:${context.marker}%;--availability-gradient:${context.availabilityGradient}"><span class="availability-layer"></span><i class="temporal-marker"></i></div>`;
}

function secondaryContext(selected, zone) {
  const parts = [relativeDateContext(selected, zone)];
  if (offsetHours(zone, new Date()) !== offsetHours(zone, selected)) parts.push('DST');
  return parts.filter(Boolean).join(' · ');
}

function normalize() {
  const scaleDefault = config.settings?.interface_scale_default;
  config = {...structuredClone(defaults), ...config, settings: {...defaults.settings, ...(config.settings || {})}};
  config.settings.interface_scale = interfaceScale(config.settings.interface_scale);
  config.settings.interface_scale_default = typeof scaleDefault === 'boolean' ? scaleDefault : config.settings.interface_scale === 100;
  config.cityContext = config.cityContext && typeof config.cityContext === 'object' && !Array.isArray(config.cityContext) ? config.cityContext : {};
  config.timezones = Array.isArray(config.timezones) ? config.timezones : [...defaults.timezones];
  const seenCities = [];
  config.timezones = config.timezones.map(key => {
    const distinct = uniqueCityKey(key, seenCities);
    if (distinct !== key && config.cityContext[key]) config.cityContext[distinct] = structuredClone(config.cityContext[key]);
    seenCities.push(distinct);
    return distinct;
  });
  config.favorites = Array.isArray(config.favorites) ? config.favorites : [...defaults.favorites];
  const intervals = config.settings.reminder_intervals;
  if (!Array.isArray(intervals) || intervals.length < 1 ||
      intervals.some(value => !Number.isSafeInteger(+value))) {
    config.settings.reminder_intervals = [15, 30, 60];
  } else {
    config.settings.reminder_intervals = intervals.map(Number);
  }
  config.settings.availabilityDefault = normalizeSchedule(config.settings.availabilityDefault);
  config.settings.baseAvailabilityOverride = config.settings.baseAvailabilityOverride
    ? normalizeSchedule(config.settings.baseAvailabilityOverride) : null;
  if (!['system','12','24'].includes(config.settings.time_format)) config.settings.time_format = 'system';
  if (!['system','dark','light'].includes(config.settings.theme)) config.settings.theme = 'system';
  for (const [key, value] of Object.entries(config.cityContext)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { delete config.cityContext[key]; continue; }
    value.label = typeof value.label === 'string' ? value.label.trim().slice(0, 80) : '';
    if (value.availabilityOverride) value.availabilityOverride = normalizeSchedule(value.availabilityOverride);
  }
  reminders.entries = Array.isArray(reminders.entries) ? reminders.entries : [];
  config.settings.quick_titles = Array.isArray(config.settings.quick_titles) ? config.settings.quick_titles : [];
  if (config.settings.title_library_version !== 1) {
    for (const title of systemTitles()) {
      if (!config.settings.quick_titles.some(item => item.title.toLocaleLowerCase() === title.toLocaleLowerCase())) {
        config.settings.quick_titles.push({id:crypto.randomUUID(),title,use_count:0});
      }
    }
    config.settings.title_library_version = 1;
  }
  reminders.entries.forEach(entry => {
    syncReminderModel(entry);
    if (entry.source_type !== 'base' && !entry.city_key) {
      const owner = reminderCityKey(entry);
      if (owner) { entry.city_key = owner; syncReminderModel(entry); }
    }
  });
}

function saveConfig() { send(`saveConfig\n${JSON.stringify(config, null, 2)}`); if (!applyingRemoteSync) window.syncLocalChanged?.(); }
function saveReminders() { reminders.entries.forEach(syncReminderModel); send(`saveReminders\n${JSON.stringify(reminders, null, 2)}`); if (!applyingRemoteSync) window.syncLocalChanged?.(); scheduleBackgroundTick(); }

function backgroundTickDelay(now = Date.now()) {
  const next = reminders.entries.reduce((earliest, entry) => {
    if (entry.state === 'ringing') return Math.min(earliest, now + 1000);
    if (entry.state !== 'pending' || !Number.isFinite(entry.alarm)) return earliest;
    return Math.min(earliest, entry.alarm * 1000);
  }, now + 60000);
  return Math.max(1000, Math.min(60000, Math.ceil(next - now)));
}

function scheduleBackgroundTick() {
  send(`scheduleTick\n${backgroundTickDelay()}`);
}

function render() {
  hideContextTooltip();
  hideReminderTooltip();
  liveOffset = null;
  normalize();
  const systemLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  document.body.classList.toggle('light', config.settings.theme === 'light' || (config.settings.theme === 'system' && systemLight));
  const selected = new Date(referenceTimestamp());
  const zone = baseZone();
  const source = config.settings.top_clock_mode === 'auto' ? `<div class="source">${t('system')}</div>` : '';
  const city = config.settings.top_clock_mode === 'auto' ? systemCities() : cityName(config.settings.manual_top_timezone);
  const baseSolar = temporalContext(selected, baseSolarKey()).solar;
  const baseAvailability = availabilityAt(baseSchedule(), localMinute(selected, baseZone()));
  const baseSolarLabel = `${t(baseAvailability)}; ${t(baseSolar)}`;
  const shift = shiftCaption(offset);
  const quickClass = offset > 0 || quickAtNowOpen || meetingMode ? 'quick-section open' : 'quick-section';

  $('#app').innerHTML = `<div class="shell">
    <div class="header">
      <button class="icon" data-action="settings" aria-label="${t('settings')}">⚙</button>
      <h1 class="drag">${t('title')}</h1>
      <button class="icon" data-action="hide" aria-label="${lang() === 'ru' ? 'Закрыть виджет' : 'Close widget'}" title="${esc(lang() === 'ru' ? `Скрыть; открыть снова: ${hotkeyLabel()}` : `Hide; reopen: ${hotkeyLabel()}`)}">×</button>
    </div>
    <div class="main-controls">
    <section class="hero" style="height:${heroHeight()}px">
       <article class="clock panel ${config.settings.top_clock_mode === 'manual' ? 'manual-base ' : ''}${expandedBase ? 'expanded' : ''}" id="baseClock" data-zone="${esc(zone)}" aria-expanded="${expandedBase}">
        <div class="base-summary">
          <span class="base-solar solar-glyph" role="img" aria-label="${esc(baseSolarLabel)}">${availabilityGlyph(baseAvailability)}</span>
          ${source}<div class="clock-time">${timeAt(selected, zone)}</div>
          <div class="clock-city">${esc(city)}</div><div class="date">${displayDate(selected, zone)}</div><div class="base-reminders" id="baseReminders"></div>
        </div>
         <div class="card-actions-wrap" aria-hidden="${!expandedBase}"><div class="card-actions"><button data-base-action="alarm">${t('alarmAction')}</button><button data-base-action="replace">${t('changeCity')}</button><button data-base-action="schedule">${t('contactHours')}</button></div></div>
         ${meetingOutlineSvg}
      </article>
      <article class="saved-panel panel"><div class="saved-heading" id="savedHeading"></div><div class="saved-list" id="alarmList"></div></article>
    </section>
    <div class="hero-resizer" id="heroResizer" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${lang() === 'ru' ? 'Высота секции времени и напоминаний' : 'Time and reminders section height'}"></div>
    <section class="slider" id="sliderArea">
      <div class="shift-label ${offset === 0 ? 'start' : offset === 24 ? 'end' : ''}" id="shiftLabel">${shift}</div>
       <button class="quick-toggle ${offset > 0 ? 'away-from-now' : ''}" id="quickToggle" type="button" aria-label="${lang() === 'ru' ? 'Быстрые напоминания' : 'Quick reminders'}" title="${lang() === 'ru' ? 'Быстрые напоминания' : 'Quick reminders'}" aria-controls="quickSection" aria-expanded="${offset > 0 || quickAtNowOpen || meetingMode}">${quickAlarmIcon}${quickChevronIcon}</button>
       <div class="slider-rail" aria-hidden="true"><div class="slider-fill"></div></div>
       <div class="meeting-range" id="meetingRange" hidden></div>
      <div class="slider-thumb" aria-hidden="true"></div>
      <input id="timeSlider" type="range" min="0" max="24" step="1" value="${offset}" aria-label="${t('moveFuture')}" aria-valuetext="${shift}">
      <div class="marks"><span id="originLabel">${timelineCaption(0)}</span>${[6,12,18,24].map(hours => `<span data-timeline-hour="${hours}">${timelineCaption(hours)}</span>`).join('')}</div>
     </section>
     <section class="${quickClass}" id="quickSection">
       <div class="timeline-actions"><span class="quick-title">${lang() === 'ru' ? 'Напоминание' : 'Reminder'}</span><div class="meeting-status" id="meetingStatus" hidden></div><div class="meeting-actions"><button class="meeting-toggle" id="meetingToggle" type="button" aria-pressed="${meetingMode}">${lang() === 'ru' ? 'Удобно всем' : 'Good for all'}</button><button class="meeting-copy" id="meetingCopy" type="button" aria-label="${lang() === 'ru' ? 'Скопировать время городов' : 'Copy city times'}" title="${lang() === 'ru' ? 'Скопировать время городов' : 'Copy city times'}">${copyIcon}</button></div></div>
       <div class="quick">${config.settings.reminder_intervals.map((minutes, index) =>
        `<button class="chip" draggable="true" data-preset="${index}" data-lead="${minutes}" title="${lang() === 'ru' ? 'Прокрутка: изменить интервал' : 'Scroll to adjust interval'}"><span class="chip-caption">${intervalCaption(minutes)}</span><span class="grip">⋮</span></button>`).join('')}</div>
      <div class="selection-status" id="selectionStatus"></div>
    </section>
    </div>
    <div class="city-section">
    <div class="cities-title">${t('cities')}</div>
    <div class="cities" id="cities"></div>
    <button class="add" data-action="add">＋ &nbsp; ${t('add')}</button>
    </div>
    <div class="footer"><button class="version-button" id="versionButton" type="button">${esc(version)}</button><button class="update-button context-token" id="updateButton" type="button">${checkUpdateIcon}</button><button class="whats-next" data-action="whats-next">${t('whatsNext')}</button></div>
  </div>`;
  renderCities();
  renderAlarms();
  bindMain();
  updateSelectionState();
  updateMeetingUI();
}

function renderCities() {
  const root = $('#cities');
  if (!root) return;
  cityAlarmResizeObserver?.disconnect();
  const selected = new Date(referenceTimestamp());
  const baseOffset = offsetHours(baseZone(), selected);
  const remaining = until(selected.getTime());
  if (expandedCityKey && !config.timezones.includes(expandedCityKey)) expandedCityKey = null;
  root.innerHTML = config.timezones.map((key, index) => {
    const zone = zoneOf(key);
    const delta = offsetHours(zone, selected) - baseOffset;
    const context = temporalContext(selected, key);
    const extra = secondaryContext(selected, zone);
    const expanded = expandedCityKey === key;
     return `<article class="card city-card ${expanded ? 'expanded' : ''}" draggable="${!meetingMode}" data-city="${index}" data-zone="${esc(key)}" aria-expanded="${expanded}">
      <div class="city-summary">
        <div class="city-main"><div class="city-name">${label(key)}</div><div class="offset">${delta >= 0 ? '+' : ''}${delta} ${lang() === 'ru' ? 'ч.' : 'h'} ${t('from')}</div></div>
        <div class="city-clock"><div class="city-time"><span class="clock-value">${timeAt(selected, zone)}</span></div><div class="until">${remaining}${extra ? ` · ${esc(extra)}` : ''}</div></div>
        <button class="delete" data-delete="${index}" aria-label="${lang() === 'ru' ? 'Удалить город' : 'Delete city'}">${trashIcon}</button>
        <span class="city-context"><span class="solar-glyph context-token" tabindex="0" aria-label="${esc(contextAccessibility(context))}" data-tooltip="${esc(contextAccessibility(context))}">${availabilityGlyph(context.availability)}</span></span>
        ${temporalBandHtml(selected, key)}
        <div class="city-alarm-track"></div>
      </div>
       <div class="card-actions-wrap" aria-hidden="${!expanded}"><div class="card-actions"><button data-city-action="alarm">${t('alarmAction')}</button><button data-city-action="base">${t('makeBase')}</button><button data-city-action="replace">${t('changeCity')}</button><button data-city-action="schedule">${t('nameAndSchedule')}</button></div></div>
       ${meetingOutlineSvg}
    </article>`;
  }).join('');
  bindCards();
  renderCityAlarms();
  updateMeetingUI();
}

// Keyed reminders belong to one added record, even if it has been removed.
// Legacy reminders without a record key are assigned to the first matching record.
function reminderCityKey(entry) {
  if (entry.city_key) return entry.city_key;
  if (entry.source_city_id && entry.source_city_id !== entry.zone) return entry.source_city_id;
  const candidates = config.timezones.filter(key => zoneOf(key) === zoneOf(entry.zone));
  return candidates.find(key => !entry.city ||
    [item(key).en, item(key).ru, cityCaption(key)].some(name => name && name.toLocaleLowerCase() === entry.city.toLocaleLowerCase()));
}

function cityReminders(key) {
  return reminders.entries.filter(entry => ['pending', 'ringing'].includes(entry.state) &&
    entry.source_type !== 'base' && reminderCityKey(entry) === key).sort((a, b) => a.alarm - b.alarm);
}

function renderCityAlarms() {
  $$('.city-card').forEach(card => renderCityAlarmTrack(card, cityReminders(card.dataset.zone)));
  const base = $('#baseReminders');
  if (base) {
    const entries = reminders.entries.filter(entry => entry.source_type === 'base' && entry.active).sort((a,b) => a.alarm-b.alarm);
    renderAlarmLabels(base, entries);
    $('#baseClock')?.classList.toggle('has-reminders', entries.length > 0);
    syncHeroHeight();
  }
}

function reminderRemaining(entry) {
  const milliseconds = entry.alarm * 1000 - Date.now();
  if (milliseconds <= 0) return '0:00';
  const seconds = Math.ceil(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${hours ? `${hours}:` : ''}${hours ? String(minutes).padStart(2, '0') : minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function reminderProgress(entry) {
  const start = (entry.started_at || entry.alarm) * 1000;
  const end = entry.alarm * 1000;
  if (end <= start) return 0;
  return clamp((end - Date.now()) / (end - start), 0, 1) * 100;
}

function renderAlarms() {
  renderCityAlarms();
  const root = $('#alarmList');
  const heading = $('#savedHeading');
  if (!root || !heading) return;
  const previousScroll = root.scrollTop;
  const active = reminders.entries.filter(entry => entry.state === 'pending' || entry.state === 'ringing')
    .sort((a, b) => a.alarm - b.alarm);
  heading.textContent = `${t('reminders')}${active.length ? ` · ${active.length}` : ''}`;
  // Preserve the existing buttons/SVGs during the clock tick so hover and focus
  // are not restarted by replacing the whole list every second.
  const signature = JSON.stringify([active,lang(),baseZone(),config.settings.top_clock_mode,config.settings.manual_top_timezone,config.settings.time_format]);
  if(root.alarmSignature === signature) {
    const byId = new Map(active.map(entry=>[entry.id,entry]));
    root.querySelectorAll('[data-alarm]').forEach(card=>{
      const entry = byId.get(card.dataset.alarm);
      if(!entry) return;
      card.querySelector('.progress i').style.width = `${reminderProgress(entry)}%`;
      card.querySelector('.progress-time').textContent = reminderRemaining(entry);
    });
    return;
  }
  root.alarmSignature = signature;
  if (!active.length) {
    root.innerHTML = `<div class="empty">${t('none')}</div>`;
    return;
  }
  root.innerHTML = active.map(entry => {
    const zone = zoneOf(entry.zone || baseZone());
    const source = sourceCaption(entry);
    const shortSource = entry.source_type === 'base' && entry.base_kind !== 'manual' ? t('system') : (entry.city || cityName(entry.city_key || entry.zone));
    const title = entry.title ? `${entry.title} · ${source}` : source;
    const caption = entry.title ? `<strong class="alarm-name">${esc(entry.title)}</strong><small class="alarm-source">${esc(shortSource)}</small>` : `<strong class="alarm-name only-source">${esc(shortSource)}</strong>`;
    const alarmTime = timeAt(new Date(entry.alarm * 1000), zone);
    const baseTime = timeAt(new Date(entry.alarm * 1000), baseZone());
    const baseName = config.settings.top_clock_mode === 'auto'
      ? systemBadge()
      : `(${esc(cityName(config.settings.manual_top_timezone))})`;
    return `<article class="saved-card" data-alarm="${esc(entry.id)}">
      <div class="saved-content"><div class="saved-top"><b class="saved-labels" title="${esc(title)}">${caption}</b><span>${entry.repeat === 'daily' ? `<span aria-label="${lang() === 'ru' ? 'Ежедневно' : 'Daily'}" title="${lang() === 'ru' ? 'Ежедневно' : 'Daily'}">↻ </span>` : ''}${alarmTime}</span></div>
      <div class="saved-bottom"><span class="progress"><i style="width:${reminderProgress(entry)}%"></i><span class="progress-time">${reminderRemaining(entry)}</span></span><span class="saved-base" title="${esc(displayDate(new Date(entry.alarm * 1000), baseZone()))}">${baseName}<span>${baseTime}</span></span></div></div>
      <button class="saved-delete" data-delalarm="${esc(entry.id)}" aria-label="${t('delete')}">${trashIcon}</button>
    </article>`;
  }).join('');
  root.scrollTop = previousScroll;
  $$('[data-alarm]').forEach(card => card.querySelector('.saved-content').onclick = () => showAlarmDetail(card.dataset.alarm));
  $$('[data-delalarm]').forEach(button => button.onclick = event => {
    event.stopPropagation();
    reminders.entries = reminders.entries.filter(entry => entry.id !== button.dataset.delalarm);
    if (alertId === button.dataset.delalarm) alertId = null;
    saveReminders();
    renderAlarms();
  });
}

function heroHeight(value = config.settings.hero_height) {
  return clamp(Number(value) || 124, 112, Math.max(112, window.innerHeight - 350));
}

// Measure the natural summary and the full action row, never the animating parent height.
function syncHeroHeight() {
  const hero = $('.hero'), clock = $('#baseClock');
  if(!hero || !clock || !window.getComputedStyle) return;
  const style = window.getComputedStyle(clock);
  const px = value => parseFloat(value) || 0;
  const summary = clock.querySelector('.base-summary');
  let minimum = px(style.borderTopWidth)+px(style.borderBottomWidth)+(summary?.scrollHeight || 0);
  if(expandedBase) {
    const wrap = clock.querySelector('.card-actions-wrap');
    const actions = wrap?.firstElementChild;
    const actionsStyle = actions ? window.getComputedStyle(actions) : null;
    const wrapStyle = wrap ? window.getComputedStyle(wrap) : null;
    const expandedPadding = actionsStyle ? px(actionsStyle.getPropertyValue('--card-actions-padding')) : 0;
    const currentPadding = actionsStyle ? px(actionsStyle.paddingTop) + px(actionsStyle.paddingBottom) : 0;
    minimum += Math.max(0, (actions?.scrollHeight || 0) - currentPadding) + expandedPadding * 2
      + (wrapStyle ? px(wrapStyle.borderTopWidth) + px(wrapStyle.borderBottomWidth) : 0);
  }
  minimum = Math.ceil(minimum);
  const manual = Number(config.settings.hero_height);
  const requested = manual > 0 ? heroHeight(manual) : heroHeight();
  const quickOpen = $('#quickSection')?.classList.contains('open');
  const compactLimit = window.innerHeight <= 800 && quickOpen && !expandedBase ? 124 : Infinity;
  const height = Math.max(minimum, Math.min(requested, compactLimit));
  hero.style.setProperty('--hero-size',`${height}px`);
  $('#heroResizer')?.setAttribute('aria-valuenow',height);
  $('#heroResizer')?.setAttribute('aria-valuemin',minimum);
}

function bindHeroResize() {
  const handle = $('#heroResizer');
  const resize = value => {
    const height = heroHeight(value);
    config.settings.hero_height = height;
    syncHeroHeight();
  };
  handle.onpointerdown = event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = $('.hero').getBoundingClientRect().height;
    handle.setPointerCapture(event.pointerId);
    handle.onpointermove = move => resize(startHeight + move.clientY - startY);
    handle.onpointerup = handle.onpointercancel = () => {
      handle.onpointermove = null;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      saveConfig();
    };
  };
  handle.onkeydown = event => {
    if (!['ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if(event.key === 'Home') {delete config.settings.hero_height; syncHeroHeight();}
    else resize($('.hero').getBoundingClientRect().height + (event.key === 'ArrowDown' ? 16 : -16));
    saveConfig();
  };
  handle.ondblclick = () => { delete config.settings.hero_height; syncHeroHeight(); saveConfig(); };
  syncHeroHeight();
}

window.addEventListener?.('resize', () => {
  syncHeroHeight();
  updateSliderVisual(liveOffset ?? offset);
  renderCityAlarms();
});

function sliderPosition(value, width, inset = 10) {
  return inset + (Math.max(0, width - inset * 2) * clamp(value, 0, 24) / 24);
}

function updateSliderVisual(value) {
  const area = $('#sliderArea');
  const input = $('#timeSlider');
  const label = $('#shiftLabel');
  if (!area || !input || !label) return;
  const x = sliderPosition(value, area.clientWidth);
  area.style.setProperty('--slider-x', `${x}px`);
  input.setAttribute('aria-valuetext', shiftCaption(value));
  label.className = `shift-label ${value <= 0 ? 'start' : value >= 24 ? 'end' : ''}`;
}

function bindMain() {
  bindHeroResize();
  $('[data-action=settings]').onclick = openSettings;
  $('[data-action=add]').onclick = () => openCities('add');
  $('[data-action=hide]').onclick = () => send('hide');
  $('[data-action=whats-next]').onclick = () => send('openExternal\nhttps://world-clock-next.uuuraaaaa.workers.dev');
  $('#versionButton').onclick = openFeatureGuide;
  $('#updateButton').onclick = updateButtonClick;
  updateUpdateButton();
  $('.header h1').onpointerdown = () => send('drag');

  const slider = $('#timeSlider');
  $('#quickToggle').onclick = event => {
    event.stopPropagation();
    toggleQuickAtNow();
  };
  $('#meetingToggle').onclick = toggleMeeting;
  $('#meetingCopy').onclick = () => {
    if (!copyTimeMembers().length) return;
    send(`copyText\n${meetingCopyText()}`);
  };
  updateSliderVisual(offset);
  slider.oninput = event => {liveOffset = +event.target.value; setOffset(liveOffset);};
  slider.onchange = event => {liveOffset = null; setOffset(+event.target.value);};
  $('#sliderArea').oncontextmenu = event => { event.preventDefault(); resetTimeline(); };
  bindValueScroll($('#sliderArea'), {read:()=>offset,write:setOffset,min:0,max:24,stepForEvent:event=>event.shiftKey?.25:1,paint:value=>{
    liveOffset = value; slider.value = value;
    updateSliderVisual(value);
  },finish:()=>{liveOffset=null; updateDynamic();}});

  $$('.chip').forEach(chip => {
    chip.onclick = () => beginReminder(+chip.dataset.lead);
    bindValueScroll(chip, {read:()=>+chip.dataset.lead,write:value=>{
      const index = +chip.dataset.preset, previous = +chip.dataset.lead;
      value = intervalValue(value);
      config.settings.reminder_intervals[index] = value;
      if(pendingLead === previous) pendingLead = value;
      chip.dataset.lead = value;
      chip.querySelector('.chip-caption').textContent = intervalCaption(value);
    },finish:saveConfig});
    chip.ondragstart = event => {
      event.dataTransfer.setData('lead', chip.dataset.lead);
      event.dataTransfer.effectAllowed = 'copy';
      document.body.classList.add('choosing-city');
    };
    chip.ondragend = () => document.body.classList.remove('choosing-city');
  });

  const baseClock = $('#baseClock');
  bindReminderDrop(baseClock, config.settings.top_clock_mode === 'auto' ? baseZone() : config.settings.manual_top_timezone, config.settings.top_clock_mode === 'auto' ? systemCities() : cityName(config.settings.manual_top_timezone), 'base');
  const reminderClick = baseClock?.onclick;
  if (baseClock) baseClock.onclick = event => {
    if (event.target.closest('button,input,label')) return;
    if (meetingMode) { toggleMeetingMember(baseScheduleKey); return; }
    if (pendingLead !== null) return reminderClick?.(event);
    toggleExpandedBase();
    applyExpandedBaseState();
  };
  $$('[data-base-action]').forEach(button => button.onclick = event => {
    event.stopPropagation();
    expandedBase = false;
    applyExpandedBaseState();
    if (button.dataset.baseAction === 'alarm') newAlarmForBase();
    else if (button.dataset.baseAction === 'replace') openCities('base');
    else if (button.dataset.baseAction === 'schedule') openScheduleEditor(baseScheduleKey, 'base');
  });
}

function setOffset(value) {
  offset = clamp(Math.round(value * 4) / 4, 0, 24);
  if (pendingLead !== null) pendingLead = null;
  syncMeetingChoiceToOffset();
  updateQuickVisibility();
  updateDynamic();
  if (meetingMode) updateMeetingUI();
}

function resetTimeline() {
  liveOffset = null;
  quickAtNowOpen = false;
  meetingMode = false;
  meetingSelected.clear();
  meetingResult = null;
  meetingEarlier = null;
  meetingShowingEarlier = false;
  setOffset(0);
  updateMeetingUI();
}

function toggleQuickAtNow() {
  if (offset !== 0) return;
  if (meetingMode) {
    meetingMode = false;
    meetingSelected.clear();
    meetingResult = null; meetingEarlier = null; meetingShowingEarlier = false;
    quickAtNowOpen = false;
    updateMeetingUI();
    updateQuickVisibility();
    return;
  }
  quickAtNowOpen = !quickAtNowOpen;
  updateQuickVisibility();
}

function updateQuickVisibility() {
  const quickSection = $('#quickSection');
  const wasOpen = quickSection?.classList.contains('open');
  const isOpen = offset > 0 || quickAtNowOpen || meetingMode;
  quickSection?.classList.toggle('open', isOpen);
  if(wasOpen !== isOpen) syncHeroHeight();
  const button = $('#quickToggle');
  if (!button) return;
  button.classList.toggle('away-from-now', offset > 0);
  button.setAttribute('aria-expanded', String(offset > 0 || quickAtNowOpen || meetingMode));
}

function updateDynamic() {
  const selected = new Date(referenceTimestamp());
  const zone = baseZone();
  const clock = $('.clock-time');
  if (!clock) return;
  clock.textContent = timeAt(selected, zone);
  $('.date').textContent = displayDate(selected, zone);
  const baseSolar = temporalContext(selected, baseSolarKey()).solar;
  const baseAvailability = availabilityAt(baseSchedule(), localMinute(selected, baseZone()));
  const baseSolarNode = $('.base-solar');
  if (baseSolarNode) {
    const label = `${t(baseAvailability)}; ${t(baseSolar)}`;
    baseSolarNode.innerHTML = availabilityGlyph(baseAvailability);
    baseSolarNode.setAttribute('aria-label', label);
  }
  const shift = shiftCaption(offset);
  $('#timeSlider').value = liveOffset ?? offset;
  const timelineNow = new Date();
  $('#originLabel').innerHTML = timelineCaption(0, timelineNow, zone);
  $$('[data-timeline-hour]').forEach(mark => {
    mark.innerHTML = timelineCaption(+mark.dataset.timelineHour, timelineNow, zone);
  });
  $('#shiftLabel').textContent = shift;
  updateSliderVisual(liveOffset ?? offset);
  const baseOffset = offsetHours(zone, selected);
  $$('[data-city]').forEach(card => {
    const cityZone = zoneOf(card.dataset.zone);
    const delta = offsetHours(cityZone, selected) - baseOffset;
    const context = temporalContext(selected, card.dataset.zone);
    card.querySelector('.clock-value').textContent = timeAt(selected, cityZone);
    const contextNode = card.querySelector('.city-context');
    const solarNode = contextNode.querySelector('.solar-glyph');
    solarNode.innerHTML = availabilityGlyph(context.availability);
    solarNode.setAttribute('aria-label', contextAccessibility(context));
    solarNode.dataset.tooltip = contextAccessibility(context);
    card.querySelector('.offset').textContent = `${delta >= 0 ? '+' : ''}${delta} ${lang() === 'ru' ? 'ч.' : 'h'} ${t('from')}`;
    const extra = secondaryContext(selected, cityZone);
    card.querySelector('.until').textContent = `${until(selected.getTime())}${extra ? ` · ${extra}` : ''}`;
    const band = card.querySelector('.temporal-band');
    band.style.setProperty('--temporal-marker', `${context.marker}%`);
    band.style.setProperty('--availability-gradient', context.availabilityGradient);
    band.setAttribute('aria-label', t(context.availability));
    band.title = t(context.availability);
  });
  $$('.chip[data-preset]').forEach(chip => { chip.querySelector('.chip-caption').textContent = intervalCaption(+chip.dataset.lead); });
  renderAlarms();
  updateSelectionState();
  if (meetingMode) updateMeetingUI();
}

function bindReminderDrop(element, zone, name, sourceType = 'city') {
  if (!element) return;
  element.onclick = event => { if (pendingLead !== null) createReminder(zone, pendingLead, name, {sourceType, x:event.clientX, y:event.clientY}); };
  element.ondragover = event => {
    if (event.dataTransfer.types.includes('lead')) { event.preventDefault(); element.classList.add('drop-target'); }
  };
  element.ondragleave = () => element.classList.remove('drop-target');
  element.ondrop = event => {
    const lead = +event.dataTransfer.getData('lead');
    element.classList.remove('drop-target');
    document.body.classList.remove('choosing-city');
    if (event.dataTransfer.types.includes('lead') && Number.isSafeInteger(lead)) { event.preventDefault(); createReminder(zone, lead, name, {sourceType, x:event.clientX, y:event.clientY}); }
  };
}

function bindCards() {
  $$('[data-delete]').forEach(button => button.onclick = event => {
    event.stopPropagation();
    const [removed] = config.timezones.splice(+button.dataset.delete, 1);
    if (removed) delete config.cityContext[removed];
    saveConfig();
    renderCities();
    updateSelectionState();
  });
  $$('[data-city]').forEach(card => {
    bindReminderDrop(card, card.dataset.zone, cityName(card.dataset.zone));
    const reminderClick = card.onclick;
    card.onclick = event => {
      if (event.target.closest('button,input,label')) return;
      if (suppressCityClick) return;
      if (meetingMode) { toggleMeetingMember(card.dataset.zone); return; }
      if (pendingLead !== null) return reminderClick?.(event);
      toggleExpandedCity(card.dataset.zone);
      applyExpandedCityState();
    };
    card.oncontextmenu = event => { event.preventDefault(); if (!meetingMode) openCityActions(card.dataset.zone); };
    card.ondragstart = event => {
      if (meetingMode) { event.preventDefault(); return; }
      if (event.target.closest('button,input,label')) { event.preventDefault(); return; }
      cityDragIndex = +card.dataset.city;
      card.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('city', String(cityDragIndex));
    };
    card.ondragend = () => {
      card.classList.remove('dragging');
      cityDragIndex = -1;
      suppressCityClick = true;
      setTimeout(() => { suppressCityClick = false; }, 0);
      config.timezones = $$('.city-card').map(row => row.dataset.zone);
      saveConfig();
      renderCities();
    };
    const reminderDragOver = card.ondragover;
    card.ondragover = event => {
      reminderDragOver?.(event);
      if (cityDragIndex < 0) return;
      event.preventDefault();
      const moving = $('.city-card.dragging');
      if (!moving || moving === card) return;
      const bounds = card.getBoundingClientRect();
      const movingBounds = moving.getBoundingClientRect();
      const sameRow = Math.abs(movingBounds.top - bounds.top) < 10;
      const after = sameRow ? event.clientX > bounds.left + bounds.width / 2 : event.clientY > bounds.top + bounds.height / 2;
      if ((after && card.nextElementSibling === moving) || (!after && moving.nextElementSibling === card)) return;
      const cards = $$('.city-card');
      const positions = new Map(cards.map(row => [row, row.getBoundingClientRect()]));
      card.parentNode.insertBefore(moving, after ? card.nextElementSibling : card);
      for (const row of cards) {
        if (row === moving) continue;
        const previous = positions.get(row), current = row.getBoundingClientRect();
        const dx = previous.left - current.left, dy = previous.top - current.top;
        if (dx || dy) row.animate([{transform: `translate(${dx}px,${dy}px)`}, {transform: 'translate(0,0)'}], {duration: 150, easing: 'ease-out'});
      }
    };
    const reminderDrop = card.ondrop;
    card.ondrop = event => {
      if (event.dataTransfer.types.includes('lead')) return reminderDrop?.(event);
      event.preventDefault();
      config.timezones = $$('.city-card').map(row => row.dataset.zone);
      saveConfig();
      cityDragIndex = -1;
      renderCities();
    };
  });
  $$('[data-city-action]').forEach(button => button.onclick = event => {
    event.stopPropagation();
    const card = button.closest('.city-card'), key = card.dataset.zone;
    if (button.dataset.cityAction === 'alarm') openAlarmForCity(key);
    else if (button.dataset.cityAction === 'base') makeBaseCity(key);
    else if (button.dataset.cityAction === 'replace') openCities(`replace:${card.dataset.city}`);
    else if (button.dataset.cityAction === 'schedule') openScheduleEditor(key, 'card');
  });
}

function toggleExpandedCity(key) {
  if (expandedBase) { expandedBase = false; applyExpandedBaseState(); }
  expandedCityKey = expandedCityKey === key ? null : key;
  return expandedCityKey;
}

function toggleExpandedBase() {
  expandedCityKey = null;
  applyExpandedCityState();
  expandedBase = !expandedBase;
  return expandedBase;
}

function applyExpandedBaseState() {
  const card = $('#baseClock');
  if (!card?.classList) return;
  card.classList.toggle('expanded', expandedBase);
  card.setAttribute('aria-expanded', String(expandedBase));
  card.querySelector('.card-actions-wrap')?.setAttribute('aria-hidden', String(!expandedBase));
  syncHeroHeight();
}

function applyExpandedCityState() {
  $$('.city-card').forEach(card => {
    const expanded = card.dataset.zone === expandedCityKey;
    card.classList.toggle('expanded', expanded);
    card.setAttribute('aria-expanded', String(expanded));
    card.querySelector('.card-actions-wrap')?.setAttribute('aria-hidden', String(!expanded));
  });
}

function closeExpandedCardsOutside(target) {
  let collapsed = false;
  if (expandedBase && !target.closest('#baseClock')) {
    expandedBase = false;
    applyExpandedBaseState();
    collapsed = true;
  }
  if (expandedCityKey !== null) {
    const card = target.closest('.city-card');
    if (card?.dataset.zone !== expandedCityKey) {
      expandedCityKey = null;
      applyExpandedCityState();
      collapsed = true;
    }
  }
  return collapsed;
}

function replaceCityAt(index, key) {
  if (!config.timezones[index]) return false;
  if (catalogKey(config.timezones[index]) === catalogKey(key)) return true;
  key = createCityKey(key);
  const oldKey = config.timezones[index];
  config.timezones[index] = key;
  if (oldKey !== key) delete config.cityContext[oldKey];
  expandedCityKey = null;
  return true;
}

function makeBaseCity(key) {
  config.settings.top_clock_mode = 'manual';
  config.settings.manual_top_timezone = key;
  config.settings.base_timezone = key;
  expandedCityKey = null;
  expandedBase = false;
  saveConfig(); render(); closeModal();
}

function openAlarmForCity(key) {
  newAlarmForCity(key);
}

function beginReminder(lead) {
  if (offset === 0 && quickAtNowOpen) {
    if (!validAlarm(Date.now(), lead)) { toast(invalidAlarmMessage()); return; }
  } else if (offset === 0 || referenceTimestamp() <= Date.now()) {
    toast(t('moveFuture'));
    return;
  }
  pendingLead = lead;
  updateSelectionState();
}

function updateSelectionState() {
  const active = pendingLead !== null;
  document.body.classList.toggle('choosing-city', active);
  const status = $('#selectionStatus');
  if (status) status.innerHTML = active ? `<span>${t('choose')}</span><button id="cancelSelection">${t('cancel')}</button>` : '';
  $('#cancelSelection')?.addEventListener('click', () => { pendingLead = null; updateSelectionState(); });
}

function createReminder(zone, lead, city, options = {}) {
  const target = referenceTimestamp();
  const now = Date.now();
  if (!validAlarm(target, lead)) { toast(invalidAlarmMessage()); return; }
  const entry = {
    id: crypto.randomUUID().replaceAll('-', ''), target: target / 1000,
    alarm: alarmTimestamp(target, lead) / 1000, state: 'pending', lead, direction: 'after',
    zone: zoneOf(zone), city_key: zone, city: city || cityCaption(zone), started_at: now / 1000,
    title: '', source_type: options.sourceType || 'city', base_kind: options.sourceType === 'base' ? config.settings.top_clock_mode : null,
  };
  syncReminderModel(entry);
  const duplicate = reminders.entries.find(old => old.source_type === entry.source_type && old.target === entry.target && (old.city_key || old.city) === (old.city_key ? entry.city_key : entry.city) && old.zone === entry.zone && old.lead === lead);
  if (!duplicate) reminders.entries.push(entry);
  reminders.lead = lead;
  pendingLead = null;
  offset = 0;
  saveReminders();
  render();
  if (!duplicate && Number.isFinite(options.x)) showNamePopover(entry.id, options.x, options.y);
  return (duplicate || entry).id;
}

function modal(title, body, onBack = closeModal) {
  hideContextTooltip();
  hideReminderTooltip();
  if (capturingHotkey) send('endHotkeyCapture');
  detailId = null; capturingHotkey = false; closeNamePopover();
  $('#modal').innerHTML = `<section class="modal-root"><div class="modal-head"><button class="icon" id="back">‹</button><h2>${esc(title)}</h2></div><div class="modal-body">${body}</div></section>`;
  $('#back').onclick = onBack;
}

function closeModal() { if (capturingHotkey) send('endHotkeyCapture'); detailId = null; capturingHotkey = false; candidateHotkey = null; $('#modal').innerHTML = ''; }

let featureTourTarget = null;
let featureGuideViewState = null;

function stopFeatureTour() {
  featureTourTarget?.classList.remove('feature-tour-focus');
  featureTourTarget = null;
  const panel = $('#featureTour');
  if (panel) { panel.className = ''; panel.innerHTML = ''; }
}

function featureGuideItems() {
  return lang() === 'ru' ? [
  [
    "timeline",
    "Посмотреть время во всех городах",
    "Передвиньте ползунок [[timeline]] под большими часами. Все города покажут выбранный момент по местному времени.\nЧтобы вернуться к текущему времени, нажмите общую шкалу правой кнопкой мыши.",
    "Ползунок помогает выбрать время звонка без пересчёта часовых поясов. Его также можно двигать колёсиком над общей шкалой."
  ],
  [
    "cities",
    "Добавить город и сохранить в избранное",
    "Нажмите «Добавить город» [[add]] под списком.\nВведите название и нажмите [[cityPlus]] рядом с нужным результатом. Карточка появится на главном экране.",
    "Звёздочка [[favorite]] сохраняет город для быстрого выбора: избранные видны при пустой строке поиска. Повторное нажатие или корзина [[unfavorite]] в этом списке убирает только из избранного. Чтобы добавить карточку, нажимайте [[cityPlus]]. Один город можно добавить для нескольких людей."
  ],
  [
    "cityActions",
    "Изменить список городов",
    "Нажмите карточку города и выберите «Сменить город» [[replace]] или «Сделать базовым» [[base]].\nДля удаления нажмите корзину [[delete]] справа на карточке — раскрывать её не нужно.",
    "Чтобы изменить порядок, удерживайте карточку мышью, перенесите на нужное место и отпустите. Действие относится только к этой карточке, даже если город повторяется."
  ],
  [
    "baseCity",
    "Выбрать время для больших часов",
    "Откройте настройки [[settings]] → «Базовый город».\nОставьте время компьютера или выберите город.",
    "Большие часы показывают базовое время. От него считаются разница времени городов и время на общей шкале."
  ],
  [
    "availability",
    "Понять, когда удобно связаться",
    "Посмотрите на цветную полосу внизу карточки города. Белая черта показывает момент, выбранный общим ползунком. [[cityScale]]",
    "Зелёный [[working]] — рабочие часы.\nЖёлтый [[okay]] — человек, вероятно, не спит: сначала спросите, удобно ли говорить; срочное обращение возможно.\nТёмный [[dnd]] — лучше не беспокоить.\nЦвета отражают заданный график, а не присутствие в сети."
  ],
  [
    "schedule",
    "Задать имя и часы связи",
    "Нажмите карточку города → «Имя и график» [[schedule]] и введите имя человека.\nДля личного распорядка выключите «Использовать общий график» [[scheduleDefault]].\nЗадайте начало часов связи, начало и конец работы, начало «Не беспокоить». Нажмите «Сохранить».",
    "Имя помогает различать людей в одном городе. График изменит цветную полосу и будет учтён при подборе созвона."
  ],
  [
    "meeting",
    "Найти время для созвона",
    "Раскройте быстрые напоминания через [[quick]] и нажмите «Удобно всем» [[meeting]].\nВсе города уже участвуют. Нажмите карточку, чтобы исключить город; ещё раз — вернуть. Чтобы учесть своё время, нажмите большие часы.\nНажмите [[copy]] справа от [[meeting]] и вставьте текст в чат: каждый увидит время встречи для своего города.",
    "Для двух и более участников ищется общее окно от 30 минут в ближайшие 24 часа. Если есть более ранний вариант, появится [[periodSwitch]]: солнце — лучшее время, закат — более раннее. Жёлтые часы согласуйте с участниками. Для выхода нажмите [[meeting]] снова."
  ],
  [
    "meetingCopy",
    "Отправить время участникам",
    "Выберите момент ползунком [[timeline]] или найдите его через [[meeting]].\nНажмите [[copy]] справа от «Удобно всем». Если кнопки скрыты, раскройте их через [[quick]].\nОткройте чат и вставьте текст: Ctrl+V в Windows или ⌘V на Mac.",
    "Копируется список местных дат, времени и названий: в подборе — выбранных участников, вне подбора — больших часов и всех городов. До вставки текст хранится в буфере обмена."
  ],
  [
    "reminderNow",
    "Напомнить через несколько минут",
    "Вернитесь к «Сейчас» правым кликом по общей шкале [[timeline]]. Если интервалы скрыты, нажмите [[quick]].\nНажмите положительный интервал [[positiveInterval]], затем нужный город или большие часы.",
    "Можно вместо двух нажатий перетащить интервал прямо на нужную карточку. Напоминание появится рядом с большими часами и прозвучит через выбранное число минут. При желании добавьте название."
  ],
  [
    "reminderFuture",
    "Напомнить в выбранный час, до или после него",
    "Передвиньте ползунок [[timeline]] на нужное будущее время.\nНажмите интервал [[interval]], затем город или большие часы. Можно перетащить интервал прямо на них.",
    "Например, при выбранных 10:00: [[before]] — сигнал в 9:45, [[after]] — в 10:15. Интервал 0 показывает время [[zeroInterval]] и ставит сигнал ровно на 10:00. Число минут меняется колёсиком. Все примеры используют время больших часов; сигнал должен оставаться в будущем."
  ],
  [
    "reminderScroll",
    "Изменить число минут на карточке",
    "Наведите указатель на интервал [[interval]]. Колёсико вверх увеличивает минуты, вниз — уменьшает; один щелчок меняет одну минуту.",
    "Плюс означает «после» выбранного времени, минус — «до». При 0 карточка показывает время [[zeroInterval]]: сигнал будет точно в этот момент. Значение сохраняется. Для 0 и минуса сначала выберите будущее время ползунком."
  ],
  [
    "reminderDrag",
    "Поставить напоминание перетаскиванием",
    "Оставьте «Сейчас» для отсчёта от текущего времени или передвиньте [[timeline]] на будущий момент.\nУдерживайте интервал [[interval]] мышью, перенесите на город или большие часы и отпустите.",
    "Минуты можно заранее изменить колёсиком. Напоминание создастся сразу, если время срабатывания ещё впереди. Оно появится рядом с большими часами; можно добавить название. Это альтернатива нажатию интервала и города."
  ],
  [
    "reminderExact",
    "Указать дату, время и ежедневный повтор",
    "Нажмите город или большие часы → «Напоминание» [[alarm]].\nВыберите будущие день, часы и минуты по местному времени этой карточки.\nДля повтора каждый день включите «Ежедневно» [[daily]]. Нажмите «Создать».",
    "С выключенным переключателем сигнал прозвучит один раз, с включённым — каждый день в этот местный час. Название и звук необязательны. Изменения существующего напоминания подтверждаются кнопкой «Сохранить»."
  ],
  [
    "reminderTrack",
    "Найти напоминание на полосе города",
    "Значок будильника на цветной полосе отмечает время сигнала. Вот пример его расположения: [[reminderScale]]",
    "Наведите указатель на будильник, чтобы увидеть время и название; нажмите — открыть список напоминаний города. Число у значка означает группу, у края полосы — напоминания вне видимой части. Белая черта показывает выбранное время, а не будильник."
  ],
  [
    "reminderManage",
    "Удалить или изменить напоминание",
    "Для удаления нажмите корзину [[deleteReminder]] в строке напоминания рядом с большими часами. Оно удалится сразу.\nДля изменения нажмите текст строки, исправьте время, название, повтор или звук и нажмите «Сохранить».",
    "Другой путь — открыть список через будильник на полосе города, затем нужное напоминание. В редакторе тоже есть «Удалить». При срабатывании сигнал можно отложить на 5 минут."
  ],
  [
    "reminderPrefs",
    "Подготовить свои интервалы, названия и звук",
    "Откройте настройки [[settings]].\nВ «Интервалах напоминания» задайте привычные минуты, в «Быстрых названиях напоминаний» — частые дела.\nВ «Звуке напоминания» выберите и прослушайте сигнал или добавьте свой аудиофайл.",
    "Готовые минуты и названия ускоряют создание напоминаний. Звёздочка отмечает любимые звуки для быстрого выбора. Отдельному напоминанию можно назначить другой звук в редакторе."
  ],
  [
    "settings",
    "Настроить виджет под себя",
    "Откройте настройки [[settings]]. Здесь выбираются тема, язык, формат часов, базовый город и масштаб текста и элементов.\nВ «Появлении и скрытии» выберите сторону панели, в «Клавише вызова панели» — сочетание клавиш. Включите автозапуск для открытия при входе в систему.",
    "Тему можно согласовать с системой, часы показывать в формате 12 или 24 часа. Размер окна меняется за край; высота верхнего блока — за ручку под ним. Настройки сохраняются."
  ],
  [
    "updates",
    "Проверить обновления",
    "Нажмите [[update]] внизу окна. Если новая версия уже найдена, кнопка предложит её скачать.",
    "В Windows установщик запускается после проверки загрузки; на Mac откроется загрузка DMG. Номер версии [[version]] открывает это обучение."
  ]
] : [
  [
    "timeline",
    "See the time in all cities",
    "Move the slider [[timeline]] below the large clock. All cities show the chosen moment in their local time.\nRight-click the main timeline to return to the current time.",
    "Use it to plan a call without time-zone calculations. You can also move it with the mouse wheel over the main timeline."
  ],
  [
    "cities",
    "Add a city and save a favorite",
    "Press “Add city” [[add]] below the list.\nType a name and press [[cityPlus]] beside the right result. Its card appears on the main screen.",
    "The star [[favorite]] saves a city for quick selection: favorites appear when search is empty. Pressing it again or the trash button [[unfavorite]] in that list removes only the favorite. Press [[cityPlus]] to add a card. One city can represent several people."
  ],
  [
    "cityActions",
    "Change your city list",
    "Click a city card and choose “Change city” [[replace]] or “Make base” [[base]].\nTo delete it, press [[delete]] on the right; no need to expand the card.",
    "To reorder, hold a card with the mouse, move it and release. Actions affect only that card, even if the city appears more than once."
  ],
  [
    "baseCity",
    "Choose the time for the large clock",
    "Open settings [[settings]] → “Base city”.\nKeep computer time or choose a city.",
    "The large clock shows your base time. The main timeline and city time differences use this clock."
  ],
  [
    "availability",
    "Know when to get in touch",
    "Look at the colored band at the bottom of a city card. The white line indicates the moment selected with the main slider. [[cityScale]]",
    "Green [[working]] means working hours.\nYellow [[okay]] means the person is probably awake: ask if it is a good time to talk; urgent contact may be possible.\nDark [[dnd]] means it is best not to disturb them.\nColors reflect the configured schedule, not online presence."
  ],
  [
    "schedule",
    "Set a name and contact hours",
    "Click a city card → “Name and schedule” [[schedule]] and enter the person’s name.\nFor a personal routine, turn off “Use default schedule” [[scheduleDefault]].\nSet when contact starts, work starts and ends, and do-not-disturb begins. Press “Save”.",
    "Names distinguish people in one city. The schedule changes their colored band and is used to find a shared call time."
  ],
  [
    "meeting",
    "Find a time to call",
    "Open quick reminders with [[quick]] and press “Good for all” [[meeting]].\nAll cities are included. Click a card to exclude that city; click again to include it. Click the large clock to include your own time.\nPress [[copy]] beside [[meeting]] and paste into chat so everyone sees their local meeting time.",
    "For two or more participants, the widget finds at least 30 shared minutes in the next 24 hours. If an earlier option exists, [[periodSwitch]] appears: sun means best, sunset means earlier. Check yellow hours with participants. Press [[meeting]] again to exit."
  ],
  [
    "meetingCopy",
    "Share participant times",
    "Choose a moment with [[timeline]] or find one using [[meeting]].\nPress [[copy]] beside “Good for all”. If hidden, open the buttons with [[quick]].\nOpen your chat and paste: Ctrl+V on Windows or ⌘V on Mac.",
    "The copied list contains local dates, times and names: selected participants during meeting selection; otherwise the large clock and all cities. Until pasted, the text is stored on the clipboard."
  ],
  [
    "reminderNow",
    "Remind me in a few minutes",
    "Right-click the main timeline [[timeline]] to return to “Now”. Press [[quick]] if intervals are hidden.\nClick a positive interval [[positiveInterval]], then a city or the large clock.",
    "Alternatively, drag the interval straight onto the desired card. The reminder appears beside the large clock and rings that many minutes from now. You can add a title."
  ],
  [
    "reminderFuture",
    "Remind me at, before or after a time",
    "Move [[timeline]] to the future time you need.\nClick an interval [[interval]], then a city or the large clock. Or drag it straight onto either one.",
    "For example, with 10:00 selected: [[before]] rings at 9:45 and [[after]] at 10:15. Interval 0 shows a time [[zeroInterval]] and rings exactly at 10:00. Change minutes with the wheel. These examples use the large clock’s time; the alarm must remain in the future."
  ],
  [
    "reminderScroll",
    "Change the minutes on a card",
    "Hover over an interval [[interval]]. Scroll up to increase minutes or down to decrease them; each wheel click changes one minute.",
    "Plus means “after” the selected time; minus means “before”. At 0, the card shows a time [[zeroInterval]] and rings at that exact moment. The value is saved. Select a future time first for zero or negative intervals."
  ],
  [
    "reminderDrag",
    "Set a reminder by dragging",
    "Leave “Now” to count from the current time, or move [[timeline]] to a future moment.\nHold an interval [[interval]] with the mouse, move it onto a city or the large clock and release.",
    "Adjust minutes with the wheel first if needed. A reminder is created immediately if the alarm time is still ahead. It appears beside the large clock; you can add a title. This is an alternative to clicking the interval and city."
  ],
  [
    "reminderExact",
    "Choose a date, time and daily repeat",
    "Click a city or the large clock → “Reminder” [[alarm]].\nChoose a future day, hour and minute in that card’s local time.\nEnable “Daily” [[daily]] for a daily repeat. Press “Create”.",
    "With the switch off, it rings once; with it on, every day at that local hour. Title and sound are optional. Confirm edits to an existing reminder with “Save”."
  ],
  [
    "reminderTrack",
    "Find a reminder on a city band",
    "The alarm icon on the colored band marks the signal time. Here is an example of its position: [[reminderScale]]",
    "Hover over the alarm for its time and title; click to open the city’s reminder list. A count beside an icon means a group; at an edge it means reminders outside the visible band. The white line marks the selected time, not an alarm."
  ],
  [
    "reminderManage",
    "Delete or edit a reminder",
    "To delete, press [[deleteReminder]] in the reminder row beside the large clock. It is removed immediately.\nTo edit, click the row’s text, change the time, title, repeat or sound and press “Save”.",
    "Alternatively, open the list using an alarm on the city band, then open the reminder. Its editor also has “Delete”. When it rings, you can snooze for 5 minutes."
  ],
  [
    "reminderPrefs",
    "Prepare your intervals, titles and sound",
    "Open settings [[settings]].\nSet your usual minutes in “Reminder intervals” and frequent tasks in “Quick reminder titles”.\nIn “Reminder sound”, choose and preview a signal or add your own audio file.",
    "Ready-made minutes and titles make reminders quicker to create. A star marks favorite sounds for quick selection. Set a different sound for an individual reminder in its editor."
  ],
  [
    "settings",
    "Make the widget suit you",
    "Open settings [[settings]] to choose a theme, language, clock format, base city and interface scale.\nIn “Show and hide”, choose the panel’s side; in “Panel shortcut”, set a key combination. Enable startup to open it when you sign in.",
    "The theme can follow your system; clocks can use 12 or 24 hours. Drag a window edge to resize; drag the handle below the top panels to adjust their height. Settings are saved."
  ],
  [
    "updates",
    "Check for updates",
    "Press [[update]] at the bottom. If a new version is already found, the button offers its download.",
    "Windows starts the installer after checking the download; Mac opens the DMG download. The version number [[version]] opens this guide."
  ]
];
}

// Illustrative card fragment: shared band renderer and reminder glyph, never saved data.
function guideCityScale(withReminder = false) {
  const key = config.timezones[0] || config.settings.base_timezone || baseZone();
  const at = new Date(referenceTimestamp());
  const band = temporalBandHtml(at, key).replace('<div ', '<span ').replace('</div>', '</span>');
  return `<span class="guide-city-scale"><span class="guide-city-caption">${esc(cityName(key))}</span><span class="guide-city-time">${esc(timeAt(at, zoneOf(key)))}</span>${band}${withReminder ? `<span class="city-alarm-track"><span class="city-alarm-pin" style="left:72%">${cityReminderIcon}</span></span>` : ''}</span>`;
}

function guideControls() {
  const ru = lang() === 'ru';
  return {
    settings: ['[data-action=settings]', `<button class="icon">⚙</button>`, t('settings')],
    cityPlus: ['[data-add]:not(:disabled)', '<button class="guide-result-button">＋</button>', ru ? 'Добавить найденный город' : 'Add city result', 'guide-city-result'],
    favorite: ['[data-star]', '<button class="guide-result-button">☆</button>', ru ? 'Сохранить город в избранном' : 'Favorite city', 'guide-city-result'],
    unfavorite: ['[data-unfav]', `<button class="guide-result-button trash">${trashIcon}</button>`, ru ? 'Убрать только из избранного' : 'Remove favorite only', 'guide-city-result'],
    zeroInterval: ['.quick .chip[data-lead="0"]', `<button class="chip"><span class="chip-caption">${esc(intervalCaption(0))}</span><span class="grip">⋮</span></button>`, ru ? 'Нулевой интервал: ровно выбранное время' : 'Zero interval: exactly the selected time'],
    daily: ['#dailySwitch', '<button class="switch on"></button>', ru ? 'Повторять ежедневно' : 'Repeat daily'],
    cityScale: ['', guideCityScale(), ru ? 'Пример карточки города с цветной полосой и белой отметкой выбранного времени' : 'Example city card with contact band and white selected-time marker'],
    reminderScale: ['', guideCityScale(true), ru ? 'Пример карточки: значок будильника расположен прямо на цветной полосе' : 'Example card: alarm icon directly on the colored band'],
    add: ['[data-action=add]', `<button class="add">＋ &nbsp; ${t('add')}</button>`, t('add')],
    deleteReminder: ['.saved-delete svg', trashIcon, t('delete')],
    delete: ['.city-card .delete svg', trashIcon, t('delete')],
    quick: ['#quickToggle', `<button class="quick-toggle">${quickAlarmIcon}${quickChevronIcon}</button>`, ru ? 'Быстрые напоминания' : 'Quick reminders'],
    positiveInterval: ['.quick .chip:not([data-lead="0"]):not([data-lead^="-"])', `<button class="chip"><span class="chip-caption">${esc(intervalCaption(15))}</span><span class="grip">⋮</span></button>`, ru ? 'Положительный интервал' : 'Positive interval'],
    interval: ['.quick .chip', `<button class="chip"><span class="chip-caption">${esc(intervalCaption(config.settings.reminder_intervals[0]))}</span><span class="grip">⋮</span></button>`, ru ? 'Карточка интервала' : 'Interval card'],
    before: ['', `<button class="chip"><span class="chip-caption">${esc(intervalCaption(-15))}</span><span class="grip">⋮</span></button>`, ru ? 'За 15 минут' : '15 minutes before'],
    after: ['', `<button class="chip"><span class="chip-caption">${esc(intervalCaption(15))}</span><span class="grip">⋮</span></button>`, ru ? 'Через 15 минут' : '15 minutes after'],
    meeting: ['#meetingToggle', `<button class="meeting-toggle">${ru ? 'Удобно всем' : 'Good for all'}</button>`, ru ? 'Удобно всем' : 'Good for all'],
    copy: ['#meetingCopy', `<button class="meeting-copy">${copyIcon}</button>`, ru ? 'Скопировать время городов' : 'Copy city times'],
    periodSwitch: ['#meetingEarlier', `<button class="period-switch"><i class="period-thumb"></i><span>${sunIcon}</span><span>${horizonIcon}</span></button>`, ru ? 'Лучшее или более раннее время' : 'Best or earlier time', 'meeting-status'],
    alarm: ['[data-city-action=alarm]', `<button>${t('alarmAction')}</button>`, t('alarmAction'), 'card-actions'],
    schedule: ['[data-city-action=schedule]', `<button>${t('nameAndSchedule')}</button>`, t('nameAndSchedule'), 'card-actions'],
    base: ['[data-city-action=base]', `<button>${t('makeBase')}</button>`, t('makeBase'), 'card-actions'],
    replace: ['[data-city-action=replace]', `<button>${t('changeCity')}</button>`, t('changeCity'), 'card-actions'],
    update: ['#updateButton', `<button class="update-button">${checkUpdateIcon}</button>`, ru ? 'Проверить обновления' : 'Check for updates'],
    version: ['#versionButton', `<button class="version-button">${esc(version)}</button>`, ru ? 'Номер версии' : 'Version number'],
    scheduleDefault: ['#useDefaultSwitch', `<button class="switch on"></button>`, t('useDefault')],
    defaultScale: ['#interfaceScaleDefaultSwitch', `<button class="switch ${config.settings.interface_scale_default ? 'on' : ''}"></button>`, ru ? 'Масштаб по умолчанию' : 'Default interface scale'],
    working: ['', `<span class="guide-period working">${availabilityGlyph('working')}</span>`, ru ? 'Рабочее время' : 'Working hours'],
    okay: ['', `<span class="guide-period okay">${availabilityGlyph('okay')}</span>`, ru ? 'Можно связаться' : 'Okay to contact'],
    dnd: ['', `<span class="guide-period dnd">${availabilityGlyph('dnd')}</span>`, ru ? 'Не беспокоить' : 'Do not disturb'],
    reminder: ['', cityReminderIcon, ru ? 'Напоминание на шкале' : 'Timeline reminder'],
    timeline: ['', `<span class="guide-scale"><span class="slider-rail"><span class="slider-fill"></span></span><span class="slider-thumb"></span></span>`, ru ? 'Шкала времени и ползунок' : 'Timeline and slider'],
  };
}

function guideControl(key) {
  const definition = guideControls()[key];
  if (!definition) return esc(key);
  const [selector, fallback, label, context = ''] = definition;
  const source = selector ? $(selector) : null;
  let markup = fallback;
  // Read the actual rendered control: future icon, caption and style changes carry into help.
  if (source?.cloneNode) {
    const clone = source.cloneNode(true);
    // Preserve the live control's typography and paint, including selector context.
    // Its inline illustration uses the same component at a uniformly smaller scale.
    const originals = [source, ...source.querySelectorAll('*')];
    [clone, ...clone.querySelectorAll('*')].forEach((node, index) => {
      const style = window.getComputedStyle?.(originals[index]);
      if (!style || !node.style) return;
      for (const property of ['font-family','font-size','font-weight','font-style','line-height','letter-spacing','color','background-color','background-image','border-top','border-right','border-bottom','border-left','border-radius','box-shadow','padding','height','fill','stroke','stroke-width']) {
        node.style.setProperty(property, style.getPropertyValue(property));
      }
    });
    clone.removeAttribute('hidden');
    for (const node of [clone, ...clone.querySelectorAll('*')]) {
      for (const attribute of [...node.attributes]) {
        if (/^(id|name|for|title|autofocus|aria-controls|aria-labelledby|aria-describedby)$/.test(attribute.name) || /^(data-|on)/.test(attribute.name)) node.removeAttribute(attribute.name);
      }
    }
    markup = clone.outerHTML;
  }
  return `<span class="guide-control ${context}" data-guide-control="${key}" role="img" aria-label="${esc(label)}"><span class="guide-control-visual" inert aria-hidden="true">${markup}</span></span>`;
}

function guideText(text) {
  return esc(text).replace(/\[\[([a-zA-Z]+)\]\]/g, (_, key) => guideControl(key));
}

function guideParagraphs(text) {
  return text.split(/(\[\[(?:cityScale|reminderScale)\]\])/).map(part => {
    if (/^\[\[(?:cityScale|reminderScale)\]\]$/.test(part)) return `<figure class="guide-figure">${guideText(part)}</figure>`;
    return part.split('\n').filter(line => line.trim()).map(line => `<p>${guideText(line)}</p>`).join('');
  }).join('');
}

function guideSteps(text) {
  const steps = text.split('\n');
  return steps.length > 1 ? `<ol class="guide-steps">${steps.map(step => `<li>${guideText(step)}</li>`).join('')}</ol>` : guideParagraphs(text);
}

function openFeatureGuide({restore = false} = {}) {
  stopFeatureTour();
  const ru = lang() === 'ru';
  const groups = ru ? [
    ['Время и города', ['timeline','cities','cityActions','baseCity','availability','schedule']],
    ['Созвоны', ['meeting','meetingCopy']],
    ['Напоминания', ['reminderNow','reminderFuture','reminderScroll','reminderDrag','reminderExact','reminderTrack','reminderManage','reminderPrefs']],
    ['Виджет', ['settings','updates']]
  ] : [
    ['Time and cities', ['timeline','cities','cityActions','baseCity','availability','schedule']],
    ['Calls', ['meeting','meetingCopy']],
    ['Reminders', ['reminderNow','reminderFuture','reminderScroll','reminderDrag','reminderExact','reminderTrack','reminderManage','reminderPrefs']],
    ['Widget', ['settings','updates']]
  ];
  const items = new Map(featureGuideItems().map(item => [item[0], item]));
  const view = restore ? featureGuideViewState : null;
  modal(ru ? 'Возможности' : 'Features', `<div class="feature-guide"><div class="feature-intro"><strong>World Clock Widget ${esc(version)}</strong><p>${ru ? 'Большие часы показывают время компьютера или выбранного базового города. Ползунок меняет показанный момент сразу во всех городах. Выберите раздел и тему; образцы в тексте помогают узнать нужный элемент, а «Показать в интерфейсе» — найти его.' : 'The large clock shows computer time or your chosen base city. The slider changes the displayed moment in every city. Choose a section and topic; illustrations help you recognize controls, and “Show in the widget” helps you find them.'}</p></div>${groups.map(([name, ids], index) => `<details class="feature-group" data-guide-section="${index}" ${view?.section === String(index) ? 'open' : ''}><summary><h3>${esc(name)}</h3><span class="feature-count">${ids.length}</span></summary><div class="feature-group-content">${ids.map(id => { const [, title, press, result] = items.get(id); return `<details class="feature-card" data-guide-topic="${id}" ${view?.topic === id ? 'open' : ''}><summary><h4>${esc(title)}</h4></summary><div class="feature-content">${guideSteps(press)}${guideParagraphs(result)}<button class="feature-show" data-feature="${id}" type="button">${ru ? 'Показать в интерфейсе' : 'Show in the widget'} ›</button></div></details>`; }).join('')}</div></details>`).join('')}</div>`);
  const sections = $$('.feature-group'), topics = $$('.feature-card');
  sections.forEach(section => section.addEventListener('toggle', () => {
    if (section.open) sections.filter(other => other !== section).forEach(other => { other.open = false; });
    else section.querySelectorAll('.feature-card').forEach(topic => { topic.open = false; });
  }));
  topics.forEach(topic => topic.addEventListener('toggle', () => {
    if (topic.open) topics.filter(other => other !== topic).forEach(other => { other.open = false; });
  }));
  $$('[data-feature]').forEach(button => button.onclick = () => showFeatureInApp(button.dataset.feature));
  if (view) {
    const restoreView = () => {
      const body = $('#modal .modal-body');
      if (!body?.querySelector('.feature-guide')) return;
      body.scrollTop = view.scrollTop;
      body.querySelector(`[data-feature="${view.topic}"]`)?.focus?.({preventScroll:true});
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restoreView);
    else restoreView();
  }
}

function showFeatureInApp(id) {
  const guide = $('#modal .feature-guide');
  if (guide?.querySelector) featureGuideViewState = {
    section: guide.querySelector('.feature-group[open]')?.dataset.guideSection ?? null,
    topic: guide.querySelector('.feature-card[open]')?.dataset.guideTopic ?? id,
    scrollTop: $('#modal .modal-body')?.scrollTop || 0,
  };
  stopFeatureTour();
  closeModal();
  let selector = '', focusSelector = '';
  if (id === 'timeline') { selector = '#timeSlider'; focusSelector = '#sliderArea'; }
  else if (id === 'cities') selector = '[data-action=add]';
  else if (id === 'cityActions') {
    if (config.timezones.length) { expandedCityKey = config.timezones[0]; applyExpandedCityState(); selector = '.city-card'; }
    else selector = '[data-action=add]';
  }
  else if (id === 'availability') selector = config.timezones.length ? '.city-card' : '#baseClock';
  else if (id === 'schedule') {
    if (config.timezones.length) { expandedCityKey = config.timezones[0]; applyExpandedCityState(); selector = '[data-city-action=schedule]'; }
    else { openCitySettingsList(); selector = '#baseSchedule'; }
  }
  else if (id === 'baseCity') { openSettings(); selector = '#base'; }
  else if (id === 'meeting' || id === 'meetingCopy') {
    if (!meetingMode && offset === 0) { quickAtNowOpen = true; updateQuickVisibility(); }
    selector = id === 'meeting' ? '#meetingToggle' : '#meetingCopy';
  }
  else if (id === 'reminderNow' || id === 'reminderFuture' || id === 'reminderDrag' || id === 'reminderScroll') {
    if (offset === 0) { quickAtNowOpen = true; updateQuickVisibility(); }
    selector = '.quick .chip';
  }
  else if (id === 'reminderExact') {
    if (config.timezones.length) { expandedCityKey = config.timezones[0]; applyExpandedCityState(); selector = '[data-city-action=alarm]'; }
    else { expandedBase = true; applyExpandedBaseState(); selector = '[data-base-action=alarm]'; }
  }
  else if (id === 'reminderTrack') selector = config.timezones.length ? '.city-card .city-alarm-track' : '#baseClock';
  else if (id === 'reminderManage') selector = reminders.entries.length ? '.saved-card' : '#savedHeading';
  else if (id === 'reminderPrefs') { openSettings(); selector = '#intervals'; }
  else if (id === 'settings') { openSettings(); selector = '#theme'; }
  else if (id === 'updates') selector = '#updateButton';
  const target = $(selector);
  if (!target) { openFeatureGuide({restore:true}); return; }
  const [,title,originalPress,result] = featureGuideItems().find(([key]) => key === id);
  const press = id === 'reminderManage' && !reminders.entries.length
    ? (lang() === 'ru' ? 'Здесь появятся ваши напоминания. Создайте первое через [[quick]] или действие [[alarm]] на карточке города.' : 'Saved reminders appear here. Create one with [[quick]] or [[alarm]] on a city card.')
    : originalPress;
  featureTourTarget = $(focusSelector || selector) || target;
  featureTourTarget.classList.add('feature-tour-focus');
  target.scrollIntoView?.({block:'center',behavior:'smooth'});
  const panel = $('#featureTour');
  panel.innerHTML = `<div class="feature-tour-card"><button class="feature-tour-close" id="featureTourClose" type="button" aria-label="${lang() === 'ru' ? 'Закрыть подсказку' : 'Close tip'}">×</button><strong>${esc(title)}</strong>${guideSteps(press)}<div class="feature-tour-result">${guideParagraphs(result)}</div><button id="featureTourBack" type="button">${lang() === 'ru' ? '← Все возможности' : '← All features'}</button></div>`;
  panel.className = 'show';
  if (target.getBoundingClientRect?.().top > window.innerHeight / 2) panel.classList.add('top');
  $('#featureTourBack').onclick = () => openFeatureGuide({restore:true});
  $('#featureTourClose').onclick = stopFeatureTour;
}

function versionParts(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:\s|$)/.exec(value || '');
  return match ? match.slice(1, 4).map(Number) : null;
}

function newerVersion(candidate, installed) {
  const next = versionParts(candidate), current = versionParts(installed);
  if (!next || !current) return false;
  for (let i = 0; i < 3; i++) if (next[i] !== current[i]) return next[i] > current[i];
  return false;
}

function updateUpdateButton() {
  const button = $('#updateButton');
  if (!button) return;
  const ru = lang() === 'ru';
  const available = Boolean(updateState.release && newerVersion(updateState.release.tag, version));
  const caption = updateState.checking ? (ru ? 'Проверяем обновление…' : 'Checking for updates…')
    : available ? (ru ? `Скачать обновление ${updateState.release.tag}` : `Download update ${updateState.release.tag}`)
    : (ru ? 'Проверить обновление' : 'Check for updates');
  button.innerHTML = available ? downloadUpdateIcon : checkUpdateIcon;
  button.dataset.tooltip = caption;
  button.setAttribute('aria-label', caption);
  button.disabled = updateState.checking;
  button.classList.toggle('available', available);
  button.classList.toggle('checking', updateState.checking);
}

async function checkForUpdates(manual = false) {
  if (updateState.checking) return;
  const now = Date.now();
  let last = updateState.lastCheck || 0;
  try { last = Number(localStorage.getItem(updateCheckKey) || last); } catch {}
  if (!manual && now - last < updateCheckPeriod) return;
  updateState.checking = true;
  updateUpdateButton();
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch('https://api.github.com/repos/CandFlip/world-clock-widget/releases/latest', {
      headers: {'Accept':'application/vnd.github+json'}, signal:abort.signal, cache:'no-store'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const release = await response.json();
    if (release.draft || release.prerelease || !versionParts(release.tag_name)) throw new Error('Invalid release');
    const suffix = platform === 'macos' ? '.dmg' : '.exe';
    const asset = (release.assets || []).find(item => item.name?.startsWith('WorldClockWidget-') && item.name.endsWith(suffix));
    if (!asset || !asset.browser_download_url?.startsWith('https://github.com/CandFlip/world-clock-widget/releases/download/')) throw new Error('Release asset missing');
    if (platform === 'windows' && !/^sha256:[a-f\d]{64}$/i.test(asset.digest || '')) throw new Error('Release checksum missing');
    updateState.release = {tag:release.tag_name, url:asset.browser_download_url, digest:asset.digest || ''};
    try { localStorage.setItem(updateReleaseKey, JSON.stringify(updateState.release)); } catch {}
    if (manual) toast(newerVersion(release.tag_name, version)
      ? (lang() === 'ru' ? `Доступна версия ${release.tag_name}` : `Version ${release.tag_name} is available`)
      : (lang() === 'ru' ? 'У вас актуальная версия' : 'You have the latest version'));
  } catch (error) {
    if (manual) toast(lang() === 'ru' ? 'Не удалось проверить обновления' : 'Could not check for updates');
  } finally {
    updateState.lastCheck = now;
    try { localStorage.setItem(updateCheckKey, String(now)); } catch {}
    clearTimeout(timeout);
    updateState.checking = false;
    updateUpdateButton();
  }
}

function restoreUpdateState() {
  try {
    const release = JSON.parse(localStorage.getItem(updateReleaseKey) || 'null');
    if (release && versionParts(release.tag) &&
        release.url?.startsWith('https://github.com/CandFlip/world-clock-widget/releases/download/'))
      updateState.release = release;
  } catch {}
}

function updateButtonClick() {
  const release = updateState.release;
  if (!release || !newerVersion(release.tag, version)) { checkForUpdates(true); return; }
  if (platform === 'macos') {
    send(`openExternal\n${release.url}`);
    toast(lang() === 'ru' ? 'Загрузка открыта в браузере' : 'Download opened in browser');
  } else {
    send(`downloadUpdate\n${release.tag}\n${release.digest}`);
    toast(lang() === 'ru' ? 'Загружаем обновление…' : 'Downloading update…');
  }
}

function directionOptions() {
  return lang() === 'ru'
    ? [['left','← Слева'],['right','Справа →'],['top','↑ Сверху'],['bottom','↓ Снизу']]
    : [['left','← Left'],['right','Right →'],['top','↑ Top'],['bottom','↓ Bottom']];
}

function openDirection() {
  const title = lang() === 'ru' ? 'Появление и скрытие' : 'Show and hide';
  const statusIcon = platform === 'macos'
    ? (lang() === 'ru' ? 'значок в строке меню' : 'the menu bar icon')
    : (lang() === 'ru' ? 'значок в трее' : 'the tray icon');
  modal(title, `<p class="settings-help">${lang() === 'ru' ? `Виджет уезжает к выбранному краю экрана и возвращается с той же стороны. Открыть снова: ${hotkeyLabel()} или ${statusIcon}.` : `The widget hides toward this screen edge and returns from the same side. Reopen with ${hotkeyLabel()} or ${statusIcon}.`}</p><div class="direction-picker">${directionOptions().map(([value,name]) => `<button class="direction-choice ${config.settings.overlay_direction === value ? 'selected' : ''}" data-direction="${value}" aria-pressed="${config.settings.overlay_direction === value}">${name}</button>`).join('')}</div>`);
  $$('[data-direction]').forEach(button => button.onclick = () => {
    config.settings.overlay_direction = button.dataset.direction;
    saveConfig(); openDirection();
  });
}

function openHotkey() {
  candidateHotkey = null;
  capturedModifiers = 0;
  hotkeySelection = currentHotkeyMode();
  modal(lang() === 'ru' ? 'Клавиша вызова панели' : 'Panel shortcut',
    `<div class="group"><div class="row toggle-row"><span>${lang() === 'ru' ? 'Сочетание по умолчанию' : 'Default shortcut'} <small>${esc(hotkeyLabel(defaultHotkeyForPlatform()))}</small></span><button class="switch" id="hotkeyModeSwitch" type="button" role="switch" aria-label="${lang() === 'ru' ? 'Сочетание по умолчанию' : 'Default shortcut'}"></button></div></div>
    <div class="hotkey-active"><span>${lang() === 'ru' ? 'Сейчас назначено' : 'Current shortcut'}</span><strong id="hotkeyCurrent">${esc(hotkeyLabel())}</strong></div>
    <div id="hotkeyCustom">
    <button class="hotkey-recorder" id="hotkeyCapture" type="button"></button>
    <div class="hotkey-preview"><span>${lang() === 'ru' ? 'Новое сочетание' : 'New shortcut'}</span><strong id="hotkeyPreview">—</strong></div>
    <button class="primary" id="hotkeyApply" type="button" disabled>${lang() === 'ru' ? 'Применить' : 'Apply'}</button></div>
    <p class="hotkey-feedback" id="hotkeyModeFeedback" role="status" aria-live="polite"></p>`);
  $('#hotkeyCapture').onclick = startHotkeyCapture;
  $('#hotkeyApply').onclick = () => {if (candidateHotkey) requestHotkey(candidateHotkey, 'custom');};
  $('#hotkeyModeSwitch').onclick = () => {
    if (pendingHotkey) return;
    if (capturingHotkey) send('endHotkeyCapture');
    capturingHotkey = false;
    candidateHotkey = null;
    if (hotkeySelection === 'custom') {
      hotkeySelection = 'default';
      requestHotkey(defaultHotkeyForPlatform(), 'default');
    } else {
      hotkeySelection = 'custom';
      const saved = config.settings.manual_hotkey;
      if (saved && !sameHotkey(saved, defaultHotkeyForPlatform())) requestHotkey(saved, 'custom');
      else updateHotkeyUI(lang() === 'ru' ? 'Запишите своё сочетание и нажмите «Применить».' : 'Record a shortcut and press Apply.');
    }
  };
  updateHotkeyUI(hotkeySelection === 'custom' ? (lang() === 'ru' ? 'Нажмите кнопку записи, затем нужные клавиши.' : 'Start recording, then press the desired keys.') : '');
}

function updateHotkeyUI(message) {
  const button = $('#hotkeyCapture');
  if (!button) return;
  $('#hotkeyCustom').hidden = hotkeySelection !== 'custom';
  const modeSwitch = $('#hotkeyModeSwitch');
  modeSwitch.classList.toggle('on', hotkeySelection === 'default');
  modeSwitch.setAttribute('aria-checked', String(hotkeySelection === 'default'));
  button.classList.toggle('recording', capturingHotkey);
  button.textContent = capturingHotkey
    ? (lang() === 'ru' ? '● Запись идёт — нажмите клавиши' : '● Recording — press keys')
    : (lang() === 'ru' ? 'Нажмите, чтобы записать сочетание' : 'Click to record a shortcut');
  $('#hotkeyCurrent').textContent = hotkeyLabel();
  $('#hotkeyPreview').textContent = candidateHotkey ? hotkeyLabel(candidateHotkey)
    : capturingHotkey ? `${modifierLabel(capturedModifiers)}${capturedModifiers ? '+' : ''}…` : '—';
  $('#hotkeyPreview').classList.toggle('ready', Boolean(candidateHotkey));
  $('#hotkeyApply').disabled = !candidateHotkey || Boolean(pendingHotkey);
  if (message !== undefined) $('#hotkeyModeFeedback').textContent = message;
}

function startHotkeyCapture() {
  if (pendingHotkey) return;
  capturingHotkey = true;
  candidateHotkey = null;
  send('beginHotkeyCapture');
  capturedModifiers = 0;
  const modifiers = platform === 'macos' ? 'Control, Option, Shift и Command' : 'Ctrl, Alt и Shift';
  const modifiersEn = platform === 'macos' ? 'Control, Option, Shift and Command' : 'Ctrl, Alt and Shift';
  updateHotkeyUI(lang() === 'ru' ? `Нажатые ${modifiers} появляются ниже. Нажмите клавишу или Mouse 4/5.` : `${modifiersEn} appear below. Press a key or Mouse 4/5.`);
  $('#hotkeyCapture').focus();
}

function requestHotkey(hotkey, mode = 'custom') {
  if (pendingHotkey) return;
  capturingHotkey = false;
  send('endHotkeyCapture');
  pendingHotkey = hotkey;
  pendingHotkeyMode = mode;
  updateHotkeyUI(lang() === 'ru' ? `Проверяем ${hotkeyLabel(hotkey)}…` : `Checking ${hotkeyLabel(hotkey)}…`);
  send(`setHotkey\n${hotkey.modifiers},${hotkey.key}`);
}

document.addEventListener('keydown', event => {
  if (!capturingHotkey || !$('#hotkeyCapture')) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (event.repeat) return;
  capturedModifiers = (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.shiftKey ? 4 : 0) | (event.metaKey ? 8 : 0);
  if (['Control','Alt','Shift','Meta'].includes(event.key)) {updateHotkeyUI(); return;}
  const hotkey = hotkeyFromEvent(event);
  if (!hotkey) {
    updateHotkeyUI(lang() === 'ru' ? 'Эта клавиша или сочетание недоступны. Попробуйте другое.' : 'This key or shortcut is unavailable. Try another.');
    return;
  }
  candidateHotkey = hotkey;
  capturingHotkey = false;
  send('endHotkeyCapture');
  updateHotkeyUI(lang() === 'ru' ? 'Сочетание записано. Нажмите «Применить», чтобы проверить и сохранить.' : 'Shortcut recorded. Press Apply to check and save it.');
}, true);

document.addEventListener('keyup', event => {
  if (!capturingHotkey || !$('#hotkeyCapture')) return;
  event.preventDefault(); event.stopImmediatePropagation();
  capturedModifiers = (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.shiftKey ? 4 : 0) | (event.metaKey ? 8 : 0);
  updateHotkeyUI();
}, true);

function interfaceScale(value = config.settings.interface_scale) {
  const percent = Number(value);
  return Number.isInteger(percent) && percent >= 100 && percent <= 200 && percent % 5 === 0 ? percent : 100;
}
function applyInterfaceScale() {
  window.__worldClockWheelZoom = currentInterfaceScale() / 100;
  send(`setInterfaceScale\n${currentInterfaceScale()}`);
}
function currentInterfaceScale() {
  return config.settings.interface_scale_default ? 100 : interfaceScale();
}
function openInterfaceScale() {
  const ru = lang() === 'ru';
  modal(ru ? 'Масштаб интерфейса' : 'Interface scale', `
    <p class="settings-help">${ru ? 'Выключите масштаб по умолчанию, чтобы выбрать свой размер с шагом 5%. Включите его снова, чтобы вернуться к 100%. Ваш выбор запоминается.' : 'Turn off default interface scale to choose your size in 5% steps. Turn it on again to return to 100%. Your custom size is remembered.'}</p>
    <div class="group interface-scale-group">
      <div class="row toggle-row"><span>${ru ? 'Масштаб по умолчанию' : 'Default interface scale'}</span><button class="switch" id="interfaceScaleDefaultSwitch" type="button" role="switch" aria-label="${ru ? 'Масштаб по умолчанию' : 'Default interface scale'}"></button></div>
      <div class="interface-scale-control"><input id="interfaceScaleSlider" type="range" min="100" max="200" step="5" aria-label="${ru ? 'Масштаб интерфейса' : 'Interface scale'}"><output id="interfaceScaleValue" for="interfaceScaleSlider"></output></div>
      <div class="interface-scale-labels"><span>100%</span><span>200%</span></div>
    </div>`, openSettings);
  const refresh = () => {
    const automatic = config.settings.interface_scale_default;
    const scale = currentInterfaceScale();
    $('#interfaceScaleDefaultSwitch').classList.toggle('on', automatic);
    $('#interfaceScaleDefaultSwitch').setAttribute('aria-checked', String(automatic));
    $('#interfaceScaleSlider').disabled = automatic;
    $('#interfaceScaleSlider').value = scale;
    $('#interfaceScaleSlider').style.setProperty('--scale-progress', `${scale - 100}%`);
    $('#interfaceScaleSlider').setAttribute('aria-valuetext', `${scale}%`);
    $('#interfaceScaleValue').textContent = `${scale}%`;
  };
  $('#interfaceScaleSlider').oninput = event => {
    if (config.settings.interface_scale_default) return;
    config.settings.interface_scale = interfaceScale(event.target.value);
    refresh(); saveConfig(); applyInterfaceScale();
  };
  $('#interfaceScaleDefaultSwitch').onclick = () => {
    config.settings.interface_scale_default = !config.settings.interface_scale_default;
    refresh(); saveConfig(); applyInterfaceScale();
  };
  refresh();
}

function openSettings() {
  const themeName = config.settings.theme === 'system' ? t('systemTheme') : t(config.settings.theme);
  const formatName = config.settings.time_format === 'system' ? t('systemFormat') : t(config.settings.time_format === '12' ? 'hour12' : 'hour24');
  modal(t('settings'), `<div class="group"><div class="row" id="theme"><span>${t('theme')}</span><span class="row-value">${themeName} ›</span></div>
    <button class="row settings-button" id="interfaceScale"><span>${lang() === 'ru' ? 'Масштаб интерфейса' : 'Interface scale'}</span><span class="row-value">${currentInterfaceScale()}% ›</span></button>
    <div class="row" id="timeFormat"><span>${t('timeFormat')}</span><span class="row-value">${formatName} ›</span></div>
    <div class="row" id="base"><span>${t('base')}</span><span class="row-value">${config.settings.top_clock_mode === 'auto' ? t('system') : esc(cityName(config.settings.manual_top_timezone))} ›</span></div></div>
    <div class="group"><div class="row" id="language"><span>${t('language')}</span><span class="row-value">${lang() === 'ru' ? 'Русский' : 'English'} ›</span></div></div>
    <div class="group"><button class="row settings-button" id="citySettings"><span>${t('citySettings')}</span><span class="row-value">›</span></button></div>
    <div class="group"><button class="row settings-button" id="quickTitles"><span>${lang() === 'ru' ? 'Быстрые названия напоминаний' : 'Quick reminder titles'}</span><span class="row-value">${config.settings.quick_titles.length} ›</span></button>
    <div class="row" id="intervals"><span>${t('intervals')}</span><span class="row-value">${config.settings.reminder_intervals.join(' · ')} ›</span></div>
    <button class="row settings-button" id="alarmSound"><span>${lang() === 'ru' ? 'Звук напоминания' : 'Reminder sound'}</span><span class="row-value">${esc(soundName(defaultSoundId()))} ›</span></button></div>
    <div class="group"><button class="row settings-button" id="direction"><span>${lang() === 'ru' ? 'Появление и скрытие' : 'Show and hide'}</span><span class="row-value">${directionOptions().find(([value]) => value === config.settings.overlay_direction)?.[1] || directionOptions()[1][1]} ›</span></button>
    <button class="row settings-button" id="hotkey"><span>${lang() === 'ru' ? 'Клавиша вызова панели' : 'Panel shortcut'}</span><span class="row-value">${esc(hotkeyLabel())}</span></button></div>
    <div class="group"><div class="row toggle-row"><span>${t('autostart')}</span><button class="switch ${config.settings.autostart ? 'on' : ''}" id="autostartSwitch" role="switch" aria-checked="${config.settings.autostart ? 'true' : 'false'}" aria-label="${t('autostart')}"></button></div></div>`);
  $('#theme').onclick = () => choice(t('theme'), [['system', t('systemTheme')], ['dark', t('dark')], ['light', t('light')]], config.settings.theme, value => {
    config.settings.theme = value; saveConfig(); render(); openSettings();
  });
  $('#timeFormat').onclick = () => choice(t('timeFormat'), [['system', t('systemFormat')], ['24', t('hour24')], ['12', t('hour12')]], config.settings.time_format, value => {
    config.settings.time_format = value; saveConfig(); render(); openSettings();
  });
  $('#base').onclick = () => openCities('base-settings');
  $('#interfaceScale').onclick = openInterfaceScale;
  $('#language').onclick = () => choice(t('language'), [['ru', 'Русский'], ['en', 'English']], lang(), value => {
    config.settings.language = value; saveConfig(); render(); openSettings();
  });
  $('#citySettings').onclick = openCitySettingsList;
  $('#intervals').onclick = openIntervals;
  $('#alarmSound').onclick = openAlarmSound;
  $('#direction').onclick = openDirection;
  $('#hotkey').onclick = openHotkey;
  $('#quickTitles').onclick = openQuickTitles;
  $('#autostartSwitch').onclick = () => {
    config.settings.autostart = !config.settings.autostart;
    saveConfig();
    send(`setStartup\n${config.settings.autostart ? '1' : '0'}`);
    openSettings();
  };
}

async function openAlarmSound() {
  await soundLibraryReady;
  const ru = lang() === 'ru', selected = defaultSoundId();
  modal(ru ? 'Звуки напоминаний' : 'Reminder sounds',
    `<div class="group"><div class="row toggle-row"><span>${ru ? 'Звук системы' : 'System sound'}</span><button class="switch ${selected === 'system' ? 'on' : ''}" id="systemSoundSwitch" role="switch" aria-checked="${selected === 'system'}" aria-label="${ru ? 'Звук системы' : 'System sound'}"></button></div></div>
    <p class="settings-help">${ru ? 'Общий звук для напоминаний. Добавляйте файлы, отмечайте избранное звёздочкой и выбирайте отдельный звук при редактировании напоминания.' : 'Default reminder sound. Add files, mark favorites with a star and choose an individual sound when editing a reminder.'}</p>
    <label class="sound-drop" id="soundDrop" for="soundFile"><strong>${ru ? 'Перетащите звуки сюда' : 'Drop sounds here'}</strong><span>${ru ? 'или нажмите, чтобы выбрать файлы' : 'or click to choose files'}</span></label>
    <input id="soundFile" type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.wma,.ogg,.flac,.opus" multiple hidden>
    <p class="sound-feedback" id="soundFeedback" role="status"></p>
    <div class="sound-library">${soundLibrary.map(sound => sound.id).map(id => {
      const sound = soundLibrary.find(item => item.id === id);
      return `<div class="sound-row"><button class="sound-select ${selected === id ? 'selected' : ''}" data-select-sound="${esc(id)}" aria-pressed="${selected === id}" title="${esc(soundName(id))}">${selected === id ? '✓ ' : ''}${esc(soundName(id))}</button><button class="sound-action" data-preview-sound="${esc(id)}" aria-label="${ru ? 'Прослушать' : 'Preview'}">▶</button>${sound ? `<button class="sound-action ${sound.favorite ? 'favorite' : ''}" data-favorite-sound="${esc(id)}" aria-pressed="${sound.favorite}" aria-label="${ru ? 'Избранное' : 'Favorite'}">${sound.favorite ? '★' : '☆'}</button><button class="sound-action" data-delete-sound="${esc(id)}" aria-label="${ru ? 'Удалить звук' : 'Delete sound'}">${trashIcon}</button>` : '<span></span><span></span>'}</div>`;
    }).join('')}</div><button class="secondary" id="soundPreview">${ru ? '▶ Проверить выбранный звук' : '▶ Test selected sound'}</button>`);
  $('#systemSoundSwitch').onclick = () => {
    config.settings.alarm_sound_id = selected === 'system' ? (soundLibrary.some(sound => sound.id === config.settings.manual_alarm_sound_id) ? config.settings.manual_alarm_sound_id : soundLibrary[0]?.id || 'system') : 'system';
    saveConfig(); stopAlarmSound(); openAlarmSound();
  };
  $$('[data-select-sound]').forEach(button => button.onclick = () => {
    config.settings.alarm_sound_id = button.dataset.selectSound;
    config.settings.manual_alarm_sound_id = button.dataset.selectSound;
    saveConfig(); stopAlarmSound(); openAlarmSound();
  });
  $$('[data-preview-sound]').forEach(button => button.onclick = () => playAlarmSound({sound_id:button.dataset.previewSound}));
  $$('[data-favorite-sound]').forEach(button => button.onclick = async () => {
    const sound = soundLibrary.find(item => item.id === button.dataset.favoriteSound);
    try {
      const next = {...sound, favorite:!sound.favorite};
      await soundStorage('put', sound.id, next);
      Object.assign(sound, next); openAlarmSound();
    } catch { $('#soundFeedback').textContent = ru ? 'Не удалось сохранить избранное.' : 'Could not save favorites.'; }
  });
  $$('[data-delete-sound]').forEach(button => button.onclick = () => removeAlarmSound(button.dataset.deleteSound));
  const drop = $('#soundDrop');
  $('#soundFile').onchange = event => importAlarmSounds(event.target.files);
  drop.ondragover = event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); drop.classList.add('drop-target'); } };
  drop.ondragleave = () => drop.classList.remove('drop-target');
  drop.ondrop = event => { event.preventDefault(); drop.classList.remove('drop-target'); importAlarmSounds(event.dataTransfer?.files); };
  $('#soundPreview').onclick = () => playAlarmSound();
  $('#back').onclick = () => { stopAlarmSound(); openSettings(); };
}
async function removeAlarmSound(id) {
  try {
    await soundStorage('delete', id);
    stopAlarmSound();
    if (soundUrls.has(id)) { URL.revokeObjectURL(soundUrls.get(id)); soundUrls.delete(id); }
    soundLibrary = soundLibrary.filter(sound => sound.id !== id);
    if (defaultSoundId() === id) config.settings.alarm_sound_id = 'system';
    if (config.settings.manual_alarm_sound_id === id) delete config.settings.manual_alarm_sound_id;
    let changed = false;
    reminders.entries.forEach(entry => { if (entry.sound_id === id) { delete entry.sound_id; changed = true; } });
    saveConfig(); if (changed) saveReminders(); openAlarmSound();
  } catch { $('#soundFeedback').textContent = lang() === 'ru' ? 'Не удалось удалить звук.' : 'Could not delete sound.'; }
}
async function importAlarmSounds(files) {
  const errors = [];
  for (const file of [...(files || [])]) {
    const candidate = URL.createObjectURL(file);
    try {
      if (!file.size || file.size > 30 * 1024 * 1024) throw new Error('size');
      await new Promise((resolve, reject) => {
        const audio = new Audio(candidate);
        const timer = setTimeout(() => finish(new Error('timeout')), 15000);
        const finish = error => { clearTimeout(timer); audio.oncanplay = audio.onerror = null; audio.removeAttribute('src'); audio.load(); error ? reject(error) : resolve(); };
        audio.oncanplay = () => finish(); audio.onerror = () => finish(new Error('decode')); audio.load();
      });
      const sound = {id:crypto.randomUUID(), name:file.name.slice(0,120), favorite:true, blob:file};
      await soundStorage('put', sound.id, sound);
      soundLibrary.push(sound);
      config.settings.alarm_sound_id = config.settings.manual_alarm_sound_id = sound.id;
      saveConfig();
    } catch { errors.push(file.name); }
    finally { URL.revokeObjectURL(candidate); }
  }
  stopAlarmSound(); await openAlarmSound();
  if (errors.length) $('#soundFeedback').textContent = (lang() === 'ru' ? 'Не удалось добавить (нужен аудиофайл до 30 МБ): ' : 'Could not add (audio file under 30 MB required): ') + errors.join(', ');
}

function scheduleEditorBody(schedule, {customizable = false, inherited = false, cityLabel = null} = {}) {
  const fields = [
    ['okayStart', lang() === 'ru' ? 'Можно связаться с' : 'Okay from'],
    ['workingStart', lang() === 'ru' ? 'Рабочее время с' : 'Working from'],
    ['workingEnd', lang() === 'ru' ? 'Рабочее время до' : 'Working until'],
    ['dndStart', lang() === 'ru' ? 'Не беспокоить с' : 'DND from'],
  ];
  return `${cityLabel !== null ? `<label class="section" for="scheduleCityLabel">${t('displayLabel')}</label><input class="search schedule-name" id="scheduleCityLabel" maxlength="80" value="${esc(cityLabel)}">` : ''}${customizable ? `<div class="group"><div class="row toggle-row"><span>${t('useDefault')}</span><button class="switch ${inherited ? 'on' : ''}" id="useDefaultSwitch" role="switch" aria-checked="${inherited}" aria-label="${t('useDefault')}"></button></div></div>` : ''}<div class="group schedule-times">${fields.map(([key,name]) => `<label class="row"><span>${name}</span><input type="time" step="900" value="${schedule[key]}" data-schedule-time="${key}" ${inherited ? 'disabled' : ''}></label>`).join('')}</div><div class="schedule-error" id="scheduleError" role="status"></div><button class="primary" id="saveSchedule">${t('save')}</button>`;
}

function openScheduleEditor(key, returnTo = 'actions') {
  const isBase = key === baseScheduleKey;
  const isCity = Boolean(key) && !isBase;
  const override = isBase ? config.settings.baseAvailabilityOverride : isCity ? cityContext(key).availabilityOverride : null;
  const schedule = normalizeSchedule(override || config.settings.availabilityDefault);
  const title = isBase ? `${t('contactHours')}: ${config.settings.top_clock_mode === 'auto' ? t('system') : cityName(config.settings.manual_top_timezone)}` : isCity ? `${t('nameAndSchedule')}: ${cityName(key)}` : t('typicalSchedule');
  const back = returnTo === 'citySettings' ? openCitySettingsList : isCity && returnTo === 'actions' ? () => openCityActions(key) : returnTo === 'settings' ? openSettings : closeModal;
  modal(title, scheduleEditorBody(schedule, {customizable:Boolean(key), inherited:Boolean(key) && !override, cityLabel:isCity ? cityContext(key).label || '' : null}), back);
  let draft = {...schedule};
  const times = $$('[data-schedule-time]');
  const useDefaultSwitch = $('#useDefaultSwitch');
  useDefaultSwitch?.addEventListener('click', () => {
    const inherited = useDefaultSwitch.getAttribute('aria-checked') !== 'true';
    if (inherited) draft = Object.fromEntries(times.map(input => [input.dataset.scheduleTime, input.value]));
    useDefaultSwitch.setAttribute('aria-checked', String(inherited));
    useDefaultSwitch.classList.toggle('on', inherited);
    times.forEach(input => { input.disabled = inherited; input.value = inherited ? config.settings.availabilityDefault[input.dataset.scheduleTime] : draft[input.dataset.scheduleTime]; });
    $('#scheduleError').textContent = '';
  });
  $('#saveSchedule').onclick = () => {
    const value = Object.fromEntries($$('[data-schedule-time]').map(input => [input.dataset.scheduleTime, input.value]));
    const inherited = useDefaultSwitch?.getAttribute('aria-checked') === 'true';
    if (!inherited && !scheduleIsValid(value)) {
      $('#scheduleError').textContent = lang() === 'ru' ? 'Границы должны идти по кругу суток в указанном порядке.' : 'Boundaries must follow this order around the 24-hour day.';
      return;
    }
    if (isBase) config.settings.baseAvailabilityOverride = inherited ? null : value;
    else if (isCity) {
      const context = {...cityContext(key)};
      context.label = $('#scheduleCityLabel').value.trim().slice(0, 80);
      if (inherited) delete context.availabilityOverride;
      else context.availabilityOverride = value;
      if (!context.label) delete context.label;
      if (!context.label && !context.availabilityOverride) delete config.cityContext[key];
      else config.cityContext[key] = context;
    } else config.settings.availabilityDefault = value;
    saveConfig(); render();
    if (returnTo === 'base' || returnTo === 'card') closeModal();
    else if (returnTo === 'citySettings') openCitySettingsList();
    else if (isCity) openCityActions(key);
    else openSettings();
  };
}

function openCitySettingsList() {
  modal(t('citySettings'), `<div class="section">${t('baseTimeSection')}</div><div class="group"><button class="row settings-button" id="baseSchedule"><span>${t('baseContactHours')}</span><span class="row-value">›</span></button><button class="row settings-button" id="typicalSchedule"><span>${t('typicalSchedule')}</span><span class="row-value">›</span></button></div><div class="section">${t('addedCities')}</div><div class="group">${config.timezones.map(key => `<button class="row settings-button" data-city-settings="${esc(key)}"><span>${label(key)}</span><span class="row-value">›</span></button>`).join('')}</div>`, openSettings);
  $('#baseSchedule').onclick = () => openScheduleEditor(baseScheduleKey, 'citySettings');
  $('#typicalSchedule').onclick = () => openScheduleEditor(null, 'citySettings');
  $$('[data-city-settings]').forEach(button => button.onclick = () => openCityActions(button.dataset.citySettings));
}

function openCityActions(key) {
  if (!config.timezones.includes(key)) { openCitySettingsList(); return; }
  modal(cityName(key), `<div class="group city-actions"><button class="row settings-button" id="scheduleCity"><span>${t('nameAndSchedule')}</span><span class="row-value">${cityContext(key).availabilityOverride ? (lang() === 'ru' ? 'Свой' : 'Custom') : (lang() === 'ru' ? 'Общий' : 'Default')} ›</span></button><button class="row settings-button" id="makeBase">${t('makeBase')}</button><button class="row settings-button danger-row" id="removeCity">${t('remove')}</button></div>`, openCitySettingsList);
  $('#scheduleCity').onclick = () => openScheduleEditor(key);
  $('#makeBase').onclick = () => {
    makeBaseCity(key); openCitySettingsList();
  };
  $('#removeCity').onclick = () => {
    config.timezones = config.timezones.filter(candidate => candidate !== key); delete config.cityContext[key];
    saveConfig(); render(); openCitySettingsList();
  };
}

function choice(title, values, selected, apply) {
  modal(title, `<div class="group">${values.map(value => `<div class="row" data-value="${value[0]}"><span>${value[1]}</span><span class="row-value">${value[0] === selected ? '✓' : ''}</span></div>`).join('')}</div>`);
  $$('[data-value]').forEach(row => row.onclick = () => apply(row.dataset.value));
}

function openIntervals() {
  const values = config.settings.reminder_intervals;
  modal(t('intervals'), `<div class="quick-title">${lang() === 'ru' ? 'Напоминание' : 'Reminder'}</div><div class="interval-editor">${values.map((value, index) => `<div class="interval-card chip"><input type="number" step="1" value="${value}" data-int="${index}" aria-label="${lang() === 'ru' ? 'Минуты' : 'Minutes'}"><span>${lang() === 'ru' ? 'мин' : 'min'}</span><button class="delete" data-remove-int="${index}" ${values.length === 1 ? 'disabled' : ''} aria-label="${lang() === 'ru' ? 'Удалить интервал' : 'Delete interval'}">${trashIcon}</button></div>`).join('')}</div><button class="add interval-add" id="addInterval">＋ &nbsp; ${lang() === 'ru' ? 'Добавить интервал' : 'Add interval'}</button>`);
  const persist = () => { saveConfig(); render(); };
  $$('[data-int]').forEach(input => {
    const commit = () => {
      const value = intervalValue(input.value);
      input.value = value;
      config.settings.reminder_intervals[+input.dataset.int] = value;
      persist();
    };
    input.onchange = commit;
    bindValueScroll(input, {read:()=>intervalValue(input.value),write:value=>{
      input.value = intervalValue(value);
      config.settings.reminder_intervals[+input.dataset.int] = +input.value;
    },finish:persist});
  });
  $$('[data-remove-int]').forEach(button => button.onclick = () => {
    if (config.settings.reminder_intervals.length <= 1) return;
    config.settings.reminder_intervals.splice(+button.dataset.removeInt, 1); persist(); openIntervals();
  });
  $('#addInterval').onclick = () => {
    config.settings.reminder_intervals.push(15); persist(); openIntervals();
    const inputs = $$('[data-int]'); inputs.at(-1).focus(); inputs.at(-1).select();
  };
}

function openCities(mode) {
  const choosingBase = mode === 'base' || mode === 'base-settings';
  const replaceIndex = mode.startsWith('replace:') ? Number(mode.split(':')[1]) : -1;
  const system = choosingBase ? `<div class="result system-result"><div><b>${t('system')}</b><div class="region">(${esc(systemCities())})</div></div><b data-live-zone="${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}">${timeAt(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)}</b><button class="switch ${config.settings.top_clock_mode === 'auto' ? 'on' : ''}" id="systemSwitch" role="switch"></button></div>` : '';
  modal(choosingBase ? t('base') : replaceIndex >= 0 ? t('changeCity') : t('add'), `<input class="search" id="search" placeholder="${t('search')}">${system}<div class="section" id="section">${t('favorites')}</div><div id="results"></div>`, mode === 'base-settings' ? openSettings : closeModal);
  const input = $('#search');
  input.oninput = () => renderResults(mode, input.value);
  if ($('#systemSwitch')) $('#systemSwitch').onclick = () => {
    config.settings.top_clock_mode = config.settings.top_clock_mode === 'auto' ? 'manual' : 'auto';
    if (config.settings.top_clock_mode === 'manual' && !config.settings.manual_top_timezone) config.settings.manual_top_timezone = 'Asia/Ho_Chi_Minh';
    config.settings.base_timezone = config.settings.top_clock_mode === 'auto' ? '' : config.settings.manual_top_timezone;
    expandedBase = false;
    saveConfig(); render(); openCities(mode);
  };
  renderResults(mode, '');
  input.focus();
}

function matches(query) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return config.favorites.map(key => item(key)).filter(Boolean);
  const russian = /[а-яё]/i.test(normalized);
  return catalog.filter(city => {
    const aliases = city.aliases.split('|');
    const names = russian
      ? [city.ru, ...aliases.filter(alias => /[а-яё]/i.test(alias))]
      : [city.en, ...aliases.filter(alias => /^[\x00-\x7f]*$/.test(alias))];
    return names.some(name => name && name.toLocaleLowerCase().includes(normalized));
  }).sort((a, b) => rank(a, normalized, russian) - rank(b, normalized, russian) ||
    b.pop - a.pop || cityName(a.key).localeCompare(cityName(b.key), lang())).slice(0, 40);
}

function rank(city, query, russian) {
  const names = (russian ? [city.ru] : [city.en]).filter(Boolean).map(name => name.toLocaleLowerCase());
  return names.includes(query) ? 0 : names.some(name => name.startsWith(query)) ? 1 : names.some(name => name.split(/[ -]/).some(word => word.startsWith(query))) ? 2 : 3;
}

function renderResults(mode, query) {
  const choosingBase = mode === 'base' || mode === 'base-settings';
  const replaceIndex = mode.startsWith('replace:') ? Number(mode.split(':')[1]) : -1;
  const rows = matches(query);
  $('#section').textContent = query.trim() ? t('results') : t('favorites');
  $('#results').innerHTML = rows.map(city => {
    const favorite = config.favorites.includes(city.key);
    const chosen = config.settings.top_clock_mode === 'manual' && config.settings.manual_top_timezone === city.key;
    const disabled = choosingBase && chosen;
    return `<div class="result city-result"><div><b>${label(city.key)}</b></div><b class="result-time" data-live-zone="${esc(zoneOf(city.key))}">${timeAt(new Date(), zoneOf(city.key))}</b><button data-add="${esc(city.key)}" ${disabled ? 'disabled' : ''}>${choosingBase && chosen ? '✓' : '＋'}</button><button class="${favorite ? 'on' : ''}" data-star="${esc(city.key)}">☆</button>${favorite ? `<button class="trash" aria-label="${lang() === 'ru' ? 'Удалить из избранного' : 'Remove from favorites'}" data-unfav="${esc(city.key)}">${trashIcon}</button>` : '<span></span>'}</div>`;
  }).join('');
  $$('[data-add]').forEach(button => button.onclick = () => {
    const key = button.dataset.add;
    if (choosingBase) {
      config.settings.top_clock_mode = 'manual';
      config.settings.manual_top_timezone = key;
      config.settings.base_timezone = key;
      expandedBase = false;
    } else if (replaceIndex >= 0 && config.timezones[replaceIndex]) {
      replaceCityAt(replaceIndex, key);
    } else config.timezones.push(createCityKey(key));
    saveConfig(); render(); mode === 'base-settings' ? openSettings() : closeModal();
  });
  $$('[data-star]').forEach(button => button.onclick = () => {
    const key = button.dataset.star;
    config.favorites = config.favorites.includes(key) ? config.favorites.filter(old => old !== key) : [...config.favorites, key];
    saveConfig(); renderResults(mode, query);
  });
  $$('[data-unfav]').forEach(button => button.onclick = () => {
    config.favorites = config.favorites.filter(key => key !== button.dataset.unfav);
    saveConfig(); renderResults(mode, query);
  });
}


function checkDue() {
  const now = Date.now() / 1000;
  const entry = reminders.entries.find(candidate => candidate.state === 'ringing' || (candidate.state === 'pending' && candidate.alarm <= now));
  if (!entry) return;
  if (entry.state !== 'ringing') { entry.state = 'ringing'; saveReminders(); }
  if (alertId === entry.id) {
    if (Date.now() - lastBeep > 10000) {
      if (!alarmAudio || alarmAudio.ended || alarmAudio.paused) playAlarmSound(entry);
      lastBeep = Date.now();
    }
    return;
  }
  alertId = entry.id;
  lastBeep = Date.now();
  send('show');
  playAlarmSound(entry);
  modal(t('alarm'), `<div class="alert-city">${esc(entry.title || t('alarm'))}</div><div class="alarm-context">${esc(sourceCaption(entry))}</div><div class="alert-time">${timeAt(new Date(entry.alarm * 1000), zoneOf(entry.zone || baseZone()))}</div><button class="primary" id="ack">${t('got')}</button><button class="secondary" id="snooze">${t('snooze')}</button>`);
  $('#ack').onclick = () => {
    stopAlarmSound();
    if (entry.repeat === 'daily') {
      entry.alarm = nextDailyAlarm(entry);
      entry.target = entry.alarm;
      entry.started_at = Date.now() / 1000;
      entry.state = 'pending';
    } else reminders.entries = reminders.entries.filter(candidate => candidate.id !== entry.id);
    alertId = null; saveReminders(); closeModal(); renderAlarms();
  };
  $('#snooze').onclick = () => {
    stopAlarmSound();
    entry.alarm = Date.now() / 1000 + 300;
    entry.started_at = Date.now() / 1000;
    entry.state = 'pending';
    alertId = null; saveReminders(); closeModal(); renderAlarms();
  };
}

// Place body-level information bubbles inside the WebView, including edge anchors.
function placeInfoTooltip(popup, anchor) {
  const rect = anchor.getBoundingClientRect();
  const {width, height} = popup.getBoundingClientRect();
  popup.style.left = `${clamp(rect.left + rect.width / 2 - width / 2, 8, Math.max(8, innerWidth - width - 8))}px`;
  const above = rect.top - height - 7;
  const top = above >= 8 ? above : rect.bottom + 7;
  popup.style.top = `${clamp(top, 8, Math.max(8, innerHeight - height - 8))}px`;
}

function hideContextTooltip() {
  const popup = document.querySelector('#contextTooltip');
  if (!popup) return;
  document.querySelectorAll('[aria-describedby="contextTooltip"]').forEach(node => node.removeAttribute('aria-describedby'));
  popup.remove?.();
}

function showContextTooltip(anchor) {
  hideContextTooltip();
  if (!anchor?.dataset.tooltip) return;
  const popup = document.createElement('div');
  popup.id = 'contextTooltip'; popup.className = 'context-tooltip';
  popup.setAttribute('role', 'tooltip');
  popup.textContent = anchor.dataset.tooltip;
  document.body.appendChild(popup);
  anchor.setAttribute('aria-describedby', popup.id);
  placeInfoTooltip(popup, anchor);
}

document.addEventListener('pointerover', event => {
  const anchor = event.target.closest?.('.context-token[data-tooltip]');
  if (anchor && !anchor.contains(event.relatedTarget)) showContextTooltip(anchor);
});
document.addEventListener('focusin', event => {
  const anchor = event.target.closest?.('.context-token[data-tooltip]');
  if (anchor) showContextTooltip(anchor);
});
document.addEventListener('pointerout', event => {
  const anchor = event.target.closest?.('.context-token[data-tooltip]');
  if (anchor && !anchor.contains(event.relatedTarget)) hideContextTooltip();
});
document.addEventListener('focusout', hideContextTooltip);
document.addEventListener('scroll', hideContextTooltip, true);
window.addEventListener?.('resize', () => {
  hideContextTooltip(); hideReminderTooltip();
  const popup = document.querySelector('.name-popover');
  if (popup) {
    const rect = popup.getBoundingClientRect();
    popup.style.left = `${clamp(rect.left, 8, Math.max(8, innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${clamp(rect.top, 8, Math.max(8, innerHeight - popup.offsetHeight - 8))}px`;
  }
});

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 1800);
}

function updateLiveCityTimes() {
  const now = new Date();
  $$('[data-live-zone]').forEach(clock => {
    clock.textContent = timeAt(now, clock.dataset.liveZone);
  });
}

window.__nativeTickCount = 0;
window.nativeTick = (visible = true) => {
  window.__nativeTickCount += 1;
  if (visible) { updateDynamic(); updateLiveCityTimes(); updateAlarmDetail(); }
  checkDue();
  if (window.__nativeTickCount % 3600 === 0 || !visible) checkForUpdates();
  if (!visible) scheduleBackgroundTick();
};

$('#resize').onpointerdown = () => send('resize');
$$('[data-resize]').forEach(edge => edge.onpointerdown = event => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  send(`resize:${edge.dataset.resize}`);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if ($('#featureTour')?.classList.contains('show')) { openFeatureGuide(); return; }
    if ($('#namePopover')?.firstElementChild) closeNamePopover();
    else if ($('#modal .modal-root')) closeModal();
    else if (pendingLead !== null) { pendingLead = null; updateSelectionState(); }
    else if (expandedBase) { expandedBase = false; applyExpandedBaseState(); }
    else if (expandedCityKey !== null) { expandedCityKey = null; applyExpandedCityState(); }
  }
});
document.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  // Do not move an interactive target between pointerdown and click.
  const interactiveTarget = event.target.closest('button,input,.card,.panel,.slider,.quick-section,.modal-root,#resize,.hero-resizer');
  const collapsedCard = interactiveTarget ? false : closeExpandedCardsOutside(event.target);
  if (event.target.closest('#namePopover')) return;
  closeNamePopover();
  if (pendingLead !== null && !event.target.closest('.chip,.city-card,.clock,.selection-status')) {
    pendingLead = null;
    updateSelectionState();
  }
  if (interactiveTarget) return;
  if (collapsedCard) return;
  if (event.target.closest('.shell')) send('drag');
});
document.addEventListener('click', event => {
  if (event.button === 0) closeExpandedCardsOutside(event.target);
}, true);

host?.addEventListener('message', event => {
  if (event.data?.type === 'updateResult') {
    toast(event.data.success
      ? (lang() === 'ru' ? 'Открываем установщик обновления…' : 'Opening update installer…')
      : (lang() === 'ru' ? 'Не удалось установить обновление' : 'Could not install the update'));
    return;
  }
  if (event.data?.type === 'copyResult') {
    toast(event.data.success ? (lang() === 'ru' ? 'Время скопировано' : 'Times copied') : (lang() === 'ru' ? 'Не удалось скопировать' : 'Could not copy'));
    return;
  }
  if (event.data?.type === 'hotkeyCaptured' && capturingHotkey) {
    candidateHotkey = {modifiers: event.data.modifiers, key: event.data.key};
    capturingHotkey = false;
    send('endHotkeyCapture');
    updateHotkeyUI(lang() === 'ru' ? 'Кнопка записана. Нажмите «Применить».' : 'Button recorded. Press Apply.');
    return;
  }
  if (event.data?.type === 'hotkeyResult') {
    activeHotkey = {modifiers: event.data.modifiers, key: event.data.key};
    if (event.data.success && pendingHotkey) {
      config.settings.hotkey = {...activeHotkey};
      if (pendingHotkeyMode === 'custom') config.settings.manual_hotkey = {...activeHotkey};
      saveConfig();
      render();
    }
    pendingHotkey = null;
    pendingHotkeyMode = null;
    hotkeySelection = currentHotkeyMode();
    candidateHotkey = event.data.success ? null : candidateHotkey;
    updateHotkeyUI(event.data.success
      ? (lang() === 'ru' ? `Сохранено: ${hotkeyLabel()}. Теперь панель вызывается этим сочетанием.` : `Saved: ${hotkeyLabel()}. Use it to open the panel.`)
      : (lang() === 'ru' ? 'Сочетание занято или недоступно. Прежнее сохранено; выберите другое.' : 'Shortcut occupied or unavailable. Previous shortcut kept; choose another.'));
    return;
  }
  if (event.data?.type !== 'init') return;
  window.__worldClockWheelLines = Number.isFinite(event.data.wheelScrollLines) && event.data.wheelScrollLines > 0 && event.data.wheelScrollLines < 1000 ? event.data.wheelScrollLines : 3;
  platform = event.data.platform === 'macos' ? 'macos' : 'windows';
  window.__worldClockPlatform = platform;
  try { config = JSON.parse(event.data.configText || '{}'); } catch { config = {}; }
  try { reminders = JSON.parse(event.data.remindersText || '{}'); } catch { reminders = {lead: 15, entries: []}; }
  version = event.data.version || version;
  restoreUpdateState();
  const previousConfig = JSON.stringify(config);
  const previousReminders = JSON.stringify(reminders);
  normalize();
  activeHotkey = Number.isInteger(event.data.hotkeyModifiers) && Number.isInteger(event.data.hotkeyKey)
    ? {modifiers: event.data.hotkeyModifiers, key: event.data.hotkeyKey}
    : {...(config.settings.hotkey || defaultHotkeyForPlatform())};
  if (!config.settings.manual_hotkey && config.settings.hotkey && !sameHotkey(config.settings.hotkey, {modifiers:5,key:84}) && !sameHotkey(config.settings.hotkey, defaultHotkeyForPlatform()))
    config.settings.manual_hotkey = {...config.settings.hotkey};
  soundLibraryReady = loadSoundLibrary();
  if (JSON.stringify(reminders) !== previousReminders) saveReminders();
  if (JSON.stringify(config) !== previousConfig) saveConfig();
  send(`setStartup\n${config.settings.autostart ? '1' : '0'}`);
  applyInterfaceScale();
  render();
  send('rendered');
  if (typeof setTimeout === 'function') setTimeout(() => checkForUpdates(), 1200);
  window.syncInitialize?.(event.data.syncCredential || '');
});
window.addEventListener?.('widgetCopyResult', event => toast(event.detail ? (lang() === 'ru' ? 'Время скопировано' : 'Times copied') : (lang() === 'ru' ? 'Не удалось скопировать' : 'Could not copy')));

send('ready');

if (!host && new URLSearchParams(location.search).has('preview')) {
  const previewParams = new URLSearchParams(location.search);
  const now = Date.now();
  reminders = {lead: 15, entries: [
    {id: 'preview-1', target: (now + 3600000) / 1000, alarm: (now + 2700000) / 1000, started_at: now / 1000, state: 'pending', lead: 15, zone: 'Asia/Bangkok', city: 'Бангкок'},
    {id: 'preview-2', target: (now + 7200000) / 1000, alarm: (now + 5400000) / 1000, started_at: now / 1000, state: 'pending', lead: 30, zone: 'Asia/Vladivostok', city: 'Владивосток'},
  ]};
  version = 'v1.1.91 preview';
  offset = clamp(Number(previewParams.get('offset') || 1), 0, 24);
  if (['dark','light','system'].includes(previewParams.get('theme'))) config.settings.theme = previewParams.get('theme');
  if (previewParams.has('context')) config.cityContext['Europe/Moscow'] = {label:'Антон',availabilityOverride:{okayStart:'10:00',workingStart:'12:00',workingEnd:'20:00',dndStart:'01:00'}};
  normalize();
  activeHotkey = defaultHotkeyForPlatform();
  render();
  if (previewParams.has('expand')) { expandedCityKey = config.timezones[0]; renderCities(); }
  if (previewParams.has('newalarm')) newAlarmForCity(config.timezones[0]);
  if (previewParams.has('settings')) openSettings();
  if (previewParams.has('schedule')) openScheduleEditor(config.timezones[0]);
}
