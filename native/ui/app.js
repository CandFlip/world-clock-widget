const trashIcon = `<svg class="trash-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><g class="trash-lid"><path d="M4 6h16M9 6V4h6v2"/></g><path d="M6 6l1 14h10l1-14M10 10v6M14 10v6"/></svg>`;
const host = window.chrome?.webview;
const send = message => host?.postMessage(message);
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const zoneOf = key => (key || 'Etc/UTC').split('@@')[0];
const defaultAvailability = Object.freeze({okayStart:'07:00',workingStart:'09:00',workingEnd:'18:00',dndStart:'22:00'});

const defaults = {
  timezones: ['Europe/Moscow', 'Asia/Vladivostok', 'Asia/Almaty'],
  favorites: ['Asia/Tokyo', 'America/New_York', 'Europe/London', 'Asia/Dubai', 'Australia/Sydney', 'Europe/Berlin'],
  settings: {
    top_clock_mode: 'auto', manual_top_timezone: 'Asia/Ho_Chi_Minh', base_timezone: '',
    overlay_direction: 'right', time_format: 'system', theme: 'system', language: 'ru',
    availabilityDefault: {...defaultAvailability},
    reminder_intervals: [15, 30, 60], autostart: true,
  },
  cityContext: {},
  window: {},
};

let config = structuredClone(defaults);
let reminders = {lead: 15, entries: []};
let version = 'native';
let offset = 0;
let liveOffset = null;
let pendingLead = null;
let cityDragIndex = -1;
let expandedCityKey = null;
let expandedBase = false;
let suppressCityClick = false;
let alertId = null;
let lastBeep = 0;
let detailId = null;
let applyingRemoteSync = false;
let platform = 'windows';
const defaultHotkeyForPlatform = () => platform === 'macos' ? {modifiers: 12, key: 84} : {modifiers: 5, key: 84};
let activeHotkey = {...defaultHotkeyForPlatform()};
let pendingHotkey = null;
let capturingHotkey = false;
let candidateHotkey = null;
let capturedModifiers = 0;
const specialHotkeyKeys = {
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Space: 32,
  PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Insert: 45, Delete: 46,
  NumpadMultiply: 106, NumpadAdd: 107, NumpadSubtract: 109,
  NumpadDecimal: 110, NumpadDivide: 111,
  Semicolon: 186, Equal: 187, Comma: 188, Minus: 189, Period: 190,
  Slash: 191, Backquote: 192, BracketLeft: 219, Backslash: 220,
  BracketRight: 221, Quote: 222,
};
const hotkeyNames = Object.fromEntries(Object.entries(specialHotkeyKeys).map(([name, key]) => [key, name.replace('Arrow', '').replace('Numpad', 'Num ')]));

