// 학생 스스로 피드백 (요구사항 4)
// - 영역별(듣기/말하기/읽기/쓰기) 정답률과 막대
// - "잘한 점 / 더 연습할 점" 문장을 규칙으로 만듦 (예: 쓰기 50% 미만이면 철자 연습 권유)
// - 오답 노트: 기기에 남은 기록에서 지금도 틀린 문항을 단원·영역별로 모음
// - 오늘 할 일: 가장 약한 영역·단원 추천, 이어서 하기
// 기록은 이 기기(localStorage)의 내 기록만 씀. 다른 학생 기록은 보지 않음
import { qaPairs, slug } from './data.js';
import { sentencePool, questionPool, stageName } from './level.js';
import { h } from './ui.js';

export const SKILL_ORDER = ['listen', 'speak', 'read', 'write'];
export const SKILL_NAMES = { listen: '듣기', speak: '말하기', read: '읽기', write: '쓰기' };

// 진단과 보충 학습(쉬운 문제)은 정답률에 넣지 않음. 다시 풀기(retry)는 넣음
export const counts = (a) => a.skill in SKILL_NAMES && a.level !== 'remedial';

export function pctOf(right, total) {
  return total ? Math.round((right / total) * 100) : null;
}

// 영역별 { total, right, pct }
export function skillStats(list) {
  const out = {};
  for (const k of SKILL_ORDER) out[k] = { total: 0, right: 0, pct: null };
  for (const a of list) {
    if (!counts(a)) continue;
    out[a.skill].total += 1;
    if (a.correct) out[a.skill].right += 1;
  }
  for (const k of SKILL_ORDER) out[k].pct = pctOf(out[k].right, out[k].total);
  return out;
}

/* ---------- 이번 활동 기록 모으기 (결과 화면에서 씀) ---------- */
let session = { unit: null, skill: null, stage: 'core', attempts: [] };

export function beginActivity({ unit, skill, stage }) {
  session = { unit, skill, stage: stage || 'core', attempts: [] };
}
export function track(attempt) {
  session.attempts.push(attempt);
}
// 결과 화면이 한 번 가져가면 비움(한 번 더 하기를 누르면 새로 모음)
export function takeSession() {
  const s = session;
  session = { ...session, attempts: [] };
  return s;
}

/* ---------- 잘한 점 / 더 연습할 점 ---------- */
const PRAISE = {
  listen: '영어를 듣고 뜻과 대답을 잘 알아들어요.',
  speak: '원어민 소리를 잘 따라 말해요.',
  read: '질문과 대답을 잘 읽고 이어요.',
  write: '철자와 문장 순서를 잘 기억해요.',
};
const LOW = { // 50% 미만
  listen: '듣기가 50%보다 낮아요. "천천히 듣기"로 두 번 듣고 골라 보세요. 보충 학습에서는 글자를 보면서 들을 수 있어요.',
  speak: '말하기가 50%보다 낮아요. 원어민 소리를 천천히 듣고 한 단어씩 따라 말해 보세요.',
  read: '읽기가 50%보다 낮아요. 질문의 첫 낱말(What time, How much 등)을 보고 무엇을 묻는지 먼저 생각해 보세요.',
  write: '쓰기가 50%보다 낮아요. 보충 학습에서 단어 철자부터 천천히 연습해 보세요.',
};
const MID = { // 50% 이상 80% 미만
  listen: '헷갈린 단어는 소리를 다시 들으며 뜻을 소리 내어 말해 보세요.',
  speak: '틀린 단어만 골라 원어민 소리와 번갈아 말해 보세요.',
  read: '틀린 짝을 소리 내어 읽고, 질문과 대답을 한 번 더 이어 보세요.',
  write: '단어 카드를 놓기 전에 문장을 소리 내어 읽고, 첫 단어부터 차례로 놓아 보세요.',
};
const NEXT_STAGE = { basic: 'core', core: 'challenge' };

