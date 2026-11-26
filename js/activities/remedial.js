// 보충 학습과 다시 풀기 (요구사항 4)
// mode 'easy'  = 보충 학습: 틀린 문항과 같은 표현을 한 단계 쉬운 형태 + 힌트로
//   듣기 뜻 고르기 → 글자를 보며 듣고 보기 3개 중 고르기
//   질문→대답 고르기 → 질문 글자와 "무엇을 묻는지" 힌트, 보기 2개
//   문답 순서 → "물음표(?)로 끝나는 질문이 먼저" 힌트
//   철자 빈칸 → 바른 철자 고르기(뜻·소리 힌트)
//   문장 배열 → 기초 단계 단어 철자부터 + 첫 카드를 놓아 준 문장 만들기
//   따라 말하기 → 글자·뜻을 보고 천천히 듣고 한 단어씩 따라 말한 뒤 스스로 평가
// mode 'retry' = 오답 노트 다시 풀기: 원래와 같은 모양, 힌트 없이. 맞히면 오답 노트에서 빠짐
// 기록: 문항마다 한 번(level 'remedial' 또는 'retry'), itemId는 원래 문항 그대로
import { vocab, qaPairs, kindOf, pickDistinct } from '../data.js';
import { canSpeak, speak, stopSpeaking } from '../speech.js';
import { h, mount, shuffle, sample, progress } from '../ui.js';
import { resolveItem, questionHint, SKILL_NAMES } from '../feedback.js';
import { misspell } from './diagnose.js';
import { cardBuilder, spellTiles } from './write.js';

const MAX_ITEMS = 5;
const plain = (t) => t.replace(/[.,?!]/g, '');

// 결과 화면에서 "보충 학습"을 누르면 이번에 틀린 문항을 먼저 냄
let pending = null;
export function setPending(p) { pending = p; }
function takePending(unit, skill) {
  const p = pending;
  pending = null;
  return p && p.unit === unit && p.skill === skill ? p.ids : null;
}

function wrongAnswers(item, units, n) {
  const all = units.flatMap((u) => qaPairs(u));
  const k = kindOf(item.q);
  const ok = (x) => kindOf(x.q) !== k && x.a !== item.a;
  const same = [...new Set(all.filter((x) => x.unit === item.unit && ok(x)).map((x) => x.a))];
  const other = [...new Set(all.filter((x) => x.unit !== item.unit && ok(x)).map((x) => x.a))];
  const out = sample(same, n);
  for (const a of shuffle(other)) if (out.length < n && !out.includes(a)) out.push(a);
  return out;
}

// 문장에서 철자 연습할 낱말: 단원 어구 → 단원 단어 → 가장 긴 낱말
function keyWord(sentence, unit) {
  const low = sentence.toLowerCase();
  const v = vocab(unit);
  const phrase = v.filter((w) => w.kind === 'phrase' && low.includes(w.en.toLowerCase())).sort((a, b) => b.en.length - a.en.length)[0];
  if (phrase && phrase.en.length <= 14) return phrase;
  const tokens = sentence.split(/\s+/).map(plain);
  const word = v.filter((w) => tokens.some((t) => t.toLowerCase() === w.en.toLowerCase())).sort((a, b) => b.en.length - a.en.length)[0];
  if (word) return word;
  const longest = tokens.filter((t) => /^[a-z]{3,}$/i.test(t)).sort((a, b) => b.length - a.length)[0];
  return longest ? { en: longest, ko: '' } : null;
}

