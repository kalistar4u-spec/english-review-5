// 쓰기 활동
// 1) 철자 빈칸 채우기(신출 어휘·단원 어구): 글자 조각을 눌러 빈칸을 채움. 도전은 단어 전체를 직접 입력
// 2) 단어 카드로 문장 만들기(주요 표현 연습·언어 형식): 카드를 눌러 순서대로 놓음. 놓인 카드를 누르면 빠짐
// 단계: 기초 = 첫 글자·뜻·천천히 듣기, 빈칸 적게, 문장 첫 카드는 미리 놓음
//       기본 = 뜻·듣기, 빈칸 조금 더, 헷갈리는 글자 2개 섞음
//       도전 = 듣고 직접 입력, 문장은 듣기 없이 + 다른 문장의 단어 카드 2개 섞음
import { slug } from '../data.js';
import { wordPool, sentencePool, sentencesAtLeast, stageName } from '../level.js';
import { canSpeak, speak, stopSpeaking } from '../speech.js';
import { h, mount, shuffle, sample, progress } from '../ui.js';
import { renderResult } from './result.js';

const isLetter = (c) => /[A-Za-z]/.test(c);
const plain = (t) => t.replace(/[.,?!]/g, '');
const norm = (t) => t.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

// 빈칸 자리 고르기: 첫 글자는 남김(기초 힌트), 글자 수에 비례해 몇 개
export function blankPositions(text, stage) {
  const letters = [...text].map((c, i) => (isLetter(c) ? i : -1)).filter((i) => i > 0);
  const n = letters.length + 1;
  const want = stage === 'basic' ? Math.min(3, Math.max(1, Math.round(n / 3))) : Math.min(4, Math.max(2, Math.round(n / 2)));
  return new Set(sample(letters, Math.min(want, letters.length)));
}

