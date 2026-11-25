// 듣기 활동
// 1) 단어·어구를 듣고 뜻 고르기  2) 질문을 듣고 알맞은 대답 고르기
import { vocab, qaPairs, kindOf, slug, pickDistinct } from '../data.js';
import { canSpeak, hasEnglishVoice, speak, stopSpeaking, voiceInfo } from '../speech.js';
import { h, mount, shuffle, sample, progress } from '../ui.js';
import { renderResult } from './result.js';

const MEANING_COUNT = 5;
const ANSWER_COUNT = 3;
let runId = 0; // 가장 최근에 시작한 듣기만 화면과 소리를 냄

// 질문이 서로 다른 짝을 먼저 고름 (같은 질문만 반복되지 않게)
function pickVariedPairs(pairs, n) {
  const groups = new Map();
  for (const p of shuffle(pairs)) {
    if (!groups.has(p.q)) groups.set(p.q, []);
    groups.get(p.q).push(p);
  }
  const lists = shuffle([...groups.values()]);
  const out = [];
  while (out.length < n && lists.some((l) => l.length)) {
    for (const l of lists) if (l.length && out.length < n) out.push(l.shift());
  }
  return out;
}

export function buildItems(unit, units) {
  const items = [];
  const v = vocab(unit);
  for (const it of sample(v, Math.min(MEANING_COUNT, v.length))) {
    const others = pickDistinct(v, 3, shuffle, [it]).map((x) => x.ko);
    items.push({
      type: 'meaning',
      id: `u${unit.unit}-listen-meaning-${slug(it.en)}`,
      level: it.level,
      say: it.en,
      answer: it.ko,
      options: shuffle([it.ko, ...others]),
    });
  }

  const allPairs = units.flatMap((u) => qaPairs(u));
  for (const p of pickVariedPairs(qaPairs(unit), ANSWER_COUNT)) {
    const k = kindOf(p.q);
    const ok = (x) => kindOf(x.q) !== k && x.a !== p.a;
    const same = [...new Set(allPairs.filter((x) => x.unit === unit.unit && ok(x)).map((x) => x.a))];
    const other = [...new Set(allPairs.filter((x) => x.unit !== unit.unit && ok(x)).map((x) => x.a))];
    const wrongs = sample(same, 2);
    for (const a of shuffle(other)) if (wrongs.length < 2 && !wrongs.includes(a)) wrongs.push(a);
    items.push({
      type: 'answer',
      id: `u${unit.unit}-listen-answer-${slug(p.q)}-${slug(p.a)}`,
      level: p.level,
      say: p.q,
      answer: p.a,
      options: shuffle([p.a, ...wrongs]),
    });
  }
  return items;
}

export async function run(root, { unit, units, record, onBack }) {
  const id = ++runId;
  const items = buildItems(unit, units);
  const speakable = canSpeak();
  const voiceOk = speakable ? await hasEnglishVoice() : false;
  const voiceName = speakable ? await voiceInfo() : '';
  const results = [];
  let saveFailed = false;
  let index = 0;

  const showItem = () => {
    if (id !== runId) return; // 더 새로 시작한 듣기가 있으면 이 화면은 그리지 않음
    const item = items[index];
    const isMeaning = item.type === 'meaning';
    let answered = false;

    const shown = h('p', { class: 'shown-text en', lang: 'en', text: item.say, hidden: speakable });
    const feedback = h('div', { 'aria-live': 'polite' });
    const nextBtn = h('button', {
      class: 'btn', type: 'button', hidden: true,
      text: index + 1 < items.length ? '다음 문제' : '결과 보기',
      onclick: () => { index += 1; index < items.length ? showItem() : finish(); },
    });

    const choose = (btn, value) => {
      if (answered) return;
      answered = true;
      const correct = value === item.answer;
      for (const b of choiceBtns) {
        b.disabled = true;
        if (b.dataset.value === item.answer) b.classList.add('is-right');
      }
      if (!correct) btn.classList.add('is-wrong');
      shown.hidden = false;
      if (!record({ unit: unit.unit, skill: 'listen', level: item.level, itemId: item.id, correct, answer: value })) saveFailed = true;
      results.push({ correct, label: item.say, right: item.answer, mine: correct ? '' : value });
      mount(feedback, 
        h('div', { class: `feedback${correct ? '' : ' wrong'}` },
          h('strong', { text: correct ? '맞았어요.' : '아쉬워요. 다시 들어 보세요.' }),
          correct ? null : h('span', {}, '정답: ', h('span', { class: 'en', text: item.answer })),
        ),
      );
      nextBtn.hidden = false;
      nextBtn.focus();
      if (!correct && speakable) speak(item.say, { slow: true });
    };

    const choiceBtns = item.options.map((opt, i) =>
      h('button', {
        class: 'choice' + (isMeaning ? '' : ' en'), type: 'button', 'data-value': opt,
        lang: isMeaning ? 'ko' : 'en',
        onclick: (e) => choose(e.currentTarget, opt),
      }, h('span', { class: 'no', text: String(i + 1) }), h('span', { text: opt })),
    );

    mount(root, 
      h('div', { class: 'act-head' },
        h('button', { class: 'link-btn back', type: 'button', text: '← 그만하기', onclick: () => { stopSpeaking(); onBack(); } }),
        progress(index + 1, items.length, '듣기')[0],
      ),
      progress(index + 1, items.length, '듣기')[1],
      h('p', { class: 'ask', text: isMeaning ? '잘 듣고 알맞은 뜻을 고르세요.' : '질문을 듣고 알맞은 대답을 고르세요.' }),
      speakable
        ? null
        : h('div', { class: 'notice notice-error' },
            h('p', { text: '이 브라우저에서는 영어 소리를 낼 수 없어요. 오늘은 글자를 보고 풀어 보세요. 웨일이나 크롬 브라우저에서 열면 소리를 들을 수 있어요.' })),
      speakable && !voiceOk
        ? h('div', { class: 'notice notice-warn' }, h('p', { text: '영어 목소리를 찾지 못해 기본 목소리로 읽어요. 발음이 어색할 수 있어요.' }))
        : null,
      speakable
        ? h('div', { class: 'play-row' },
            h('button', { class: 'btn', type: 'button', text: '▶ 다시 듣기', onclick: () => speak(item.say) }),
            h('button', { class: 'btn btn-line', type: 'button', text: '천천히 듣기', onclick: () => speak(item.say, { slow: true }) }),
          )
        : null,
      shown,
      h('div', { class: 'choices' }, choiceBtns),
      feedback,
      h('div', { class: 'btn-row' }, nextBtn),
      speakable ? h('p', { class: 'voice-name muted', text: `목소리: ${voiceName}` }) : null,
    );
    if (speakable) speak(item.say);
  };

  const finish = () => {
    if (id !== runId) return;
    stopSpeaking();
    renderResult(root, {
      title: `${unit.unit}단원 듣기`,
      results,
      saveFailed,
      onRetry: () => run(root, { unit, units, record, onBack }),
      onBack,
    });
  };

  if (!items.length) {
    mount(root, 
      h('h1', { text: '문제가 없어요' }),
      h('p', { text: '이 단원에는 아직 듣기 문제를 만들 표현이 없어요.' }),
      h('button', { class: 'btn btn-line', type: 'button', text: '돌아가기', onclick: onBack }),
    );
    return;
  }
  showItem();
}