// 노트 한 문항 → 풀 단계들
function stepsFor(it, mode, units) {
  const unit = units.find((u) => u.unit === it.unit);
  const easy = mode === 'easy';
  const v = vocab(unit);
  switch (it.type) {
    case 'meaning': {
      const others = pickDistinct(v, easy ? 2 : 3, shuffle, [it]).map((x) => x.ko);
      return [{ kind: 'choice', ask: '영어를 듣고 알맞은 뜻을 고르세요.', say: it.en, showText: easy || it.skill === 'read' || !canSpeak(),
        hint: easy ? `첫 글자는 "${it.en[0]}"예요. 글자를 보며 소리 내어 읽어 보세요.` : '', answer: it.ko, options: shuffle([it.ko, ...others]), enOptions: false }];
    }
    case 'answer':
      return [{ kind: 'choice', ask: '질문에 알맞은 대답을 고르세요.', say: it.q, showText: easy || it.skill === 'read' || !canSpeak(),
        hint: easy ? questionHint(it.q) : '', answer: it.a, options: shuffle([it.a, ...wrongAnswers(it, units, easy ? 1 : 2)]), enOptions: true }];
    case 'order':
      return [{ kind: 'order', ask: '두 문장을 대화 순서대로 눌러 보세요.', lines: [it.q, it.a],
        hint: easy ? '물음표(?)로 끝나는 질문이 먼저 와요. 질문을 듣고 대답해요.' : '' }];
    case 'spell':
      if (easy) {
        const opts = [it.en, ...misspell(it.en, 2)];
        return [{ kind: 'choice', ask: '바른 철자를 고르세요.', say: it.en, showText: false,
          hint: `뜻: ${it.ko || '-'} · 소리를 듣고 글자를 하나씩 맞춰 보세요.`, answer: it.en, options: shuffle(opts), enOptions: true }];
      }
      return [{ kind: 'spell', ask: '빈칸에 알맞은 글자를 눌러 채우세요.', en: it.en, ko: it.ko, stage: 'core', hint: '' }];
    case 'build': {
      const tokens = it.en.split(/\s+/).map(plain);
      const end = (it.en.match(/[.?!]$/) || ['.'])[0];
      if (!easy) return [{ kind: 'build', ask: '카드를 순서대로 눌러 문장을 만드세요.', en: it.en, q: it.q, tokens, end, lockFirst: false, hint: '' }];
      const kw = keyWord(it.en, unit);
      const out = [];
      if (kw) out.push({ kind: 'spell', ask: '먼저 문장에 나오는 낱말의 철자를 채우세요.', en: kw.en, ko: kw.ko, stage: 'basic',
        hint: `이 낱말은 다음 문장에 나와요. 첫 글자는 "${kw.en[0]}"예요.` });
      out.push({ kind: 'build', ask: '이제 카드를 순서대로 놓아 문장을 만드세요.', en: it.en, q: it.q, tokens, end, lockFirst: true,
        hint: `첫 카드 "${tokens[0]}"는 놓아 두었어요. "▶ 문장 듣기"로 순서를 들어 보세요.` });
      return out;
    }
    case 'say':
      return [{ kind: 'say', ask: easy ? '천천히 듣고 한 단어씩 따라 말해 보세요.' : '듣고 따라 말해 보세요.', en: it.en, ko: it.ko, easy,
        hint: easy ? '낱말을 누르면 그 낱말만 들을 수 있어요. 세 번 따라 말한 뒤 스스로 평가해요.' : '' }];
    default:
      return [];
  }
}

/* 단계 그리기: done({ correct, mine }) 를 한 번 부름 */
function choiceStep(step, done) {
  let answered = false;
  const btns = step.options.map((opt, i) => h('button', {
    class: 'choice' + (step.enOptions ? ' en' : ''), type: 'button', lang: step.enOptions ? 'en' : 'ko', 'data-value': opt,
    onclick: (e) => {
      if (answered) return;
      answered = true;
      const correct = opt === step.answer;
      for (const b of btns) { b.disabled = true; if (b.dataset.value === step.answer) b.classList.add('is-right'); }
      if (!correct) e.currentTarget.classList.add('is-wrong');
      done({ correct, mine: opt, right: step.answer });
    },
  }, h('span', { class: 'no', text: String(i + 1) }), h('span', { text: opt })));
  return { el: h('div', { class: 'choices' }, btns), autoplay: true };
}

