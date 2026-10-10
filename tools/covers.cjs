// Dev tool: render each game mid-play and save a 16:10 JPEG cover for the lobby.
// usage: node tools/covers.cjs [gameId ...]
const { chromium } = require('playwright');
const path = require('path');
const { server } = require('../server');
const OUT = path.join(__dirname, '..', 'public', 'img', 'covers');
const LABEL = { chess: '체스', go: '바둑', othello: '오델로', davinci: '다빈치', louie: '루핑', halligalli: '할리갈리', uno: '우노', gomoku: '오목', quoridor: '쿼리도', blokus: '블로커스', rummikub: '루미큐브', dobble: '도블', splendor: '스플렌더', onecard: '원카드', jenga: '젠가', penguin: '펭귄', yacht: '요트', pirate: '통아저씨', sixnimmt: '젝스님트', marble: '부루마블' };
const only = process.argv.slice(2);
(async () => {
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  async function page(n) {
    const c = await b.newContext({ viewport: { width: 1280, height: 1000 } });
    await c.addInitScript(x => { localStorage.setItem('sjl-name', x); localStorage.setItem('sjl-rules-seen', 'all'); localStorage.setItem('sjl-mute', '1'); }, n);
    const p = await c.newPage(); await p.goto(url); await p.waitForSelector('#conn.on'); return p;
  }
  const ps = [await page('서준'), await page('민지'), await page('도윤'), await page('하린')];
  const click = async (p, k) => { await p.bringToFront(); await p.waitForTimeout(60); const pt = await p.evaluate(x => document.querySelector('#board').__test.screen(x), k); if (pt) await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(650); };
  async function run(game, np, play, opt) {
    if (only.length && !only.includes(game)) return;
    const pl = ps.slice(0, np), host = pl[0];
    await host.bringToFront();
    await host.locator('.gameCard').filter({ hasText: LABEL[game] }).first().click();
    if (opt) await opt(host);
    await host.click('#createBtn'); await host.waitForSelector('#room:not(.hidden)');
    const code = (await host.textContent('#roomCode')).trim();
    for (const g of pl.slice(1)) { await g.fill('#joinCode', code); await g.click('#joinBtn'); await g.waitForSelector('#room:not(.hidden)'); }
    for (const g of pl) await g.click('#readyBtn');
    await host.waitForSelector('#board canvas.stage3d', { state: 'attached', timeout: 90000 });
    await host.waitForTimeout(1500);
    if (play) await play(pl);
    await host.bringToFront();
    await host.evaluate(() => { document.querySelector('.overlayWin')?.remove(); document.querySelectorAll('.hud,.toastIn').forEach(e => e.style.display = 'none'); });
    await host.waitForTimeout(1300);
    const bb = await host.locator('#board canvas.stage3d').boundingBox();
    const h = Math.min(bb.height, bb.width / 1.6);
    await host.screenshot({ path: path.join(OUT, game + '.jpg'), type: 'jpeg', quality: 78,
      clip: { x: bb.x, y: bb.y + (bb.height - h) / 2, width: bb.width, height: h } });
    for (const g of pl) { await g.bringToFront(); await g.evaluate(() => document.querySelector('.overlayWin')?.remove()); await g.evaluate(() => document.querySelector('#leaveBtn').click()); await g.waitForSelector('#lobby:not(.hidden)'); }
    console.log('cover', game);
  }
  await run('chess', 2, async ([a, c]) => {
    for (const [p, m] of [[a, '6,4 4,4'], [c, '1,4 3,4'], [a, '7,6 5,5'], [c, '0,1 2,2'], [a, '7,5 4,2'], [c, '0,6 2,5'], [a, '6,3 5,3'], [c, '1,3 2,3']]) {
      const [x, y] = m.split(' '); await click(p, 'sq:' + x); await click(p, 'sq:' + y);
    }
  });
  await run('go', 2, async ([a, c]) => {
    const mv = [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4], [3, 5], [5, 3], [4, 6], [3, 3], [5, 5], [2, 4], [6, 4]];
    for (let i = 0; i < mv.length; i++) await click(i % 2 ? c : a, 'sq:' + mv[i].join(','));
  }, async h => { await h.check('input[name=sz][value="9"]'); });
  await run('othello', 2, async ([a, c]) => {
    const mv = [[4, 5], [5, 3], [2, 2], [2, 3], [3, 2], [3, 5], [4, 2], [2, 1], [1, 2], [2, 4], [5, 5], [5, 4]];
    for (let i = 0; i < mv.length; i++) await click(i % 2 ? c : a, 'sq:' + mv[i].join(','));
  });
  await run('davinci', 3, async ([a]) => { await a.bringToFront(); await a.click('.panelGuess button:has-text("흰색 뽑기")'); await a.waitForTimeout(900); });
  await run('halligalli', 4, async pl => {
    for (let k = 0; k < 8; k++) { const p = pl[k % 4]; await p.bringToFront(); await p.click('button:has-text("카드 뒤집기")').catch(() => {}); await p.waitForTimeout(400); }
  });
  await run('uno', 4, null);
  await run('louie', 4, async () => {});
  await run('gomoku', 2, async ([a, c]) => {
    const mv = [[7, 7], [7, 8], [6, 6], [8, 8], [5, 5], [6, 8], [8, 6], [5, 8], [6, 7], [9, 9], [8, 7], [4, 8]];
    for (let i = 0; i < mv.length; i++) await click(i % 2 ? c : a, 'sq:' + mv[i].join(','));
  });
  await run('quoridor', 2, async ([a, c]) => {
    const wall = async (p, o, x) => { await p.bringToFront(); await p.click(`button:has-text("${o === 'h' ? '가로 벽' : '세로 벽'}")`); await click(p, 'cross:' + x); };
    await click(a, 'sq:7,4');
    await wall(c, 'h', '5,3');
    await wall(a, 'v', '1,4');
    await click(c, 'sq:1,4');
    await wall(a, 'h', '2,2');
    await wall(c, 'v', '5,5');
    await click(a, 'sq:6,4');
  });
  await run('blokus', 2, async ([a, c]) => {
    const seq = [[a, 'V5', '1,0'], [c, 'O4', '0,18'], [a, 'O4', '18,18'], [c, 'O4', '18,0'],
      [a, 'W5', '3,3'], [c, 'I4', '3,17'], [a, 'I5', '16,17'], [c, 'T5', '16,2'], [a, 'L5', '5,6']];
    for (const [p, id, sq] of seq) { await click(p, 'piece:' + id); await click(p, 'sq:' + sq); await p.waitForTimeout(300); }
  });
  await run('rummikub', 3, async ([a]) => {
    const rk = await a.evaluate(() => document.querySelector('#board').__test.rack());
    await click(a, 'tile:' + rk[0]); await click(a, 'newset');
    await click(a, 'tile:' + rk[1]); await click(a, 'slot:0,1');
    await click(a, 'tile:' + rk[2]); await click(a, 'slot:0,2');
    await click(a, 'tile:' + rk[7]); await click(a, 'newset');
    await click(a, 'tile:' + rk[9]);
  });
  await run('dobble', 4, async ([a, b]) => { await click(b, 'common'); await b.waitForTimeout(500); });

  await run('splendor', 2, async ([a, c]) => {
    const take = async (p, gems) => { for (const g of gems) await click(p, 'bank:' + g); await p.bringToFront(); await p.click('button:has-text("가져오기")'); await p.waitForTimeout(300); };
    await take(a, ['w', 'u', 'g']); await take(c, ['r', 'k', 'w']); await take(a, ['r', 'k', 'u']);
  });

  await run('onecard', 3, async pl => {
    for (let k = 0; k < 6; k++) for (const p of pl) {
      const st = await p.evaluate(() => document.querySelector('#board').__test.state());
      if (st.turn !== st.mySeat || st.over) continue;
      const i = st.hand.findIndex(c => c.playable && c.rank !== 7);
      if (i >= 0) await click(p, 'hand:' + i); else { await p.bringToFront(); await p.click('.controls button.primary'); await p.waitForTimeout(300); }
    }
  });
  await run('jenga', 2, async ([a, c]) => {
    for (const [p, l, s] of [[a, 4, 1], [c, 7, 1], [a, 10, 1]]) {
      await p.bringToFront(); await p.evaluate(([l, s]) => document.querySelector('#board').__test.pick(l, s), [l, s]);
      await p.waitForTimeout(300); await p.evaluate(() => document.querySelector('#board').__test.pullSteady(1)); await p.waitForTimeout(1800);
      if (await p.evaluate(() => document.querySelector('#board').__test.state().over)) break;
    }
  });
  await run('penguin', 2, async ([a, c]) => {
    for (const [p, k] of [[a, '0,0'], [c, '6,6'], [a, '1,3'], [c, '0,5'], [a, '5,1'], [c, '2,6']]) { await click(p, 'ice:' + k); await p.waitForTimeout(900); }
  });

  await run('yacht', 2, async ([a]) => {
    await a.bringToFront(); await a.click('.controls button:has-text("굴리기")'); await a.waitForTimeout(2200);
    await click(a, 'die:1'); await click(a, 'die:3');
  });
  await run('pirate', 3, async pl => {
    for (const [k, i] of [[0, 0], [1, 6], [2, 1], [0, 7]]) {
      const p = pl[k]; const st = await p.evaluate(() => document.querySelector('#board').__test.state());
      if (st.over || st.turn !== k) break;
      await p.evaluate(i => document.querySelector('#board').__test.face(i), i); await p.waitForTimeout(150); await click(p, 'slot:' + i); await p.waitForTimeout(700);
      if (await p.evaluate(() => document.querySelector('#board').__test.state().over)) break;
    }
    await pl[0].evaluate(() => document.querySelector('#board').__test.face(3));
  });
  await run('sixnimmt', 3, async pl => {
    for (let r = 0; r < 2; r++) {
      for (const p of pl) { const st = await p.evaluate(() => document.querySelector('#board').__test.state()); if (st.phase === 'choose' && st.myChoice == null) await click(p, 'card:' + st.myHand[st.myHand.length - 1]); }
      for (let k = 0; k < 20; k++) {
        await pl[0].waitForTimeout(500);
        for (const p of pl) { const st = await p.evaluate(() => document.querySelector('#board').__test.state()); const busy = await p.evaluate(() => document.querySelector('#board').__test.busy()); if (st.phase === 'pickRow' && st.picker === st.mySeat && !busy) await click(p, 'row:0'); }
        const st0 = await pl[0].evaluate(() => document.querySelector('#board').__test.state()); const b0 = await pl[0].evaluate(() => document.querySelector('#board').__test.busy());
        if (st0.phase === 'choose' && !b0) break;
      }
    }
  });
  await run('marble', 3, async pl => {
    for (let k = 0; k < 9; k++) {
      for (let t = 0; t < 40; t++) { if (!(await pl[0].evaluate(() => document.querySelector('#board').__test.busy()))) break; await pl[0].waitForTimeout(250); }
      const st = await pl[0].evaluate(() => document.querySelector('#board').__test.state()); if (st.over) break;
      const p = pl[st.turn]; await p.bringToFront(); await p.waitForTimeout(200);
      const pp = st.players[st.turn];
      if (st.phase === 'roll') { if (pp.fly) await click(p, 'tile:5'); else await p.click('.controls button:has-text("굴리기")'); }
      else if (st.phase === 'buy') await p.click('.controls button:has-text("사기")');
      else if (st.phase === 'build') await p.click('.controls button:has-text("짓기")');
      await p.waitForTimeout(500);
    }
    for (let t = 0; t < 40; t++) { if (!(await pl[0].evaluate(() => document.querySelector('#board').__test.busy()))) break; await pl[0].waitForTimeout(250); }
  });

  await b.close(); server.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
