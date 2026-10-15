// Real Chromium layout checks for the shared Windows/macOS widget UI.
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const macVersion = fs.readFileSync(path.join(__dirname, '..', 'macos', 'Info.plist'), 'utf8')
  .match(/<key>CFBundleShortVersionString<\/key><string>([^<]+)<\/string>/)?.[1];
assert.ok(macVersion, 'macOS version is missing');

const browser = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
if (!fs.existsSync(browser)) {
  if (process.env.LAYOUT_REQUIRE_CHROME === '1') throw new Error(`Chrome is required for layout checks: ${browser}`);
  console.log('Chromium layout checks skipped: Chrome is not installed.');
  process.exit(0);
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'world-clock-layout-'));
const port = 19000 + Math.floor(Math.random() * 20000);
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank',
], {windowsHide:true, stdio:'ignore'});

async function connect() {
  let tabs;
  for (let i = 0; i < 80; i++) {
    try {
      tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (tabs.some(tab => tab.type === 'page')) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const address = tabs?.find(tab => tab.type === 'page')?.webSocketDebuggerUrl;
  if (!address) throw new Error('Chrome debugging endpoint did not start');
  const socket = new WebSocket(address);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once:true});
    socket.addEventListener('error', reject, {once:true});
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, {resolve, reject});
    socket.send(JSON.stringify({id, method, params}));
  });
  return {socket, send};
}


