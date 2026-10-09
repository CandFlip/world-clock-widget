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
    const url = pathToFileURL(path.join(__dirname, 'ui', 'index.html')).href + '?preview&offset=1';
    for (const [width, height] of [[360, 640], [390, 720], [430, 720], [430, 500], [900, 550]]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor:1, mobile:false});
      await send('Page.navigate', {url});
      await new Promise(resolve => setTimeout(resolve, 500));
      await send('Runtime.evaluate', {expression:`
        version = ${JSON.stringify(`v${macVersion} layout preview`)};
        config.timezones = ['Europe/Moscow','Asia/Vladivostok','Asia/Yekaterinburg','Asia/Almaty','America/New_York'];
        meetingMode = true;
        meetingSelected = new Set(config.timezones);
        render();
      `});
      await new Promise(resolve => setTimeout(resolve, 350));
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
        const marks = rect('.marks span');
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
        const label = rect('.shift-label');
        const rail = rect('.slider-rail');
        const quickTitle = rect('.quick-title');
        const cityTitle = rect('.cities-title');
        const firstCity = rect('.cities .card');
        const textWalker = document.createTreeWalker(document.querySelector('.shell'), NodeFilter.SHOW_TEXT);
        const fontSizes = new Set();
        for(let node=textWalker.nextNode();node;node=textWalker.nextNode()) {
          if(node.textContent.trim() && node.parentElement?.getClientRects().length)
            fontSizes.add(getComputedStyle(node.parentElement).fontSize);
        }
        const del = rect('.city-summary>.delete');
        const summary = rect('.city-summary');
        const band = rect('.city-summary .temporal-band');
        const contentCenter = (rect('.city-name').top + rect('.offset').bottom) / 2;
        return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
          cityHeight:cityRect?.height,visibleCards,
          actionGap,groupGap,normalGroupGap,deleteCenter:(del.top + del.bottom)/2,contentCenter,
          heroToLabel:label.top-hero.bottom,labelToRail:rail.top-label.bottom,
          heroBottom:hero.bottom,labelTop:label.top,sliderTop:rect('.slider').top,sliderMargin:getComputedStyle(document.querySelector('.slider')).marginTop,
          railToQuick:quickTitle.top-marks.bottom,
          quickToCities:cityTitle.top-rect('.quick .chip').bottom,
          cityTitleToCard:firstCity.top-cityTitle.bottom,
          labelLeft:label.left,nowLabelLeft,railLeft:rail.left,heroLeft:hero.left,quickTitleLeft:quickTitle.left,cityTitleLeft:cityTitle.left,addLeft:rect('.add').left,
          statusWidths,shiftedStatusWidths,longStatusFits,
          deleteTop:del.top,deleteBottom:del.bottom,deleteRight:del.right,
          summaryTop:summary.top,summaryRight:summary.right,
          bandTop:band.top,bandLeft:band.left,bandRight:band.right,summaryLeft:summary.left,
          fontSizes:[...fontSizes].sort((a,b)=>parseFloat(a)-parseFloat(b)),
          cityHeading:document.querySelector('.cities-title')?.textContent,
          headingFont:getComputedStyle(document.querySelector('.cities-title')).fontSize,
          reminderHeadingFont:getComputedStyle(document.querySelector('.quick-title')).fontSize,
          nameTop:rect('.city-name')?.top,timeTop:rect('.city-time')?.top,
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
      assert.deepEqual(layout.fontSizes, ['10px','12px','14px','16px','32px']);
      assert.equal(layout.cityHeading, 'Города');
      assert.equal(layout.headingFont, layout.reminderHeadingFont);
      assert.ok(layout.groupGap >= layout.actionGap * 2, `quick action hierarchy at ${width}x${height}`);
      assert.ok(layout.normalGroupGap >= layout.actionGap * 2, `quick disclosure hierarchy at ${width}x${height}`);
      assert.ok(layout.heroToLabel > layout.labelToRail, `slider label groups with the rail at ${width}x${height}`);
      // Under 520 px, the whole shell scrolls and keeps a smaller section gap.
      assert.ok(layout.railToQuick >= layout.actionGap * 2, `slider labels and quick actions need separate space at ${width}x${height}`);
      assert.ok(Math.abs(layout.nowLabelLeft - layout.heroLeft) <= 1, `Now label is not aligned to the main blocks at ${width}x${height}`);
      assert.ok(Math.abs(layout.quickTitleLeft - layout.heroLeft) <= 1, `quick heading is not aligned to the main blocks at ${width}x${height}`);
      assert.ok(layout.cityTitleToCard <= 8, `city heading is too far from its cards at ${width}x${height}`);
      assert.ok(Math.abs(layout.deleteTop - layout.summaryTop) <= 1, `delete button top gap at ${width}x${height}`);
      assert.ok(Math.abs(layout.deleteBottom - layout.bandTop) <= 1, `delete button must stop at color band at ${width}x${height}`);
      assert.ok(Math.abs(layout.deleteRight - layout.summaryRight) <= 1, `delete button right gap at ${width}x${height}`);
      assert.ok(Math.abs(layout.bandLeft - layout.summaryLeft) <= 1 && Math.abs(layout.bandRight - layout.summaryRight) <= 1,
        `color band must span the card at ${width}x${height}`);
      assert.ok(layout.longStatusFits, `short day-shift status should be fully visible at ${width}x${height}`);
      if (width < 760 && height >= 520) {
        assert.ok(layout.quickToCities >= layout.cityTitleToCard * 2, `city section grouping at ${width}x${height}`);
        assert.ok(Math.abs(layout.cityTitleLeft - layout.addLeft) <= 1, `city heading grid at ${width}x${height}`);
        assert.ok(Math.abs(layout.nameTop - layout.timeTop) <= 1, `city name/time misaligned at ${width}x${height}`);
        assert.ok(layout.visibleCards >= (height >= 700 ? 3 : 2), `too few cities at ${width}x${height}`);
      }
      if (height < 520) assert.equal(layout.shellOverflow, 'auto');
      if (width >= 800 && height <= 600) assert.equal(layout.wide, 'flex');
      console.log(`${width}x${height}: ${layout.visibleCards} complete cities, list ${layout.cityHeight}px`);
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
