// 화면 조각 만들기 도우미

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// 화면 바꾸기: 배열은 펼치고 null/false는 빼고 넣음
export function mount(root, ...children) {
  root.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample(list, n) {
  return shuffle(list).slice(0, n);
}

let toastTimer = null;
export function toast(message, ms = 4000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export function progress(current, total, label) {
  const pct = total ? Math.round((current / total) * 100) : 0;
  return [
    h('span', { class: 'progress-text', text: `${label} ${current} / ${total}` }),
    h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(current) },
      h('span', { style: `width:${pct}%` })),
  ];
}
