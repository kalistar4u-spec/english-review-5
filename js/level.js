// 수준별 단계: 기초(basic) / 기본(core) / 도전(challenge)
// units.json의 level 태그로 문항을 고름
//   기초: level=basic 표현(신출 어휘, 단원 어구, 의사소통 기능 대답) + 힌트 많이(첫 글자, 한국어 뜻, 천천히 듣기)
//   기본: basic + core(주요 표현 연습, 언어 형식) 섞음, 뜻·듣기 힌트
//   도전: core 문장 전체를 힌트 없이
import { qaPairs } from './data.js';

export const STAGE_INFO = {
  basic: { name: '기초', desc: '첫 글자, 한국어 뜻, 천천히 듣기 힌트를 많이 줘요.' },
  core: { name: '기본', desc: '뜻과 듣기 힌트를 보며 단원 문장을 연습해요.' },
  challenge: { name: '도전', desc: '힌트 없이 문장 전체를 듣고 말하고 써요.' },
};

export const stageName = (s) => STAGE_INFO[s]?.name || '기본';

// 진단 5문항 맞힌 수 → 추천 단계
export function recommendStage(right, total = 5) {
  if (right >= total) return 'challenge';
  if (right >= Math.ceil(total * 0.6)) return 'core';
  return 'basic';
}

// 단어·어구 (뜻이 있는 것)
export function wordPool(unit, stage) {
  const words = (unit.words || []).filter((w) => w.en && w.ko).map((w) => ({ ...w, kind: 'word', level: w.level || 'basic' }));
  const phrases = (unit.phrases || []).filter((w) => w.en && w.ko).map((w) => ({ ...w, kind: 'phrase', level: w.level || 'basic' }));
  if (stage === 'basic') return words.filter((w) => w.level === 'basic');
  if (stage === 'challenge') return [...phrases, ...words];
  return [...words, ...phrases];
}

// 문장 (대답 문장과 언어 형식). 기초는 basic 태그(의사소통 기능 대답)만
export function sentencePool(unit, stage) {
  const out = [];
  const seen = new Set();
  const add = (en, level, q = '') => {
    const t = (en || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push({ en: t, level: level || 'basic', q });
  };
  for (const p of qaPairs(unit)) add(p.a, p.level, p.q);
  for (const f of unit.forms || []) add(f.en, f.level);
  const basic = out.filter((s) => s.level === 'basic');
  const core = out.filter((s) => s.level !== 'basic');
  if (stage === 'basic') return basic.length ? basic : out;
  if (stage === 'challenge') return core.length ? core : out;
  return out;
}

// 단계 문장이 n개보다 적으면 기본(core) 문장으로 채움 (힌트는 그 단계대로)
export function sentencesAtLeast(unit, stage, n, minWords = 1) {
  const ok = (s) => s.en.split(/\s+/).length >= minWords;
  const first = sentencePool(unit, stage).filter(ok);
  if (first.length >= n) return first;
  const have = new Set(first.map((s) => s.en));
  return [...first, ...sentencePool(unit, 'core').filter((s) => ok(s) && !have.has(s.en))];
}

// 질문 문장 (말하기 도전에서 질문도 따라 말함)
export function questionPool(unit) {
  return [...new Set(qaPairs(unit).map((p) => p.q))].map((q) => ({ en: q, level: 'core' }));
}
