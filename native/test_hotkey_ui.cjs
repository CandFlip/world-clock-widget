const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const listeners = {};
const hostMessages = [];
const elements = new Map();
for (const id of ['modal', 'back', 'hotkeyCapture', 'hotkeyCurrent', 'hotkeyPreview', 'hotkeyApply', 'hotkeyCustom', 'hotkeyModeSwitch', 'hotkeyModeFeedback']) {
  elements.set(`#${id}`, {
    textContent: '', disabled: false, focus() {}, setAttribute(name, value) {this[name] = value;},
    classList: {toggle() {}},
  });
}
const host = {
  postMessage: message => hostMessages.push(message),
  addEventListener: (name, listener) => {listeners[`host:${name}`] = listener;},
};
const context = vm.createContext({
  window: {chrome: {webview: host}},
  document: {
    querySelector: selector => elements.get(selector) || {},
    querySelectorAll: () => [],
    addEventListener: (name, listener) => {(listeners[name] ||= []).push(listener);},
  },
  Intl, Date, structuredClone, crypto: require('node:crypto').webcrypto,
});
vm.runInContext(fs.readFileSync(__dirname + '/ui/suncalc.js', 'utf8'), context);
vm.runInContext(fs.readFileSync(__dirname + '/ui/reminder_ui.js', 'utf8'), context);
vm.runInContext(fs.readFileSync(__dirname + '/ui/app.js', 'utf8'), context);
const run = script => vm.runInContext(script, context);
const field = id => elements.get(`#${id}`);
const key = (code, keyName, modifiers = {}) => ({
  code, key: keyName, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
  repeat: false, preventDefault() {}, stopImmediatePropagation() {this.stopped = true;}, ...modifiers,
});
const fireKey = event => {for (const listener of listeners.keydown) {listener(event); if (event.stopped) break;}};

run("hotkeySelection='custom'; startHotkeyCapture()");
assert.match(field('hotkeyCapture').textContent, /Запись идёт/);
assert.equal(field('hotkeyApply').disabled, true);
fireKey(key('ControlLeft', 'Control', {ctrlKey: true}));
assert.equal(field('hotkeyPreview').textContent, 'Ctrl+…');
fireKey(key('ShiftLeft', 'Shift', {ctrlKey: true, shiftKey: true}));
assert.equal(field('hotkeyPreview').textContent, 'Ctrl+Shift+…');
fireKey(key('KeyK', 'л', {ctrlKey: true, shiftKey: true}));
assert.equal(field('hotkeyPreview').textContent, 'Ctrl+Shift+K');
assert.equal(field('hotkeyApply').disabled, false);
assert.equal(hostMessages.some(message => message.startsWith('setHotkey\n')), false);
run('requestHotkey(candidateHotkey)');
assert.equal(hostMessages.at(-1), 'setHotkey\n6,75');
assert.equal(field('hotkeyApply').disabled, true);
run('saveConfig=()=>{}; render=()=>{}');
listeners['host:message']({data: {type:'hotkeyResult',success:true,modifiers:6,key:75}});
assert.equal(field('hotkeyCurrent').textContent, 'Ctrl+Shift+K');
assert.match(field('hotkeyModeFeedback').textContent, /Сохранено/);

run('startHotkeyCapture()');
fireKey(key('Escape', 'Escape'));
assert.match(field('hotkeyModeFeedback').textContent, /недоступны/);
assert.equal(field('hotkeyApply').disabled, true);
listeners['host:message']({data:{type:'hotkeyCaptured',modifiers:0,key:1001}});
assert.equal(field('hotkeyPreview').textContent, 'Mouse 4');
assert.equal(field('hotkeyApply').disabled, false);
run('startHotkeyCapture()');
fireKey(key('F12', 'F12'));
assert.match(field('hotkeyModeFeedback').textContent, /недоступны/);
assert.equal(field('hotkeyApply').disabled, true);

run('capturingHotkey=false; candidateHotkey=null; pendingHotkey=null; platform="macos"; activeHotkey={modifiers:1,key:32}');
assert.equal(run('hotkeyLabel()'), '⌥+Space');
assert.equal(run("t('system')"), 'Время Mac');
assert.equal(run("t('autostart')"), 'Запускать при входе в macOS');
run('startHotkeyCapture()');
fireKey(key('MetaLeft', 'Meta', {metaKey: true}));
assert.equal(field('hotkeyPreview').textContent, '⌘+…');
fireKey(key('KeyK', 'л', {metaKey: true, shiftKey: true}));
assert.equal(field('hotkeyPreview').textContent, '⇧+⌘+K');
run('requestHotkey(candidateHotkey)');
assert.equal(hostMessages.at(-1), 'setHotkey\n12,75');
run('pendingHotkey=null; pendingHotkeyMode=null; closeNamePopover=()=>{}; loadSoundLibrary=()=>Promise.resolve()');
listeners['host:message']({data: {type:'init', platform:'windows', version:'v1.1.115',
  configText: JSON.stringify({settings:{hotkey:{modifiers:6,key:75}}}), remindersText:'{}',
  hotkeyModifiers:6, hotkeyKey:75}});
assert.equal(run('hotkeyLabel()'), 'Ctrl+Shift+K');
assert.equal(run('config.settings.manual_hotkey.key'), 75);
run('openHotkey()');
assert.equal(field('hotkeyCurrent').textContent, 'Ctrl+Shift+K');
assert.equal(field('hotkeyModeSwitch')['aria-checked'], 'false');
assert.match(field('modal').innerHTML, /Сочетание по умолчанию/);
assert.ok(field('modal').innerHTML.indexOf('hotkeyModeSwitch') < field('modal').innerHTML.indexOf('hotkeyCurrent'));
field('hotkeyModeSwitch').onclick();
assert.equal(hostMessages.at(-1), 'setHotkey\n1,32');
listeners['host:message']({data:{type:'hotkeyResult',success:true,modifiers:1,key:32}});
assert.equal(field('hotkeyCurrent').textContent, 'Alt+Space');
assert.equal(field('hotkeyModeSwitch')['aria-checked'], 'true');
assert.equal(run('config.settings.manual_hotkey.key'), 75);
field('hotkeyModeSwitch').onclick();
assert.equal(hostMessages.at(-1), 'setHotkey\n6,75');
listeners['host:message']({data:{type:'hotkeyResult',success:true,modifiers:6,key:75}});
assert.equal(field('hotkeyCurrent').textContent, 'Ctrl+Shift+K');
console.log('Hotkey recording feedback, preview, explicit apply and rejection checks passed.');
