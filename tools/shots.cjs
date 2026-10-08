// Dev tool: screenshot the site on a laptop and a phone.
// usage: node tools/shots.cjs <outDir> <gameId|lobby> [players=2] [phone|laptop]
const { chromium, devices } = require('playwright');
const { server } = require('../server');
const [outDir, game = 'lobby', np = '2', kind = 'phone'] = process.argv.slice(2);
const LABEL = { chess: '체스', go: '바둑', othello: '오델로', davinci: '다빈치', louie: '루핑', halligalli: '할리갈리', uno: '우노' };
(async () => {
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const errs = [];
  const ctxOpts = i => (i === 0 && kind === 'phone') ? { ...devices['iPhone 13'], defaultBrowserType: undefined } : { viewport: { width: 1280, height: 860 } };
  async function page(n, i) {
    const o = ctxOpts(i); delete o.defaultBrowserType;
    const c = await b.newContext(o);
    await c.addInitScript(([x, skip]) => { localStorage.setItem('sjl-name', x); if (skip) localStorage.setItem('sjl-rules-seen', 'all'); }, [n, !!process.env.SKIP_RULES]);
    const p = await c.newPage();
    p.on('pageerror', e => errs.push(n + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(n + ' c: ' + m.text()); });
    await p.goto(url); await p.waitForSelector('#conn.on');
    return p;
  }
  const ps = [];
  for (let i = 0; i < +np; i++) ps.push(await page(['서준', '민지', '도윤', '하린'][i], i));
  const host = ps[0];
  if (game !== 'lobby') {
    await host.locator('.gameCard').filter({ hasText: LABEL[game] }).first().click();
    if (await host.locator('#createBtn').isVisible().catch(() => false)) await host.click('#createBtn');
    await host.waitForSelector('#room:not(.hidden)');
    await host.screenshot({ path: `${outDir}/${kind}-${game}-wait.png`, fullPage: true });
    const code = (await host.textContent('#roomCode')).trim();
    for (const g of ps.slice(1)) { await g.fill('#joinCode', code); await g.click('#joinBtn'); await g.waitForSelector('#room:not(.hidden)'); }
    for (const g of ps) { await g.bringToFront(); await g.evaluate(() => document.querySelector('.rulesModal .closeRules')?.click()); await g.click('#readyBtn'); }
    await host.waitForSelector('#board canvas', { state: 'attached', timeout: 90000 });
    await host.bringToFront(); await host.waitForTimeout(2500);
  }
  await host.screenshot({ path: `${outDir}/${kind}-${game}.png`, fullPage: true });
  console.log('ok', errs.length ? errs : '');
  await b.close(); server.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