export function buildItems(unit, units, stage) {
  const words = wordPool(unit, stage).filter((w) => w.en.replace(/[^A-Za-z]/g, '').length >= 3);
  const spellN = stage === 'challenge' ? 2 : 3;
  const sentN = 5 - spellN;
  const sents = sentencesAtLeast(unit, stage, sentN, 3);
  const pool = stage === 'basic' ? words.filter((w) => w.en.length <= 10) : words;
  const items = sample(pool.length >= spellN ? pool : words, spellN).map((w) => ({
    type: 'spell', id: `u${unit.unit}-write-spell-${slug(w.en)}`, en: w.en, ko: w.ko,
  }));
  // 도전의 섞는 카드: 같은 단원(모자라면 다른 단원) 문장의 단어 중 이 문장에 없는 것. 숫자·I 는 뺌
  const wordsOf = (list) => [...new Set(list.flatMap((s) => s.en.split(/\s+/).map(plain)))].filter((w) => /^[a-z']{2,}$/i.test(w));
  const unitWords = wordsOf(sentencePool(unit, 'core'));
  const otherWords = wordsOf(units.filter((u) => u.unit !== unit.unit).flatMap((u) => sentencePool(u, 'core')));
  for (const s of sample(sents, sentN)) {
    const tokens = s.en.split(/\s+/).map(plain);
    const have = new Set(tokens.map((t) => t.toLowerCase()));
    const fresh = (w) => !have.has(w.toLowerCase());
    let extra = [];
    if (stage === 'challenge') {
      extra = sample(unitWords.filter(fresh), 2);
      for (const w of shuffle(otherWords.filter(fresh))) if (extra.length < 2 && !extra.includes(w)) extra.push(w);
    }
    items.push({
      type: 'order', id: `u${unit.unit}-write-order-${slug(s.en)}`, en: s.en, q: s.q, tokens, extra,
      end: (s.en.match(/[.?!]$/) || ['.'])[0],
    });
  }
  return items;
}

// 단어 카드 배열 부품(진단 퀴즈에서도 씀)
// tokens: 정답 순서 단어, extra: 섞는 카드, lockFirst: 첫 카드를 미리 놓음
// onChange(ready) : 카드를 모두 놓았는지
export function cardBuilder({ tokens, extra = [], lockFirst = false, end = '.', onChange }) {
  const cards = shuffle([...tokens, ...extra].map((text, i) => ({ text, key: i })));
  const placed = [];
  if (lockFirst) {
    const first = cards.find((c) => c.text === tokens[0]);
    placed.push({ ...first, locked: true });
  }
  let done = false;
  const line = h('div', { class: 'build-line', 'aria-label': '내가 만든 문장' });
  const pool = h('div', { class: 'card-pool' });
  const paint = () => {
    const used = new Set(placed.map((p) => p.key));
    mount(line,
      placed.length
        ? placed.map((p, i) => h('button', {
            class: 'wcard placed en' + (p.locked ? ' locked' : '') + (p.mark ? ` ${p.mark}` : ''), type: 'button', lang: 'en',
            disabled: done || p.locked, 'aria-label': `${p.text} 빼기`,
            onclick: () => { placed.splice(i, 1); paint(); },
          }, p.text))
        : h('span', { class: 'build-empty', text: '아래 카드를 순서대로 눌러요' }),
      placed.length ? h('span', { class: 'build-end en', text: end }) : null);
    mount(pool, cards.filter((c) => !used.has(c.key)).map((c) =>
      h('button', {
        class: 'wcard en', type: 'button', lang: 'en', disabled: done,
        onclick: () => { placed.push(c); paint(); },
      }, c.text)));
    onChange?.(placed.length === tokens.length);
  };
  paint();
  return {
    el: h('div', { class: 'builder' }, line, pool),
    value: () => placed.map((p) => p.text),
    check: () => {
      done = true;
      const mine = placed.map((p) => p.text);
      placed.forEach((p, i) => { p.mark = p.text === tokens[i] ? 'is-right' : 'is-wrong'; });
      paint();
      return { correct: mine.length === tokens.length && mine.every((t, i) => t === tokens[i]), mine: `${mine.join(' ')}${end}` };
    },
  };
}

// 철자 빈칸: 글자 조각 누르기
function spellTiles(item, stage, onChange) {
  const blanks = blankPositions(item.en, stage);
  const answer = [...blanks].sort((a, b) => a - b).map((i) => item.en[i].toLowerCase());
  const extra = stage === 'core' ? sample([...'aeioutsnrlmdkc'].filter((c) => !answer.includes(c)), 2) : [];
  const tiles = shuffle([...answer, ...extra].map((c, k) => ({ c, k })));
  const fill = new Map(); // 빈칸 위치 → tile
  let done = false;
  const order = [...blanks].sort((a, b) => a - b);
  const wordEl = h('div', { class: 'spell en', lang: 'en' });
  const poolEl = h('div', { class: 'tile-pool' });
  const paint = (marks) => {
    mount(wordEl, [...item.en].map((ch, i) => {
      if (ch === ' ') return h('span', { class: 'gap' });
      if (!blanks.has(i)) return h('span', { class: 'given', text: ch });
      const t = fill.get(i);
      return h('button', {
        class: 'blank' + (t ? ' filled' : '') + (marks ? (marks.get(i) ? ' is-right' : ' is-wrong') : ''),
        type: 'button', disabled: done || !t, 'aria-label': t ? `${t.c} 빼기` : '빈칸',
        onclick: () => { fill.delete(i); paint(); },
      }, t ? t.c : '');
    }));
    const used = new Set([...fill.values()].map((t) => t.k));
    mount(poolEl, tiles.filter((t) => !used.has(t.k)).map((t) =>
      h('button', {
        class: 'tile', type: 'button', disabled: done, text: t.c,
        onclick: () => { const at = order.find((i) => !fill.has(i)); if (at == null) return; fill.set(at, t); paint(); },
      })));
    onChange(fill.size === order.length);
  };
  paint();
  return {
    el: h('div', {}, wordEl, poolEl),
    check: () => {
      done = true;
      const marks = new Map(order.map((i) => [i, fill.get(i)?.c === item.en[i].toLowerCase()]));
      paint(marks);
      const mine = [...item.en].map((ch, i) => (blanks.has(i) ? fill.get(i)?.c || '_' : ch)).join('');
      return { correct: [...marks.values()].every(Boolean), mine };
    },
  };
}

// 도전: 직접 입력
function spellInput(item, onChange) {
  const input = h('input', {
    class: 'type-in en', type: 'text', lang: 'en', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    'aria-label': '들은 영어를 적어요', placeholder: '여기에 영어로 적어요',
  });
  input.addEventListener('input', () => onChange(input.value.trim().length > 0));
  onChange(false);
  return {
    el: input,
    focus: () => input.focus(),
    check: () => {
      input.disabled = true;
      const correct = norm(input.value) === norm(item.en);
      input.classList.add(correct ? 'is-right' : 'is-wrong');
      return { correct, mine: input.value.trim() };
    },
  };
}

export function run(root, ctx) {
  const { unit, units, record, onBack, stage = 'core' } = ctx;
  const items = buildItems(unit, units, stage);
  const speakable = canSpeak();
  const results = [];
  let saveFailed = false;
  let index = 0;

  if (!items.length) {
    mount(root,
      h('h1', { text: '문제가 없어요' }),
      h('p', { text: '이 단원에는 아직 쓰기 문제를 만들 표현이 없어요.' }),
      h('button', { class: 'btn btn-line', type: 'button', text: '돌아가기', onclick: onBack }));
    return;
  }

  const showItem = () => {
    stopSpeaking();
    const item = items[index];
    const spell = item.type === 'spell';
    const feedback = h('div', { 'aria-live': 'polite' });
    const nextBtn = h('button', {
      class: 'btn', type: 'button', hidden: true,
      text: index + 1 < items.length ? '다음 문제' : '결과 보기',
      onclick: () => { index += 1; index < items.length ? showItem() : finish(); },
    });
    const checkBtn = h('button', { class: 'btn', type: 'button', text: '확인하기', disabled: true });
    const ready = (ok) => { checkBtn.disabled = !ok; };

    let part;
    if (spell) part = stage === 'challenge' ? spellInput(item, ready) : spellTiles(item, stage, ready);
    else part = cardBuilder({ tokens: item.tokens, extra: item.extra, lockFirst: stage === 'basic', end: item.end, onChange: ready });

    checkBtn.onclick = () => {
      const r = part.check();
      checkBtn.hidden = true;
      if (!record({ unit: unit.unit, skill: 'write', itemId: item.id, correct: r.correct, answer: r.mine })) saveFailed = true;
      results.push({ correct: r.correct, label: item.en, right: spell && item.ko ? item.ko : '', mine: r.correct ? '' : r.mine });
      mount(feedback, h('div', { class: `feedback${r.correct ? '' : ' wrong'}` },
        h('strong', { text: r.correct ? '맞았어요.' : '아쉬워요. 바른 답을 보고 소리 내어 읽어 보세요.' }),
        r.correct ? null : h('span', {}, '바른 답: ', h('span', { class: 'en', lang: 'en', text: item.en }))));
      if (speakable) speak(item.en, { slow: !r.correct });
      nextBtn.hidden = false;
      nextBtn.focus();
    };

    const playable = speakable && (spell || stage !== 'challenge');
    const [ptext, pbar] = progress(index + 1, items.length, '쓰기');
    mount(root,
      h('div', { class: 'act-head' },
        h('button', { class: 'link-btn back', type: 'button', onclick: () => { stopSpeaking(); onBack(); } }, h('span', { class: 'arrow', 'aria-hidden': 'true', text: '←' }), '그만하고 나가기'),
        ptext),
      pbar,
      h('p', { class: 'ask' },
        spell ? (stage === 'challenge' ? '잘 듣고 영어로 적어 보세요.' : '빈칸에 알맞은 글자를 눌러 채우세요.') : '카드를 순서대로 눌러 문장을 만드세요.',
        h('span', { class: 'stage-tag', text: stageName(stage) })),
      spell && item.ko && stage !== 'challenge' ? h('p', { class: 'say-ko', text: `뜻: ${item.ko}` }) : null,
      !spell && item.q ? h('p', { class: 'q-line' }, h('span', { class: 'label', text: '질문' }), h('span', { class: 'en', lang: 'en', text: item.q })) : null,
      playable
        ? h('div', { class: 'play-row' },
            h('button', { class: 'btn btn-line', type: 'button', text: spell ? '▶ 듣기' : '▶ 대답 듣기', onclick: () => speak(item.en) }),
            stage !== 'challenge' ? h('button', { class: 'btn btn-line', type: 'button', text: '천천히 듣기', onclick: () => speak(item.en, { slow: true }) }) : null)
        : null,
      part.el,
      feedback,
      h('div', { class: 'btn-row' }, checkBtn, nextBtn),
    );
    if (playable && (spell || stage === 'basic')) speak(item.en, { slow: stage === 'basic' });
    part.focus?.();
  };

  const finish = () => {
    stopSpeaking();
    renderResult(root, {
      title: `${unit.unit}단원 쓰기`,
      results,
      saveFailed,
      onRetry: () => run(root, ctx),
      onBack,
    });
  };

  showItem();
}
