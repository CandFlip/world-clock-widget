const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map(),messages=[];
const element=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',style:{setProperty(){}},classList:{toggle(){}},setAttribute(k,v){this[k]=v;}});return elements.get(selector);};
const context=vm.createContext({window:{chrome:{webview:{postMessage:m=>messages.push(m),addEventListener(){}}}},document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},Intl,Date,structuredClone,crypto:require('node:crypto').webcrypto});
for(const file of ['suncalc.js','reminder_ui.js','app.js'])vm.runInContext(fs.readFileSync(__dirname+'/ui/'+file,'utf8'),context);
const run=s=>vm.runInContext(s,context);
for(const scale of [100,105,115,125,135,175,200]){
 run(`config=structuredClone(defaults);delete config.settings.interface_scale_default;config.settings.interface_scale=${scale};normalize();`);
 assert.equal(run('currentInterfaceScale()'),scale);assert.equal(run('config.settings.interface_scale_default'),scale===100);
 run('config.settings.interface_scale_default=true;normalize();');assert.equal(run('currentInterfaceScale()'),100);assert.equal(run('interfaceScale()'),scale);
 run('config.settings.interface_scale_default=false;normalize();');assert.equal(run('currentInterfaceScale()'),scale);
}
run('config.settings.interface_scale=135;config.settings.interface_scale_default=false;openInterfaceScale();');
element('#interfaceScaleDefaultSwitch').onclick();assert.equal(run('currentInterfaceScale()'),100);assert.equal(element('#interfaceScaleSlider').disabled,true);assert.equal(element('#interfaceScaleDefaultSwitch')['aria-checked'],'true');
element('#interfaceScaleSlider').oninput({target:{value:150}});assert.equal(run('interfaceScale()'),135);
element('#interfaceScaleDefaultSwitch').onclick();assert.equal(run('currentInterfaceScale()'),135);assert.equal(element('#interfaceScaleSlider').disabled,false);
for(let scale=100;scale<=200;scale+=5){element('#interfaceScaleSlider').oninput({target:{value:scale}});assert.equal(run('currentInterfaceScale()'),scale);assert.equal(messages.at(-1),`setInterfaceScale\n${scale}`);}
for(const value of [99,101,204,Infinity,'bad'])assert.equal(run(`interfaceScale(${JSON.stringify(value)})`),100);
console.log('Scale migration, default/custom switch, disabled slider, remembered size and all 21 steps passed.');
