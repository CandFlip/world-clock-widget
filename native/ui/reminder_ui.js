function syncReminderModel(entry) {
  entry.id ||= crypto.randomUUID().replaceAll('-', '');
  entry.title = typeof entry.title === 'string' ? entry.title : '';
  entry.zone ||= entry.timezone_id || baseZone();
  if (!entry.source_type) {
    const legacyBase = (entry.city || '').includes(',') || entry.city === 'Время Windows' || entry.city === 'Windows time';
    entry.source_type = legacyBase ? 'base' : 'city';
    if (legacyBase) entry.base_kind = 'auto';
  }
  entry.source_city_id = entry.source_type === 'base' && entry.base_kind === 'auto' ? null : (entry.city_key || entry.zone);
  entry.timezone_id = zoneOf(entry.zone);
  entry.scheduled_at = new Date(entry.alarm * 1000).toISOString();
  const local = inputAt(entry.alarm * 1000, entry.timezone_id).split('T');
  entry.local_date = local[0];
  entry.local_time = local[1];
  entry.repeat = entry.repeat === 'daily' ? 'daily' : 'none';
  if (entry.repeat === 'daily') {
    entry.repeat_time = /^([01]\d|2[0-3]):[0-5]\d$/.test(entry.repeat_time || '') ? entry.repeat_time : local[1];
  } else delete entry.repeat_time;
  entry.active = ['pending', 'ringing'].includes(entry.state);
  entry.schema_version = 2;
}

function sourceCaption(entry) {
  if (entry.source_type === 'base') {
    const source = entry.base_kind === 'manual' ? (entry.city || cityName(entry.city_key || entry.zone)) : 'Windows';
    return lang() === 'ru' ? `Базовое время (${source})` : `Base time (${source})`;
  }
  return entry.city || cityName(entry.city_key || entry.zone);
}

function compactAlarmDate(at, zone, now = new Date()) {
  const current = zonedParts(now, zone), target = zonedParts(at, zone);
  const day = parts => Date.UTC(+parts.year, +parts.month - 1, +parts.day);
  const difference = Math.round((day(target) - day(current)) / 86400000);
  if (difference === 0) return lang() === 'ru' ? 'Сегодня' : 'Today';
  if (difference === 1) return lang() === 'ru' ? 'Завтра' : 'Tomorrow';
  const options = difference > 1 && difference < 7 && target.year === current.year
    ? {weekday:'short'} : {day:'numeric', month:'short', ...(target.year !== current.year ? {year:'numeric'} : {})};
  return new Intl.DateTimeFormat(lang() === 'ru' ? 'ru-RU' : 'en-GB', {timeZone:zone, ...options}).format(at);
}

function alarmLabel(entry) {
  const at = new Date(entry.alarm * 1000), zone = zoneOf(entry.zone);
  return `${entry.repeat === 'daily' ? '↻ ' : ''}${compactAlarmDate(at, zone)} · ${timeAt(at, zone)}`;
}

function renderAlarmLabels(root, entries) {
  if (!root) return;
  const markup = entries.slice(0,2).map(entry => `<button class="city-reminder" data-label-alarm="${esc(entry.id)}" title="${esc(displayDate(new Date(entry.alarm * 1000), zoneOf(entry.zone)))}">${esc(alarmLabel(entry))}</button>`).join('') +
    (entries.length > 2 ? `<button class="city-reminder" data-more-alarms aria-label="${lang() === 'ru' ? 'Все напоминания' : 'All reminders'}">+${entries.length-2}</button>` : '');
  if (root.innerHTML === markup) return;
  root.innerHTML = markup;
  root.querySelectorAll('[data-label-alarm]').forEach(button => button.onclick = event => {event.stopPropagation(); showAlarmDetail(button.dataset.labelAlarm);});
  const more = root.querySelector('[data-more-alarms]');
  if (more) more.onclick = event => {
    event.stopPropagation();
    const ids = entries.map(entry => entry.id);
    modal(t('reminders'), `<div class="alarm-list-detail">${ids.map(id => {
      const entry = reminders.entries.find(entry => entry.id === id);
      return entry ? `<button class="secondary" data-open-alarm="${esc(id)}">${esc(alarmLabel(entry))}${entry.title ? ` · ${esc(entry.title)}` : ''}</button>` : '';
    }).join('')}</div>`);
    $$('[data-open-alarm]').forEach(button => button.onclick = () => showAlarmDetail(button.dataset.openAlarm));
  };
}