function orderStep(step, done) {
  const cards = shuffle(step.lines);
  const placed = [];
  let checked = false;
  const slots = h('div', { class: 'slots' });
  const pool = h('div', { class: 'choices' });
  const checkBtn = h('button', { class: 'btn', type: 'button', text: '확인하기', disabled: true });
  const paint = () => {
    mount(slots, step.lines.map((_, i) => h('button', {
      class: 'slot en' + (placed[i] ? ' filled' : '') + (checked ? (placed[i] === step.lines[i] ? ' is-right' : ' is-wrong') : ''),
      type: 'button', lang: 'en', disabled: checked || !placed[i], onclick: () => { placed.splice(i, 1); paint(); },
    }, h('span', { class: 'n', text: String(i + 1) }), h('span', { text: placed[i] || '' }))));
    mount(pool, cards.filter((c) => !placed.includes(c)).map((c) => h('button', {
      class: 'choice en', type: 'button', lang: 'en', disabled: checked, onclick: () => { placed.push(c); paint(); },
    }, h('span', { text: c }))));
    checkBtn.disabled = placed.length !== step.lines.length;
  };
  checkBtn.onclick = () => {
    checked = true;
    checkBtn.hidden = true;
    paint();
    const correct = placed.every((t, i) => t === step.lines[i]);
    done({ correct, mine: placed.join(' / '), right: step.lines.join(' → ') });
  };
  paint();
  return { el: h('div', {}, slots, pool, h('div', { class: 'btn-row' }, checkBtn)) };
}

function spellStep(step, done) {
  const checkBtn = h('button', { class: 'btn', type: 'button', text: '확인하기', disabled: true });
  const part = spellTiles({ en: step.en }, step.stage, (ok) => { checkBtn.disabled = !ok; });
  checkBtn.onclick = () => {
    checkBtn.hidden = true;
    const r = part.check();
    done({ correct: r.correct, mine: r.mine, right: step.en });
  };
  return { el: h('div', {}, step.ko ? h('p', { class: 'say-ko', text: `뜻: ${step.ko}` }) : null, part.el, h('div', { class: 'btn-row' }, checkBtn)), autoplay: true, say: step.en, slow: true };
}

function buildStep(step, done) {
  const checkBtn = h('button', { class: 'btn', type: 'button', text: '확인하기', disabled: true });
  const part = cardBuilder({ tokens: step.tokens, extra: [], lockFirst: step.lockFirst, end: step.end, onChange: (ok) => { checkBtn.disabled = !ok; } });
  checkBtn.onclick = () => {
    checkBtn.hidden = true;
    const r = part.check();
    done({ correct: r.correct, mine: r.mine, right: step.en });
  };
  return {
    el: h('div', {},
      step.q ? h('p', { class: 'q-line' }, h('span', { class: 'label', text: '질문' }), h('span', { class: 'en', lang: 'en', text: step.q })) : null,
      part.el, h('div', { class: 'btn-row' }, checkBtn)),
    say: step.en, autoplay: step.lockFirst, slow: true, playLabel: '▶ 문장 듣기',
  };
}

const SAY_RATES = [
  { key: 'good', label: '잘했어요', note: '원어민 소리와 거의 같아요.' },
  { key: 'soso', label: '조금 비슷해요', note: '한두 단어가 달라요.' },
  { key: 'again', label: '어려워요', note: '한 번 더 들어 볼래요.' },
];
function sayStep(step, done) {
  const words = step.en.split(/\s+/);
  const target = h('p', { class: 'say-target en', lang: 'en' },
    step.easy && words.length > 1 && canSpeak()
      ? words.map((w) => h('button', { class: 'word-btn', type: 'button', text: w, 'aria-label': `${plain(w)} 듣기`, onclick: () => speak(plain(w), { slow: true }) }))
      : step.en);
  let rated = false;
  const btns = SAY_RATES.map((r) => h('button', {
    class: 'btn btn-line rate-btn', type: 'button', 'aria-pressed': 'false',
    onclick: (e) => {
      if (rated) return;
      rated = true;
      e.currentTarget.setAttribute('aria-pressed', 'true');
      for (const b of btns) b.disabled = true;
      done({ correct: r.key === 'good', mine: '', selfRating: r.key, right: step.en });
    },
  }, h('span', { text: r.label }), h('span', { class: 'rate-note', text: r.note })));
  return {
    el: h('div', {}, target, step.ko ? h('p', { class: 'say-ko', text: `뜻: ${step.ko}` }) : null,
      h('div', { class: 'rate' }, h('p', { class: 'rate-q', text: '따라 말해 봤나요? 스스로 평가해요.' }), h('div', { class: 'rate-btns' }, btns))),
    say: step.en, autoplay: true, slow: step.easy,
  };
}

