// 읽기 활동 (units.json의 핵심 표현만 사용)
// 1) 질문과 알맞은 대답 연결  2) 단어·어구와 뜻 연결  3) 문답 두 문장 순서 맞추기
import { vocab, qaPairs, kindOf, slug, pickDistinct } from '../data.js';
import { h, mount, shuffle, sample, progress } from '../ui.js';
import { stopSpeaking } from '../speech.js';
import { renderResult } from './result.js';

// 종류가 서로 다른 질문 n개 (단원에서 모자라면 앞 단원부터 채워 복습)
function distinctQa(unit, units, n) {
  const used = new Set();
  const out = [];
  const take = (pairs) => {
    for (const p of shuffle(pairs)) {
      const k = kindOf(p.q);
      if (out.length >= n || used.has(k)) continue;
      used.add(k);
      out.push(p);
    }
  };
  take(qaPairs(unit));
  const others = units.filter((u) => u.unit !== unit.unit).sort((a, b) => Math.abs(a.unit - unit.unit) - Math.abs(b.unit - unit.unit));
  for (const u of others) if (out.length < n) take(qaPairs(u));
  return out;
}

export function buildSteps(unit, units) {
  const steps = [];
  const qa = distinctQa(unit, units, 3);
  if (qa.length >= 2) {
    steps.push({
      type: 'match',
      ask: '질문과 알맞은 대답을 이어 보세요.',
      leftTitle: '질문', rightTitle: '대답',
      english: true,
      pairs: qa.map((p) => ({
        id: `u${p.unit}-read-qa-${slug(p.q)}-${slug(p.a)}`,
        unit: p.unit, level: p.level, left: p.q, right: p.a,
      })),
    });
  }
  const v = pickDistinct(vocab(unit), 4, shuffle);
  if (v.length >= 2) {
    steps.push({
      type: 'match',
      ask: '영어와 알맞은 뜻을 이어 보세요.',
      leftTitle: '영어', rightTitle: '뜻',
      english: false,
      pairs: v.map((it) => ({
        id: `u${unit.unit}-read-meaning-${slug(it.en)}`,
        unit: unit.unit, level: it.level, left: it.en, right: it.ko,
      })),
    });
  }
  for (const p of sample(qaPairs(unit), 2)) {
    steps.push({
      type: 'order',
      ask: '두 문장을 대화 순서대로 눌러 보세요.',
      id: `u${unit.unit}-read-order-${slug(p.q)}-${slug(p.a)}`,
      unit: unit.unit, level: p.level, lines: [p.q, p.a],
    });
  }
  return steps;
}

// 짝 맞추기: 왼쪽 하나, 오른쪽 하나를 차례로 누르면 같은 번호가 붙음. 다시 누르면 풀림
function matchStep(body, step, onChecked) {
  const left = step.pairs.map((p, i) => ({ ...p, n: i + 1 }));
  const right = shuffle(step.pairs.map((p) => p.right));
  const pairOf = new Map(); // left id → right text
  let selected = null; // { side, key }
  let checked = false;

  const leftBtns = new Map();
  const rightBtns = new Map();

  const paint = () => {
    for (const p of left) {
      const b = leftBtns.get(p.id);
      const paired = pairOf.has(p.id);
      b.classList.toggle('is-paired', paired);
      b.classList.toggle('is-selected', selected?.side === 'L' && selected.key === p.id);
      b.querySelector('.tag').textContent = paired ? String(p.n) : '';
    }
    for (const r of right) {
      const b = rightBtns.get(r);
      const owner = left.find((p) => pairOf.get(p.id) === r);
      b.classList.toggle('is-paired', !!owner);
      b.classList.toggle('is-selected', selected?.side === 'R' && selected.key === r);
      b.querySelector('.tag').textContent = owner ? String(owner.n) : '';
    }
    checkBtn.disabled = pairOf.size !== left.length;
  };

  const tapLeft = (id) => {
    if (checked) return;
    if (pairOf.has(id)) { pairOf.delete(id); selected = null; }
    else if (selected?.side === 'R') { pairOf.set(id, selected.key); selected = null; }
    else selected = selected?.side === 'L' && selected.key === id ? null : { side: 'L', key: id };
    paint();
  };
  const tapRight = (r) => {
    if (checked) return;
    const owner = left.find((p) => pairOf.get(p.id) === r);
    if (owner) { pairOf.delete(owner.id); selected = null; }
    else if (selected?.side === 'L') { pairOf.set(selected.key, r); selected = null; }
    else selected = selected?.side === 'R' && selected.key === r ? null : { side: 'R', key: r };
    paint();
  };

  const chip = (text, lang, onclick) =>
    h('button', { class: 'chip' + (lang === 'en' ? ' en' : ''), type: 'button', lang, onclick },
      h('span', { class: 'tag', 'aria-hidden': 'true' }), h('span', { class: 'txt', text }));

  for (const p of left) leftBtns.set(p.id, chip(p.left, 'en', () => tapLeft(p.id)));
  for (const r of right) rightBtns.set(r, chip(r, step.english ? 'en' : 'ko', () => tapRight(r)));

  const checkBtn = h('button', {
    class: 'btn', type: 'button', text: '확인하기', disabled: true,
    onclick: () => {
      checked = true;
      const results = [];
      for (const p of left) {
        const mine = pairOf.get(p.id);
        const correct = mine === p.right;
        const b = leftBtns.get(p.id);
        b.classList.add(correct ? 'is-right' : 'is-wrong');
        rightBtns.get(mine).classList.add(correct ? 'is-right' : 'is-wrong');
        if (!correct) b.querySelector('.txt').append(h('span', { class: 'fix', text: `맞는 짝: ${p.right}` }));
        results.push({ pair: p, correct, mine });
      }
      for (const b of [...leftBtns.values(), ...rightBtns.values()]) b.disabled = true;
      checkBtn.hidden = true;
      onChecked(results);
    },
  });

  body.append(
    h('p', { class: 'muted', text: '왼쪽을 누르고 짝이 되는 오른쪽을 누르세요. 잘못 이었으면 다시 누르면 풀려요.' }),
    h('div', { class: 'match' },
      h('div', { class: 'col' }, h('h3', { text: step.leftTitle }), [...leftBtns.values()]),
      h('div', { class: 'col' }, h('h3', { text: step.rightTitle }), [...rightBtns.values()]),
    ),
    h('div', { class: 'btn-row' }, checkBtn),
  );
  paint();
}

