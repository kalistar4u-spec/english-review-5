// 진단 퀴즈: 단원별 5문항(듣기 2·읽기 1·쓰기 2를 섞음) → 맞힌 수로 시작 단계 추천
//   0~2개 기초 / 3~4개 기본 / 5개 도전. 학생이 추천과 다른 단계를 직접 고를 수도 있음
import { vocab, qaPairs, kindOf, slug, pickDistinct } from '../data.js';
import { STAGE_INFO, recommendStage, sentencePool } from '../level.js';
import { canSpeak, speak, stopSpeaking } from '../speech.js';
import { h, mount, shuffle, sample, progress } from '../ui.js';
import { cardBuilder } from './write.js';

const plain = (t) => t.replace(/[.,?!]/g, '');

// 그럴듯한 틀린 철자 만들기 (글자 바꾸기, 빼기, 겹치기, 모음 바꾸기)
export function misspell(word, n = 2) {
  const out = new Set();
  const letters = [...word];
  const idx = letters.map((c, i) => (/[a-z]/i.test(c) ? i : -1)).filter((i) => i > 0);
  const vowels = 'aeiou';
  const makers = [
    () => { const i = sample(idx.filter((k) => k + 1 < letters.length && /[a-z]/i.test(letters[k + 1]) && letters[k] !== letters[k + 1]), 1)[0]; if (i == null) return null; const a = [...letters]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a.join(''); },
    () => { const i = sample(idx, 1)[0]; if (i == null) return null; const a = [...letters]; a.splice(i, 1); return a.join(''); },
    () => { const i = sample(idx, 1)[0]; if (i == null) return null; const a = [...letters]; a.splice(i, 0, a[i]); return a.join(''); },
    () => { const i = sample(idx.filter((k) => vowels.includes(letters[k].toLowerCase())), 1)[0]; if (i == null) return null; const a = [...letters]; a[i] = sample([...vowels].filter((v) => v !== a[i].toLowerCase()), 1)[0]; return a.join(''); },
  ];
  for (let tries = 0; out.size < n && tries < 40; tries++) {
    const w = makers[tries % makers.length]();
    if (w && w !== word && w.toLowerCase() !== word.toLowerCase()) out.add(w);
  }
  return [...out];
}

function wrongAnswers(pair, allPairs, n) {
  const k = kindOf(pair.q);
  const ok = (x) => kindOf(x.q) !== k && x.a !== pair.a;
  const same = [...new Set(allPairs.filter((x) => x.unit === pair.unit && ok(x)).map((x) => x.a))];
  const other = [...new Set(allPairs.filter((x) => x.unit !== pair.unit && ok(x)).map((x) => x.a))];
  const out = sample(same, n);
  for (const a of shuffle(other)) if (out.length < n && !out.includes(a)) out.push(a);
  return out;
}

