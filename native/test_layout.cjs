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
    connection = await connect();
    const {send} = connection;
    if (process.env.LAYOUT_REDUCED_MOTION === '1') await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    const url = pathToFileURL(path.join(__dirname, 'ui', 'index.html')).href + '?preview&offset=1';
    for (const [width, height] of [[360, 640], [390, 720], [430, 720], [430, 500], [900, 550], [1200,800]]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor:1, mobile:false});
      await send('Page.navigate', {url});
      await new Promise(resolve => setTimeout(resolve, 500));
      await send('Runtime.evaluate', {expression:`
        version = ${JSON.stringify(`v${macVersion} layout preview`)};
        config.settings.language = 'ru';
        config.timezones = ['Europe/Moscow','Asia/Vladivostok','Asia/Yekaterinburg','Asia/Almaty','America/New_York'];
        meetingMode = false;
        meetingSelected = new Set(config.timezones);
        render();
      `});
      await new Promise(resolve => setTimeout(resolve, 350));
      const infoCheck = await send('Runtime.evaluate', {expression:`(() => {
        const failures=[]; let label='tooltip';
        const fits = node => { const r=node.getBoundingClientRect(); const ok=r.left>=8 && r.top>=8 && r.right<=innerWidth-8 && r.bottom<=innerHeight-8; if(!ok) failures.push({label,rect:r.toJSON(),viewport:[innerWidth,innerHeight]}); return ok; };
        const button=document.querySelector('#updateButton');
        let pass=true;
        for (const text of ['Скачать обновление v1.1.168','Download update v1.1.168','ДлинноеСообщение'.repeat(100)]) {
          button.dataset.tooltip=text;
          button.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));
          const tip=document.querySelector('#contextTooltip');
          pass &&= !!tip && tip.textContent===text && fits(tip);
          button.dispatchEvent(new PointerEvent('pointerout',{bubbles:true}));
          pass &&= !document.querySelector('#contextTooltip');
        }
        const probe=document.createElement('button'); probe.className='context-token'; probe.dataset.tooltip='Edge tooltip';
        probe.style.cssText='position:fixed;width:16px;height:16px'; document.body.appendChild(probe);
        for (const [x,y] of [[0,0],[innerWidth-16,0],[0,innerHeight-16],[innerWidth-16,innerHeight-16]]) {
          probe.style.left=x+'px'; probe.style.top=y+'px'; probe.focus(); showContextTooltip(probe);
          const fractionalTip=document.querySelector('#contextTooltip');
          fractionalTip.style.width='85.328125px'; fractionalTip.style.height='27.328125px';
          placeInfoTooltip(fractionalTip,probe);
          pass &&= fits(fractionalTip);
          bindReminderTooltip(probe,[reminders.entries[0]]); probe.onfocus();
          pass &&= fits(document.querySelector('#reminderTooltip')); hideReminderTooltip();
        }
        hideContextTooltip(); probe.remove();
        const baseIcon = document.querySelector('#baseClock .context-token');
        baseIcon.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));
        pass &&= document.querySelector('#contextTooltip')?.textContent === baseIcon.getAttribute('aria-label');
        baseIcon.dispatchEvent(new PointerEvent('pointerout',{bubbles:true}));
        pass &&= !document.querySelector('#contextTooltip');
        const baseCard = document.querySelector('#baseClock');
        baseCard.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        pass &&= baseCard.getAttribute('aria-expanded') === 'true';
        baseCard.click();
        pass &&= baseCard.getAttribute('aria-expanded') === 'false';
        const originalReminders=reminders;
        const originalNow=Date.now;
        const originalMode=config.settings.top_clock_mode;
        const originalTimezone=config.settings.manual_top_timezone;
        try {
          let now=Math.floor(originalNow()/1000)*1000;
          Date.now=()=>now;
          const entry=(id,delay,source_type)=>({id,source_type,base_kind:'auto',zone:baseZone(),
            alarm:Math.floor(now/1000)+delay,target:Math.floor(now/1000)+delay,state:'pending'});
          reminders={...originalReminders,entries:[entry('later',180,'base'),entry('nearest',120,'base'),entry('city-only',30,'city')]};
          render();
          const basePin=document.querySelector('#baseClock .city-alarm-pin');
          pass &&= !document.querySelector('#baseCountdown') && !document.querySelector('#reminderTooltip');
          basePin.dispatchEvent(new MouseEvent('mouseenter'));
          const popup=document.querySelector('#reminderTooltip');
          pass &&= !!popup && popup.textContent.includes('Осталось 3:00') &&
            popup.textContent.includes('Осталось 2:00') && !popup.textContent.includes('Осталось 0:30');
          pass &&= popup.getBoundingClientRect().width<=280;
          now+=1000;
          renderAlarms();
          pass &&= document.querySelector('#reminderTooltip')===popup &&
            popup.textContent.includes('Осталось 1:59') && popup.textContent.includes('Осталось 2:59');
          basePin.dispatchEvent(new MouseEvent('mouseleave'));
          pass &&= !document.querySelector('#reminderTooltip');
          config.settings.top_clock_mode='manual';
          config.settings.manual_top_timezone='Asia/Tokyo';
          render();
          pass &&= document.querySelector('#baseClockTitle').textContent === 'Токио' &&
            document.querySelector('#baseClock .clock-city').textContent === 'Выбрано вручную';
        } finally {
          Date.now=originalNow;
          reminders=originalReminders;
          config.settings.top_clock_mode=originalMode;
          config.settings.manual_top_timezone=originalTimezone;
          render();
        }
        const previousLanguage=config.settings.language;
        for (const language of ['ru','en']) {
          config.settings.language=language;
          for (const item of featureGuideItems()) {
            label=language+':'+item[0];
            showFeatureInApp(item[0]);
            const card=document.querySelector('.feature-tour-card');
            if(!card) failures.push({label,missing:true});
            pass = (!!card && fits(card)) && pass;
            stopFeatureTour(); closeModal();
          }
        }
        config.settings.language=previousLanguage;
        modal('Информация', '<p>'+ 'ДлинноеСообщение'.repeat(200) +'</p>');
        const body=document.querySelector('.modal-body'), modalBox=document.querySelector('.modal-root').getBoundingClientRect();
        pass &&= modalBox.left>=0 && modalBox.top>=0 && modalBox.right<=innerWidth && modalBox.bottom<=innerHeight;
        pass &&= body.getBoundingClientRect().bottom<=innerHeight && body.scrollWidth<=body.clientWidth;
        closeModal();
        toast('ДлинноеСообщение'.repeat(200));
        pass &&= fits(document.querySelector('#toast'));
        document.querySelector('#toast').classList.remove('show');
        return {pass,failures};
      })()`,returnByValue:true});
      if (infoCheck.exceptionDetails) throw Error(JSON.stringify(infoCheck.exceptionDetails));
      assert.equal(infoCheck.result.value.pass,true, 'information bubbles must fit the viewport: '+JSON.stringify(infoCheck.result.value.failures));
      const reminderCheck = await send('Runtime.evaluate', {expression:`(() => {
        const previous = structuredClone(reminders), oldOffset=offset;
        offset=0; expandedCityKey=null; expandedBase=false; render();
        const card=document.querySelector('.city-card'), key=card.dataset.zone;
        const height=card.getBoundingClientRect().height;
        const now=Date.now()/1000;
        reminders.entries=[1,6,1440,2880].map((minutes,i)=>({id:'layout-alarm-'+i, city_key:key,city:cityName(key),zone:zoneOf(key),source_type:'city',alarm:now+minutes*60,target:now+minutes*60,started_at:now,state:'pending',title:'Test '+i}));
        renderAlarms();
        const pin=card.querySelector('.city-alarm-pin'), future=card.querySelector('.city-alarm-right');
        renderAlarms();
        const stablePin=pin===card.querySelector('.city-alarm-pin');
        const rect=element=>element.getBoundingClientRect(), sun=card.querySelector('.city-context');
        const p=rect(pin), s=rect(sun), f=rect(future);
        const originalHeight=rect(card.querySelector('.city-summary')).height;
        const dial=rect(pin.querySelector('.city-reminder-glyph')), band=rect(card.querySelector('.temporal-band'));
        const marker=rect(card.querySelector('.temporal-marker'));
        const sunMarkerUnchanged=marker.width===2 && marker.height===7 && band.height===7;
        const bandCentered=Math.abs(p.top+p.height/2-band.top-band.height/2)<.1 && Math.abs(f.top+f.height/2-band.top-band.height/2)<.1;
        const exactPositions=[...card.querySelectorAll('.city-alarm-pin')].every((node,index)=>{
          const r=rect(node), track=rect(card.querySelector('.city-alarm-track'));
          const groups=cityAlarmLayout(reminders.entries,zoneOf(card.dataset.zone),new Date(referenceTimestamp()),track.width).groups;
          const expected=track.left+groups[index].x;
          return Math.abs(r.left+r.width/2-expected)<.1;
        });
        const filled=getComputedStyle(pin.querySelector('circle')).fill==='rgb(255, 255, 255)' && getComputedStyle(pin.querySelector('.alarm-hands')).stroke==='rgb(11, 14, 20)';
        const svg=pin.querySelector('svg'), bells=pin.querySelector('.alarm-bells'), hands=pin.querySelector('.alarm-hands');
        const partsFit=[...svg.children].every(node=>{const b=node.getBBox();return b.x>=0 && b.y>=0 && b.x+b.width<=14 && b.y+b.height<=14;});
        const bellsVisible=getComputedStyle(bells).fill==='rgb(255, 255, 255)' && bells.getBBox().width===13 && bells.getBBox().height===3.5;
        const silhouette=svg.getBBox();
        const sameVisibleSize=Math.abs((silhouette.width+1)*dial.width/14-f.width)<.1 && Math.abs((silhouette.height+1)*dial.height/14-f.height)<.1;
        const first=hands.getPointAtLength(0), elbow=hands.getPointAtLength(4), last=hands.getPointAtLength(8);
        const rightAngle=Math.abs((elbow.x-first.x)*(last.x-elbow.x)+(elbow.y-first.y)*(last.y-elbow.y))<.001;
        const handGap=5.5-4-0.5;
        const longHands=hands.getTotalLength()===8 && handGap===1;
        const lightBefore=document.body.classList.contains('light'); document.body.classList.add('light');
        const lightFilled=getComputedStyle(pin.querySelector('circle')).fill==='rgb(255, 255, 255)';
        document.body.classList.toggle('light',lightBefore);
        const noLinks=!card.querySelector('.city-alarm-tick,.city-alarm-link');
        const unclipped=getComputedStyle(card).overflow==='visible' && p.bottom<rect(card).bottom+4;
        const untilVisible=getComputedStyle(card.querySelector('.until')).visibility==='visible' && !!card.querySelector('.until').textContent;
        const badgeStyle=getComputedStyle(future);
        const badgeFramed=badgeStyle.borderTopWidth==='1px' && parseFloat(badgeStyle.borderRadius)>=7 && badgeStyle.backgroundColor!=='rgba(0, 0, 0, 0)';
        pin.dispatchEvent(new MouseEvent('mouseenter'));
        const popup=document.querySelector('#reminderTooltip');
        const tooltip=popup?.textContent, tooltipFits=popup && rect(popup).left>=0 && rect(popup).right<=innerWidth;
        pin.dispatchEvent(new MouseEvent('mouseleave'));
        const groupCount=pin.querySelector('small')?.textContent;
        pin.click(); const groupOpensList=document.querySelectorAll('.reminder-list-row').length===4; closeModal();
        future.click();
        const rows=document.querySelectorAll('.reminder-list-row').length;
        document.querySelector('[data-list-delete]').click();
        const remaining=document.querySelectorAll('.reminder-list-row').length;
        offset=24; updateDynamic();
        const shiftedLeft=card.querySelector('.city-alarm-left')?.textContent;
        const shiftedRight=!!card.querySelector('.city-alarm-right');
        const shiftedVisible=card.querySelectorAll('.city-alarm-pin').length;
        card.querySelector('.city-alarm-left').dispatchEvent(new MouseEvent('mouseenter'));
        const leftTooltip=document.querySelector('#reminderTooltip')?.textContent;
        card.querySelector('.city-alarm-left').dispatchEvent(new MouseEvent('mouseleave'));
        offset=0; updateDynamic();
        const result={sameVisibleSize,groupCount,groupOpensList,longHands,partsFit,bellsVisible,rightAngle,sunMarkerUnchanged,bandCentered,exactPositions,filled,lightFilled,noLinks,unclipped,badgeFramed,shiftedLeft,shiftedRight,shiftedVisible,leftTooltip,untilVisible,dialHeight:dial.height,dialWidth:dial.width,originalHeight,stablePin,heightStable:height===card.getBoundingClientRect().height, pins:card.querySelectorAll('.city-alarm-pin').length,future:future.textContent,tooltip,tooltipFits,rows,remaining,deleted:!reminders.entries.some(entry=>entry.id==='layout-alarm-0')};
        closeModal(); reminders=previous; offset=oldOffset; render(); return result;
      })()`,returnByValue:true});
      if (reminderCheck.exceptionDetails) throw new Error(JSON.stringify(reminderCheck.exceptionDetails));
      const reminderResult=reminderCheck.result.value;
      assert.equal(reminderResult.sameVisibleSize,true);
      assert.equal(reminderResult.stablePin,true);
      assert.equal(reminderResult.groupCount,'2');
      assert.equal(reminderResult.groupOpensList,true);
      assert.equal(reminderResult.originalHeight,61);
      assert.equal(reminderResult.badgeFramed,true);
      assert.equal(reminderResult.shiftedLeft,'1');
      assert.equal(reminderResult.shiftedRight,true);
      assert.equal(reminderResult.shiftedVisible,1);
      assert.match(reminderResult.leftTooltip,/Test 1/);
      assert.doesNotMatch(reminderResult.leftTooltip,/Test 2|Test 3/);
      assert.ok(reminderResult.sunMarkerUnchanged && reminderResult.bandCentered && reminderResult.exactPositions);
      assert.ok(reminderResult.filled && reminderResult.lightFilled && reminderResult.noLinks && reminderResult.unclipped);
      assert.ok(reminderResult.partsFit && reminderResult.bellsVisible && reminderResult.rightAngle && reminderResult.longHands);
      assert.equal(reminderResult.untilVisible,true);
      assert.ok(Math.abs(reminderResult.dialHeight-12)<.1);
      assert.ok(Math.abs(reminderResult.dialWidth-12)<.1);
      assert.equal(reminderResult.heightStable,true, 'adding/removing reminders must not change a collapsed city-card height: '+JSON.stringify(reminderResult));
      assert.equal(reminderResult.future,'2');
      assert.equal(reminderResult.tooltipFits,true);
      assert.match(reminderResult.tooltip,/Test 0/);
      assert.match(reminderResult.tooltip,/Test 1/);
      assert.match(reminderResult.tooltip,/Напоминаний: 2/);
      assert.equal(reminderResult.rows,4);
      assert.equal(reminderResult.remaining,3);
      assert.equal(reminderResult.deleted,true);
      console.log(width+'x'+height+' reminder track: filled clock centred on band at exact time, no connectors, unchanged sun marker, hover and deletion passed');
      if (process.env.LAYOUT_SCREENSHOT_DIR && width === 390) {
        await send('Runtime.evaluate', {expression:`window.reminderShotState={entries:structuredClone(reminders.entries),offset}; offset=0; const shotNow=Date.now()/1000; const shotKey=config.timezones[0]; reminders.entries=[1,6,240,1440,2880].map((m,i)=>({id:'shot-'+i,city_key:shotKey,city:cityName(shotKey),zone:zoneOf(shotKey),source_type:'city',alarm:shotNow+m*60,target:shotNow+m*60,started_at:shotNow,state:'pending',title:['Лекарство','Созвон','Встреча','Работа','Такси'][i]})); render();`});
        await new Promise(resolve => setTimeout(resolve, 150));
        const shot = await send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
        fs.writeFileSync(path.join(process.env.LAYOUT_SCREENSHOT_DIR, 'reminder-track.png'), Buffer.from(shot.data,'base64'));
        const iconClip=await send('Runtime.evaluate',{expression:`(() => {const r=document.querySelectorAll('.city-alarm-pin')[1].getBoundingClientRect();return {x:r.left-11,y:r.top-7,width:32,height:24,scale:8};})()`,returnByValue:true});
        const iconShot=await send('Page.captureScreenshot',{format:'png',clip:iconClip.result.value,captureBeyondViewport:false});
        fs.writeFileSync(path.join(process.env.LAYOUT_SCREENSHOT_DIR,'alarm-detail.png'),Buffer.from(iconShot.data,'base64'));
        const pointerTarget = await send('Runtime.evaluate', {expression:`(() => {const r=document.querySelector('.city-alarm-pin').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()`,returnByValue:true});
        await send('Input.dispatchMouseEvent', {type:'mouseMoved',...pointerTarget.result.value});
        let hoverCheck;
        for(let frame=0;frame<30;frame++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        hoverCheck = await send('Runtime.evaluate', {expression:`(() => {const pin=document.querySelector('.city-alarm-pin'), probe=document.createElement('span'); probe.style.color='var(--accent)'; document.body.appendChild(probe); const result={white:getComputedStyle(pin.querySelector('circle')).fill==='rgb(255, 255, 255)',hoverVisible:getComputedStyle(pin).outlineStyle==='none' && getComputedStyle(pin).boxShadow==='none' && getComputedStyle(pin.querySelector('circle')).stroke===getComputedStyle(probe).color && getComputedStyle(pin.querySelector('.alarm-bells')).stroke===getComputedStyle(probe).color && getComputedStyle(pin).backgroundColor==='rgba(0, 0, 0, 0)' && getComputedStyle(pin.querySelector('.alarm-hands')).stroke===getComputedStyle(probe).color,popup:!!document.querySelector('#reminderTooltip')}; probe.remove(); return result;})()`,returnByValue:true});
        if(hoverCheck.result.value?.white && hoverCheck.result.value?.popup) break;
        }
        assert.deepEqual(hoverCheck.result.value,{white:true,hoverVisible:true,popup:true});
        const tooltipShot = await send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
        fs.writeFileSync(path.join(process.env.LAYOUT_SCREENSHOT_DIR, 'reminder-tooltip.png'), Buffer.from(tooltipShot.data,'base64'));
        await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:0,y:0});
        await send('Runtime.evaluate', {expression:'offset=24; updateDynamic();'});
        const edgeShot = await send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
        fs.writeFileSync(path.join(process.env.LAYOUT_SCREENSHOT_DIR, 'reminder-directions.png'), Buffer.from(edgeShot.data,'base64'));
        await send('Runtime.evaluate', {expression:'offset=0; updateDynamic();'});
        await send('Runtime.evaluate', {expression:`document.querySelector('.city-alarm-right').click();`});
        const listShot = await send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
        fs.writeFileSync(path.join(process.env.LAYOUT_SCREENSHOT_DIR, 'reminder-list.png'), Buffer.from(listShot.data,'base64'));
        await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:0,y:0});
        await send('Runtime.evaluate', {expression:`closeModal(); reminders.entries=window.reminderShotState.entries; offset=window.reminderShotState.offset; render();`});
      }
      if (width === 390) {
        const duplicateCheck = await send('Runtime.evaluate', {returnByValue:true,expression:`(() => {
          const saved={config:structuredClone(config),reminders:structuredClone(reminders),offset,meetingMode,quickAtNowOpen};
          meetingMode=false; quickAtNowOpen=true; reminders.entries=[];
          const original=item(config.timezones[0]).key; config.timezones[0]=original;
          openCities('add'); renderResults('add',cityName(original));
          [...document.querySelectorAll('[data-add]')].find(b=>b.dataset.add===original).click();
          const copy=config.timezones.at(-1);
          for (const [key,name,start] of [[original,'Анна','09:00'],[copy,'Иван','11:00']]) {
            openScheduleEditor(key);
            if(document.querySelector('#useDefaultSwitch').getAttribute('aria-checked')==='true') document.querySelector('#useDefaultSwitch').click();
            document.querySelector('#scheduleCityLabel').value=name;
            document.querySelector('[data-schedule-time="workingStart"]').value=start;
            document.querySelector('#saveSchedule').click(); closeModal();
          }
          offset=1; createReminder(original,0); offset=1; createReminder(copy,0);
          config=JSON.parse(JSON.stringify(config)); reminders=JSON.parse(JSON.stringify(reminders)); normalize(); render();
          const cards=[...document.querySelectorAll('.city-card')];
          const result={distinct:copy!==original,sameCity:cityName(copy)===cityName(original),names:[cityContext(original).label,cityContext(copy).label],starts:[scheduleFor(original).workingStart,scheduleFor(copy).workingStart],alarms:[cityReminders(original).length,cityReminders(copy).length],pins:[original,copy].map(key=>cards.find(c=>c.dataset.zone===key).querySelectorAll('.city-alarm-pin').length)};
          const wheel=[];
          for(const initial of [5,-5,0]) {
            config.settings.reminder_intervals[0]=initial; render();
            const chip=document.querySelector('.chip');
            chip.dispatchEvent(new WheelEvent('wheel',{deltaY:-40,bubbles:true,cancelable:true}));
            wheel.push(+chip.dataset.lead);
            chip.dispatchEvent(new WheelEvent('wheel',{deltaY:40,bubbles:true,cancelable:true}));
            wheel.push(+chip.dataset.lead);
          }
          result.wheel=wheel;
          config=saved.config; reminders=saved.reminders; offset=saved.offset; meetingMode=saved.meetingMode; quickAtNowOpen=saved.quickAtNowOpen; closeModal(); render();
          return result;
        })()`});
        if(duplicateCheck.exceptionDetails) throw new Error(JSON.stringify(duplicateCheck.exceptionDetails));
        assert.deepEqual(duplicateCheck.result.value,{distinct:true,sameCity:true,names:['Анна','Иван'],starts:['09:00','11:00'],alarms:[1,1],pins:[1,1],wheel:[6,5,-4,-5,1,0]});
        console.log('Real UI duplicate add, independent name/schedule editors, isolated pins after reload and signed interval wheel directions passed.');
      }
      if (process.env.LAYOUT_SCREENSHOT_DIR && width === 360 && height === 640) {
        await send('Runtime.evaluate', {expression:'meetingMode=false; offset=0; quickAtNowOpen=true; render();'});
        await new Promise(resolve => setTimeout(resolve, 350));
        const narrow = await send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
        fs.mkdirSync(process.env.LAYOUT_SCREENSHOT_DIR, {recursive:true});
        fs.writeFileSync(path.join(process.env.LAYOUT_SCREENSHOT_DIR, 'narrow.png'), Buffer.from(narrow.data, 'base64'));
        await send('Runtime.evaluate', {expression:'offset=1; meetingMode=true; render();'});
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      if (process.env.LAYOUT_SCREENSHOT_DIR && width === 900 && height === 550) {
        const wide = await send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
        fs.writeFileSync(path.join(process.env.LAYOUT_SCREENSHOT_DIR, 'wide.png'), Buffer.from(wide.data, 'base64'));
      }
      if (process.env.LAYOUT_SCREENSHOT_DIR && width === 430 && height === 720) {
        fs.mkdirSync(process.env.LAYOUT_SCREENSHOT_DIR, {recursive:true});
        const shot = await send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
        fs.writeFileSync(path.join(process.env.LAYOUT_SCREENSHOT_DIR, 'meeting.png'), Buffer.from(shot.data, 'base64'));
        await send('Runtime.evaluate', {expression:'meetingMode=false; offset=0; quickAtNowOpen=false; render();'});
        await new Promise(resolve => setTimeout(resolve, 350));
        const closed = await send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
        fs.writeFileSync(path.join(process.env.LAYOUT_SCREENSHOT_DIR, 'closed.png'), Buffer.from(closed.data, 'base64'));
        await send('Runtime.evaluate', {expression:'quickAtNowOpen=true; render();'});
        await new Promise(resolve => setTimeout(resolve, 350));
        const open = await send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
        fs.writeFileSync(path.join(process.env.LAYOUT_SCREENSHOT_DIR, 'open.png'), Buffer.from(open.data, 'base64'));
        await send('Runtime.evaluate', {expression:'openSettings();'});
        await new Promise(resolve => setTimeout(resolve, 150));
        const settings = await send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
        fs.writeFileSync(path.join(process.env.LAYOUT_SCREENSHOT_DIR, 'settings.png'), Buffer.from(settings.data, 'base64'));
        await send('Runtime.evaluate', {expression:'offset=1; meetingMode=true; render();'});
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      const expression = `(async () => {
        const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
        const toggle = rect('#meetingToggle');
        const copy = rect('#meetingCopy');
        const chip = rect('.quick .chip');
        const actionGap = copy.left - toggle.right;
        const groupGap = chip.top - toggle.bottom;
        meetingMode = false;
        offset = 0;
        quickAtNowOpen = true;
        render();
        const normalGroupGap = rect('.quick .chip').top - rect('#meetingToggle').bottom;
        const nowLabelLeft = rect('.shift-label').left;
        const statusWidths = [...document.querySelectorAll('.city-card .until')].map(el => ({text:el.textContent,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth}));
        offset = 3;
        render();
        const shiftedStatusWidths = [...document.querySelectorAll('.city-card .until')].map(el => ({text:el.textContent,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth}));
        offset = 0;
        render();
        const sampleStatus = document.querySelector('.city-card .until');
        sampleStatus.textContent = 'Через 2 ч 46 мин · Вчера';
        const longStatusFits = sampleStatus.scrollWidth <= sampleStatus.clientWidth + 1;
        render();
        await new Promise(resolve => setTimeout(resolve, 300));
        const cityRect = document.querySelector('.cities')?.getBoundingClientRect();
        const cards = [...document.querySelectorAll('.cities .card')];
        const visibleCards = cards.filter(card => card.getBoundingClientRect().bottom <= cityRect.bottom + 1).length;
        const cityOverflow = getComputedStyle(document.querySelector('.cities')).overflowY;
        const hero = rect('.hero');
        const panels = rect('.top-panels');
        const baseCard = rect('#baseClock');
        const label = rect('.shift-label');
        const rail = rect('.slider-rail');
        const marks = rect('.marks span');
        const quickTitle = rect('.quick-title');
        const cityTitle = rect('.cities-title');
        const firstCity = rect('.city-card');
        const baseSummary = rect('.base-clock-row');
        const baseBand = rect('#baseClock .temporal-band');
        const baseIcon = rect('#baseClock .city-context');
        const shell=document.querySelector('.shell');
        shell.classList.add('meeting-mode');
        const cardEdges=['#baseClock','.city-card'].map(selector => {
          const card=document.querySelector(selector), box=card.getBoundingClientRect();
          card.classList.remove('meeting-selected');
          const outline=card.querySelector('.meeting-outline rect'), path=outline.getBoundingClientRect();
          const stroke=parseFloat(getComputedStyle(outline).strokeWidth)/2;
          const radius=parseFloat(getComputedStyle(outline).rx);
          return [path.left-box.left-stroke, path.top-box.top-stroke, box.right-path.right-stroke,
            box.bottom-path.bottom-stroke, radius+stroke-parseFloat(getComputedStyle(card).borderTopLeftRadius)];
        });
        shell.classList.remove('meeting-mode');
        const textWalker = document.createTreeWalker(document.querySelector('.shell'), NodeFilter.SHOW_TEXT);
        const fontSizes = new Set();
        for(let node=textWalker.nextNode();node;node=textWalker.nextNode()) {
          if(node.textContent.trim() && node.parentElement?.getClientRects().length)
            fontSizes.add(getComputedStyle(node.parentElement).fontSize);
        }
        const del = rect('.city-card .city-summary>.delete');
        const trash = rect('.city-card .city-summary>.delete .trash-icon');
        const track = rect('.city-card .city-alarm-track');
        const summary = rect('.city-card .city-summary');
        const band = rect('.city-card .city-summary .temporal-band');
        const icon = rect('.city-card .city-context');
        const cityName = rect('.city-card .city-name');
        const cityClockValue = rect('.city-time');
        const cityDelete = rect('.city-card .city-summary>.delete');
        const baseTextLeft = rect('.base-summary').left + parseFloat(getComputedStyle(document.querySelector('.base-summary')).paddingLeft);
        const baseTextRight = parseFloat(getComputedStyle(document.querySelector('.base-summary')).paddingRight);
        const contentCenter = (rect('.city-card .city-name').top + rect('.offset').bottom) / 2;
        return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
          cityHeight:cityRect?.height,cityTop:cityRect?.top,cardBounds:cards.map(card=>({top:card.getBoundingClientRect().top,bottom:card.getBoundingClientRect().bottom,height:card.getBoundingClientRect().height})),visibleCards,
          actionGap,groupGap,normalGroupGap,deleteCenter:(del.top + del.bottom)/2,contentCenter,
          heroToLabel:label.top-panels.bottom,labelToRail:rail.top-label.bottom,
          heroBottom:hero.bottom,labelTop:label.top,sliderTop:rect('.slider').top,sliderMargin:getComputedStyle(document.querySelector('.slider')).marginTop,
          railToQuick:quickTitle.top-marks.bottom,
          quickToCities:cityTitle.top-rect('.quick .chip').bottom,
          cityTitleToCard:firstCity.top-cityTitle.bottom,
          labelLeft:label.left,nowLabelLeft,railLeft:rail.left,heroLeft:panels.left,quickTitleLeft:quickTitle.left,cityTitleLeft:cityTitle.left,addLeft:rect('.add').left,
          statusWidths,shiftedStatusWidths,longStatusFits,
          deleteTop:del.top,deleteBottom:del.bottom,deleteRight:del.right,deleteLeft:del.left,
          trashX:(trash.left+trash.right)/2,trashY:(trash.top+trash.bottom)/2,deleteX:(del.left+del.right)/2,
          trackLeft:track.left,trackRight:track.right,iconX:(icon.left+icon.right)/2,
          summaryTop:summary.top,summaryBottom:summary.bottom,summaryRight:summary.right,
          bandTop:band.top,bandBottom:band.bottom,iconTop:icon.top,iconBottom:icon.bottom,
          bandLeft:band.left,bandRight:band.right,summaryLeft:summary.left,
          cityTextInset:cityName.left-summary.left,baseTextInset:baseTextLeft-rect('.base-summary').left,
          deleteTextGap:cityDelete.left-cityClockValue.right,baseTextRight,
          fontSizes:[...fontSizes].sort((a,b)=>parseFloat(a)-parseFloat(b)),
          cityHeading:document.querySelector('.cities-title')?.textContent,
          headingFont:getComputedStyle(document.querySelector('.cities-title')).fontSize,
          reminderHeadingFont:getComputedStyle(document.querySelector('.quick-title')).fontSize,
          nameTop:rect('.city-card .city-name')?.top,timeTop:rect('.city-time')?.top,
          contentBottom:Math.max(rect('.offset').bottom,rect('.until').bottom),
          baseOutsideCities:!document.querySelector('#cities #baseClock'),
          baseAboveSlider:document.querySelector('#sliderArea').previousElementSibling.contains(document.querySelector('#baseClock')),
          firstCityBelowSlider:firstCity.top>rect('#sliderArea').bottom,
          cardEdges,
          hasBaseHeading:!!document.querySelector('.base-section h2'),
          baseSectionLabel:document.querySelector('.base-section').getAttribute('aria-label'),
          hasBaseMenu:!!document.querySelector('.base-menu'),
          baseBandStart:baseBand.left-baseSummary.left,
          baseBandEnd:baseSummary.right-baseBand.right,
          baseTrackWidth:rect('#baseClock .city-alarm-track').width,
          baseBandWidth:baseBand.width,
          baseIconInset:(baseIcon.left+baseIcon.right)/2-baseSummary.left,
          baseIconX:(baseIcon.left+baseIcon.right)/2,
          baseRulerWidth:rect('#baseClock .availability-window').width,
          cityRulerWidth:rect('.city-card .availability-window').width,
          baseTextToBand:baseBand.top-Math.max(rect('#baseClock .clock-city').bottom,rect('#baseClock .date').bottom),
          baseMarkerInset:(rect('#baseClock .temporal-marker').left+rect('#baseClock .temporal-marker').right)/2-baseSummary.left,
          baseIconBottom:baseBand.top-baseIcon.bottom,
          cityHeadingAligned:Math.abs(cityTitle.left-firstCity.left)<1,
          sharedScrollbar:['scrollbarWidth','scrollbarColor'].every(property =>
            getComputedStyle(document.querySelector('.cities'))[property] === getComputedStyle(document.querySelector('.saved-list'))[property]),
          leftEdges:[baseCard.left-panels.left, firstCity.left-panels.left],
          widePanelsAligned:baseCard.right < hero.left && Math.abs(baseCard.top-hero.top) < 1 && Math.abs(hero.right-panels.right) < 1,
          narrowPanelsAligned:hero.bottom < baseCard.top && Math.abs(hero.left-baseCard.left) < 1,
          baseRight:hero.right-rect('#baseClock').right,
          cityRight:hero.right-Math.max(...cards.map(card=>card.getBoundingClientRect().right)),
          firstCardNarrowing:rect('#baseClock').width-firstCity.width,
          listGutter:document.querySelector('#cities').offsetWidth-document.querySelector('#cities').clientWidth,
          listScrolls:document.querySelector('#cities').scrollHeight>document.querySelector('#cities').clientHeight,
          baseClockBottom:rect('#baseClock').bottom,
          baseCardTop:rect('#baseClock').top,
          baseTitleSize:parseFloat(getComputedStyle(document.querySelector('#baseClock .city-name')).fontSize),
          baseTimeSize:parseFloat(getComputedStyle(document.querySelector('#baseClock .clock-time')).fontSize),
          cityTitleSize:parseFloat(getComputedStyle(document.querySelector('.city-card .city-name')).fontSize),
          cityTimeSize:parseFloat(getComputedStyle(document.querySelector('.city-card .city-time')).fontSize),
          baseSubtitleY:rect('#baseClock .clock-city').top,
          baseDateY:rect('#baseClock .date').top,
          baseTitleLeft:rect('#baseClock .city-name').left,
          baseTimeLeft:rect('#baseClock .clock-time').left,
          baseTimeRight:rect('#baseClock .clock-time').right,
          baseRowTimeEdge:baseSummary.right-baseTextRight,
          cardCursors:[document.querySelector('#baseClock'),...cards].map(card=>getComputedStyle(card.querySelector('.city-name')).cursor),
          heroColumns:getComputedStyle(document.querySelector('.hero')).gridTemplateColumns,
          heroWidth:rect('.hero')?.width,heroHeight:rect('.hero')?.height,summaryHeight:document.querySelector('.base-summary')?.scrollHeight,clockWidth:rect('.clock')?.width,savedWidth:rect('.saved-panel')?.width,
          clockText:document.querySelector('.clock-time')?.textContent,clockTextWidth:rect('.clock-time')?.width,clockTextScroll:document.querySelector('.clock-time')?.scrollWidth,
          wide: getComputedStyle(document.querySelector('.main-controls')).display,
          shellOverflow:getComputedStyle(document.querySelector('.shell')).overflowY,
          cityOverflow};
      })()`;
      const evaluated = await send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
      if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.text);
      const layout = evaluated.result.value;
      console.log(`${width}x${height}: ${JSON.stringify(layout)}`);
      assert.equal(layout.scrollWidth, width, `horizontal overflow at ${width}x${height}`);
      assert.deepEqual(layout.fontSizes, ['10px','12px','14px','16px','22px']);
      assert.ok(layout.baseOutsideCities && layout.baseAboveSlider && layout.firstCityBelowSlider, 'base and city sections sit on opposite sides of the slider');
      assert.equal(layout.hasBaseHeading, false);
      assert.ok(layout.cardEdges.flat().every(delta => Math.abs(delta)<.15), 'animated outlines follow both card borders and corner radii');
      assert.equal(layout.baseSectionLabel, 'Основное время');
      assert.ok(Math.abs(layout.savedWidth - layout.heroWidth) <= 1, 'saved panel fills the hero');
      assert.equal(layout.hasBaseMenu, false);
      assert.ok(Math.abs(layout.baseBandStart) <= 1 && Math.abs(layout.baseBandEnd) <= 1, 'base band fills the whole card');
      assert.ok(Math.abs(layout.baseTrackWidth - layout.baseBandWidth) <= 1, 'base pin track covers the band');
      assert.ok(Math.abs(layout.baseIconInset - layout.baseMarkerInset) <= 1, 'base availability icon aligns with the white marker');
      assert.ok(Math.abs(layout.baseIconX - layout.iconX) <= 1, 'base and first city icons line up');
      assert.ok(Math.abs(layout.baseRulerWidth - layout.cityRulerWidth) <= 1, 'both rulers use the same width for 24 hours');
      assert.ok(Math.abs(layout.baseBandWidth - layout.baseRulerWidth - 36 - layout.firstCardNarrowing) <= 1, 'base band extends right by the width of the city action column');
      assert.ok(layout.baseTextToBand >= 25, 'base secondary text has extra room above the band');
      assert.ok(Math.abs(layout.baseIconBottom - 4) <= 1, 'availability icon keeps its vertical inset');
      assert.ok(layout.cityHeadingAligned, 'city heading lines up with the cards');
      assert.ok(layout.sharedScrollbar, 'cities and saved reminders have identical scrollbar width and color');
      assert.ok(layout.leftEdges.every(delta=>Math.abs(delta)<1) && (width>=760 || Math.abs(layout.baseRight)<1), 'card and panel edges line up');
      assert.ok(Math.abs(layout.cityRight-layout.listGutter)<1, 'city cards narrow by exactly the space taken by their scrollbar');
      if (!layout.listScrolls) assert.equal(layout.listGutter, 0, 'no space is reserved when the city scrollbar is hidden');
      assert.ok(layout.baseClockBottom < layout.sliderTop && (width>=760 ? layout.widePanelsAligned : layout.narrowPanelsAligned), 'base clock sits to the left on wide windows and below on narrow windows');
      assert.equal(layout.baseTitleSize, layout.baseTimeSize, 'base time and title share the large type size');
      assert.ok(layout.baseTitleSize > layout.cityTitleSize && layout.baseTimeSize > layout.cityTimeSize, 'base type leads the city type');
      assert.ok(Math.abs(layout.baseSubtitleY - layout.baseDateY) <= 1, 'secondary lines share one horizontal anchor');
      assert.ok(layout.baseTitleLeft < layout.baseTimeLeft, 'base time is to the right of the heading');
      assert.ok(Math.abs(layout.baseTimeRight - layout.baseRowTimeEdge) <= 1, 'base time has the shared right inset');
      assert.ok(layout.cardCursors.every(cursor => cursor === 'pointer'), 'every card has a pointer cursor');
      assert.equal(layout.cityHeading, 'Города');
      assert.equal(layout.headingFont, layout.reminderHeadingFont);
      assert.ok(Math.abs((layout.nameTop-layout.summaryTop)-(layout.bandTop-layout.contentBottom))<.1, 'city text top/bottom padding must match');
      assert.ok(layout.groupGap >= layout.actionGap * 2, `quick action hierarchy at ${width}x${height}`);
      assert.ok(layout.normalGroupGap >= layout.actionGap * 2, `quick disclosure hierarchy at ${width}x${height}`);
      assert.ok(layout.heroToLabel > layout.labelToRail, `slider label groups with the rail at ${width}x${height}`);
      // Under 620 px, the whole shell scrolls and keeps a smaller section gap.
      assert.ok(layout.railToQuick >= layout.actionGap * 2, `slider labels and quick actions need separate space at ${width}x${height}`);
      assert.ok(Math.abs(layout.nowLabelLeft - layout.heroLeft) <= 1, `Now label is not aligned to the main blocks at ${width}x${height}`);
      assert.ok(Math.abs(layout.quickTitleLeft - layout.heroLeft) <= 1, `quick heading is not aligned to the main blocks at ${width}x${height}`);
      assert.ok(layout.cityTitleToCard <= 8, `city heading is too far from its cards at ${width}x${height}`);
      assert.ok(Math.abs(layout.deleteTop - layout.summaryTop) <= 1, `delete button top gap at ${width}x${height}`);
      assert.ok(Math.abs(layout.deleteBottom - layout.summaryBottom) <= 1, `delete button spans the full column at ${width}x${height}`);
      assert.ok(Math.abs(layout.bandBottom - layout.summaryBottom) <= 1, `color band should sit at city-card bottom at ${width}x${height}`);
      assert.ok(Math.abs(layout.bandTop-layout.iconBottom-4)<.1, 'sun icon needs a 4px gap above the band');
      assert.ok(layout.iconBottom <= layout.bandTop + 1, `city icon remains above the bottom timeline at ${width}x${height}`);
      assert.ok(Math.abs(layout.deleteRight - layout.summaryRight) <= 1, `delete button right gap at ${width}x${height}`);
      assert.ok(Math.abs(layout.cityTextInset - layout.baseTextInset) <= 1, `city and base left text insets should match at ${width}x${height}`);
      assert.ok(Math.abs(layout.deleteTextGap - layout.baseTextRight) <= 1, `city time should match base-card right inset at ${width}x${height}`);
      assert.ok(Math.abs(layout.bandLeft - layout.summaryLeft) <= 1 && Math.abs(layout.bandRight - layout.deleteLeft) <= 1,
        `color band must stop at the delete column at ${width}x${height}`);
      assert.ok(Math.abs(layout.trashX-layout.deleteX)<=1 && Math.abs(layout.trashY-layout.deleteCenter)<=1, `trash glyph centered in its column at ${width}x${height}`);
      assert.ok(Math.abs(layout.trackLeft-layout.bandLeft)<=1 && Math.abs(layout.trackRight-layout.bandRight)<=1, `reminder track follows shortened band at ${width}x${height}`);
      assert.ok(Math.abs(layout.iconX-(layout.bandLeft+layout.bandRight)/2)<=1, `sun follows shortened band center at ${width}x${height}`);
      assert.ok(layout.longStatusFits, `short day-shift status should be fully visible at ${width}x${height}`);
      if (width < 760 && height >= 520) {
        assert.ok(layout.quickToCities >= layout.cityTitleToCard * 2, `city section grouping at ${width}x${height}`);
        assert.ok(Math.abs(layout.nameTop - layout.timeTop) <= 1, `city name/time misaligned at ${width}x${height}`);
        assert.ok(layout.visibleCards >= (height >= 700 ? 2 : 1), `too few cities at ${width}x${height}`);
      }
      if (height < 620) assert.equal(layout.shellOverflow, 'auto');
      if (width >= 800 && height <= 600) assert.equal(layout.shellOverflow, 'auto');
      console.log(`${width}x${height}: ${layout.visibleCards} complete cities, list ${layout.cityHeight}px`);
      if (width === 360) {
        const target = await send('Runtime.evaluate', {expression:`(() => {
          const list = document.querySelector('#cities');
          list.scrollTop = 0;
          const bounds = list.getBoundingClientRect();
          return {x:bounds.right - (list.offsetWidth-list.clientWidth)/2, y:bounds.top+20};
        })()`,returnByValue:true});
        const {x,y} = target.result.value;
        await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y:y+28,button:'left',buttons:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y:y+28,button:'left',buttons:0,clickCount:1});
        await new Promise(resolve=>setTimeout(resolve,100));
        const result = await send('Runtime.evaluate',{expression:"document.querySelector('#cities').scrollTop",returnByValue:true});
        assert.ok(result.result.value > 0,'dragging the native city scrollbar moves the list');
      }
      const meetingCheck = await send('Runtime.evaluate', {expression:`(async () => {
        const RealDate = Date;
        const fixed = RealDate.parse('2026-10-10T05:45:00Z');
        window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };
        config.settings.top_clock_mode = 'manual';
        config.settings.manual_top_timezone = 'Europe/Moscow';
        config.timezones = ['Europe/Moscow','Asia/Bangkok'];
        config.cityContext = {'Asia/Bangkok':{availabilityOverride:{okayStart:'07:00',workingStart:'14:00',workingEnd:'18:00',dndStart:'22:00'}}};
        meetingMode = false;
        meetingSelected = new Set(config.timezones);
        document.querySelector('#modal').innerHTML = '';
        render();
        const summary = document.querySelector('.city-card .city-summary');
        const remove = summary.querySelector('.delete');
        const initialColumns = getComputedStyle(summary).gridTemplateColumns;
        toggleMeeting();
        const status = document.querySelector('#meetingStatus');
        const header = status.parentElement;
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        getComputedStyle(summary).gridTemplateColumns;
        getComputedStyle(remove).opacity;
        getComputedStyle(status).opacity;
        const motions = [...summary.getAnimations(), ...remove.getAnimations(), ...status.getAnimations()];
        for (const motion of motions) { motion.pause(); await motion.ready; motion.currentTime = Number(motion.effect.getTiming().duration) / 2; }
        const middleColumns = getComputedStyle(summary).gridTemplateColumns;
        const middleDeleteOpacity = Number(getComputedStyle(remove).opacity);
        const middleRevealOpacity = Number(getComputedStyle(status).opacity);
        const durations = motions.map(motion => Number(motion.effect.getTiming().duration));
        for (const motion of motions) motion.finish();
        const finalColumns = getComputedStyle(summary).gridTemplateColumns;
        const reveal = {initialColumns,middleColumns,finalColumns,middleDeleteOpacity,middleRevealOpacity,durations,inert:remove.inert,hiddenOpacity:getComputedStyle(remove).opacity};
        const switchNode = document.querySelector('#meetingEarlier');
        if (!switchNode) throw Error('Expected both meeting options');
        const before = getComputedStyle(switchNode.querySelector('.period-thumb')).transform;
        switchNode.click();
        const thumb = document.querySelector('.period-thumb');
        getComputedStyle(thumb).transform;
        const transition = thumb.getAnimations().find(animation => animation.transitionProperty === 'transform');
        if (!reducedMotion && !transition) throw Error('Expected a transform transition for the switch');
        if (transition) {
          transition.pause();
          await transition.ready;
          transition.currentTime = Number(transition.effect.getTiming().duration) / 2;
        }
        const during = getComputedStyle(thumb).transform;
        if (transition) transition.finish();
        const end = getComputedStyle(thumb).transform;
        const sunBounds = document.querySelector('.period-switch span:first-of-type svg g').getBBox();
        const horizonGroup = document.querySelector('.period-switch span:last-of-type svg g');
        const horizonBounds = horizonGroup.getBBox();
        const result = {
          iconBoundsAligned:Math.abs(sunBounds.y-horizonBounds.y)<.01 && Math.abs(sunBounds.height-horizonBounds.height)<.01,
          visibleSunFraction:horizonGroup.firstElementChild.getBBox().height / 8,
          statusFits:status.scrollWidth <= status.clientWidth + 1,
          sameRow:Math.abs(status.getBoundingClientRect().top - header.getBoundingClientRect().top) < 3,
          checked:document.querySelector('#meetingEarlier').getAttribute('aria-checked'),
          yellow:status.classList.contains('period-yellow'), before, during, end, reducedMotion, reveal,
          startAbsent:!status.querySelector('.meeting-start'),
          buttonGap:document.querySelector('.meeting-actions').getBoundingClientRect().left - status.getBoundingClientRect().right,
          neutralIcon:getComputedStyle(status.querySelector('.meeting-period-icon')).color === getComputedStyle(document.querySelector('.city-card .solar-glyph')).color,
          durationColor:getComputedStyle(document.querySelector('.meeting-duration')).color,
          yellowColor:getComputedStyle(document.documentElement).getPropertyValue('--availability-okay').trim()
        };
        setOffset(meetingOffsetAt(meetingResult.at));
        result.autoGreen = !meetingShowingEarlier && document.querySelector('#meetingEarlier').getAttribute('aria-checked') === 'false';
        setOffset(meetingOffsetAt(meetingEarlier.at));
        result.rangeGradient = getComputedStyle(document.querySelector('#meetingRange')).backgroundImage;
        result.autoYellow = meetingShowingEarlier && document.querySelector('#meetingEarlier').getAttribute('aria-checked') === 'true';
        const savedWindowMinutes = meetingWindowMinutes;
        const edgeRange = document.querySelector('#meetingRange');
        try {
          meetingWindowMinutes = () => 480;
          setOffset(23);
          const bounds = node => node.getBoundingClientRect();
          const clip = bounds(edgeRange.parentElement), rail = bounds(document.querySelector('.slider-rail'));
          const range = bounds(edgeRange);
          result.rangeClipped = getComputedStyle(edgeRange.parentElement).overflowX === 'hidden' &&
            Math.abs(clip.left - rail.left) < 1 && Math.abs(clip.right - rail.right) < 1 &&
            range.right > rail.right && Math.abs(range.left - (rail.left + rail.width * 23 / 24)) < 1 &&
            Math.abs(range.width - rail.width / 3) < 1;
        } finally { meetingWindowMinutes = savedWindowMinutes; }
        setOffset(16);
        const message = status.querySelector('.meeting-message');
        result.noWindow = message?.textContent;
        result.noWindowMuted = !!message && getComputedStyle(message).color === getComputedStyle(document.querySelector('.city-card .solar-glyph')).color;
        setOffset(meetingOffsetAt(meetingEarlier.at));
        toggleMeeting();
        getComputedStyle(summary).gridTemplateColumns;
        const exitMotions = [...summary.getAnimations(), ...remove.getAnimations()];
        for (const motion of exitMotions) motion.finish();
        result.exitDeleteRestored = !remove.inert && getComputedStyle(remove).opacity === '1' && getComputedStyle(remove).visibility === 'visible';
        result.exitColumnRestored = getComputedStyle(summary).gridTemplateColumns.endsWith('36px');
        toggleMeeting();
        for (const node of [summary,remove,status]) for (const motion of node.getAnimations()) motion.finish();
        window.Date = RealDate;
        return result;
      })()`,returnByValue:true,awaitPromise:true});
      if (meetingCheck.exceptionDetails) throw Error(JSON.stringify(meetingCheck.exceptionDetails));
      const meeting = meetingCheck.result.value;
      console.log(`${width}x${height} meeting: ${JSON.stringify(meeting)}`);
      assert.ok(meeting.exitDeleteRestored && meeting.exitColumnRestored, 'exiting meeting mode must restore the delete control and its column');
      assert.ok(meeting.reveal.inert, 'meeting delete must not accept keyboard input');
      assert.equal(meeting.reveal.hiddenOpacity, '0');
      if (!meeting.reducedMotion) {
        const reveal = meeting.reveal;
        assert.ok(reveal.middleDeleteOpacity > 0 && reveal.middleDeleteOpacity < 1, 'delete must fade through an intermediate state');
        assert.ok(reveal.middleRevealOpacity > 0 && reveal.middleRevealOpacity < 1, 'meeting controls must fade through an intermediate state');
        assert.notEqual(reveal.middleColumns, reveal.initialColumns, 'city content must expand during the fade');
        assert.notEqual(reveal.middleColumns, reveal.finalColumns, 'city content must not jump directly to full width');
        assert.ok(reveal.durations.length >= 3 && reveal.durations.filter(duration => duration > 0).every(duration => duration === 220), 'reveal, deletion and expansion must use the same duration');
      }
      assert.ok(meeting.statusFits, 'meeting controls should fit without clipping');
      assert.ok(meeting.sameRow, 'meeting controls should stay in the heading row');
      assert.ok(meeting.startAbsent, 'start time should only appear in the base clock');
      assert.ok(meeting.neutralIcon, 'period icon should use the neutral city icon color');
      assert.ok(meeting.iconBoundsAligned, 'sun and sunrise should have the same vertical bounds');
      assert.ok(Math.abs(meeting.visibleSunFraction - .975) < .01, 'horizon should be lowered by 15% of the glyph height');
      assert.ok(Math.abs(meeting.buttonGap - 4) < 1, 'meeting group should stay beside Good for all when widened');
      assert.equal(meeting.checked, 'true');
      assert.ok(meeting.yellow);
      assert.ok(meeting.autoGreen, 'moving into work hours should select the green switch state');
      assert.ok(meeting.rangeClipped, 'the meeting range is clipped to the rail without rescaling its colors');
      assert.match(meeting.rangeGradient, /linear-gradient/);
      assert.ok(meeting.rangeGradient.includes('rgb(67, 139, 103)') || meeting.rangeGradient.includes('rgb(93, 159, 123)'), 'shared window must contain the work-hour color');
      assert.ok(meeting.rangeGradient.includes('rgb(154, 124, 66)') || meeting.rangeGradient.includes('rgb(180, 148, 80)'), 'shared window must contain the acceptable-hour color');
      assert.ok(meeting.autoYellow, 'moving into contact hours should select the yellow switch state');
      assert.equal(meeting.noWindow, 'Нет окна');
      assert.ok(meeting.noWindowMuted, 'no-window text should use the neutral icon color');
      if (!meeting.reducedMotion) {
        assert.notEqual(meeting.during, meeting.before, 'switch should start animating');
        assert.notEqual(meeting.during, meeting.end, 'switch should animate through intermediate positions');
      }
      const screensCheck = await send('Runtime.evaluate', {expression:`(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect();
        const frame = box('.shell');
        const headerHeight = box('.header').height;
        const inset = getComputedStyle(document.querySelector('.base-summary')).paddingLeft;
        openSettings();
        const settings = {frameLeft:box('.modal-root').left,headerHeight:box('.modal-head').height,inset:getComputedStyle(document.querySelector('.row')).paddingLeft,titleSize:getComputedStyle(document.querySelector('.modal-head h2')).fontSize};
        openFeatureGuide();
        const help = {inset:getComputedStyle(document.querySelector('.feature-group>summary')).paddingLeft,body:document.querySelector('.feature-guide').textContent};
        closeModal();
        return {frameLeft:frame.left,headerHeight,inset,settings,help};
      })()`, returnByValue:true});
      if (screensCheck.exceptionDetails) throw Error(JSON.stringify(screensCheck.exceptionDetails));
      const screens = screensCheck.result.value;
      assert.equal(screens.settings.frameLeft, screens.frameLeft);
      assert.equal(screens.settings.headerHeight, screens.headerHeight);
      assert.equal(screens.settings.inset, screens.inset);
      assert.equal(screens.help.inset, screens.inset);
      assert.equal(screens.settings.titleSize, '16px');
      assert.match(screens.help.body, /Чтобы учесть своё время/);
      assert.doesNotMatch(screens.help.body, /верхние часы добавьте отдельно/);
      if (process.env.LAYOUT_SCREENSHOT_DIR) {
        const shot = await send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
        fs.writeFileSync(path.join(process.env.LAYOUT_SCREENSHOT_DIR, `period-${width}-${height}.png`), Buffer.from(shot.data,'base64'));
      }
    }
  } finally {
    try { await connection?.send('Browser.close'); } catch {}
    connection?.socket.close();
    child.kill();
    await new Promise(resolve => setTimeout(resolve, 250));
    const tempRoot = fs.realpathSync(os.tmpdir());
    const resolvedProfile = fs.realpathSync(profile);
    if (path.dirname(resolvedProfile) !== tempRoot || !path.basename(resolvedProfile).startsWith('world-clock-layout-'))
      throw new Error('Refusing to remove an unexpected browser profile path');
    fs.rmSync(resolvedProfile, {recursive:true, force:true, maxRetries:10, retryDelay:100});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