function hotkeyFromEvent(event) {
  if ((event.metaKey && platform !== 'macos') || event.getModifierState?.('AltGraph')) return null;
  const code = event.code;
  let key = specialHotkeyKeys[code];
  if (/^Key[A-Z]$/.test(code)) key = code.charCodeAt(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.charCodeAt(5);
  else if (/^Numpad[0-9]$/.test(code)) key = 96 + Number(code.slice(6));
  else if (/^F([1-9]|10|11)$/.test(code)) key = 111 + Number(code.slice(1));
  if (!key) return null;
  return {modifiers: (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.shiftKey ? 4 : 0) | (event.metaKey ? 8 : 0), key};
}

function hotkeyLabel(hotkey = activeHotkey) {
  const key = hotkey.key;
  const name = (key >= 48 && key <= 90) ? String.fromCharCode(key) :
    (key >= 96 && key <= 105) ? `Num ${key - 96}` :
    (key >= 112 && key <= 122) ? `F${key - 111}` : hotkeyNames[key] || '?';
  const modifiers = platform === 'macos'
    ? [(hotkey.modifiers & 8) && 'Command', (hotkey.modifiers & 4) && 'Shift', (hotkey.modifiers & 1) && 'Option', (hotkey.modifiers & 2) && 'Control']
    : [(hotkey.modifiers & 2) && 'Ctrl', (hotkey.modifiers & 1) && 'Alt', (hotkey.modifiers & 4) && 'Shift'];
  return [...modifiers, name].filter(Boolean).join('+');
}
function modifierLabel(modifiers) {
  return (platform === 'macos'
    ? [(modifiers & 8) && 'Command', (modifiers & 4) && 'Shift', (modifiers & 1) && 'Option', (modifiers & 2) && 'Control']
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
    title: 'Мировое время', cities: 'ГОРОДА', add: 'Добавить город', reminders: 'Напоминания', none: 'Пока нет',
    settings: 'Настройки', theme: 'Тема', systemTheme: 'Системная', dark: 'Тёмная', light: 'Светлая', language: 'Язык', base: 'Базовый город',
    timeFormat: 'Формат времени', systemFormat: 'Системный', hour24: '24-часовой', hour12: '12-часовой',
    typicalSchedule: 'Типичный график', citySettings: 'График в городах', defaultSchedule: 'График по умолчанию',
    working: 'Рабочее время', okay: 'Можно связаться', dnd: 'Не беспокоить', daylight: 'Светло', twilight: 'Сумерки', night: 'Темно',
    rename: 'Переименовать', schedule: 'График', makeBase: 'Сделать базовым', remove: 'Удалить', useDefault: 'Использовать общий график', displayLabel: 'Имя человека или клиента',
    alarmAction: 'Будильник', changeCity: 'Сменить город', contactHours: 'Часы связи',
    intervals: 'Интервалы напоминания', autostart: 'Запускать вместе с Windows', favorites: 'ИЗБРАННЫЕ ГОРОДА',
    results: 'РЕЗУЛЬТАТЫ ПОИСКА', search: 'Поиск города...', system: 'Время Windows', from: 'от базы', now: 'Сейчас',
    save: 'Сохранить', choose: 'Выберите город', got: 'Понятно', snooze: 'Повторить через 5 минут', alarm: 'Напоминание',
    edit: 'Изменить напоминание', newReminder: 'Новое напоминание', create: 'Создать', delete: 'Удалить напоминание', cancel: 'Отмена', target: 'Конечное время',
    remindBefore: 'Смещение напоминания (минуты)', moveFuture: 'Сдвиньте шкалу на будущее время', left: 'Осталось',
    whatsNext: 'Что дальше?',
  },
  en: {
    title: 'World time', cities: 'CITIES', add: 'Add city', reminders: 'Reminders', none: 'None yet',
    settings: 'Settings', theme: 'Theme', systemTheme: 'System', dark: 'Dark', light: 'Light', language: 'Language', base: 'Base city',
    timeFormat: 'Time format', systemFormat: 'System', hour24: '24-hour', hour12: '12-hour',
    typicalSchedule: 'Typical schedule', citySettings: 'Schedules by city', defaultSchedule: 'Default schedule',
    working: 'Working', okay: 'Okay to contact', dnd: 'Do not disturb', daylight: 'Daylight', twilight: 'Twilight', night: 'Night',
    rename: 'Rename', schedule: 'Schedule', makeBase: 'Make base', remove: 'Remove', useDefault: 'Use default schedule', displayLabel: 'Person or client name',
    alarmAction: 'Alarm', changeCity: 'Change city', contactHours: 'Contact hours',
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
  return byKey.get(key) || zoneFallback.get(zoneOf(key)) || {
    key, en: zoneOf(key).split('/').pop().replaceAll('_', ' '), ru: '', cc: '',
  };
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
    ? (lang() === 'ru' ? 'Через < 1 мин' : 'In < 1 min')
    : (lang() === 'ru' ? '< 1 мин назад' : '< 1 min ago');
  const hours = Math.floor(minutes / 60);
  minutes %= 60;
  const duration = [
    hours && (lang() === 'ru' ? `${hours} ч` : `${hours} h`),
    minutes && (lang() === 'ru' ? `${minutes} мин` : `${minutes} min`),
  ].filter(Boolean).join(' ');
  if (lang() === 'ru') return future ? `Через ${duration}` : `${duration} назад`;
  return future ? `In ${duration}` : `${duration} ago`;
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

function solarGlyph(state) { return state === 'daylight' ? '☀' : state === 'twilight' ? '◐' : '☾'; }

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
  config = {...structuredClone(defaults), ...config, settings: {...defaults.settings, ...(config.settings || {})}};
  config.cityContext = config.cityContext && typeof config.cityContext === 'object' && !Array.isArray(config.cityContext) ? config.cityContext : {};
  config.timezones = Array.isArray(config.timezones) ? config.timezones : [...defaults.timezones];
  config.favorites = Array.isArray(config.favorites) ? config.favorites : [...defaults.favorites];
  const intervals = config.settings.reminder_intervals;
  if (!Array.isArray(intervals) || intervals.length < 1 ||
      intervals.some(value => !Number.isSafeInteger(+value))) {
    config.settings.reminder_intervals = [15, 30, 60];
  } else {
    config.settings.reminder_intervals = intervals.map(Number);
  }
  config.settings.availabilityDefault = normalizeSchedule(config.settings.availabilityDefault);
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
  reminders.entries.forEach(syncReminderModel);
}

function saveConfig() { send(`saveConfig\n${JSON.stringify(config, null, 2)}`); if (!applyingRemoteSync) window.syncLocalChanged?.(); }
function saveReminders() { reminders.entries.forEach(syncReminderModel); send(`saveReminders\n${JSON.stringify(reminders, null, 2)}`); if (!applyingRemoteSync) window.syncLocalChanged?.(); }

function render() {
  liveOffset = null;
  normalize();
  const systemLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  document.body.classList.toggle('light', config.settings.theme === 'light' || (config.settings.theme === 'system' && systemLight));
  const selected = new Date(referenceTimestamp());
  const zone = baseZone();
  const source = config.settings.top_clock_mode === 'auto' ? `<div class="source">${t('system')}</div>` : '';
  const city = config.settings.top_clock_mode === 'auto' ? systemCities() : cityName(config.settings.manual_top_timezone);
  const baseSolar = temporalContext(selected, baseSolarKey()).solar;
  const baseSolarLabel = t(baseSolar);
  const shift = shiftCaption(offset);
  const quickClass = offset > 0 ? 'quick-section open' : 'quick-section';

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
          <span class="base-solar solar-glyph" role="img" aria-label="${esc(baseSolarLabel)}">${solarGlyph(baseSolar)}</span>
          ${source}<div class="clock-time">${timeAt(selected, zone)}</div>
          <div class="clock-city">${esc(city)}</div><div class="date">${displayDate(selected, zone)}</div><div class="base-reminders" id="baseReminders"></div>
        </div>
        <div class="card-actions-wrap" aria-hidden="${!expandedBase}"><div class="card-actions"><button data-base-action="alarm">${t('alarmAction')}</button><button data-base-action="replace">${t('changeCity')}</button></div></div>
      </article>
      <article class="saved-panel panel"><div class="saved-heading" id="savedHeading"></div><div class="saved-list" id="alarmList"></div></article>
    </section>
    <div class="hero-resizer" id="heroResizer" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${lang() === 'ru' ? 'Высота секции времени и напоминаний' : 'Time and reminders section height'}"></div>
    <section class="slider" id="sliderArea">
      <div class="shift-label ${offset === 0 ? 'start' : offset === 24 ? 'end' : ''}" id="shiftLabel">${shift}</div>
      <div class="slider-rail" aria-hidden="true"><div class="slider-fill"></div></div>
      <div class="slider-thumb" aria-hidden="true"></div>
      <input id="timeSlider" type="range" min="0" max="24" step="1" value="${offset}" aria-label="${t('moveFuture')}" aria-valuetext="${shift}">
      <div class="marks"><span id="originLabel">${originCaption()}</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
    </section>
    <section class="${quickClass}" id="quickSection">
      <div class="quick-title">${lang() === 'ru' ? 'Напоминание' : 'Reminder'}</div>
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
    <div class="footer"><span>${esc(version)}</span><button class="whats-next" data-action="whats-next">${t('whatsNext')}</button></div>
  </div>`;
  renderCities();
  renderAlarms();
  bindMain();
  updateSelectionState();
}

function renderCities() {
  const root = $('#cities');
  if (!root) return;
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
    return `<article class="card city-card ${expanded ? 'expanded' : ''}" draggable="true" data-city="${index}" data-zone="${esc(key)}" aria-expanded="${expanded}">
      <div class="city-summary">
        <div class="city-main"><div class="city-name">${label(key)}</div><div class="offset">${delta >= 0 ? '+' : ''}${delta} ${lang() === 'ru' ? 'ч.' : 'h'} ${t('from')}</div><div class="city-reminders"></div></div>
        <div class="city-clock"><div class="city-time"><span class="clock-value">${timeAt(selected, zone)}</span></div><div class="until">${remaining}${extra ? ` · ${esc(extra)}` : ''}</div></div>
        <button class="delete" data-delete="${index}" aria-label="${lang() === 'ru' ? 'Удалить город' : 'Delete city'}">${trashIcon}</button>
        <span class="city-context"><span class="solar-glyph context-token" tabindex="0" aria-label="${esc(contextAccessibility(context))}" data-tooltip="${esc(contextAccessibility(context))}">${solarGlyph(context.solar)}</span></span>
        ${temporalBandHtml(selected, key)}
      </div>
      <div class="card-actions-wrap" aria-hidden="${!expanded}"><div class="card-actions"><button data-city-action="alarm">${t('alarmAction')}</button><button data-city-action="base">${t('makeBase')}</button><button data-city-action="replace">${t('changeCity')}</button><button data-city-action="schedule">${t('contactHours')}</button></div></div>
    </article>`;
  }).join('');
  bindCards();
  renderCityAlarms();
}

function cityReminders(key) {
  const city = item(key);
  return reminders.entries.filter(entry => {
    if (!['pending', 'ringing'].includes(entry.state) || entry.source_type === 'base') return false;
    if (entry.city_key) return entry.city_key === key || item(entry.city_key).key === city.key;
    if (zoneOf(entry.zone) !== zoneOf(key)) return false;
    if (entry.city) return [city.en, city.ru, cityName(key)].some(name => name && name.toLocaleLowerCase() === entry.city.toLocaleLowerCase());
    return item(entry.zone).key === city.key;
  }).sort((a, b) => a.alarm - b.alarm);
}

function renderCityAlarms() {
  $$('.city-card').forEach(card => renderAlarmLabels(card.querySelector('.city-reminders'), cityReminders(card.dataset.zone)));
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
  return clamp(Number(value) || 150, 136, Math.max(136, window.innerHeight - 350));
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
  const height = Math.max(minimum, manual > 0 ? heroHeight(manual) : 0);
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
  $('[data-action=whats-next]').onclick = () => send('openExternal\nhttps://world-clock-next.decent-rat-2368.chatgpt.site');
  $('.header h1').onpointerdown = () => send('drag');

  const slider = $('#timeSlider');
  updateSliderVisual(offset);
  slider.oninput = event => {liveOffset = +event.target.value; setOffset(liveOffset);};
  slider.onchange = event => {liveOffset = null; setOffset(+event.target.value);};
  $('#sliderArea').oncontextmenu = event => { event.preventDefault(); liveOffset = null; setOffset(0); };
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
  });
}

function setOffset(value) {
  offset = clamp(Math.round(value * 4) / 4, 0, 24);
  if (pendingLead !== null) pendingLead = null;
  $('#quickSection')?.classList.toggle('open', offset > 0);
  updateDynamic();
}

function updateDynamic() {
  const selected = new Date(referenceTimestamp());
  const zone = baseZone();
  const clock = $('.clock-time');
  if (!clock) return;
  clock.textContent = timeAt(selected, zone);
  $('.date').textContent = displayDate(selected, zone);
  const baseSolar = temporalContext(selected, baseSolarKey()).solar;
  const baseSolarNode = $('.base-solar');
  if (baseSolarNode) {
    const label = t(baseSolar);
    baseSolarNode.textContent = solarGlyph(baseSolar);
    baseSolarNode.setAttribute('aria-label', label);
  }
  const shift = shiftCaption(offset);
  $('#timeSlider').value = liveOffset ?? offset;
  $('#originLabel').innerHTML = originCaption();
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
    solarNode.textContent = solarGlyph(context.solar);
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
      if (pendingLead !== null) return reminderClick?.(event);
      toggleExpandedCity(card.dataset.zone);
      applyExpandedCityState();
    };
    card.oncontextmenu = event => { event.preventDefault(); openCityActions(card.dataset.zone); };
    card.ondragstart = event => {
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
  if (!config.timezones[index] || config.timezones.some((candidate, candidateIndex) => candidate === key && candidateIndex !== index)) return false;
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
  if (offset === 0 || referenceTimestamp() <= Date.now()) {
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
    zone: zoneOf(zone), city_key: zone, city: city || cityName(zone), started_at: now / 1000,
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

function modal(title, body) {
  detailId = null; capturingHotkey = false; closeNamePopover();
  $('#modal').innerHTML = `<section class="modal-root"><div class="modal-head"><button class="icon" id="back">‹</button><h2>${esc(title)}</h2></div><div class="modal-body">${body}</div></section>`;
  $('#back').onclick = closeModal;
}

function closeModal() { detailId = null; capturingHotkey = false; candidateHotkey = null; $('#modal').innerHTML = ''; }

function directionOptions() {
  return lang() === 'ru'
    ? [['left','← Слева'],['right','Справа →'],['top','↑ Сверху'],['bottom','↓ Снизу']]
    : [['left','← Left'],['right','Right →'],['top','↑ Top'],['bottom','↓ Bottom']];
}

function openDirection() {
  const title = lang() === 'ru' ? 'Появление и скрытие' : 'Show and hide';
  modal(title, `<p class="settings-help">${lang() === 'ru' ? `Виджет уезжает к выбранному краю экрана и возвращается с той же стороны. Открыть снова: ${hotkeyLabel()} или значок в трее.` : `The widget hides toward this screen edge and returns from the same side. Reopen with ${hotkeyLabel()} or the tray icon.`}</p><div class="direction-picker">${directionOptions().map(([value,name]) => `<button class="direction-choice ${config.settings.overlay_direction === value ? 'selected' : ''}" data-direction="${value}" aria-pressed="${config.settings.overlay_direction === value}">${name}</button>`).join('')}</div>`);
  $$('[data-direction]').forEach(button => button.onclick = () => {
    config.settings.overlay_direction = button.dataset.direction;
    saveConfig(); openDirection();
  });
}

function openHotkey() {
  candidateHotkey = null;
  capturedModifiers = 0;
  modal(lang() === 'ru' ? 'Клавиша вызова панели' : 'Panel shortcut',
    `<div class="hotkey-active"><span>${lang() === 'ru' ? 'Сейчас назначено' : 'Current shortcut'}</span><strong id="hotkeyCurrent">${esc(hotkeyLabel())}</strong></div>
    <button class="hotkey-recorder" id="hotkeyCapture" type="button"></button>
    <div class="hotkey-preview"><span>${lang() === 'ru' ? 'Новое сочетание' : 'New shortcut'}</span><strong id="hotkeyPreview">—</strong></div>
    <p class="hotkey-feedback" id="hotkeyFeedback" role="status" aria-live="polite"></p>
    <button class="primary" id="hotkeyApply" type="button" disabled>${lang() === 'ru' ? 'Применить' : 'Apply'}</button>
    <button class="secondary" id="hotkeyReset">${lang() === 'ru' ? `Вернуть ${hotkeyLabel(defaultHotkeyForPlatform())}` : `Restore ${hotkeyLabel(defaultHotkeyForPlatform())}`}</button>`);
  $('#hotkeyCapture').onclick = startHotkeyCapture;
  $('#hotkeyApply').onclick = () => {if (candidateHotkey) requestHotkey(candidateHotkey);};
  $('#hotkeyReset').onclick = () => {
    capturingHotkey = false;
    candidateHotkey = {...defaultHotkeyForPlatform()};
    updateHotkeyUI(lang() === 'ru' ? 'Нажмите «Применить», чтобы восстановить сочетание.' : 'Press Apply to restore the shortcut.');
  };
  updateHotkeyUI(lang() === 'ru' ? 'Нажмите кнопку записи, затем нужные клавиши.' : 'Start recording, then press the desired keys.');
}

function updateHotkeyUI(message) {
  const button = $('#hotkeyCapture');
  if (!button) return;
  button.classList.toggle('recording', capturingHotkey);
  button.textContent = capturingHotkey
    ? (lang() === 'ru' ? '● Запись идёт — нажмите клавиши' : '● Recording — press keys')
    : (lang() === 'ru' ? 'Нажмите, чтобы записать сочетание' : 'Click to record a shortcut');
  $('#hotkeyCurrent').textContent = hotkeyLabel();
  $('#hotkeyPreview').textContent = candidateHotkey ? hotkeyLabel(candidateHotkey)
    : capturingHotkey ? `${modifierLabel(capturedModifiers)}${capturedModifiers ? '+' : ''}…` : '—';
  $('#hotkeyPreview').classList.toggle('ready', Boolean(candidateHotkey));
  $('#hotkeyApply').disabled = !candidateHotkey || Boolean(pendingHotkey);
  if (message !== undefined) $('#hotkeyFeedback').textContent = message;
}

function startHotkeyCapture() {
  if (pendingHotkey) return;
  capturingHotkey = true;
  candidateHotkey = null;
  capturedModifiers = 0;
  const modifiers = platform === 'macos' ? 'Control, Option, Shift и Command' : 'Ctrl, Alt и Shift';
  const modifiersEn = platform === 'macos' ? 'Control, Option, Shift and Command' : 'Ctrl, Alt and Shift';
  updateHotkeyUI(lang() === 'ru' ? `Нажатые ${modifiers} появляются ниже. Завершите сочетание клавишей.` : `${modifiersEn} appear below as you press them. Finish with a key.`);
  $('#hotkeyCapture').focus();
}

function requestHotkey(hotkey) {
  if (pendingHotkey) return;
  capturingHotkey = false;
  pendingHotkey = hotkey;
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
  updateHotkeyUI(lang() === 'ru' ? 'Сочетание записано. Нажмите «Применить», чтобы проверить и сохранить.' : 'Shortcut recorded. Press Apply to check and save it.');
}, true);

document.addEventListener('keyup', event => {
  if (!capturingHotkey || !$('#hotkeyCapture')) return;
  event.preventDefault(); event.stopImmediatePropagation();
  capturedModifiers = (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.shiftKey ? 4 : 0) | (event.metaKey ? 8 : 0);
  updateHotkeyUI();
}, true);

function openSettings() {
  const themeName = config.settings.theme === 'system' ? t('systemTheme') : t(config.settings.theme);
  const formatName = config.settings.time_format === 'system' ? t('systemFormat') : t(config.settings.time_format === '12' ? 'hour12' : 'hour24');
  modal(t('settings'), `<div class="group"><div class="row" id="theme"><span>${t('theme')}</span><span class="row-value">${themeName} ›</span></div>
    <div class="row" id="timeFormat"><span>${t('timeFormat')}</span><span class="row-value">${formatName} ›</span></div></div>
    <div class="group"><div class="row" id="language"><span>${t('language')}</span><span class="row-value">${lang() === 'ru' ? 'Русский' : 'English'} ›</span></div>
    <div class="row" id="base"><span>${t('base')}</span><span class="row-value">${config.settings.top_clock_mode === 'auto' ? t('system') : esc(cityName(config.settings.manual_top_timezone))} ›</span></div></div>
    <div class="group"><button class="row settings-button" id="typicalSchedule"><span>${t('typicalSchedule')}</span><span class="row-value">›</span></button>
    <button class="row settings-button" id="citySettings"><span>${t('citySettings')}</span><span class="row-value">${config.timezones.length} ›</span></button></div>
    <div class="group"><div class="row" id="intervals"><span>${t('intervals')}</span><span class="row-value">${config.settings.reminder_intervals.join(' · ')} ›</span></div></div>
    <div class="group"><button class="row settings-button" id="quickTitles"><span>${lang() === 'ru' ? 'Быстрые названия' : 'Quick titles'}</span><span class="row-value">›</span></button></div>
    <div class="group"><button class="row settings-button" id="phone"><span>${lang() === 'ru' ? 'Телефон' : 'Phone'}</span><span class="row-value">${window.syncSettingsLabel?.() || (lang() === 'ru' ? 'Подключить Android' : 'Connect Android')} ›</span></button></div>
    <div class="group"><button class="row settings-button" id="direction"><span>${lang() === 'ru' ? 'Появление и скрытие' : 'Show and hide'}</span><span class="row-value">${directionOptions().find(([value]) => value === config.settings.overlay_direction)?.[1] || directionOptions()[1][1]} ›</span></button>
    <button class="row settings-button" id="hotkey"><span>${lang() === 'ru' ? 'Клавиша вызова панели' : 'Panel shortcut'}</span><span class="row-value">${esc(hotkeyLabel())} ›</span></button></div>
    <div class="group"><div class="row toggle-row"><span>${t('autostart')}</span><button class="switch ${config.settings.autostart ? 'on' : ''}" id="autostartSwitch" role="switch" aria-checked="${config.settings.autostart ? 'true' : 'false'}" aria-label="${t('autostart')}"></button></div></div>`);
  $('#theme').onclick = () => choice(t('theme'), [['system', t('systemTheme')], ['dark', t('dark')], ['light', t('light')]], config.settings.theme, value => {
    config.settings.theme = value; saveConfig(); render(); openSettings();
  });
  $('#timeFormat').onclick = () => choice(t('timeFormat'), [['system', t('systemFormat')], ['24', t('hour24')], ['12', t('hour12')]], config.settings.time_format, value => {
    config.settings.time_format = value; saveConfig(); render(); openSettings();
  });
  $('#language').onclick = () => choice(t('language'), [['ru', 'Русский'], ['en', 'English']], lang(), value => {
    config.settings.language = value; saveConfig(); render(); openSettings();
  });
  $('#base').onclick = () => openCities('base');
  $('#typicalSchedule').onclick = () => openScheduleEditor(null);
  $('#citySettings').onclick = openCitySettingsList;
  $('#intervals').onclick = openIntervals;
  $('#direction').onclick = openDirection;
  $('#hotkey').onclick = openHotkey;
  $('#quickTitles').onclick = openQuickTitles;
  $('#phone').onclick = () => window.openPhoneSettings?.();
  $('#autostartSwitch').onclick = () => {
    config.settings.autostart = !config.settings.autostart;
    saveConfig();
    send(`setStartup\n${config.settings.autostart ? '1' : '0'}`);
    openSettings();
  };
}

function scheduleEditorBody(schedule, inherited = false) {
  const fields = [
    ['okayStart', lang() === 'ru' ? 'Можно связаться с' : 'Okay from'],
    ['workingStart', lang() === 'ru' ? 'Рабочее время с' : 'Working from'],
    ['workingEnd', lang() === 'ru' ? 'Рабочее время до' : 'Working until'],
    ['dndStart', lang() === 'ru' ? 'Не беспокоить с' : 'DND from'],
  ];
  return `${inherited ? `<button class="secondary schedule-default" id="useDefault">${t('useDefault')}</button>` : ''}<div class="group schedule-times">${fields.map(([key,name]) => `<label class="row"><span>${name}</span><input type="time" step="900" value="${schedule[key]}" data-schedule-time="${key}"></label>`).join('')}</div><div class="schedule-error" id="scheduleError" role="status"></div><button class="primary" id="saveSchedule">${t('save')}</button>`;
}

function openScheduleEditor(key, returnTo = 'actions') {
  const override = key ? cityContext(key).availabilityOverride : null;
  const schedule = normalizeSchedule(override || config.settings.availabilityDefault);
  modal(key ? `${t('schedule')}: ${cityName(key)}` : t('typicalSchedule'), scheduleEditorBody(schedule, Boolean(key)));
  $('#useDefault')?.addEventListener('click', () => {
    const context = cityContext(key); delete context.availabilityOverride;
    if (!context.label) delete config.cityContext[key];
    saveConfig(); render(); ['card','base'].includes(returnTo) ? closeModal() : openCityActions(key);
  });
  $('#saveSchedule').onclick = () => {
    const value = Object.fromEntries($$('[data-schedule-time]').map(input => [input.dataset.scheduleTime, input.value]));
    if (!scheduleIsValid(value)) {
      $('#scheduleError').textContent = lang() === 'ru' ? 'Границы должны идти по кругу суток в указанном порядке.' : 'Boundaries must follow this order around the 24-hour day.';
      return;
    }
    if (key) {
      config.cityContext[key] = {...cityContext(key), availabilityOverride:value};
    } else config.settings.availabilityDefault = value;
    saveConfig(); render(); returnTo === 'base' ? closeModal() : key ? (returnTo === 'card' ? closeModal() : openCityActions(key)) : openSettings();
  };
}

function openCitySettingsList() {
  modal(t('citySettings'), `<div class="group">${config.timezones.map(key => `<button class="row settings-button" data-city-settings="${esc(key)}"><span>${label(key)}</span><span class="row-value">›</span></button>`).join('')}</div>`);
  $$('[data-city-settings]').forEach(button => button.onclick = () => openCityActions(button.dataset.citySettings));
}

function openCityActions(key) {
  if (!config.timezones.includes(key)) { openCitySettingsList(); return; }
  modal(cityName(key), `<div class="group city-actions"><button class="row settings-button" id="renameCity"><span>${t('rename')}</span><span class="row-value">${esc(cityContext(key).label || '')} ›</span></button><button class="row settings-button" id="scheduleCity"><span>${t('schedule')}</span><span class="row-value">${cityContext(key).availabilityOverride ? (lang() === 'ru' ? 'Свой' : 'Custom') : (lang() === 'ru' ? 'Общий' : 'Default')} ›</span></button><button class="row settings-button" id="makeBase">${t('makeBase')}</button><button class="row settings-button danger-row" id="removeCity">${t('remove')}</button></div>`);
  $('#renameCity').onclick = () => openRenameCity(key);
  $('#scheduleCity').onclick = () => openScheduleEditor(key);
  $('#makeBase').onclick = () => {
    makeBaseCity(key);
  };
  $('#removeCity').onclick = () => {
    config.timezones = config.timezones.filter(candidate => candidate !== key); delete config.cityContext[key];
    saveConfig(); render(); closeModal();
  };
}

function openRenameCity(key) {
  modal(`${t('rename')}: ${cityName(key)}`, `<label class="section" for="cityLabel">${t('displayLabel')}</label><input class="search" id="cityLabel" maxlength="80" value="${esc(cityContext(key).label || '')}"><button class="primary rename-save" id="saveCityLabel">${t('save')}</button>`);
  const input = $('#cityLabel'); input.focus(); input.select();
  $('#saveCityLabel').onclick = () => {
    const context = {...cityContext(key), label:input.value.trim().slice(0,80)};
    if (!context.label) delete context.label;
    if (!context.label && !context.availabilityOverride) delete config.cityContext[key]; else config.cityContext[key] = context;
    saveConfig(); render(); openCityActions(key);
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
  const replaceIndex = mode.startsWith('replace:') ? Number(mode.split(':')[1]) : -1;
  const system = mode === 'base' ? `<div class="result system-result"><div><b>${t('system')}</b><div class="region">(${esc(systemCities())})</div></div><b data-live-zone="${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}">${timeAt(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)}</b><button class="switch ${config.settings.top_clock_mode === 'auto' ? 'on' : ''}" id="systemSwitch" role="switch"></button></div>` : '';
  modal(mode === 'base' ? t('base') : replaceIndex >= 0 ? t('changeCity') : t('add'), `<input class="search" id="search" placeholder="${t('search')}">${system}<div class="section" id="section">${t('favorites')}</div><div id="results"></div>`);
  const input = $('#search');
  input.oninput = () => renderResults(mode, input.value);
  if ($('#systemSwitch')) $('#systemSwitch').onclick = () => {
    config.settings.top_clock_mode = config.settings.top_clock_mode === 'auto' ? 'manual' : 'auto';
    if (config.settings.top_clock_mode === 'manual' && !config.settings.manual_top_timezone) config.settings.manual_top_timezone = 'Asia/Ho_Chi_Minh';
    config.settings.base_timezone = config.settings.top_clock_mode === 'auto' ? '' : config.settings.manual_top_timezone;
    expandedBase = false;
    saveConfig(); render(); openCities('base');
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
  const replaceIndex = mode.startsWith('replace:') ? Number(mode.split(':')[1]) : -1;
  const rows = matches(query);
  $('#section').textContent = query.trim() ? t('results') : t('favorites');
  $('#results').innerHTML = rows.map(city => {
    const favorite = config.favorites.includes(city.key);
    const chosen = config.settings.top_clock_mode === 'manual' && config.settings.manual_top_timezone === city.key;
    const duplicate = replaceIndex >= 0 && config.timezones.includes(city.key) && config.timezones[replaceIndex] !== city.key;
    const disabled = (mode === 'base' && chosen) || duplicate;
    return `<div class="result city-result"><div><b>${label(city.key)}</b></div><b class="result-time" data-live-zone="${esc(zoneOf(city.key))}">${timeAt(new Date(), zoneOf(city.key))}</b><button data-add="${esc(city.key)}" ${disabled ? 'disabled' : ''}>${mode === 'base' && chosen ? '✓' : '＋'}</button><button class="${favorite ? 'on' : ''}" data-star="${esc(city.key)}">☆</button>${favorite ? `<button class="trash" aria-label="${lang() === 'ru' ? 'Удалить из избранного' : 'Remove from favorites'}" data-unfav="${esc(city.key)}">${trashIcon}</button>` : '<span></span>'}</div>`;
  }).join('');
  $$('[data-add]').forEach(button => button.onclick = () => {
    const key = button.dataset.add;
    if (mode === 'base') {
      config.settings.top_clock_mode = 'manual';
      config.settings.manual_top_timezone = key;
      config.settings.base_timezone = key;
      expandedBase = false;
    } else if (replaceIndex >= 0 && config.timezones[replaceIndex]) {
      replaceCityAt(replaceIndex, key);
    } else if (!config.timezones.includes(key)) config.timezones.push(key);
    saveConfig(); render(); closeModal();
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
    if (Date.now() - lastBeep > 10000) { send('beep'); lastBeep = Date.now(); }
    return;
  }
  alertId = entry.id;
  lastBeep = Date.now();
  send('show');
  send('beep');
  modal(t('alarm'), `<div class="alert-city">${esc(entry.title || t('alarm'))}</div><div class="alarm-context">${esc(sourceCaption(entry))}</div><div class="alert-time">${timeAt(new Date(entry.alarm * 1000), zoneOf(entry.zone || baseZone()))}</div><button class="primary" id="ack">${t('got')}</button><button class="secondary" id="snooze">${t('snooze')}</button>`);
  $('#ack').onclick = () => {
    if (entry.repeat === 'daily') {
      entry.alarm = nextDailyAlarm(entry);
      entry.target = entry.alarm;
      entry.started_at = Date.now() / 1000;
      entry.state = 'pending';
    } else reminders.entries = reminders.entries.filter(candidate => candidate.id !== entry.id);
    alertId = null; saveReminders(); closeModal(); renderAlarms();
  };
  $('#snooze').onclick = () => {
    entry.alarm = Date.now() / 1000 + 300;
    entry.started_at = Date.now() / 1000;
    entry.state = 'pending';
    alertId = null; saveReminders(); closeModal(); renderAlarms();
  };
}

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
window.nativeTick = () => {
  window.__nativeTickCount += 1;
  updateDynamic(); updateLiveCityTimes(); updateAlarmDetail(); checkDue();
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
  if (event.data?.type === 'hotkeyResult') {
    activeHotkey = {modifiers: event.data.modifiers, key: event.data.key};
    if (event.data.success && pendingHotkey) {
      config.settings.hotkey = {...activeHotkey};
      saveConfig();
      render();
    }
    pendingHotkey = null;
    candidateHotkey = event.data.success ? null : candidateHotkey;
    updateHotkeyUI(event.data.success
      ? (lang() === 'ru' ? `Сохранено: ${hotkeyLabel()}. Теперь панель вызывается этим сочетанием.` : `Saved: ${hotkeyLabel()}. Use it to open the panel.`)
      : (lang() === 'ru' ? 'Сочетание занято или недоступно. Прежнее сохранено; выберите другое.' : 'Shortcut occupied or unavailable. Previous shortcut kept; choose another.'));
    return;
  }
  if (event.data?.type !== 'init') return;
  platform = event.data.platform === 'macos' ? 'macos' : 'windows';
  window.__worldClockPlatform = platform;
  try { config = JSON.parse(event.data.configText || '{}'); } catch { config = {}; }
  try { reminders = JSON.parse(event.data.remindersText || '{}'); } catch { reminders = {lead: 15, entries: []}; }
  version = event.data.version || version;
  const previousTitleVersion = config.settings?.title_library_version;
  const previousReminders = JSON.stringify(reminders);
  normalize();
  if (JSON.stringify(reminders) !== previousReminders) saveReminders();
  if (previousTitleVersion !== 1) saveConfig();
  send(`setStartup\n${config.settings.autostart ? '1' : '0'}`);
  render();
  send('rendered');
  window.syncInitialize?.(event.data.syncCredential || '');
});

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
  activeHotkey = {modifiers: event.data.hotkeyModifiers, key: event.data.hotkeyKey};
  render();
  if (previewParams.has('expand')) { expandedCityKey = config.timezones[0]; renderCities(); }
  if (previewParams.has('newalarm')) newAlarmForCity(config.timezones[0]);
  if (previewParams.has('settings')) openSettings();
  if (previewParams.has('schedule')) openScheduleEditor(config.timezones[0]);
}
