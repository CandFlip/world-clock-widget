// Direct Android companion synchronization. No Telegram account or bot is involved.
let syncCredential = '';
let syncSocket = null;
let syncRetry = 0;
let syncBusy = false;

const syncBackend = () => String(window.WORLD_CLOCK_SYNC_BACKEND || '').replace(/\/$/, '');
const syncMeta = () => (config.sync ||= {enabled:false,status:'off',revision:0,queue:[],mobile_language:lang()});
const syncText = (ru,en) => lang() === 'ru' ? ru : en;
const syncPersist = () => send(`saveConfig\n${JSON.stringify(config, null, 2)}`);
const syncHeaders = (json=true) => ({...(json ? {'Content-Type':'application/json'} : {}),...(syncCredential ? {Authorization:`Bearer ${syncCredential}`} : {})});

function syncSettingsLabel() {
  const state=config.sync;
  if(state?.status==='connected')return state.device_name || syncText('Подключён','Connected');
  if(state?.status==='pairing')return syncText('Ожидает телефон','Waiting for phone');
  if(state?.enabled&&state?.status==='offline')return syncText('Нет связи','Offline');
  return syncText('Подключить Android','Connect Android');
}

function syncSnapshot() {
  return {
    schema_version:1,language:lang(),mobile_language:syncMeta().mobile_language||lang(),
    base:{type:config.settings.top_clock_mode,timezone:baseZone(),city_key:config.settings.manual_top_timezone||null,name:config.settings.top_clock_mode==='auto'?systemCities():cityName(config.settings.manual_top_timezone)},
    cities:config.timezones.map(key=>({id:key,timezone:zoneOf(key),name:cityName(key)})),
    quick_titles:(config.settings.quick_titles||[]).map(item=>({id:item.id,title:item.title,use_count:item.use_count||0})),
    reminder_intervals:[...config.settings.reminder_intervals],
    reminders:reminders.entries.map(entry=>{syncReminderModel(entry);return structuredClone(entry)}),
    client_updated_at:new Date().toISOString(),
  };
}

function syncLocalChanged() {
  const state=syncMeta();
  if(!state.enabled||!syncCredential)return;
  state.queue=[{id:crypto.randomUUID(),state:syncSnapshot()}];
  syncPersist();syncFlush();
}

function syncApply(remote,revision) {
  if(!remote||!Array.isArray(remote.reminders))return;
  applyingRemoteSync=true;
  try {
    reminders.entries=remote.reminders;
    if(Array.isArray(remote.cities))config.timezones=remote.cities.map(city=>city.id||city.timezone).filter(Boolean);
    if(remote.base?.type==='manual'&&remote.base.city_key){config.settings.top_clock_mode='manual';config.settings.manual_top_timezone=remote.base.city_key;config.settings.base_timezone=remote.base.city_key}
    else if(remote.base?.type==='auto')config.settings.top_clock_mode='auto';
    if(Array.isArray(remote.quick_titles))config.settings.quick_titles=remote.quick_titles;
    if(Array.isArray(remote.reminder_intervals)&&remote.reminder_intervals.length)config.settings.reminder_intervals=remote.reminder_intervals.map(Number);
    const state=syncMeta();state.revision=revision;state.queue=[];
    const oldAlert=alertId;alertId=reminders.entries.some(entry=>entry.id===oldAlert&&entry.state==='ringing')?oldAlert:null;
    if(oldAlert&&!alertId)closeModal();
    send(`saveConfig\n${JSON.stringify(config,null,2)}`);reminders.entries.forEach(syncReminderModel);send(`saveReminders\n${JSON.stringify(reminders,null,2)}`);render();
  } finally {applyingRemoteSync=false}
}

async function syncRequest(path,options={}) {
  const response=await fetch(`${syncBackend()}${path}`,{...options,headers:{...syncHeaders(options.body!==undefined),...(options.headers||{})}}),data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error||`HTTP ${response.status}`);error.status=response.status;error.data=data;throw error}return data;
}

async function syncFlush() {
  const state=syncMeta();if(syncBusy||!state.enabled||!syncCredential||!state.queue?.length)return;syncBusy=true;const operation=state.queue[0];
  try{const result=await syncRequest('/api/device/state',{method:'PUT',body:JSON.stringify({idempotency_key:operation.id,base_revision:state.revision||0,state:operation.state})});state.revision=result.revision;state.queue=state.queue.filter(item=>item.id!==operation.id);if(state.status!=='pairing')state.status='connected';syncPersist()}
  catch(error){if(error.status===409&&error.data?.state)syncApply(error.data.state,error.data.revision);else{state.status='offline';state.last_error=String(error.message||error);syncPersist()}}
  finally{syncBusy=false;if(state.queue?.length&&state.status!=='offline')queueMicrotask(syncFlush)}
}

function syncReadEvents() {
  if(!syncCredential||!syncMeta().enabled||!syncBackend())return;
  syncSocket?.close();
  try {
    const socket=new WebSocket(`${syncBackend().replace(/^http/,'ws')}/api/device/events/ws`,['wcc-sync',syncCredential]);syncSocket=socket;
    socket.onopen=()=>{syncRetry=0;if(syncMeta().status!=='pairing')syncMeta().status='connected';syncPersist();syncFlush()};
    socket.onmessage=message=>{try{const event=JSON.parse(message.data);if(event.type==='paired'){Object.assign(syncMeta(),{status:'connected',device_name:event.device_name||syncText('Android','Android'),revision:event.revision||syncMeta().revision});syncPersist();syncLocalChanged();if($('#modal .modal-root'))openPhoneSettings()}if(event.type==='state')syncApply(event.state,event.revision);if(event.type==='device_disconnected'){syncMeta().status='pairing';syncPersist()}}catch{}};
    socket.onerror=()=>socket.close();socket.onclose=()=>{if(syncSocket===socket)syncSocket=null;if(syncMeta().enabled&&syncCredential){syncMeta().status='offline';syncPersist();setTimeout(syncReadEvents,Math.min(30000,2000*2**Math.min(syncRetry++,4)))}};
  } catch(error){syncMeta().status='offline';syncMeta().last_error=String(error.message||error);syncPersist()}
}

