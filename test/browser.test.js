'use strict';
// Browser smoke test: drives two real pages through each game and checks the
// board renders (3D canvas or DOM) with no console errors.
const assert = require('assert');
const { chromium } = require('playwright');
const { server } = require('../server');

const GAMES = ['chess', 'go', 'othello', 'davinci', 'louie', 'halligalli', 'uno'];
const THREE_D = new Set(['chess', 'go', 'othello']);
const LABEL = { chess: '체스', go: '바둑', othello: '오델로', davinci: '다빈치 코드', louie: '루핑 루이', halligalli: '할리갈리', uno: '우노' };

(async () => {
  await new Promise(res => server.listen(0, res));
  const url = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
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
    await host.locator('.gcard').filter({ hasText: LABEL[gameId] }).first().click();
    await host.click('#createBtn');
    await host.waitForSelector('#room:not(.hidden)');
    const code = (await host.textContent('#roomCode')).trim();
    await guest.fill('#joinCode', code);
    await guest.click('#joinBtn');
    await guest.waitForSelector('#room:not(.hidden)');
    await host.click('#readyBtn');
    await guest.click('#readyBtn');

    if (THREE_D.has(gameId)) {
      for (const pg of [host, guest]) {
        await pg.waitForSelector('#board canvas', { timeout: 10000 });
        await pg.waitForFunction(() => {
          const c = document.querySelector('#board canvas');
          if (!c || !c.width) return false;
          const gl = c.getContext('webgl2') || c.getContext('webgl');
          return !!gl;                       // context created => Stage booted
        }, { timeout: 10000 });
      }
      console.log(`  ✓ ${gameId}: 3D board rendered in a WebGL canvas (room ${code})`);
    } else {
      await host.waitForSelector('#board *', { timeout: 8000 });
      await guest.waitForSelector('#board *', { timeout: 8000 });
      console.log(`  ✓ ${gameId}: board rendered (room ${code})`);
    }

    if (gameId === 'halligalli') {
      await host.click('button.primary:has-text("카드 뒤집기")');
      await guest.waitForFunction(() => document.querySelectorAll('.hgSeat .card:not(.empty)').length >= 1);
      console.log('  ✓ halligalli: flipped card visible to everyone');
    }
    if (gameId === 'davinci') {
      await host.waitForSelector('.dvRow', { timeout: 8000 });
      console.log('  ✓ davinci: tile rows rendered');
    }
    if (gameId === 'uno') {
      await host.waitForFunction(() => document.querySelectorAll('.unoHand .ucard').length === 7);
      await host.waitForSelector('.topCard .sym');
      // host is seat 0 and starts; draw one card and check the log reacts
      await host.click('.drawPile');
      await host.waitForFunction(() => /뽑았습니다|넘겼습니다|:/.test(document.querySelector('#panelExtra').textContent));
      console.log('  ✓ uno: hand of 7, discard shown, draw works');
    }

    await host.click('#leaveBtn');
    await guest.click('#leaveBtn');
    await host.waitForSelector('#lobby:not(.hidden)');
    await guest.waitForSelector('#lobby:not(.hidden)');
  }

  await browser.close();
  server.close();
  assert.deepStrictEqual(errors, [], 'browser errors:\n' + errors.join('\n'));
  console.log('\nbrowser e2e: all checks passed.');
  process.exit(0);
})().catch(e => { console.error('✗', e); process.exit(1); });