function closeNamePopover() { const root = $('#namePopover'); if (root) root.innerHTML = ''; }

function systemTitles() {
  return lang() === 'ru' ? ['Созвон','Встреча','Позвонить','Лекарство','Работа','Такси'] : ['Call','Meeting','Phone someone','Medication','Work','Taxi'];
}

function rememberTitle(title) {
  title = title.trim();
  if (!title) return;
  config.settings.quick_titles ||= [];
  let saved = config.settings.quick_titles.find(item => item.title.toLocaleLowerCase() === title.toLocaleLowerCase());
  if (!saved) { saved = {id:crypto.randomUUID(), title, use_count:0}; config.settings.quick_titles.push(saved); }
  saved.used_at = Date.now(); saved.use_count = (saved.use_count || 0) + 1;
  saveConfig();
}

function showNamePopover(id, x, y, expanded = false) {
  const root = $('#namePopover');
  if (!root) return;
  const candidates = (config.settings.quick_titles || []).map(item => ({text:item.title, custom:true}));
  const visible = expanded ? candidates : candidates.slice(0,6);
  root.innerHTML = `<section class="name-popover" role="dialog" aria-label="${lang() === 'ru' ? 'Добавить название' : 'Add title'}"><div class="name-success"><span class="success-check" aria-hidden="true">✓</span><div class="name-popover-heading">${lang() === 'ru' ? 'Будильник создан' : 'Alarm created'}</div></div><div class="name-section-label">${lang() === 'ru' ? 'Название · необязательно' : 'Title · optional'}</div><button class="name-option" id="noTitle">${lang() === 'ru' ? 'Без названия' : 'No title'}</button><div class="name-options">${visible.map((item,index) => `<button class="name-option" data-title-choice="${index}">${esc(item.text)}</button>`).join('')}</div>${!expanded && candidates.length > visible.length ? `<button class="name-option" id="moreTitles">${lang() === 'ru' ? 'Ещё…' : 'More…'}</button>` : ''}<button class="name-option" id="customTitle">${lang() === 'ru' ? '+ Добавить своё' : '+ Add your own'}</button><form id="nameForm" hidden><input class="search" id="newAlarmTitle" aria-label="${lang() === 'ru' ? 'Название' : 'Title'}" placeholder="${lang() === 'ru' ? 'Название · Enter сохранить' : 'Title · Enter to save'}"></form></section>`;
  const popover = root.firstElementChild;
  popover.style.left = `${clamp(x, 8, Math.max(8, window.innerWidth - 288))}px`;
  popover.style.top = `${clamp(y, 8, Math.max(8, window.innerHeight - Math.min(400, popover.offsetHeight) - 8))}px`;
  const apply = (title, custom) => {
    const entry = reminders.entries.find(entry => entry.id === id);
    if (entry) { entry.title = title.trim(); if (custom && entry.title) rememberTitle(entry.title); saveReminders(); renderAlarms(); }
    closeNamePopover();
  };
  $('#noTitle').onclick = () => apply('', false);
  root.querySelectorAll('[data-title-choice]').forEach(button => button.onclick = () => {
    const item = visible[+button.dataset.titleChoice]; apply(item.text, item.custom);
  });
  $('#moreTitles')?.addEventListener('click', () => showNamePopover(id,x,y,true));
  $('#customTitle').onclick = () => { $('#nameForm').hidden = false; $('#newAlarmTitle').focus(); };
  $('#nameForm').onsubmit = event => {event.preventDefault(); apply($('#newAlarmTitle').value, true);};
}