// stats: skillStats(그 단원 기록), sessionRight/sessionTotal: 이번 활동 점수
export function advise(stats, { stage = 'core', sessionRight = null, sessionTotal = null, skill = null } = {}) {
  const good = [];
  const more = [];
  if (sessionTotal && sessionRight === sessionTotal) good.push(`이번 ${SKILL_NAMES[skill] || '활동'}에서 ${sessionTotal}문제를 모두 맞혔어요.`);
  for (const k of SKILL_ORDER) {
    const s = stats[k];
    if (s.total >= 2 && s.pct >= 80) good.push(`${SKILL_NAMES[k]} ${s.pct}%: ${PRAISE[k]}`);
  }
  for (const k of SKILL_ORDER) {
    const s = stats[k];
    if (s.total < 2) continue;
    if (s.pct < 50) more.push(LOW[k]);
    else if (s.pct < 80) more.push(`${SKILL_NAMES[k]} ${s.pct}%: ${MID[k]}`);
  }
  const notYet = SKILL_ORDER.filter((k) => stats[k].total === 0).map((k) => SKILL_NAMES[k]);
  if (notYet.length && notYet.length < 4) more.push(`아직 ${notYet.join('·')} 활동을 하지 않았어요. 네 영역을 고르게 해 보세요.`);
  const done = SKILL_ORDER.filter((k) => stats[k].total >= 2);
  if (done.length >= 2 && done.every((k) => stats[k].pct >= 80) && NEXT_STAGE[stage]) {
    good.push(`지금 단계(${stageName(stage)})를 잘 해냈어요. ${stageName(NEXT_STAGE[stage])} 단계에 도전해 보세요.`);
  }
  if (!good.length) good.push('끝까지 풀었어요. 포기하지 않고 끝까지 한 것이 잘한 점이에요.');
  if (!more.length) more.push('지금처럼 꾸준히 복습해요. 다른 단원도 해 보세요.');
  return { good, more };
}

/* ---------- 문항 찾기: 기록의 itemId → 표현 ---------- */
const indexCache = new Map();
function unitIndex(unit) {
  if (indexCache.has(unit.unit)) return indexCache.get(unit.unit);
  const words = new Map();
  for (const list of [unit.words, unit.phrases]) {
    for (const w of list || []) if (w.en) words.set(slug(w.en), { en: w.en, ko: w.ko || '' });
  }
  const qa = new Map();
  for (const p of qaPairs(unit)) qa.set(`${slug(p.q)}-${slug(p.a)}`, p);
  const sents = new Map();
  for (const s of sentencePool(unit, 'core')) sents.set(slug(s.en), s);
  for (const q of questionPool(unit)) if (!sents.has(slug(q.en))) sents.set(slug(q.en), { en: q.en, q: '' });
  const idx = { words, qa, sents };
  indexCache.set(unit.unit, idx);
  return idx;
}

// 돌려주는 모양: { unit, skill, type, en, ko, q, a }
//   type: meaning(단어 뜻) / answer(질문→대답) / order(문답 순서) / spell(철자) / build(문장 만들기) / say(따라 말하기)
export function resolveItem(itemId, units) {
  const m = /^u(\d+)-(listen|read|write|speak)-(.+)$/.exec(itemId || '');
  if (!m) return null;
  const unit = units.find((u) => u.unit === Number(m[1]));
  if (!unit) return null;
  const [, , skill, rest] = m;
  const idx = unitIndex(unit);
  const base = { unit: unit.unit, skill, itemId };
  const word = (key, type) => { const w = idx.words.get(key); return w ? { ...base, type, en: w.en, ko: w.ko } : null; };
  const pair = (key, type) => { const p = idx.qa.get(key); return p ? { ...base, type, q: p.q, a: p.a, en: p.a } : null; };
  const cut = (prefix) => rest.slice(prefix.length);
  if (skill === 'listen' && rest.startsWith('meaning-')) return word(cut('meaning-'), 'meaning');
  if (skill === 'listen' && rest.startsWith('answer-')) return pair(cut('answer-'), 'answer');
  if (skill === 'read' && rest.startsWith('meaning-')) return word(cut('meaning-'), 'meaning');
  if (skill === 'read' && rest.startsWith('qa-')) return pair(cut('qa-'), 'answer');
  if (skill === 'read' && rest.startsWith('order-')) return pair(cut('order-'), 'order');
  if (skill === 'write' && rest.startsWith('spell-')) return word(cut('spell-'), 'spell');
  if (skill === 'write' && rest.startsWith('order-')) {
    const s = idx.sents.get(cut('order-'));
    return s ? { ...base, type: 'build', en: s.en, q: s.q || '' } : null;
  }
  if (skill === 'speak') {
    const w = idx.words.get(rest);
    if (w) return { ...base, type: 'say', en: w.en, ko: w.ko };
    const s = idx.sents.get(rest);
    return s ? { ...base, type: 'say', en: s.en, ko: '' } : null;
  }
  return null;
}

