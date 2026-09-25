// Synthesised table-top sounds (no audio files): wooden knock, stone clack,
// card flick, brass bell. Muted state persists in localStorage.
let ac = null;
let muted = false;
try { muted = localStorage.getItem('sjl-mute') === '1'; } catch {}

export function isMuted() { return muted; }
export function setMuted(v) { muted = !!v; try { localStorage.setItem('sjl-mute', muted ? '1' : '0'); } catch {} }

function ctx() {
  if (muted) return null;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  } catch { return null; }
}
// Unlock audio on the first gesture so opponents' moves are audible too.
window.addEventListener('pointerdown', () => ctx(), { once: true });

function noiseBuf(a, dur) {
  const b = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  return b;
}
function burst(a, t, { dur = 0.05, freq = 2000, q = 1, type = 'bandpass', vol = 0.4 }) {
  const s = a.createBufferSource(); s.buffer = noiseBuf(a, dur);
  const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}
function tone(a, t, { f0, f1, dur, vol, type = 'sine' }) {
  const o = a.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  knock(vol = 0.5) { // wooden chess piece set down
    const a = ctx(); if (!a) return; const t = a.currentTime;
    tone(a, t, { f0: 310, f1: 120, dur: 0.09, vol: vol * 0.7, type: 'triangle' });
    burst(a, t, { dur: 0.03, freq: 1800, q: 2, vol: vol * 0.5 });
  },
  stone(vol = 0.6) { // go stone on kaya: sharp high clack
    const a = ctx(); if (!a) return; const t = a.currentTime;
    burst(a, t, { dur: 0.025, freq: 3800, q: 4, vol: vol * 0.9 });
    tone(a, t, { f0: 1250, f1: 900, dur: 0.07, vol: vol * 0.35, type: 'triangle' });
  },
  disc(vol = 0.45) { // plastic disc flip
    const a = ctx(); if (!a) return; const t = a.currentTime;
    burst(a, t, { dur: 0.03, freq: 2600, q: 3, vol });
    tone(a, t, { f0: 700, f1: 500, dur: 0.05, vol: vol * 0.3, type: 'square' });
  },
  card(vol = 0.35) { // card flick / slide
    const a = ctx(); if (!a) return; const t = a.currentTime;
    burst(a, t, { dur: 0.09, freq: 5200, q: 0.7, type: 'highpass', vol });
  },
  tile(vol = 0.5) { // plastic tile tap
    const a = ctx(); if (!a) return; const t = a.currentTime;
    burst(a, t, { dur: 0.03, freq: 2200, q: 2.5, vol });
    tone(a, t, { f0: 520, f1: 380, dur: 0.06, vol: vol * 0.4, type: 'triangle' });
  },
  bell(vol = 0.5) { // brass counter bell
    const a = ctx(); if (!a) return; const t = a.currentTime;
    for (const [f, v, d] of [[1760, 1, 1.6], [2637, 0.5, 1.1], [4186, 0.25, 0.7], [880, 0.35, 1.2]]) tone(a, t, { f0: f, dur: d, vol: vol * v * 0.45 });
    burst(a, t, { dur: 0.02, freq: 6000, q: 1, vol: vol * 0.3 });
  },
  buzz(vol = 0.35) { // wrong
    const a = ctx(); if (!a) return; const t = a.currentTime;
    tone(a, t, { f0: 160, f1: 110, dur: 0.3, vol, type: 'sawtooth' });
  },
  whoosh(vol = 0.3) {
    const a = ctx(); if (!a) return; const t = a.currentTime;
    burst(a, t, { dur: 0.25, freq: 900, q: 0.8, vol });
  },
  win(vol = 0.35) {
    const a = ctx(); if (!a) return; const t = a.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(a, t + i * 0.11, { f0: f, dur: 0.35, vol, type: 'triangle' }));
  }
};