// 순서 맞추기: 카드를 누르면 빈칸 1, 2에 차례로 들어감. 들어간 칸을 누르면 빠짐
function orderStep(body, step, onChecked) {
  const cards = shuffle(step.lines);
  const placed = [];
  let checked = false;

  const slots = h('div', { class: 'slots' });
  const pool = h('div', { class: 'choices' });
  const checkBtn = h('button', {
    class: 'btn', type: 'button', text: '확인하기', disabled: true,
    onclick: () => {
      checked = true;
      const correct = placed.every((t, i) => t === step.lines[i]);
      [...slots.children].forEach((s, i) => s.classList.add(placed[i] === step.lines[i] ? 'is-right' : 'is-wrong'));
      if (!correct) slots.after(h('p', { class: 'fix', text: `바른 순서: ${step.lines.join(' → ')}` }));
      checkBtn.hidden = true;
      paint();
      onChecked([{ step, correct, mine: placed.join(' / ') }]);
    },
  });

  const paint = () => {
    mount(slots, ...step.lines.map((_, i) => {
      const t = placed[i];
      return h('button', {
        class: 'slot en' + (t ? ' filled' : ''), type: 'button', lang: 'en', disabled: checked || !t,
        onclick: () => { placed.splice(i, 1); paint(); },
      }, h('span', { class: 'n', text: `${i + 1}` }), h('span', { text: t || '' }));
    }));
    mount(pool, ...cards.filter((c) => !placed.includes(c)).map((c) =>
      h('button', {
        class: 'choice en', type: 'button', lang: 'en', disabled: checked,
        onclick: () => { placed.push(c); paint(); },
      }, h('span', { text: c }))));
    checkBtn.disabled = placed.length !== step.lines.length;
  };

  body.append(
    h('p', { class: 'muted', text: '먼저 오는 문장을 누르면 1번 칸에 들어가요.' }),
    slots, pool,
    h('div', { class: 'btn-row' }, checkBtn),
  );
  paint();
}

export function run(root, { unit, units, record, onBack }) {
  const steps = buildSteps(unit, units);
  const results = [];
  let saveFailed = false;
  let index = 0;

  if (!steps.length) {
    mount(root, 
      h('h1', { text: '문제가 없어요' }),
      h('p', { text: '이 단원에는 아직 읽기 문제를 만들 표현이 없어요.' }),
      h('button', { class: 'btn btn-line', type: 'button', text: '돌아가기', onclick: onBack }),
    );
    return;
  }

  const showStep = () => {
    const step = steps[index];
    const [ptext, pbar] = progress(index + 1, steps.length, '읽기');
    const body = h('div');
    const feedback = h('div', { 'aria-live': 'polite' });
    const nextBtn = h('button', {
      class: 'btn', type: 'button', hidden: true,
      text: index + 1 < steps.length ? '다음 문제' : '결과 보기',
      onclick: () => { index += 1; index < steps.length ? showStep() : finish(); },
    });

    const done = (list) => {
      let right = 0;
      for (const r of list) {
        const it = r.pair || r.step;
        if (!record({ unit: it.unit, skill: 'read', level: it.level, itemId: it.id, correct: r.correct, answer: r.mine })) saveFailed = true;
        if (r.correct) right += 1;
        results.push(r.pair
          ? { correct: r.correct, label: r.pair.left, right: r.pair.right, mine: r.correct ? '' : r.mine }
          : { correct: r.correct, label: r.step.lines.join(' → '), right: '', mine: r.correct ? '' : r.mine });
      }
      const all = right === list.length;
      mount(feedback, h('div', { class: `feedback${all ? '' : ' wrong'}` },
        h('strong', { text: all ? '모두 맞았어요.' : `${list.length}개 중 ${right}개 맞았어요.` }),
        all ? null : h('span', { text: '황토색으로 표시된 곳을 다시 읽어 보세요.' })));
      nextBtn.hidden = false;
      nextBtn.focus();
    };

    mount(root, 
      h('div', { class: 'act-head' },
        h('button', { class: 'link-btn back', type: 'button', onclick: () => { stopSpeaking(); onBack(); } }, h('span', { class: 'arrow', 'aria-hidden': 'true', text: '←' }), '그만하고 나가기'),
        ptext),
      pbar,
      h('p', { class: 'ask', text: step.ask }),
      body,
      feedback,
      h('div', { class: 'btn-row' }, nextBtn),
    );
    if (step.type === 'match') matchStep(body, step, done);
    else orderStep(body, step, done);
  };

  const finish = () => {
    renderResult(root, {
      title: `${unit.unit}단원 읽기`,
      results,
      saveFailed,
      onRetry: () => run(root, { unit, units, record, onBack }),
      onBack,
    });
  };

  showStep();
}