export function buildItems(unit, units) {
  const items = [];
  const all = units.flatMap((u) => qaPairs(u));
  const v = vocab(unit);
  const qa = qaPairs(unit);
  const basicQa = qa.filter((p) => p.level === 'basic');
  const coreQa = qa.filter((p) => p.level !== 'basic');

  // 1) 듣기: 단어 뜻 (basic)
  const w = sample(v.filter((x) => x.level === 'basic'), 1)[0] || sample(v, 1)[0];
  if (w) {
    items.push({ type: 'choice', skill: 'listen', id: `u${unit.unit}-diag-listen-${slug(w.en)}`, ask: '잘 듣고 알맞은 뜻을 고르세요.',
      say: w.en, answer: w.ko, options: shuffle([w.ko, ...pickDistinct(v, 3, shuffle, [w]).map((x) => x.ko)]), en: false });
  }
  // 2) 듣기: 질문 듣고 대답 (basic)
  const p1 = sample(basicQa.length ? basicQa : qa, 1)[0];
  if (p1) {
    items.push({ type: 'choice', skill: 'listen', id: `u${unit.unit}-diag-listen-${slug(p1.q)}-${slug(p1.a)}`, ask: '질문을 듣고 알맞은 대답을 고르세요.',
      say: p1.q, answer: p1.a, options: shuffle([p1.a, ...wrongAnswers(p1, all, 2)]), en: true });
  }
  // 3) 읽기: 질문 읽고 대답 (core)
  const notP1 = (p) => p !== p1 && p.a !== p1?.a;
  const otherKind = (p) => !p1 || kindOf(p.q) !== kindOf(p1.q);
  const p2 = sample((coreQa.length ? coreQa : qa).filter((p) => notP1(p) && otherKind(p)), 1)[0]
    || sample((coreQa.length ? coreQa : qa).filter(notP1), 1)[0];
  if (p2) {
    items.push({ type: 'choice', skill: 'read', id: `u${unit.unit}-diag-read-${slug(p2.q)}-${slug(p2.a)}`, ask: '질문을 읽고 알맞은 대답을 고르세요.',
      show: p2.q, answer: p2.a, options: shuffle([p2.a, ...wrongAnswers(p2, all, 2)]), en: true });
  }
  // 4) 쓰기: 바른 철자 고르기 (basic)
  const s = sample(v.filter((x) => x !== w && /^[a-z ]+$/i.test(x.en) && x.en.length >= 4), 1)[0];
  if (s) {
    const wrongs = misspell(s.en, 2);
    if (wrongs.length === 2) {
      items.push({ type: 'choice', skill: 'write', id: `u${unit.unit}-diag-spell-${slug(s.en)}`, ask: `'${s.ko}'을(를) 바르게 쓴 것을 고르세요.`,
        say: s.en, answer: s.en, options: shuffle([s.en, ...wrongs]), en: true });
    }
  }
  // 5) 쓰기: 단어 카드로 문장 만들기 (core)
  const sent = sample(sentencePool(unit, 'challenge').filter((x) => x.en.split(/\s+/).length >= 3), 1)[0];
  if (sent) {
    items.push({ type: 'order', skill: 'write', id: `u${unit.unit}-diag-order-${slug(sent.en)}`, ask: '카드를 순서대로 눌러 문장을 만드세요.',
      q: sent.q, en: sent.en, tokens: sent.en.split(/\s+/).map(plain), end: (sent.en.match(/[.?!]$/) || ['.'])[0] });
  }
  return items;
}

