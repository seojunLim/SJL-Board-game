'use strict';
// Browser smoke test: drives two real pages through a full Othello game and
// checks every game's renderer boots without console errors.
const assert = require('assert');
const { chromium } = require('playwright');
const { server } = require('../server');

const GAMES = ['chess', 'go', 'othello', 'davinci', 'louie', 'halligalli'];

(async () => {
  await new Promise(res => server.listen(0, res));
  const url = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [];

  async function newPage(name) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(n => localStorage.setItem('sjl-name', n), name);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
    await page.goto(url);
    await page.waitForSelector('#conn.on');
    return page;
  }

  const host = await newPage('호스트');
  const guest = await newPage('게스트');
  console.log('  ✓ both clients connected');

  for (const gameId of GAMES) {
    const card = host.locator('.gcard').filter({ hasText: gameLabel(gameId) }).first();
    await card.click();
    await host.click('#createBtn');
    await host.waitForSelector('#room:not(.hidden)');
    const code = (await host.textContent('#roomCode')).trim();

    await guest.fill('#joinCode', code);
    await guest.click('#joinBtn');
    await guest.waitForSelector('#room:not(.hidden)');

    await host.click('#readyBtn');
    await guest.click('#readyBtn');
    await host.waitForSelector('#board *', { timeout: 8000 });
    await guest.waitForSelector('#board *', { timeout: 8000 });
    console.log(`  ✓ ${gameId}: room ${code} started and both boards rendered`);

    if (gameId === 'othello') {
      await host.locator('.othello .cell').nth(2 * 8 + 3).click();
      await guest.waitForFunction(() => document.querySelectorAll('.othello .disc.b').length === 4);
      console.log('  ✓ othello: a real move rendered on the opponent screen');
    }
    if (gameId === 'chess') {
      await host.locator('.chessboard .sq').nth(6 * 8 + 4).click();
      await host.waitForSelector('.chessboard .sq .hint');
      await host.locator('.chessboard .sq').nth(4 * 8 + 4).click();
      await guest.waitForFunction(() => document.querySelector('#panelExtra').textContent.includes('e4'));
      console.log('  ✓ chess: e4 played and shown in the move list');
    }
    if (gameId === 'halligalli') {
      await host.click('button.primary:has-text("카드 뒤집기")');
      await guest.waitForFunction(() => document.querySelectorAll('.hgSeat .card:not(.empty)').length >= 1);
      console.log('  ✓ halligalli: flipped card visible to everyone');
    }
    if (gameId === 'louie') {
      await host.waitForFunction(() => document.querySelector('.louieWrap canvas').width > 0);
      console.log('  ✓ louie: animation canvas is live');
    }

    await host.click('#leaveBtn');
    await guest.click('#leaveBtn');
    await host.waitForSelector('#lobby:not(.hidden)');
    await guest.waitForSelector('#lobby:not(.hidden)');
  }

  await browser.close();
  server.close();
  assert.deepStrictEqual(errors, [], 'no browser errors');
  console.log('\nbrowser e2e: all checks passed.');
  process.exit(0);
})().catch(e => { console.error('✗', e); process.exit(1); });

function gameLabel(id) {
  return { chess: '체스', go: '바둑', othello: '오델로', davinci: '다빈치 코드', louie: '루핑 루이', halligalli: '할리갈리' }[id];
}