function openQuickTitles() {
  config.settings.quick_titles ||= [];
  const entries = config.settings.quick_titles;
  modal(lang() === 'ru' ? 'Быстрые названия' : 'Quick titles', `<p class="settings-help">${lang() === 'ru' ? 'Все варианты из окна создания будильника. Изменяйте названия и порядок, добавляйте новые или удаляйте лишние.' : 'All suggestions from the alarm creation window. Rename, reorder, add or remove any title.'}</p><div class="quick-title-editor">${entries.map((entry,index) => `<div class="title-edit-row"><input class="search" data-title-edit="${index}" value="${esc(entry.title)}" aria-label="${lang() === 'ru' ? 'Название' : 'Title'}"><button data-title-up="${index}" ${index === 0 ? 'disabled' : ''} aria-label="${lang() === 'ru' ? 'Выше' : 'Move up'}">↑</button><button data-title-down="${index}" ${index === entries.length-1 ? 'disabled' : ''} aria-label="${lang() === 'ru' ? 'Ниже' : 'Move down'}">↓</button><button class="trash" data-title-delete="${index}" aria-label="${t('delete')}">${trashIcon}</button></div>`).join('')}</div><form id="addTitleForm" class="title-add"><input class="search" id="addTitleText" aria-label="${lang() === 'ru' ? 'Новое название' : 'New title'}" placeholder="${lang() === 'ru' ? 'Новое название' : 'New title'}"><button class="secondary">${lang() === 'ru' ? 'Добавить' : 'Add'}</button></form>`);
  $$('[data-title-edit]').forEach(input => input.onchange = () => {
    const title = input.value.trim(); if (!title) {input.value = entries[+input.dataset.titleEdit].title; return;}
    entries[+input.dataset.titleEdit].title = title; saveConfig();
  });
  const move = (index, delta) => { const destination = index + delta; if (destination < 0 || destination >= entries.length) return; [entries[index],entries[destination]] = [entries[destination],entries[index]]; saveConfig(); openQuickTitles(); };
  $$('[data-title-up]').forEach(button => button.onclick = () => move(+button.dataset.titleUp,-1));
  $$('[data-title-down]').forEach(button => button.onclick = () => move(+button.dataset.titleDown,1));
  $$('[data-title-delete]').forEach(button => button.onclick = () => {entries.splice(+button.dataset.titleDelete,1); saveConfig(); openQuickTitles();});
  $('#addTitleForm').onsubmit = event => {event.preventDefault(); const title = $('#addTitleText').value.trim(); if (title) {rememberTitle(title); openQuickTitles(); $('#addTitleText').focus();}};
}

function deleteAlarm(id) {
  reminders.entries = reminders.entries.filter(entry => entry.id !== id);
  if (alertId === id) alertId = null;
  saveReminders(); closeModal(); renderAlarms();
}

function showAlarmDetail(id) { editAlarm(id); }

function updateAlarmDetail() {
  if (!detailId) return;
  const entry = reminders.entries.find(entry => entry.id === detailId);
  if (!entry) {closeModal(); return;}
  const remaining = $('#detailRemaining');
  if (remaining) remaining.textContent = until(entry.alarm * 1000);
}

function editAlarm(id) {
  const entry = reminders.entries.find(entry => entry.id === id);
  if (!entry) return;
  openAlarmEditor(entry, false);
}

function nextDailyAlarm(entry, after = Date.now()) {
  const zone = zoneOf(entry.zone);
  const today = inputAt(after, zone).split('T')[0];
  const dayNumber = Math.floor(Date.parse(today + 'T00:00:00Z') / 86400000);
  for (let offset = 0; offset < 370; offset += 1) {
    const date = new Date((dayNumber + offset) * 86400000).toISOString().slice(0, 10);
    const local = `${date}T${entry.repeat_time}`;
    const timestamp = epochAt(local, zone);
    if (Number.isFinite(timestamp) && timestamp > after && inputAt(timestamp, zone) === local) return timestamp / 1000;
  }
  throw new Error('No valid daily alarm date');
}

function newAlarmForCity(key) {
  const timestamp = Math.ceil((Date.now() + 1) / 60000) * 60000;
  const entry = {
    id: crypto.randomUUID().replaceAll('-', ''), target: timestamp / 1000,
    alarm: timestamp / 1000, state: 'pending', lead: 0, direction: 'after',
    zone: zoneOf(key), city_key: key, city: cityName(key), started_at: Date.now() / 1000,
    title: '', source_type: 'city', base_kind: null,
  };
  syncReminderModel(entry);
  openAlarmEditor(entry, true);
}