(async () => {
 let connection;
 try {
  connection=await connect();const {send}=connection;
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const out=process.env.GUIDE_SCREENSHOT_DIR;
  if(out)fs.mkdirSync(out,{recursive:true});
  for(const [width,height,language,theme] of [[360,640,'ru','dark'],[360,640,'en','light'],[430,500,'ru','light'],[400,320,'ru','dark'],[800,720,'en','dark']]){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   await send('Page.navigate',{url:pathToFileURL(path.join(__dirname,'ui','index.html')).href+'?preview'});
   await new Promise(r=>setTimeout(r,350));
   await evaluate(`version='v1.1.189';config.settings.language=${JSON.stringify(language)};config.settings.theme=${JSON.stringify(theme)};render();openFeatureGuide();`);
   assert.equal(await evaluate("document.querySelectorAll('.feature-guide details[open]').length"),0,'Fresh entry is collapsed');
   const hierarchy=await evaluate(`(()=>{const a=getComputedStyle(document.querySelector('.feature-group>summary h3')),b=getComputedStyle(document.querySelector('.feature-card>summary h4'));return {sectionSize:parseFloat(a.fontSize),topicSize:parseFloat(b.fontSize),sectionWeight:+a.fontWeight,topicWeight:+b.fontWeight};})()`);
   assert.ok(hierarchy.sectionSize>hierarchy.topicSize&&hierarchy.sectionWeight>hierarchy.topicWeight,'Section and topic hierarchy is distinct');
   const illustration=await evaluate(`(()=>{const pin=document.querySelector('[data-guide-control=reminderScale] .city-alarm-pin'),band=pin.closest('.guide-city-scale').querySelector('.temporal-band'),sw=document.querySelector('[data-guide-control=periodSwitch] button');return {pin:!!pin,band:!!band,sharedSwitch:sw.closest('.meeting-status')!==null};})()`);
   assert.ok(illustration.pin&&illustration.band&&illustration.sharedSwitch);
   const ids=await evaluate('featureGuideItems().map(x=>x[0])');
   for(const id of ids){
    await evaluate(`(()=>{const topic=document.querySelector('[data-guide-topic="${id}"]');topic.closest('.feature-group').open=true;topic.open=true;})()`);
    await new Promise(r=>setTimeout(r,40));
    assert.equal(await evaluate("document.querySelectorAll('.feature-card[open]').length"),1);
    assert.equal(await evaluate("document.querySelectorAll('.feature-group[open]').length"),1);
   const check=await evaluate(`(()=>{
    const failures=[];const controls=[...document.querySelectorAll('.feature-card[open] .guide-control')];
    const body=document.querySelector('.modal-body');
    for(const node of controls){
     const r=node.querySelector('.guide-control-visual').getBoundingClientRect(),p=node.closest('p,li,figure').getBoundingClientRect(),b=body.getBoundingClientRect();
     if(r.width<=0||r.height<=0||r.left<b.left-1||r.right>b.right+1||r.top<p.top-1||r.bottom>p.bottom+1)failures.push({key:node.dataset.guideControl,rect:r.toJSON(),paragraph:p.toJSON()});
     if(!node.closest('figure') && r.height>parseFloat(getComputedStyle(node.closest('p,li')).lineHeight)+.5)failures.push({key:node.dataset.guideControl,lineTooTall:r.height});
     if(!node.getAttribute('aria-label')||!node.querySelector('[inert]')||node.querySelector('[id],[data-action],[data-city-action],[data-delalarm],img'))failures.push({key:node.dataset.guideControl,unsafe:true});
    }
    return {count:controls.length,topics:document.querySelectorAll('.feature-card').length,failures,overflow:body.scrollWidth>body.clientWidth+1,rawTokens:document.querySelector('.feature-guide').textContent.includes('[['),duplicateIds:[...document.querySelectorAll('[id]')].map(n=>n.id).filter((id,i,a)=>a.indexOf(id)!==i)};
   })()`);
   assert.equal(check.topics,18);assert.ok(check.count>0);assert.equal(check.overflow,false,JSON.stringify(check));assert.equal(check.rawTokens,false);assert.deepEqual(check.failures,[]);assert.deepEqual(check.duplicateIds,[]);
   await evaluate(`(()=>{const card=document.querySelector('[data-guide-topic="${id}"]'),body=document.querySelector('.modal-body');body.scrollTop+=card.getBoundingClientRect().top-body.getBoundingClientRect().top-12;})()`);
   const state=await evaluate(`JSON.stringify([document.querySelector('.feature-group[open]').dataset.guideSection,document.querySelector('.feature-card[open]').dataset.guideTopic,document.querySelector('.modal-body').scrollTop])`);
   await evaluate(`document.querySelector('[data-feature="${id}"]').click()`);
   assert.equal(await evaluate("!!document.querySelector('#featureTourBack')"),true,id);
   await evaluate("document.querySelector('#featureTourBack').click()");
   await new Promise(r=>setTimeout(r,60));
   assert.equal(await evaluate(`JSON.stringify([document.querySelector('.feature-group[open]').dataset.guideSection,document.querySelector('.feature-card[open]').dataset.guideTopic,document.querySelector('.modal-body').scrollTop])`),state,'Return restores section, topic and exact scroll: '+id);
   }

   await evaluate(`(()=>{const topic=document.querySelector('[data-guide-topic=meeting]');topic.closest('.feature-group').open=true;topic.open=true;})()`);
   await new Promise(r=>setTimeout(r,40));
   const switchLayout=await evaluate(`(()=>{const n=document.querySelector('[data-guide-control=periodSwitch] button'),icons=[...n.querySelectorAll('span')].map(x=>x.getBoundingClientRect()),thumb=n.querySelector('.period-thumb');return {display:getComputedStyle(n).display,width:n.getBoundingClientRect().width,sameRow:Math.abs(icons[0].top-icons[1].top)<1,sideBySide:icons[1].left>icons[0].left,color:getComputedStyle(thumb).backgroundColor};})()`);
   assert.ok(switchLayout.display==='flex'&&Math.abs(switchLayout.width-42*.85)<.1&&switchLayout.sameRow&&switchLayout.sideBySide,JSON.stringify(switchLayout));
   assert.notEqual(switchLayout.color,'rgba(0, 0, 0, 0)');
   const rhythm=await evaluate(`(()=>{
    const host=document.querySelector('.feature-card[open] .feature-content'),p=document.createElement('p');
    p.style.maxWidth='240px';p.innerHTML=guideText('Текст [[add]] текст [[cityPlus]] текст [[favorite]] текст [[unfavorite]] текст [[periodSwitch]] текст [[alarm]] текст [[interval]] текст [[delete]] текст');host.append(p);
    const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),ys=[];
    while(walker.nextNode()){if(walker.currentNode.parentElement.closest('.guide-control'))continue;const range=document.createRange();range.selectNodeContents(walker.currentNode);for(const r of range.getClientRects())ys.push(r.top);}
    const rows=[...new Set(ys.map(y=>Math.round(y*10)/10))].sort((a,b)=>a-b),line=parseFloat(getComputedStyle(p).lineHeight),gaps=rows.slice(1).map((y,i)=>y-rows[i]);p.remove();return {line,gaps};
   })()`);
   assert.ok(rhythm.gaps.length>0);assert.ok(rhythm.gaps.every(gap=>Math.abs(gap/rhythm.line-Math.round(gap/rhythm.line))<.04),JSON.stringify(rhythm));
   const paint=await evaluate(`(()=>{const live=document.querySelector('[data-action=add]'),copy=document.querySelector('[data-guide-control=add] button'),a=getComputedStyle(live),b=getComputedStyle(copy);return ['fontSize','fontWeight','color','backgroundColor','borderTopStyle','borderTopColor','borderRadius','paddingLeft'].map(k=>[k,a[k],b[k]]);})()`);
   assert.ok(paint.every(([,a,b])=>a===b),JSON.stringify(paint));
   const before=await evaluate('JSON.stringify([config,reminders,meetingMode,offset])');
   await evaluate(`document.querySelectorAll('.guide-control button').forEach(n=>n.click())`);
   assert.equal(await evaluate('JSON.stringify([config,reminders,meetingMode,offset])'),before,'Reference buttons never mutate widget state');
   if(out&&height>=500){
    for(const [name,key] of [['time','timeline'],['actions','cityActions'],['favorites','cities'],['availability','availability'],['alarm-band','reminderTrack'],['meeting','meeting'],['reminders','reminderFuture'],['daily','reminderExact'],['settings','settings']]){
     await evaluate(`(()=>{const button=document.querySelector('[data-feature="${key}"]');const card=button.closest('.feature-card');card.closest('.feature-group').open=true;card.open=true;const body=document.querySelector('.modal-body');body.scrollTop+=card.getBoundingClientRect().top-body.getBoundingClientRect().top-8;})()`);
     await new Promise(r=>setTimeout(r,60));
     const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`${name}-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
    }
   }
   await evaluate(`closeModal();document.querySelector('#meetingToggle').textContent='QA synchronized';openFeatureGuide()`);
   assert.equal(await evaluate(`document.querySelector('[data-guide-control=meeting] button').textContent`),'QA synchronized','Help clones current live captions rather than duplicating them');
   await evaluate(`closeModal();render()`);
   for(const id of await evaluate('featureGuideItems().map(x=>x[0])')){
    await evaluate(`showFeatureInApp(${JSON.stringify(id)})`);
    const tour=await evaluate(`(()=>{const panel=document.querySelector('.feature-tour-card');return {present:!!panel,tokens:panel?.textContent.includes('[['),overflow:panel?.scrollWidth>panel?.clientWidth+1,components:panel?.querySelectorAll('.guide-control').length};})()`);
    assert.ok(tour.present&&tour.components>0&&!tour.tokens&&!tour.overflow,JSON.stringify({id,tour}));
    await evaluate('stopFeatureTour();closeModal()');
   }
   await evaluate('closeModal();openFeatureGuide()');
   assert.equal(await evaluate("document.querySelectorAll('.feature-guide details[open]').length"),0,'New entry resets after return');
   console.log(`${width}x${height} ${language}/${theme}: 18 illustrated topics, alignment, clean IDs, safe references, live caption reuse and tours passed.`);
  }
 } finally {
  try { await connection?.send('Browser.close'); } catch {}
  connection?.socket.close();child.kill();
  await new Promise(r=>setTimeout(r,250));
  const tempRoot=fs.realpathSync(os.tmpdir()),resolvedProfile=fs.realpathSync(profile);
  if(path.dirname(resolvedProfile)!==tempRoot||!path.basename(resolvedProfile).startsWith('world-clock-layout-'))throw Error('Unexpected browser profile');
  fs.rmSync(resolvedProfile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
