// Small DOM helpers shared by the 3D renderers: a choice modal and a HUD strip.

export function choose(title, options) {
  return new Promise(res => {
    const modal = document.createElement('div');
    modal.className = 'chooser';
    const box = document.createElement('div');
    box.className = 'box';
    const h = document.createElement('strong'); h.textContent = title;
    const grid = document.createElement('div'); grid.className = 'opts';
    for (const o of options) {
      const b = document.createElement('button');
      b.className = 'opt ' + (o.cls || '');
      b.innerHTML = `<span class="big">${o.icon || ''}</span><span>${o.label}</span>`;
      if (o.style) b.style.cssText = o.style;
      b.onclick = () => { modal.remove(); res(o.value); };
      grid.appendChild(b);
    }
    box.append(h, grid);
    modal.appendChild(box);
    modal.addEventListener('click', e => { if (e.target === modal) { modal.remove(); res(null); } });
    document.body.appendChild(modal);
  });
}

export function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

export function btn(label, cls, fn) {
  const b = document.createElement('button');
  b.className = cls || '';
  b.textContent = label;
  b.onclick = fn;
  return b;
}

export function fillLog(log, lines) {
  log.innerHTML = '';
  for (const l of lines || []) {
    const d = document.createElement('div');
    d.textContent = l;
    log.appendChild(d);
  }
  log.scrollTop = log.scrollHeight;
}