function newAlarmForBase() {
  const timestamp = Math.ceil((Date.now() + 1) / 60000) * 60000;
  const manual = config.settings.top_clock_mode === 'manual';
  const key = manual ? config.settings.manual_top_timezone : baseZone();
  const entry = {
    id: crypto.randomUUID().replaceAll('-', ''), target: timestamp / 1000,
    alarm: timestamp / 1000, state: 'pending', lead: 0, direction: 'after',
    zone: baseZone(), city_key: key, city: manual ? cityName(key) : systemCities(), started_at: Date.now() / 1000,
    title: '', source_type: 'base', base_kind: manual ? 'manual' : 'auto',
  };
  syncReminderModel(entry);
  openAlarmEditor(entry, true);
  return entry;
}

function openAlarmEditor(entry, isNew) {
  const id = entry.id;
  const zone = zoneOf(entry.zone), originalLocal = inputAt(entry.alarm*1000, zone);
  const [date,time] = originalLocal.split('T'), [hour,minute] = time.split(':');
  modal(isNew ? t('newReminder') : t('edit'), `<div class="schedule-editor"><div class="alarm-context">${esc(sourceCaption(entry))}</div><div class="schedule-labels"><span>${lang() === 'ru' ? 'День' : 'Day'}</span><span>${lang() === 'ru' ? 'Часы' : 'Hours'}</span><span>${lang() === 'ru' ? 'Минуты' : 'Minutes'}</span></div><div class="schedule-wheels"><div id="alarmDate"></div><div id="alarmHour"></div><div id="alarmMinute"></div></div><div class="row toggle-row alarm-repeat-row"><span>${lang() === 'ru' ? 'Ежедневно' : 'Daily'}</span><button class="switch ${entry.repeat === 'daily' ? 'on' : ''}" id="dailySwitch" role="switch" aria-checked="${entry.repeat === 'daily' ? 'true' : 'false'}" aria-label="${lang() === 'ru' ? 'Повторять ежедневно' : 'Repeat daily'}"></button></div><div id="scheduleError" class="schedule-error" role="status"></div><button class="primary schedule-save" id="saveAlarm">${t(isNew ? 'create' : 'save')}</button><label class="section edit-label" for="editTitle">${lang() === 'ru' ? 'Название (необязательно)' : 'Title (optional)'}</label><input class="search" id="editTitle" value="${esc(entry.title || '')}"><div class="editor-title-choices" id="editorTitleChoices">${editorTitleChoices(entry.title || '')}</div><button class="secondary" id="cancelAlarm">${t('cancel')}</button>${isNew ? '' : `<button class="quiet-delete" id="removeAlarm">${t('delete')}</button>`}</div>`);
  bindEditorTitles();
  const currentDate = inputAt(Date.now(),zone).split('T')[0];
  const dayNumber = value => Math.round(Date.parse(value + 'T00:00:00Z') / 86400000);
  const dateString = value => new Date(value * 86400000).toISOString().slice(0,10);
  const firstDay = Math.min(dayNumber(date),dayNumber(currentDate));
  const lastDay = Math.max(dayNumber(date),dayNumber(currentDate)) + 3660;
  const dateFormats = [
    new Intl.DateTimeFormat(lang() === 'ru' ? 'ru-RU' : 'en-GB', {timeZone:'UTC',day:'numeric',month:'short',weekday:'short'}),
    new Intl.DateTimeFormat(lang() === 'ru' ? 'ru-RU' : 'en-GB', {timeZone:'UTC',day:'numeric',month:'short',year:'numeric'})
  ];
  const dateLabel = value => {
    const difference = dayNumber(value) - dayNumber(currentDate);
    if (difference === 0) return lang() === 'ru' ? 'Сегодня' : 'Today';
    if (difference === 1) return lang() === 'ru' ? 'Завтра' : 'Tomorrow';
    return dateFormats[value.slice(0,4) !== currentDate.slice(0,4) ? 1 : 0].format(new Date(value + 'T12:00:00Z'));
  };
  const selectedTime = () => `${$('#alarmDate').value}T${String($('#alarmHour').value).padStart(2,'0')}:${String($('#alarmMinute').value).padStart(2,'0')}`;
  const refresh = () => {
    const local = selectedTime();
    let timestamp;
    try { timestamp = local === originalLocal ? entry.alarm*1000 : epochAt(local,zone); } catch {timestamp = NaN;}
    const available = Number.isFinite(timestamp) && inputAt(timestamp,zone) === local;
    $('#scheduleError').textContent = !available ? (lang() === 'ru' ? 'Это местное время недоступно' : 'This local time is unavailable') : timestamp <= Date.now() ? invalidAlarmMessage() : '';
    $('#saveAlarm').disabled = !available || timestamp <= Date.now();
    $('#saveAlarm').textContent = `${t(isNew ? 'create' : 'save')} · ${dateLabel($('#alarmDate').value)} ${local.split('T')[1]}`;
  };
  bindScheduleWheel($('#alarmDate'), {value:date, min:firstDay, max:lastDay, parse:dayNumber, format:dateString, label:dateLabel, name:lang() === 'ru' ? 'День' : 'Day'}, refresh);
  bindScheduleWheel($('#alarmHour'), {value:+hour, min:0, max:23, wrap:true, name:lang() === 'ru' ? 'Часы' : 'Hours'}, refresh);
  bindScheduleWheel($('#alarmMinute'), {value:+minute, min:0, max:59, wrap:true, name:lang() === 'ru' ? 'Минуты' : 'Minutes'}, refresh);
  $('#dailySwitch').onclick = () => {
    const button = $('#dailySwitch');
    const enabled = button.getAttribute('aria-checked') !== 'true';
    button.setAttribute('aria-checked', String(enabled));
    button.classList.toggle('on', enabled);
  };
  refresh();
  $('#saveAlarm').onclick = () => {
    const local = `${$('#alarmDate').value}T${String($('#alarmHour').value).padStart(2,'0')}:${String($('#alarmMinute').value).padStart(2,'0')}`;
    let timestamp;
    try { timestamp = local === originalLocal ? entry.alarm*1000 : epochAt(local,zone); } catch {timestamp = NaN;}
    if (!Number.isFinite(timestamp) || inputAt(timestamp,zone) !== local) {toast(lang() === 'ru' ? 'Это местное время недоступно. Выберите другое.' : 'This local time is unavailable. Choose another.'); return;}
    if (timestamp <= Date.now()) {toast(invalidAlarmMessage()); return;}
    entry.title = $('#editTitle').value.trim();
    entry.repeat = $('#dailySwitch').getAttribute('aria-checked') === 'true' ? 'daily' : 'none';
    if (entry.repeat === 'daily') entry.repeat_time = local.split('T')[1];
    else delete entry.repeat_time;
    entry.alarm = timestamp/1000; entry.target = entry.alarm; entry.lead = 0; entry.direction = 'after';
    entry.started_at = Date.now()/1000; entry.state = 'pending';
    syncReminderModel(entry);
    if (isNew) reminders.entries.push(entry);
    if (alertId === id) alertId = null;
    saveReminders(); renderAlarms(); closeModal();
  };
  $('#cancelAlarm').onclick = closeModal;
  if (!isNew) $('#removeAlarm').onclick = () => deleteAlarm(id);
}