const RENDER = { choice: choiceStep, order: orderStep, spell: spellStep, build: buildStep, say: sayStep };

export function run(root, ctx) {
  const { mode, unit, skill, units, notes, record, onBack, onAgain, onChallenge } = ctx;
  const easy = mode === 'easy';
  const modeName = easy ? '보충 학습' : '다시 풀기';
  const skillName = SKILL_NAMES[skill] || '';

  // 문항 고르기: 결과 화면에서 넘어온 이번 오답 → 오답 노트 순(최근 것 먼저), 최대 5개
  const pendingIds = takePending(unit.unit, skill);
  let picked = [];
  if (pendingIds?.length) {
    const seen = new Set();
    for (const id of pendingIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const it = resolveItem(id, units);
      if (it) picked.push(it);
    }
  } else {
    picked = notes.filter((n) => n.unit === unit.unit && n.skill === skill);
  }
  picked = picked.slice(0, MAX_ITEMS);
  const plan = picked.map((it) => ({ it, steps: stepsFor(it, mode, units) })).filter((p) => p.steps.length);
  const flat = plan.flatMap((p, pi) => p.steps.map((s, si) => ({ ...s, pi, last: si === p.steps.length - 1 })));

  if (!flat.length) {
    mount(root,
      h('a', { class: 'back', href: '#/notes' }, h('span', { class: 'arrow', 'aria-hidden': 'true', text: '←' }), '오답 노트로'),
      h('h1', { text: `${unit.unit}단원 ${skillName} ${modeName}` }),
      h('div', { class: 'notice' }, h('p', { text: '지금은 다시 풀 문제가 없어요. 틀린 문제가 생기면 여기에서 다시 풀 수 있어요.' })),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-line', type: 'button', text: '단원 화면으로', onclick: onBack })));
    return;
  }

  const speakable = canSpeak();
  const itemOk = plan.map(() => true);
  const results = [];
  let saveFailed = false;
  let index = 0;

  const showStep = () => {
    stopSpeaking();
    const step = flat[index];
    const feedback = h('div', { 'aria-live': 'polite' });
    const nextBtn = h('button', {
      class: 'btn', type: 'button', hidden: true,
      text: index + 1 < flat.length ? '다음 문제' : '결과 보기',
      onclick: () => { index += 1; index < flat.length ? showStep() : finish(); },
    });
    const done = (r) => {
      if (!r.correct) itemOk[step.pi] = false;
      if (step.last) {
        const { it } = plan[step.pi];
        const ok = itemOk[step.pi];
        if (!record({ unit: it.unit, skill: it.skill, level: mode === 'easy' ? 'remedial' : 'retry', itemId: it.itemId, correct: ok, answer: r.mine, selfRating: r.selfRating })) saveFailed = true;
        results.push({ it, correct: ok });
      }
      // 다시 들려 줄 소리: 영어 보기면 바른 답, 순서면 두 문장, 아니면 문제 소리 (스스로 "잘했어요"면 생략)
      const replay = step.kind === 'order' ? step.lines.join(' ')
        : step.kind === 'choice' && step.enOptions ? step.answer
        : step.en || step.say;
      mount(feedback, h('div', { class: `feedback${r.correct ? '' : ' wrong'}` },
        h('strong', { text: r.selfRating ? (r.correct ? '좋아요.' : '괜찮아요. 천천히 한 번 더 들어 봐요.') : r.correct ? '맞았어요.' : '아쉬워요. 바른 답을 보고 소리 내어 읽어 보세요.' }),
        !r.correct && r.right && !r.selfRating ? h('span', {}, '바른 답: ', h('span', { class: 'en', lang: 'en', text: r.right })) : null));
      if (speakable && replay && r.selfRating !== 'good') speak(replay, { slow: !r.correct });
      nextBtn.hidden = false;
      nextBtn.focus();
    };
    const part = RENDER[step.kind](step, done);
    const sayText = part.say || step.say;
    const showText = step.kind === 'choice' ? step.showText : false;
    const [ptext, pbar] = progress(index + 1, flat.length, modeName);
    mount(root,
      h('div', { class: 'act-head' },
        h('button', { class: 'link-btn back', type: 'button', onclick: () => { stopSpeaking(); onBack(); } }, h('span', { class: 'arrow', 'aria-hidden': 'true', text: '←' }), '그만하고 나가기'),
        ptext),
      pbar,
      h('p', { class: 'ask' }, step.ask, h('span', { class: 'stage-tag', text: modeName })),
      step.hint ? h('p', { class: 'hint-box' }, h('span', { class: 'hint-label', text: '힌트' }), h('span', { text: step.hint })) : null,
      sayText && speakable
        ? h('div', { class: 'play-row' },
            h('button', { class: 'btn btn-line', type: 'button', text: part.playLabel || '▶ 듣기', onclick: () => speak(sayText) }),
            h('button', { class: 'btn btn-line', type: 'button', text: '천천히 듣기', onclick: () => speak(sayText, { slow: true }) }))
        : null,
      showText ? h('p', { class: 'shown-text en', lang: 'en', text: step.say }) : null,
      part.el,
      feedback,
      h('div', { class: 'btn-row' }, nextBtn),
    );
    if (speakable && sayText && (part.autoplay ?? true)) speak(sayText, { slow: !!part.slow });
  };

  const finish = () => {
    stopSpeaking();
    const right = results.filter((r) => r.correct).length;
    const all = right === results.length;
    const wrong = results.filter((r) => !r.correct);
    mount(root,
      h('h1', { text: `${unit.unit}단원 ${skillName} ${modeName} 끝` }),
      h('p', { class: 'score' }, h('span', { class: 'big', text: String(right) }), ` / ${results.length} 맞혔어요`),
      saveFailed ? h('div', { class: 'notice notice-error' }, h('p', { text: '기록을 이 기기에 저장하지 못했어요. 오답 노트가 바뀌지 않을 수 있어요.' })) : null,
      all
        ? h('div', { class: 'notice challenge-notice' },
            h('p', {}, h('strong', { text: '모두 맞혔어요. 다시 도전해 볼까요?' })),
            h('p', { text: easy
              ? '쉬운 문제와 힌트로는 다 맞혔어요. 이제 원래 단계 문제로 다시 도전해 보세요. 원래 문제로 맞혀야 오답 노트에서 빠져요.'
              : '다시 풀어 모두 맞혔어요. 이 문제들은 오답 노트에서 빠졌어요.' }))
        : h('div', { class: 'notice notice-warn' },
            h('p', { text: `${wrong.length}문제는 아직 헷갈려요. 바른 답을 소리 내어 읽고 보충 학습을 한 번 더 해 보세요.` })),
      wrong.length
        ? h('ul', { class: 'review' }, wrong.map((r) => h('li', {}, h('span', { class: 'en', lang: 'en', text: r.it.type === 'answer' || r.it.type === 'order' ? `${r.it.q} → ${r.it.a}` : r.it.en }), r.it.ko ? h('span', { text: ` → ${r.it.ko}` }) : null)))
        : null,
      h('div', { class: 'btn-row' },
        all
          ? [
              easy ? h('button', { class: 'btn', type: 'button', text: '다시 도전: 원래 문제로 다시 풀기', onclick: () => onAgain('retry') }) : null,
              h('button', { class: 'btn' + (easy ? ' btn-line' : ''), type: 'button', text: `${unit.unit}단원 ${skillName} 처음부터 하기`, onclick: onChallenge }),
            ]
          : h('button', { class: 'btn', type: 'button', text: '보충 학습 한 번 더', onclick: () => onAgain('easy') }),
        h('a', { class: 'btn btn-line', href: '#/notes', text: '오답 노트로' }),
      ),
    );
  };

  showStep();
}
