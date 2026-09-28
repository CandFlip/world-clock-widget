const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const records = new Map([['alarm', {legacyBlob:true}]]);
const messages = [];
const nodes = new Map();
const get = key => {
  if (!nodes.has(key)) nodes.set(key, {dataset:{},style:{},innerHTML:'',textContent:'',classList:{toggle(){},add(){},remove(){}},querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}});
  return nodes.get(key);
};
const indexedDB = {open() {
  const request = {};
  setImmediate(() => {
    request.result = {close(){}, transaction() {
      const tx = {};
      const execute = work => {
        const req = {};
        setImmediate(() => { req.result = work(); req.onsuccess?.(); tx.oncomplete?.(); });
        return req;
      };
      tx.objectStore = () => ({get:key=>execute(()=>records.get(key)),getAll:()=>execute(()=>[...records.values()]),put:(value,key)=>execute(()=>records.set(key,value)),delete:key=>execute(()=>records.delete(key))});
      return tx;
    }};
    request.onsuccess();
  });
  return request;
}};
const context = vm.createContext({indexedDB, Promise,console,setTimeout,clearTimeout,Date,Intl,structuredClone,crypto:require('node:crypto').webcrypto,
  URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
  Audio:class {async play(){this.paused=false;} pause(){this.paused=true;}},
  window:{chrome:{webview:{postMessage:value=>messages.push(value),addEventListener(){}}}},
  document:{querySelector:get,querySelectorAll:()=>[],addEventListener(){},body:{classList:{toggle(){}}}}
});
vm.runInContext(fs.readFileSync(__dirname+'/ui/app.js','utf8'),context);
const run = script => vm.runInContext(script,context);
(async () => {
  assert.equal(run('defaultSoundId()'),'system');
  assert.equal(run("resolvedSoundId({sound_id:'builtin'})"),'system');
  assert.ok(!run("soundChoicesHtml('builtin')").includes('Built-in'));
  assert.ok(!run("soundChoicesHtml('builtin')").includes('Встроенный'));
  run("config.settings.alarm_sound_name='Existing.mp3'; saveConfig=()=>{}; saveReminders=()=>{}; openAlarmSound=async()=>{};");
  await run('loadSoundLibrary()');
  assert.equal(records.has('alarm'),false);
  assert.equal(run('soundLibrary.length'),1);
  assert.equal(run('soundLibrary[0].name'),'Existing.mp3');
  assert.equal(run('defaultSoundId()'),'imported-legacy');
  await run("soundStorage('put','second',{id:'second',name:'Second.wav',favorite:true,blob:{}})");
  await run('loadSoundLibrary()');
  assert.equal(run('soundLibrary.length'),2);
  await run("playAlarmSound({sound_id:'system'})");
  assert.equal(messages.at(-1),'systemBeep');
  await run("playAlarmSound({sound_id:'second'})");
  assert.equal(run('alarmAudio.paused'),false);
  run("reminders.entries=[{id:'one',sound_id:'second'},{id:'two',sound_id:'imported-legacy'}]; config.settings.alarm_sound_id='second'; config.settings.manual_alarm_sound_id='second';");
  await run("removeAlarmSound('second')");
  assert.equal(records.has('second'),false);
  assert.equal(run('soundLibrary.length'),1);
  assert.equal(run('defaultSoundId()'),'system');
  assert.equal(run('reminders.entries[0].sound_id'),undefined);
  assert.equal(run('reminders.entries[1].sound_id'),'imported-legacy');
  await run('loadSoundLibrary()');
  assert.equal(run('soundLibrary.length'),1);
  assert.equal(run('soundLibrary[0].name'),'Existing.mp3');
  console.log('Sound library: legacy migration, multiple persistent records, system/custom routing and referenced deletion passed.');
})().catch(error => { console.error(error);process.exitCode=1; });