// Native scrolling owns wheel/touch momentum and snapping. Only mouse dragging
// needs a kinetic adapter: browsers do not pan a scrollport with the left button.
function bindScheduleWheel(root, options, changed) {
  const {min,max,wrap=false,parse=Number,format=String,label=value=>String(value).padStart(2,'0')} = options;
  const count = max-min+1, cycles = wrap ? 41 : 1, middle = wrap ? count*20 : 0;
  const normalize = value => wrap ? ((value-min)%count+count)%count+min : clamp(value,min,max);
  const valueAt = index => normalize(min+index);
  root.value = String(options.value);
  root.classList.add('schedule-wheel'); root.tabIndex = 0;
  root.setAttribute('role','spinbutton'); root.setAttribute('aria-label',options.name);
  root.setAttribute('aria-valuemin',min); root.setAttribute('aria-valuemax',max);
  root.innerHTML = '<div class="schedule-track">' + Array.from({length:count*cycles},(_,index) => `<div class="schedule-option" aria-hidden="true">${esc(label(format(valueAt(index))))}</div>`).join('') + '</div>';
  root.scrollTop = (middle+parse(root.value)-min)*40;
  let frame = 0, drag = null, velocity = 0, lastTime = 0;
  const update = () => {
    const value = format(valueAt(Math.round(root.scrollTop/40)));
    const different = root.value !== value;
    root.value = value;
    root.setAttribute('aria-valuenow',parse(value)); root.setAttribute('aria-valuetext',label(value));
    if(different) changed();
  };
  const stop = () => {if(frame) cancelAnimationFrame(frame); frame = 0; velocity = 0;};
  const snap = () => {
    root.style.scrollSnapType = '';
    root.scrollTo({top:Math.round(root.scrollTop/40)*40,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  };
  root.onscroll = update;
  root.onscrollend = () => {
    if(drag || frame) return;
    update();
    // Recenter identical cycles only after native momentum and snapping finish.
    if(wrap) {
      const index = Math.round(root.scrollTop/40), centered = middle+parse(root.value)-min;
      if(Math.abs(index-centered) > count*5) root.scrollTop = centered*40;
    }
  };
  root.addEventListener('wheel', () => {
    stop(); drag = null; root.style.scrollSnapType = '';
  }, {passive:true});
  root.onkeydown = event => {
    const delta = {ArrowUp:-1,ArrowDown:1,PageUp:-5,PageDown:5}[event.key];
    if(delta === undefined && !['Home','End'].includes(event.key)) return;
    event.preventDefault(); stop(); drag = null;
    const index = Math.round(root.scrollTop/40);
    const destination = delta !== undefined ? index+delta : middle+(event.key === 'Home' ? 0 : count-1);
    root.scrollTo({top:clamp(destination,0,count*cycles-1)*40,behavior:'smooth'});
  };
  root.onpointerdown = event => {
    if(event.pointerType !== 'mouse' || event.button !== 0) return;
    stop(); root.focus(); root.setPointerCapture(event.pointerId);
    root.style.scrollSnapType = 'none';
    // Assigning the current position stops an in-flight smooth scroll.
    root.scrollTo({top:root.scrollTop,behavior:'instant'});
    drag = {start:event.clientY,last:event.clientY,time:event.timeStamp,moved:false};
  };
  root.onpointermove = event => {
    if(!drag) return;
    const delta = drag.last-event.clientY, dt = Math.max(1,event.timeStamp-drag.time);
    if(Math.abs(event.clientY-drag.start)>3) drag.moved = true;
    root.scrollTop += delta;
    velocity = dt > 80 ? delta/dt : velocity*.25 + delta/dt*.75;
    drag.last = event.clientY; drag.time = event.timeStamp;
  };
  const coast = now => {
    frame = 0;
    if(!root.isConnected) {stop(); return;}
    const dt = Math.min(32,Math.max(1,now-lastTime)); lastTime = now;
    const result = pickerDecay(velocity,dt), previous = root.scrollTop;
    root.scrollTop += result.distance; velocity = result.velocity;
    if(Math.abs(velocity)<.025 || root.scrollTop === previous) {stop(); snap(); return;}
    frame = requestAnimationFrame(coast);
  };
  root.onpointerup = event => {
    if(!drag) return;
    const ended = drag; drag = null;
    if(root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    if(!ended.moved) {
      const bounds = root.getBoundingClientRect();
      root.style.scrollSnapType = '';
      root.scrollTo({top:Math.round((root.scrollTop+event.clientY-bounds.top-100)/40)*40,behavior:'smooth'});
    } else if(event.timeStamp-ended.time > 80 || Math.abs(velocity)<.08 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {stop(); snap();}
    else {lastTime = performance.now(); frame = requestAnimationFrame(coast);}
  };
  root.onpointercancel = () => {if(drag) {drag = null; stop(); snap();}};
  root.onlostpointercapture = () => {if(drag) {drag = null; stop(); snap();}};
  update();
}

function pickerDecay(velocity, milliseconds) {
  const friction = .006, decay = Math.exp(-friction*milliseconds);
  return {velocity:velocity*decay,distance:velocity*(1-decay)/friction};
}

// Numeric controls have no scrollport. Preserve the entire wheel distance,
// including native momentum events; never synthesize a second wheel inertia.
function valueWheelUnits(event) {
  const delta = event.deltaY;
  if(event.deltaMode === 1) return Math.sign(delta)*Math.max(1,Math.round(Math.abs(delta)/3));
  if(event.deltaMode === 2) return delta*5;

  // Chromium exposes a classic mouse-wheel detent as wheelDeltaY=120 even
  // though deltaY is reported in pixels (usually 100). Precision touchpads
  // produce variable, fractional wheelDeltaY values, so keep their complete
  // stream untouched for native momentum and fine positioning.
  const legacy = Math.abs(Number(event.wheelDeltaY));
  const detents = legacy/120;
  if(Math.abs(delta) >= 80 && legacy >= 120 && Math.abs(detents-Math.round(detents)) < .001) {
    return Math.sign(delta)*Math.round(detents);
  }
  return delta/40;
}

function bindValueScroll(root, {read,write,min=-Number.MAX_SAFE_INTEGER,max=Number.MAX_SAFE_INTEGER,paint=()=>{},finish=()=>{},stepForEvent=()=>1}) {
  let position = read(), committed = position, timer = 0, activeStep = 1, quantizeOrigin = position;
  const quantize = value => quantizeOrigin + Math.round((value - quantizeOrigin) / activeStep) * activeStep;
  const settle = () => {
    timer = 0;
    if(!root.isConnected) {finish(); return;}
    position = committed = clamp(quantize(position),min,max);
    write(committed); paint(position); finish();
  };
  root.onwheel = event => {
    if(event.ctrlKey || !Number.isFinite(event.deltaY) || !event.deltaY || Math.abs(event.deltaX || 0)>Math.abs(event.deltaY)) return;
    event.preventDefault(); event.stopPropagation();
    const nextStep = Math.max(.01, Number(stepForEvent(event)) || 1);
    if(!timer || read() !== committed || nextStep !== activeStep) position = quantizeOrigin = read();
    clearTimeout(timer);
    activeStep = nextStep;
    const units = valueWheelUnits(event);
    position = clamp(position-units*activeStep,min,max);
    committed = quantize(position);
    write(committed); paint(position);
    timer = setTimeout(settle,180);
  };
  const flush = () => {if(timer){clearTimeout(timer); settle();}};
  root.addEventListener('pointerdown',flush);
  root.addEventListener('keydown',flush);
  root.addEventListener('blur',flush);
  return flush;
}

function editorTitleChoices(selected) {
  const choices = config.settings.quick_titles || [];
  return `<button type="button" class="name-option" data-editor-title="-1" aria-pressed="${!selected}">${lang() === 'ru' ? 'Без названия' : 'No title'}</button>` + choices.map((item,index) => `<button type="button" class="name-option" data-editor-title="${index}" aria-pressed="${item.title === selected}">${esc(item.title)}</button>`).join('');
}

function bindEditorTitles() {
  const root = $('#editorTitleChoices'), input = $('#editTitle');
  const highlight = () => root.querySelectorAll('[data-editor-title]').forEach(button => {
    const title = +button.dataset.editorTitle < 0 ? '' : config.settings.quick_titles[+button.dataset.editorTitle]?.title;
    button.setAttribute('aria-pressed',String(input.value === title));
  });
  root.onclick = event => {
    const button = event.target.closest('[data-editor-title]');
    if(!button) return;
    const index = +button.dataset.editorTitle;
    input.value = index < 0 ? '' : config.settings.quick_titles[index]?.title || '';
    highlight();
  };
  input.oninput = highlight;
}
