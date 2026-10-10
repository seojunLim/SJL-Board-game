// Dev tool: start a game with N players, run a scripted sequence, screenshot.
// usage: node tools/play.cjs <outPng> <gameId> <players> <script.cjs|-> [laptop|phone]
const { chromium, devices } = require('playwright');
const path = require('path');
const { server } = require('../server');
const LABEL = { chess: '체스', go: '바둑', othello: '오델로', davinci: '다빈치', louie: '루핑', halligalli: '할리갈리', uno: '우노', gomoku: '오목', quoridor: '쿼리도', blokus: '블로커스', rummikub: '루미큐브', dobble: '도블', splendor: '스플렌더', onecard: '원카드', jenga: '젠가', penguin: '펭귄', yacht: '요트', pirate: '통아저씨', sixnimmt: '젝스님트', marble: '부루마블' };
const [out, game, np = '2', script = '-', kind = 'laptop'] = process.argv.slice(2);
(async () => {
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const errs = [];
  async function page(n, i) {
    const o = i === 0 && kind === 'phone' ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 960 } };
    delete o.defaultBrowserType;
    const c = await b.newContext(o);
    await c.addInitScript(x => { localStorage.setItem('sjl-name', x); localStorage.setItem('sjl-rules-seen', 'all'); localStorage.setItem('sjl-mute', '1'); }, n);
    const p = await c.newPage();
    p.on('pageerror', e => errs.push(n + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(n + ' c: ' + m.text()); });
    await p.goto(url); await p.waitForSelector('#conn.on'); return p;
  }
  const ps = [];
  for (let i = 0; i < +np; i++) ps.push(await page(['서준', '민지', '도윤', '하린'][i], i));
  const host = ps[0];
  await host.locator('.gameCard').filter({ hasText: LABEL[game] }).first().click();
  await host.click('#createBtn'); await host.waitForSelector('#room:not(.hidden)');
  const code = (await host.textContent('#roomCode')).trim();
  for (const g of ps.slice(1)) { await g.fill('#joinCode', code); await g.click('#joinBtn'); await g.waitForSelector('#room:not(.hidden)'); }
  for (const g of ps) await g.click('#readyBtn');
  await host.waitForSelector('#board canvas.stage3d', { state: 'attached', timeout: 90000 });
  await host.waitForTimeout(1500);
  const helpers = {
    click3d: async (p, k, touch) => { await p.bringToFront(); await p.waitForTimeout(60); const pt = await p.evaluate(x => document.querySelector('#board').__test.screen(x), k); if (!pt) throw new Error('no point ' + k); if (touch) await p.touchscreen.tap(pt.x, pt.y); else await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(450); },
    hover3d: async (p, k) => { const pt = await p.evaluate(x => document.querySelector('#board').__test.screen(x), k); await p.mouse.move(pt.x, pt.y); await p.waitForTimeout(250); },
    log: async p => p.evaluate(() => document.querySelector('#panelExtra').innerText.replace(/\n/g, ' | ')),
    toast: async p => p.evaluate(() => { const t = document.querySelector('#toast'); return t.classList.contains('hidden') ? '' : t.textContent; })
  };
  if (script !== '-') await require(path.resolve(script))(ps, helpers);
  await host.bringToFront(); await host.waitForTimeout(1200);
  await host.screenshot({ path: out });
  console.log('shot', out, errs.length ? '\nERRORS:\n' + errs.join('\n') : '');
  await b.close(); server.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