async function syncInitialize(credential) {
  syncCredential=credential||'';const state=syncMeta();if(!state.enabled||!syncCredential)return;
  try{const status=await syncRequest('/api/device/status');state.status=status.paired?'connected':'pairing';state.device_name=status.peer_count?state.device_name||syncText('Android','Android'):'';state.revision=status.revision||0;if(status.state&&!state.queue?.length)syncApply(status.state,status.revision);else syncFlush()}
  catch(error){state.status='offline';state.last_error=String(error.message||error);syncPersist()}syncReadEvents();
}

async function syncBeginPairing() {
  if(!syncBackend()){toast(syncText('Сервис синхронизации не настроен','Sync service is not configured'));return}
  const button=$('#connectPhone');if(button)button.disabled=true;
  try{const result=await syncRequest('/api/device/pair/start',{method:'POST',body:JSON.stringify({language:lang(),device_name:'Windows'})});syncCredential=result.device_credential;send(`saveSyncCredential\n${syncCredential}`);Object.assign(syncMeta(),{enabled:true,status:'pairing',revision:0,queue:[],qr_url:result.qr_url,expires_at:result.expires_at,device_name:''});syncPersist();syncLocalChanged();openPhoneSettings();syncReadEvents()}
  catch{toast(syncText('Не удалось связаться с сервисом','Could not reach the sync service'));if(button)button.disabled=false}
}

function syncDisconnectLocal(){syncSocket?.close();syncSocket=null;syncCredential='';config.sync={enabled:false,status:'off',revision:0,queue:[],mobile_language:lang()};send('deleteSyncCredential');syncPersist()}
async function syncDisconnect(){try{if(syncCredential)await syncRequest('/api/device/disconnect',{method:'POST',body:'{}'})}catch{}syncDisconnectLocal();openPhoneSettings()}
async function syncCheck(){try{const status=await syncRequest('/api/device/status');toast(status.paired?syncText('Телефон на связи','Phone is connected'):syncText('Телефон ещё не подключён','Phone is not connected yet'))}catch{toast(syncText('Нет связи с сервисом','Service is unavailable'))}}

function openPhoneSettings() {
  const state=syncMeta(),connected=state.status==='connected';
  if(!state.enabled||!syncCredential){modal(syncText('Телефон','Phone'),`<div class="phone-card"><p class="settings-help">${syncText('Будильники и таймеры будут звенеть на Android. Telegram не используется.','Alarms and timers will ring on Android. Telegram is not used.')}</p><button class="primary" id="connectPhone">${syncText('Подключить Android','Connect Android')}</button><p class="sync-note">${syncText('После установки приложения достаточно один раз отсканировать QR.','After installing the app, scan the QR once.')}</p></div>`);$('#connectPhone').onclick=syncBeginPairing;return}
  if(!connected){const expired=state.expires_at&&Date.now()/1000>state.expires_at;modal(syncText('Подключение Android','Connect Android'),`<div class="phone-card"><div class="phone-status"><span class="phone-status-dot"></span>${syncText('Ожидает телефон','Waiting for phone')}</div>${state.qr_url&&!expired?`<img class="pair-qr" src="${esc(state.qr_url)}" alt="QR Android">`:''}<p class="sync-note">${syncText('Откройте World Clock Alarm на телефоне и нажмите «Сканировать QR».','Open World Clock Alarm on your phone and tap Scan QR.')}</p>${expired?`<button class="primary" id="newPair">${syncText('Создать новый QR','Create new QR')}</button>`:''}<button class="quiet-delete" id="cancelPair">${t('cancel')}</button>${state.status==='offline'?`<div class="sync-error">${syncText('Нет связи с сервисом. Локальные напоминания работают.','Sync service is offline. Local reminders still work.')}</div>`:''}</div>`);$('#newPair')?.addEventListener('click',async()=>{await syncDisconnect();syncBeginPairing()});$('#cancelPair').onclick=syncDisconnect;return}
  modal(syncText('Телефон','Phone'),`<div class="phone-card"><div class="phone-status connected"><span class="phone-status-dot"></span><div>${syncText('Android подключён','Android connected')}<br><span class="row-value">${esc(state.device_name||'Android')}</span></div></div><div class="phone-actions"><button class="secondary" id="checkPhone">${syncText('Проверить связь','Check connection')}</button><button class="quiet-delete" id="disconnectPhone">${syncText('Отключить телефон','Disconnect phone')}</button></div><p class="sync-note">${syncText('В уведомлении будильника доступны «Готово», «+5 минут» и «+15 минут».','Alarm notifications include Done, +5 minutes and +15 minutes.')}</p></div>`);$('#checkPhone').onclick=syncCheck;$('#disconnectPhone').onclick=syncDisconnect;
}

window.syncSettingsLabel=syncSettingsLabel;
window.syncLocalChanged=syncLocalChanged;
window.syncInitialize=syncInitialize;
window.openPhoneSettings=openPhoneSettings;