// 화면에 보일 한 줄 설명
export function itemLabel(it) {
  if (!it) return '';
  if (it.type === 'answer') return { main: it.q, sub: `→ ${it.a}` };
  if (it.type === 'order') return { main: `${it.q} → ${it.a}`, sub: '' };
  if (it.ko) return { main: it.en, sub: `→ ${it.ko}` };
  return { main: it.en, sub: '' };
}

/* ---------- 오답 노트 ---------- */
// 문항마다 마지막 기록(보충 학습 제외)이 틀렸으면 노트에 남음. 다시 풀어 맞히면 빠짐
// easyDone: 그 뒤 보충 학습에서 맞힘
export function wrongNotes(list, units) {
  const byId = new Map();
  for (const a of list) {
    if (!(a.skill in SKILL_NAMES) || !a.itemId) continue;
    if (!byId.has(a.itemId)) byId.set(a.itemId, []);
    byId.get(a.itemId).push(a);
  }
  const notes = [];
  let fixed = 0;
  for (const [itemId, rows] of byId) {
    rows.sort((x, y) => String(x.at).localeCompare(String(y.at)));
    const real = rows.filter((a) => a.level !== 'remedial');
    const last = real[real.length - 1];
    if (!last) continue;
    if (last.correct) {
      if (real.some((a) => !a.correct)) fixed += 1;
      continue;
    }
    const item = resolveItem(itemId, units);
    if (!item) continue;
    const after = rows.filter((a) => a.level === 'remedial' && String(a.at) > String(last.at));
    notes.push({
      ...item,
      unit: last.unit ?? item.unit,
      mine: last.answer || (last.selfRating ? `스스로 평가: ${last.selfRating === 'soso' ? '조금' : '다시'}` : ''),
      at: last.at,
      wrongTimes: real.filter((a) => !a.correct).length,
      easyDone: after.length > 0 && after[after.length - 1].correct,
    });
  }
  notes.sort((x, y) => String(y.at).localeCompare(String(x.at)));
  return { notes, fixed };
}

export function groupNotes(notes) {
  const groups = new Map();
  for (const n of notes) {
    const key = `${n.unit}-${n.skill}`;
    if (!groups.has(key)) groups.set(key, { unit: n.unit, skill: n.skill, items: [] });
    groups.get(key).items.push(n);
  }
  return [...groups.values()].sort((a, b) => a.unit - b.unit || SKILL_ORDER.indexOf(a.skill) - SKILL_ORDER.indexOf(b.skill));
}

