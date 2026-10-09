// Real Chromium layout checks for the shared Windows/macOS widget UI.
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const browser = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (!fs.existsSync(browser)) {
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
    for (const [width, height] of [[430, 720], [360, 640], [430, 500], [900, 550]]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor:1, mobile:false});
      await send('Page.navigate', {url});
      await new Promise(resolve => setTimeout(resolve, 500));
      await send('Runtime.evaluate', {expression:`
        config.timezones = ['Europe/Moscow','Asia/Vladivostok','Asia/Yekaterinburg','Asia/Almaty','America/New_York'];
        meetingMode = true;
        meetingSelected = new Set(config.timezones);
        render();
      `});
      await new Promise(resolve => setTimeout(resolve, 350));
      const expression = `(() => {
        const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
        const city = document.querySelector('.cities');
        const cityRect = city?.getBoundingClientRect();
        const cards = [...document.querySelectorAll('.cities .card')];
        return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
          cityHeight:cityRect?.height,visibleCards:cards.filter(card => card.getBoundingClientRect().bottom <= cityRect.bottom + 1).length,
          nameTop:rect('.city-name')?.top,timeTop:rect('.city-time')?.top,
          heroColumns:getComputedStyle(document.querySelector('.hero')).gridTemplateColumns,
          heroWidth:rect('.hero')?.width,heroHeight:rect('.hero')?.height,summaryHeight:document.querySelector('.base-summary')?.scrollHeight,clockWidth:rect('.clock')?.width,savedWidth:rect('.saved-panel')?.width,
          clockText:document.querySelector('.clock-time')?.textContent,clockTextWidth:rect('.clock-time')?.width,clockTextScroll:document.querySelector('.clock-time')?.scrollWidth,
          wide: getComputedStyle(document.querySelector('.main-controls')).display,
          shellOverflow:getComputedStyle(document.querySelector('.shell')).overflowY,
          cityOverflow:getComputedStyle(city).overflowY};
      })()`;
      const evaluated = await send('Runtime.evaluate', {expression, returnByValue:true});
      if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.text);
      const layout = evaluated.result.value;
      console.log(`${width}x${height}: ${JSON.stringify(layout)}`);
      assert.equal(layout.scrollWidth, width, `horizontal overflow at ${width}x${height}`);
      if (width < 760 && height >= 520) {
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
