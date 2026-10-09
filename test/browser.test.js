'use strict';
// Browser end-to-end test: two real Chromium pages play every game. 3D boards
// are driven by clicking the projected screen position of a square/tile (each
// renderer exposes `#board.__test.screen(key)`), so raycast picking is covered.
const assert = require('assert');
const { chromium, devices } = require('playwright');
const { server } = require('../server');

const POLL = { polling: 100, timeout: 15000 };
const LABEL = { chess: '체스', go: '바둑', othello: '오델로', davinci: '다빈치 코드', louie: '루핑 루이', halligalli: '할리갈리', uno: '우노', gomoku: '오목', quoridor: '쿼리도', blokus: '블로커스', rummikub: '루미큐브', dobble: '도블' };

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
    await ctx.addInitScript(n => { localStorage.setItem('sjl-name', n); localStorage.setItem('sjl-rules-seen', 'all'); localStorage.setItem('sjl-mute', '1'); }, name);
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
    await host.locator('.gameCard').filter({ hasText: LABEL[gameId] }).first().click();
    if (gameId === 'go') await host.check('input[name=sz][value="9"]');
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
    for (const p of [host, guest]) {
      await p.bringToFront();
      // a finished game shows the result card, which has its own leave button
      if (await p.locator('#winLeave').count()) await p.click('#winLeave'); else await p.click('#leaveBtn');
      await p.waitForSelector('#lobby:not(.hidden)');
    }
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



  // gomoku: tengen
  code = await start('gomoku', host, guest);
  await click3d(host, 'sq:7,7');
  await guest.waitForFunction(() => document.querySelector('#panelExtra').innerText.includes('H8'), null, POLL);
  console.log(`  ✓ gomoku (${code}): stone placed on the 15x15 board`);
  await leave(host, guest);

  // quoridor: pawn step, then a wall from the other player
  code = await start('quoridor', host, guest);
  await click3d(host, 'sq:7,4');
  await guest.waitForFunction(() => /말 → e2/.test(document.querySelector('#panelExtra').innerText), null, POLL);
  await guest.bringToFront();
  await guest.click('button:has-text("가로 벽")');
  await click3d(guest, 'cross:6,3');
  await host.waitForFunction(() => /벽 \(가로\)/.test(document.querySelector('#panelExtra').innerText), null, POLL);
  console.log(`  ✓ quoridor (${code}): pawn moved and a wall slotted into a groove`);
  await leave(host, guest);

  // blokus: pick a piece from the tray and cover the corner
  code = await start('blokus', host, guest);
  await click3d(host, 'piece:V5');
  await click3d(host, 'sq:1,0');
  await guest.waitForFunction(() => /5칸 조각/.test(document.querySelector('#panelExtra').innerText), null, POLL);
  console.log(`  ✓ blokus (${code}): first piece placed on the blue corner`);
  await leave(host, guest);

  // rummikub: edit the draft (red bar for an invalid set), undo, then draw
  code = await start('rummikub', host, guest);
  await host.bringToFront();
  const rk = await host.evaluate(() => document.querySelector('#board').__test.rack());
  await click3d(host, 'tile:' + rk[0]);
  await click3d(host, 'newset');
  const invalid = await host.evaluate(() => document.querySelector('#status').innerText.includes('빨간 줄'));
  assert.ok(invalid, 'a one-tile set is flagged invalid');
  await host.click('button:has-text("되돌리기")');
  await host.click('button:has-text("1장 가져오기")');
  await guest.waitForFunction(() => /가져갔습니다/.test(document.querySelector('#panelExtra').innerText), null, POLL);
  console.log(`  ✓ rummikub (${code}): draft editing with live set checks, draw works`);
  await leave(host, guest);

  // dobble: click the symbol shared with the centre card
  code = await start('dobble', host, guest);
  await click3d(host, 'common');
  await guest.waitForFunction(() => /호스트: .+!/.test(document.querySelector('#panelExtra').innerText), null, POLL);
  console.log(`  ✓ dobble (${code}): spotted the shared symbol and took the centre card`);
  await leave(host, guest);

  // ---- a visitor's phone: open the invite link, tap to play, survive a reload
  {
    const pctx = await browser.newContext({ ...devices['iPhone 13'] });
    await pctx.addInitScript(() => { localStorage.setItem('sjl-name', '폰손님'); localStorage.setItem('sjl-rules-seen', 'all'); localStorage.setItem('sjl-mute', '1'); });
    const phone = await pctx.newPage();
    phone.on('pageerror', e => errors.push(`phone: ${e.message}`));
    await host.bringToFront();
    await host.locator('.gameCard').filter({ hasText: '체스' }).first().click();
    await host.click('#createBtn');
    await host.waitForSelector('#room:not(.hidden)');
    const pc = (await host.textContent('#roomCode')).trim();
    const qrOk = await host.evaluate(() => !!document.querySelector('.waiting .qr svg'));
    assert.ok(qrOk, 'waiting room shows a QR code');
    await phone.goto(url + '/?room=' + pc);                        // what the QR code opens
    await phone.waitForSelector('#room:not(.hidden)');
    await host.click('#readyBtn');
    await phone.click('#readyBtn');
    await phone.waitForSelector('#board canvas.stage3d', { state: 'attached', timeout: 90000 });
    await click3d(host, 'sq:6,4'); await click3d(host, 'sq:4,4');
    await phone.waitForFunction(() => document.querySelector('#panelExtra').innerText.includes('e4'), null, POLL);
    const tap = async key => {
      await phone.bringToFront(); await phone.waitForTimeout(80);
      const pt = await phone.evaluate(k => document.querySelector('#board').__test.screen(k), key);
      await phone.touchscreen.tap(pt.x, pt.y); await phone.waitForTimeout(300);
    };
    await tap('sq:1,4'); await tap('sq:3,4');
    await host.waitForFunction(() => document.querySelector('#panelExtra').innerText.includes('e5'), null, POLL);
    console.log(`  ✓ phone (${pc}): joined from the invite link and played e5 by touch`);
    await phone.reload();                                            // screen lock / refresh
    await phone.waitForSelector('#board canvas.stage3d', { state: 'attached', timeout: 90000 });
    await phone.waitForFunction(() => document.querySelector('#panelExtra').innerText.includes('e5'), null, POLL);
    const seatOk = await phone.evaluate(() => document.querySelector('#status').innerText.includes('나: 흑'));
    assert.ok(seatOk, 'phone is back in its own seat after reload');
    console.log('  ✓ phone reloaded and was put straight back into its seat');
    await phone.click('#leaveBtn');
    await host.bringToFront(); await host.click('#leaveBtn'); await host.waitForSelector('#lobby:not(.hidden)');
    await pctx.close();
  }

  await browser.close();
  server.close();
  assert.deepStrictEqual(errors, [], 'browser errors:\n' + errors.join('\n'));
  console.log('\nbrowser e2e: all checks passed.');
  process.exit(0);
})().catch(e => { console.error('✗', e); process.exit(1); });
