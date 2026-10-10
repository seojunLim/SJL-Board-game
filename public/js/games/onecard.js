import { paintedTexture, roundRect } from '../three3d/textures.js';
import { cardTable } from './uno.js';

// 원카드 on the shared card table, with a classic French-suited deck drawn
// on canvas: pips laid out like a real deck, framed court cards and jokers.

const RED = '#c8102e', BLACK = '#111';
const SUIT_COLOR = { s: BLACK, c: BLACK, h: RED, d: RED };
const RANK = r => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[r] || String(r);

function suitPath(g, x, y, s, suit) {
  g.save(); g.translate(x, y); g.scale(s / 100, s / 100);
  g.beginPath();
  if (suit === 'd') {
    g.moveTo(0, -50); g.quadraticCurveTo(20, -20, 38, 0); g.quadraticCurveTo(20, 20, 0, 50);
    g.quadraticCurveTo(-20, 20, -38, 0); g.quadraticCurveTo(-20, -20, 0, -50);
  } else if (suit === 'h') {
    g.moveTo(0, 46);
    g.bezierCurveTo(-30, 18, -50, 2, -48, -20); g.bezierCurveTo(-46, -46, -10, -52, 0, -24);
    g.bezierCurveTo(10, -52, 46, -46, 48, -20); g.bezierCurveTo(50, 2, 30, 18, 0, 46);
  } else if (suit === 's') {
    g.moveTo(0, -50);
    g.bezierCurveTo(-30, -22, -50, -6, -48, 14); g.bezierCurveTo(-46, 38, -14, 42, -4, 20);
    g.quadraticCurveTo(-6, 40, -20, 50); g.lineTo(20, 50); g.quadraticCurveTo(6, 40, 4, 20);
    g.bezierCurveTo(14, 42, 46, 38, 48, 14); g.bezierCurveTo(50, -6, 30, -22, 0, -50);
  } else {
    g.arc(0, -24, 22, 0, Math.PI * 2);
    g.moveTo(-2, 8); g.arc(-24, 8, 22, 0, Math.PI * 2);
    g.moveTo(46, 8); g.arc(24, 8, 22, 0, Math.PI * 2);
    g.moveTo(-5, 10); g.quadraticCurveTo(-6, 40, -20, 50); g.lineTo(20, 50); g.quadraticCurveTo(6, 40, 5, 10); g.closePath();
  }
  g.fillStyle = SUIT_COLOR[suit]; g.fill();
  g.restore();
}

const PIPS = (() => {
  const L = 0.28, M = 0.5, R = 0.72;
  return {
    2: [[M, .2], [M, .8]], 3: [[M, .2], [M, .5], [M, .8]],
    4: [[L, .2], [R, .2], [L, .8], [R, .8]], 5: [[L, .2], [R, .2], [M, .5], [L, .8], [R, .8]],
    6: [[L, .2], [R, .2], [L, .5], [R, .5], [L, .8], [R, .8]],
    7: [[L, .2], [R, .2], [M, .35], [L, .5], [R, .5], [L, .8], [R, .8]],
    8: [[L, .2], [R, .2], [M, .35], [L, .5], [R, .5], [M, .65], [L, .8], [R, .8]],
    9: [[L, .2], [R, .2], [L, .4], [R, .4], [M, .5], [L, .6], [R, .6], [L, .8], [R, .8]],
    10: [[L, .2], [R, .2], [M, .3], [L, .4], [R, .4], [L, .6], [R, .6], [M, .7], [L, .8], [R, .8]]
  };
})();