export function run(root, ctx) {
  const { unit, units, record, onBack, onStage, currentStage } = ctx;
  const items = buildItems(unit, units);
  const speakable = canSpeak();
  let right = 0;
  let index = 0;
  let saveFailed = false;

  const showItem = () => {
    stopSpeaking();
    const item = items[index];
    const feedback = h('div', { 'aria-live': 'polite' });
    const nextBtn = h('button', {
      class: 'btn', type: 'button', hidden: true,
      text: index + 1 < items.length ? '다음 문제' : '추천 단계 보기',
      onclick: () => { index += 1; index < items.length ? showItem() : finish(); },
    });
    const done = (correct, answer) => {
      if (correct) right += 1;
      if (!record({ unit: unit.unit, skill: 'diagnose', itemId: item.id, correct, answer })) saveFailed = true;
      // 진단은 정답을 길게 알려 주지 않고 다음으로 (맞힌 수로 단계만 정함)
      mount(feedback, h('div', { class: `feedback${correct ? '' : ' wrong'}` }, h('strong', { text: correct ? '맞았어요.' : '괜찮아요. 다음 문제로 가요.' })));
      nextBtn.hidden = false;
      nextBtn.focus();
    };

    let body;
    if (item.type === 'choice') {
      let answered = false;
      const btns = item.options.map((opt, i) => h('button', {
        class: 'choice' + (item.en ? ' en' : ''), type: 'button', lang: item.en ? 'en' : 'ko', 'data-value': opt,
        onclick: (e) => {
          if (answered) return;
          answered = true;
          const correct = opt === item.answer;
          for (const b of btns) { b.disabled = true; if (b.dataset.value === item.answer) b.classList.add('is-right'); }
          if (!correct) e.currentTarget.classList.add('is-wrong');
          done(correct, opt);
        },
      }, h('span', { class: 'no', text: String(i + 1) }), h('span', { text: opt })));
      body = [
        item.show ? h('p', { class: 'shown-text en', lang: 'en', text: item.show }) : null,
        item.say && speakable ? h('div', { class: 'play-row' }, h('button', { class: 'btn btn-line', type: 'button', text: '▶ 다시 듣기', onclick: () => speak(item.say) })) : null,
        item.say && !speakable && item.skill === 'listen' ? h('p', { class: 'shown-text en', lang: 'en', text: item.say }) : null,
        h('div', { class: 'choices' }, btns),
      ];
    } else {
      const checkBtn = h('button', { class: 'btn', type: 'button', text: '확인하기', disabled: true });
      const cb = cardBuilder({ tokens: item.tokens, end: item.end, onChange: (ok) => { checkBtn.disabled = !ok; } });
      checkBtn.onclick = () => { checkBtn.hidden = true; const r = cb.check(); done(r.correct, r.mine); };
      body = [
        item.q ? h('p', { class: 'q-line' }, h('span', { class: 'label', text: '질문' }), h('span', { class: 'en', lang: 'en', text: item.q })) : null,
        cb.el,
        h('div', { class: 'btn-row' }, checkBtn),
      ];
    }

    const [ptext, pbar] = progress(index + 1, items.length, '진단');
    mount(root,
      h('div', { class: 'act-head' },
        h('button', { class: 'link-btn back', type: 'button', onclick: () => { stopSpeaking(); onBack(); } }, h('span', { class: 'arrow', 'aria-hidden': 'true', text: '←' }), '그만하고 나가기'),
        ptext),
      pbar,
      h('p', { class: 'ask' }, item.ask, h('span', { class: 'stage-tag', text: { listen: '듣기', read: '읽기', write: '쓰기' }[item.skill] })),
      body,
      feedback,
      h('div', { class: 'btn-row' }, nextBtn),
    );
    if (item.say && speakable && item.skill === 'listen') speak(item.say);
  };

  const finish = () => {
    stopSpeaking();
    const rec = recommendStage(right, items.length);
    const pick = (stage) => onStage(stage, { from: stage === rec ? 'diagnose' : 'self', score: right });
    mount(root,
      h('h1', { text: `${unit.unit}단원 진단 끝` }),
      h('p', { class: 'score' }, h('span', { class: 'big', text: String(right) }), ` / ${items.length} 맞혔어요`),
      saveFailed ? h('div', { class: 'notice notice-error' }, h('p', { text: '기록을 이 기기에 저장하지 못했어요. 단계는 고를 수 있어요.' })) : null,
      h('div', { class: 'recommend' },
        h('p', { class: 'rec-label', text: '추천 단계' }),
        h('p', { class: 'rec-name', text: STAGE_INFO[rec].name }),
        h('p', { text: STAGE_INFO[rec].desc })),
      h('h2', { text: '어느 단계로 시작할까요?' }),
      h('p', { class: 'muted', text: '추천과 다른 단계를 골라도 돼요. 나중에 단원 화면에서 바꿀 수 있어요.' }),
      stageButtons(rec, currentStage, pick),
    );
    root.querySelector('h1').focus?.();
  };

  if (items.length < 3) {
    mount(root,
      h('h1', { text: '진단 문제를 만들 수 없어요' }),
      h('p', { text: '이 단원은 표현이 적어 기본 단계로 시작해요.' }),
      h('button', { class: 'btn', type: 'button', text: '기본 단계로 시작', onclick: () => onStage('core', { from: 'self' }) }));
    return;
  }
  showItem();
}

// 단계 고르기 버튼 3개 (단원 화면에서도 씀)
export function stageButtons(recommended, current, onPick) {
  return h('div', { class: 'stage-pick', role: 'group', 'aria-label': '단계 고르기' },
    ['basic', 'core', 'challenge'].map((s) => h('button', {
      class: 'stage-btn' + (s === current ? ' is-current' : ''), type: 'button', 'aria-pressed': String(s === current),
      onclick: () => onPick(s),
    },
      h('span', { class: 'stage-name' }, STAGE_INFO[s].name, s === recommended ? h('span', { class: 'rec-mark', text: '추천' }) : null),
      h('span', { class: 'stage-desc', text: STAGE_INFO[s].desc }))));
}
