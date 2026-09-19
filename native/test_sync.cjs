const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

const sent=[];
const context={
  console,crypto:webcrypto,structuredClone,setTimeout,clearTimeout,queueMicrotask,TextDecoder,AbortController,
  config:{timezones:['Asia/Vladivostok'],settings:{language:'ru',top_clock_mode:'auto',manual_top_timezone:'',quick_titles:[{id:'q',title:'Созвон'}],reminder_intervals:[15]}},
  reminders:{lead:15,entries:[{id:'a'.repeat(32),title:'Тест',alarm:2000000000,state:'pending',zone:'Asia/Vladivostok'}]},
  applyingRemoteSync:false,alertId:null,
  lang:()=>context.config.settings.language,baseZone:()=> 'Asia/Bangkok',systemCities:()=> 'Бангкок',cityName:key=>key.split('/').at(-1),zoneOf:key=>key,
  syncReminderModel:entry=>{entry.timezone_id ||= entry.zone;},send:value=>sent.push(value),render:()=>context.renders++,closeModal:()=>context.closed++,
  renders:0,closed:0,document:{querySelector:()=>null},fetch:async()=>{throw new Error('network disabled in unit test')},
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/ui/sync.js','utf8'),context);

assert.equal(context.syncSettingsLabel(),'Подключить Android');
context.syncLocalChanged();
assert.equal(context.config.sync.queue.length,0,'disabled sync stays entirely local');
vm.runInContext("syncCredential='device-secret';syncBusy=true",context);
context.config.sync.enabled=true;context.config.sync.status='connected';
context.syncLocalChanged();
assert.equal(context.config.sync.queue.length,1,'connected local change enters durable queue');
const snapshot=context.config.sync.queue[0].state;
assert.equal(snapshot.reminders[0].id,'a'.repeat(32));
assert.equal(snapshot.cities[0].timezone,'Asia/Vladivostok');
assert.equal(snapshot.base.timezone,'Asia/Bangkok');
assert.ok(sent.some(value=>value.startsWith('saveConfig\n')));

context.alertId='a'.repeat(32);
context.syncApply({...snapshot,reminders:[]},3);
assert.equal(context.reminders.entries.length,0);
assert.equal(context.config.sync.revision,3);
assert.equal(context.closed,1,'remote Done/Snooze closes a ringing Windows dialog');
assert.equal(context.renders,1);
console.log('Optional sync regression, durable queue, stable IDs, city/base snapshot and remote alarm stop passed.');