function faceTexture(card) {
  const key = card.joker ? 'oc-joker-' + card.joker : `oc-${card.suit}${card.rank}`;
  return paintedTexture(key, 512, 794, (g, W, H) => {
    g.fillStyle = '#fdfcf7'; roundRect(g, 0, 0, W, H, 40); g.fill();
    g.strokeStyle = '#d9d4c7'; g.lineWidth = 6; roundRect(g, 3, 3, W - 6, H - 6, 38); g.stroke();
    if (card.joker) {
      const col = card.joker === 'c' ? RED : BLACK;
      g.save(); g.beginPath(); roundRect(g, 70, 110, W - 140, H - 220, 20); g.clip();
      if (card.joker === 'c') {
        const grd = g.createLinearGradient(0, 110, 0, H - 110);
        ['#ff4d4d', '#ffb02e', '#ffe14d', '#3ecf6b', '#3a8bff', '#a35bff'].forEach((c, i, a) => grd.addColorStop(i / (a.length - 1), c));
        g.fillStyle = grd;
      } else g.fillStyle = '#e9e6dd';
      g.fillRect(0, 0, W, H); g.restore();
      g.font = '230px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🃏', W / 2, H / 2 + 10);
      g.fillStyle = col; g.font = '900 52px Georgia,serif';
      [...'JOKER'].forEach((ch, i) => { g.fillText(ch, 40, 70 + i * 54); g.save(); g.translate(W - 40, H - 70 - i * 54); g.rotate(Math.PI); g.fillText(ch, 0, 0); g.restore(); });
      return;
    }
    const col = SUIT_COLOR[card.suit];
    const corner = (rot) => {
      g.save(); if (rot) { g.translate(W, H); g.rotate(Math.PI); }
      g.fillStyle = col; g.font = `900 ${card.rank === 10 ? 74 : 86}px Georgia,"Times New Roman",serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(RANK(card.rank), 58, 70);
      suitPath(g, 58, 140, 52, card.suit);
      g.restore();
    };
    corner(false); corner(true);
    if (card.rank === 1) {
      suitPath(g, W / 2, H / 2, card.suit === 's' ? 260 : 190, card.suit);
      if (card.suit === 's') { g.strokeStyle = '#b8932f'; g.lineWidth = 6; g.beginPath(); g.ellipse(W / 2, H / 2, 170, 190, 0, 0, Math.PI * 2); g.stroke(); }
    } else if (card.rank <= 10) {
      for (const [px, py] of PIPS[card.rank]) {
        const y = 110 + py * (H - 220);
        const xx = 130 + (px - 0.28) / 0.44 * (W - 260);
        g.save();
        if (py > 0.5) { g.translate(xx, y); g.rotate(Math.PI); suitPath(g, 0, 0, 92, card.suit); }
        else suitPath(g, xx, y, 92, card.suit);
        g.restore();
      }
    } else {
      // court card: framed panel, mirrored halves, big letter + crown
      const fx = 110, fy = 120, fw = W - 220, fh = H - 240;
      const tint = { 11: '#2f6fbf', 12: '#c8102e', 13: '#d9a520' }[card.rank];
      g.fillStyle = '#f4e9cf'; g.fillRect(fx, fy, fw, fh);
      for (const half of [0, 1]) {
        g.save();
        if (half) { g.translate(W, H); g.rotate(Math.PI); }
        g.fillStyle = tint; g.globalAlpha = 0.85;
        g.beginPath(); g.moveTo(fx, fy + fh / 2); g.lineTo(fx + fw * 0.2, fy + fh * 0.25); g.lineTo(fx + fw * 0.8, fy + fh * 0.25); g.lineTo(fx + fw, fy + fh / 2); g.closePath(); g.fill();
        g.globalAlpha = 1;
        g.fillStyle = '#f1c27d'; g.beginPath(); g.arc(W / 2, fy + fh * 0.2, 54, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#d9a520';
        g.beginPath(); g.moveTo(W / 2 - 56, fy + fh * 0.12); g.lineTo(W / 2 - 40, fy + 22); g.lineTo(W / 2 - 14, fy + fh * 0.08); g.lineTo(W / 2, fy + 10); g.lineTo(W / 2 + 14, fy + fh * 0.08); g.lineTo(W / 2 + 40, fy + 22); g.lineTo(W / 2 + 56, fy + fh * 0.12); g.closePath(); g.fill();
        g.fillStyle = '#222'; g.beginPath(); g.arc(W / 2 - 18, fy + fh * 0.2, 6, 0, 7); g.arc(W / 2 + 18, fy + fh * 0.2, 6, 0, 7); g.fill();
        suitPath(g, fx + 50, fy + fh * 0.4, 60, card.suit);
        g.restore();
      }
      g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(fx, fy, fw, fh);
      g.fillStyle = col; g.font = '900 120px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.strokeStyle = '#fdfcf7'; g.lineWidth = 10; g.strokeText(RANK(card.rank), W / 2, H / 2); g.fillText(RANK(card.rank), W / 2, H / 2);
    }
  });
}

function backTexture() {
  return paintedTexture('oc-back', 512, 794, (g, W, H) => {
    g.fillStyle = '#fdfcf7'; roundRect(g, 0, 0, W, H, 40); g.fill();
    g.fillStyle = '#1d3f8f'; roundRect(g, 26, 26, W - 52, H - 52, 26); g.fill();
    g.save(); g.beginPath(); roundRect(g, 40, 40, W - 80, H - 80, 20); g.clip();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 4;
    for (let i = -H; i < W + H; i += 28) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); g.beginPath(); g.moveTo(i, H); g.lineTo(i + H, 0); g.stroke(); }
    g.restore();
    g.strokeStyle = '#fdfcf7'; g.lineWidth = 8; roundRect(g, 40, 40, W - 80, H - 80, 20); g.stroke();
    g.fillStyle = '#fdfcf7'; g.beginPath(); g.ellipse(W / 2, H / 2, 120, 90, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1d3f8f'; g.font = '900 64px "Noto Sans KR",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SJL', W / 2, H / 2 + 4);
  });
}

const SUITS_KO = { s: '스페이드 ♠', h: '하트 ♥', d: '다이아 ♦', c: '클로버 ♣' };
export default function onecard(ctx) {
  return cardTable(ctx, {
    face: faceTexture, back: backTexture,
    hex: { s: 0x6d7cff, h: 0xe0304a, d: 0xff8a2a, c: 0x2fbf6a },
    ko: SUITS_KO,
    icon: { s: '♠', h: '♥', d: '♦', c: '♣' },
    colorWord: '모양', mat: { color: 0x1d4a34, sheen: 0x6fbf8f },
    needsColor: (c, st) => c.rank === 7 && !(st && st.attack),
    flash: (c, st) => {
      if (c.joker) return `🃏 ${c.joker === 'c' ? '컬러' : '흑백'} 조커! 공격 +${st.attack}`;
      if (c.rank === 1 || c.rank === 2) return `⚔️ 공격 +${st.attack}`;
      if (c.rank === 3 && !st.attack) return null;
      return ({ 11: '⏭ 점프!', 12: '⇄ 방향 반대!', 13: '🔁 한 번 더!' })[c.rank];
    },
    call: '원카드!', tagCall: '원카드!', catchPenalty: 1,
    drawLabel: st => (st.attack ? `💥 공격 받기 (+${st.attack})` : '🂠 카드 뽑기'),
    statusExtra: (st) => (st.attack ? `<b style="color:#ff6a6a">⚔️ 공격 +${st.attack}</b> 막거나 받으세요!<br>` : '') + (st.again ? '<b>🔁 K: 한 번 더!</b><br>' : '')
  });
}