/* ---------- 오늘 할 일 ---------- */
// 가장 약한 영역(전체 단원 합)과 그 영역에서 가장 약한 단원, 이어서 할 활동
export function todayPlan(list, units) {
  const real = list.filter(counts);
  if (!real.length) return { empty: true, first: units[0] };
  const overall = skillStats(real);
  const weakSkill = SKILL_ORDER
    .filter((k) => overall[k].total >= 2 && overall[k].pct < 80)
    .sort((a, b) => overall[a].pct - overall[b].pct || overall[b].total - overall[a].total)[0] || null;
  let weakUnit = null;
  if (weakSkill) {
    const per = units.map((u) => {
      const s = skillStats(real.filter((a) => a.unit === u.unit))[weakSkill];
      return { unit: u, ...s };
    }).filter((x) => x.total > 0).sort((a, b) => a.pct - b.pct || b.total - a.total);
    weakUnit = per[0] || null;
  }
  // 이어서 하기: 마지막으로 한 단원에서 아직 안 한 영역, 다 했으면 다음 단원
  const last = [...real].sort((x, y) => String(y.at).localeCompare(String(x.at)))[0];
  const lastUnit = units.find((u) => u.unit === last.unit) || units[0];
  const doneSkills = new Set(real.filter((a) => a.unit === lastUnit.unit).map((a) => a.skill));
  const nextSkill = SKILL_ORDER.find((k) => !doneSkills.has(k));
  let next;
  if (nextSkill) next = { unit: lastUnit, skill: nextSkill };
  else {
    const started = new Set(real.map((a) => a.unit));
    const fresh = units.find((u) => !started.has(u.unit));
    next = fresh ? { unit: fresh, skill: null } : null;
  }
  return { empty: false, overall, weakSkill, weakUnit, last: { unit: lastUnit, skill: last.skill }, next };
}

/* ---------- 화면 조각 ---------- */
// 영역별 정답률 막대 4줄
export function skillBars(stats, { caption } = {}) {
  return h('div', { class: 'skill-bars', role: 'list', 'aria-label': caption || '영역별 정답률' },
    SKILL_ORDER.map((k) => {
      const s = stats[k];
      const none = s.total === 0;
      const low = !none && s.pct < 50;
      return h('div', { class: 'sb-row' + (none ? ' none' : ''), role: 'listitem' },
        h('span', { class: 'sb-name', text: SKILL_NAMES[k] }),
        h('span', { class: 'sb-track', 'aria-hidden': 'true' },
          none ? null : h('span', { class: 'sb-fill' + (low ? ' low' : ''), style: `width:${Math.max(s.pct, 2)}%` })),
        h('span', { class: 'sb-num', text: none ? '아직 안 했어요' : `${s.pct}% · ${s.total}문제 중 ${s.right}개` }));
    }));
}

export function adviceBlock({ good, more }) {
  return h('div', { class: 'advice' },
    h('section', { class: 'adv adv-good' },
      h('h2', { text: '잘한 점' }),
      h('ul', {}, good.map((t) => h('li', { text: t })))),
    h('section', { class: 'adv adv-more' },
      h('h2', { text: '더 연습할 점' }),
      h('ul', {}, more.map((t) => h('li', { text: t })))));
}

// 보충 학습 힌트: 질문이 무엇을 묻는지
export function questionHint(q) {
  const s = (q || '').toLowerCase();
  if (s.startsWith('what time')) return '몇 시에 하는지 묻는 질문이에요. 대답에 시각(at ...)이 들어가요.';
  if (s.startsWith('how much')) return '값(가격)이 얼마인지 묻는 질문이에요. 대답에 돈이 들어가요.';
  if (s.startsWith('how was')) return '어땠는지 묻는 질문이에요. It was ...로 대답해요.';
  if (s.startsWith('what did you do')) return '무엇을 했는지(지난 일) 묻는 질문이에요. 대답에 지난 일을 말하는 낱말이 들어가요.';
  if (s.startsWith('what would you like')) return '무엇을 먹고 싶은지 묻는 질문이에요. I\'d like ...로 대답해요.';
  if (s.startsWith('do you want')) return '더 먹을지 묻는 질문이에요. Yes나 No로 대답해요.';
  if (s.startsWith('what color')) return '어떤 색을 원하는지 묻는 질문이에요.';
  if (s.includes('favorite subject')) return '가장 좋아하는 과목을 묻는 질문이에요.';
  if (s.startsWith('really')) return '"정말?" 하고 되묻는 말이에요.';
  return `질문의 첫 낱말 "${(q || '').split(/\s+/).slice(0, 2).join(' ')}"을 보고 무엇을 묻는지 생각해 보세요.`;
}
