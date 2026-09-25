'use strict';
// Browser end-to-end test: two real Chromium pages play every game. 3D boards
// are driven by clicking the projected screen position of a square/tile (each
// renderer exposes `#board.__test.screen(key)`), so raycast picking is covered.
const assert = require('assert');
const { chromium } = require('playwright');
const { server } = require('../server');

const POLL = { polling: 100, timeout: 15000 };
const LABEL = { chess: '체스', go: '바둑', othello: '오델로', davinci: '다빈치 코드', louie: '루핑 루이', halligalli: '할리갈리', uno: '우노' };

(async () => {
  await new Promise(res => server.listen(0, res));
  const url = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
      // both players' windows must keep running while the other one is in front
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']
  });
  const errors = [];

  async function newPage(name) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    await ctx.addInitScript(n => localStorage.setItem('sjl-name', n), name);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
    await page.goto(url);
    await page.waitForSelector('#conn.on');
    return page;
  }
  const extra = p => p.evaluate(() => document.querySelector('#panelExtra').innerText);
  async function click3d(p, key) {
    await p.bringToFront();
    await p.waitForTimeout(80);
    const pt = await p.evaluate(k => document.querySelector('#board').__test.screen(k), key);
    assert.ok(pt, 'no screen point for ' + key);
    await p.mouse.click(pt.x, pt.y);
    await p.waitForTimeout(250);
  }
  async function start(gameId, host, guest) {
    await host.bringToFront();
    await host.locator('.gcard').filter({ hasText: LABEL[gameId] }).first().click();
    if (gameId === 'go') await host.selectOption('#optSize', '9');
    await host.click('#createBtn');
    await host.waitForSelector('#room:not(.hidden)');
    const code = (await host.textContent('#roomCode')).trim();
    await guest.fill('#joinCode', code);
    await guest.click('#joinBtn');
    await guest.waitForSelector('#room:not(.hidden)');
    await host.click('#readyBtn');
    await guest.click('#readyBtn');
    for (const pg of [host, guest]) {
      await pg.bringToFront();
      // The first scene compiles every shader; on software GL (CI) that can
      // take a while, so allow a generous timeout here.
      await pg.waitForSelector('#board canvas.stage3d', { state: 'attached', timeout: 90000 });
      await pg.waitForFunction(() => !!document.querySelector('#board canvas.stage3d').getContext('webgl2'), null, { polling: 100, timeout: 90000 });
    }
    return code;
  }
  async function leave(host, guest) {
    for (const p of [host, guest]) { await p.bringToFront(); await p.click('#leaveBtn'); await p.waitForSelector('#lobby:not(.hidden)'); }
  }

  const host = await newPage('호스트');
  const guest = await newPage('게스트');
  console.log('  ✓ both clients connected');

  // chess: e4 e5 by clicking 3D squares
  let code = await start('chess', host, guest);
  await click3d(host, 'sq:6,4'); await click3d(host, 'sq:4,4');
  await guest.waitForFunction(() => document.querySelector('#panelExtra').innerText.includes('e4'), null, POLL);
  await click3d(guest, 'sq:1,4'); await click3d(guest, 'sq:3,4');
  await host.waitForFunction(() => document.querySelector('#panelExtra').innerText.includes('e5'), null, POLL);
  console.log(`  ✓ chess (${code}): e4 e5 played by clicking the 3D board`);
  await leave(host, guest);

  // go 9x9: black then white stone
  code = await start('go', host, guest);
  await click3d(host, 'sq:2,2');
  await guest.waitForFunction(() => document.querySelector('#panelExtra').innerText.includes('C7'), null, POLL);
  await click3d(guest, 'sq:6,6');
  await host.waitForFunction(() => document.querySelector('#panelExtra').innerText.includes('G3'), null, POLL);
  console.log(`  ✓ go (${code}): stones placed at C7 and G3 via 3D picking`);
  await leave(host, guest);

  // othello: f5
  code = await start('othello', host, guest);
  await click3d(host, 'sq:4,5');
  await guest.waitForFunction(() => document.querySelector('#panelExtra').innerText.includes('f5'), null, POLL);
  console.log(`  ✓ othello (${code}): f5 placed, discs flipped on both screens`);
  await leave(host, guest);

  // da vinci: draw a colour, pick an opponent tile in 3D, guess
  code = await start('davinci', host, guest);
  await host.bringToFront();
  await host.click('.panelGuess button:has-text("검정 뽑기"), .panelGuess button:has-text("흰색 뽑기")');
  await host.waitForSelector('.panelGuess :text("상대의 비공개 타일")');
  await click3d(host, 'tile:1:0');
  await host.waitForSelector('.panelGuess .numGrid button');
  await host.click('.panelGuess .numGrid button >> nth=0');
  await guest.waitForFunction(() => /추측|적중/.test(document.querySelector('#panelExtra').innerText), null, POLL);
  console.log(`  ✓ davinci (${code}): drew by colour, picked a 3D tile, guessed`);
  await leave(host, guest);

  // loopin' louie: flick lever
  code = await start('louie', host, guest);
  await host.bringToFront();
  await host.waitForTimeout(3200);
  await host.keyboard.press('Space');
  await host.waitForTimeout(300);
  console.log(`  ✓ louie (${code}): 3D toy running, lever flicked`);
  await leave(host, guest);

  // halli galli: flip a card, opponent sees one face-up pile
  code = await start('halligalli', host, guest);
  await host.bringToFront();
  await host.click('button:has-text("카드 뒤집기")');
  await guest.waitForFunction(() => document.querySelector('#board').dataset.faceup === '1', null, POLL);
  console.log(`  ✓ halligalli (${code}): card flipped onto the table for everyone`);
  await leave(host, guest);

  // uno: 7 cards in hand, draw one
  code = await start('uno', host, guest);
  await host.bringToFront();
  const handBefore = Number(await host.evaluate(() => document.querySelector('#board').dataset.hand));
  assert.ok(handBefore >= 7, 'dealt a hand');
  const myTurn = await host.locator('button', { hasText: '카드 뽑기' }).isEnabled();
  const turnHolder = myTurn ? host : guest;
  await turnHolder.bringToFront();
  const drawBtn = turnHolder.locator('button', { hasText: '카드 뽑기' });
  if (await drawBtn.isEnabled()) {
    await drawBtn.click();
    await turnHolder.waitForFunction(() => /뽑았습니다/.test(document.querySelector('#panelExtra').innerText), null, POLL);
  }
  console.log(`  ✓ uno (${code}): hand of ${handBefore} rendered as 3D cards, draw works`);
  await leave(host, guest);

  await browser.close();
  server.close();
  assert.deepStrictEqual(errors, [], 'browser errors:\n' + errors.join('\n'));
  console.log('\nbrowser e2e: all checks passed.');
  process.exit(0);
})().catch(e => { console.error('✗', e); process.exit(1); });
