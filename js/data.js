// data/units.json 읽기와 문항 재료 만들기
// 앱은 units.json의 핵심 표현(의사소통 기능, 언어 형식, 신출 어휘, 단원 어구, 주요 표현 연습)만 씁니다.

let cache = null;

export async function loadUnits() {
  if (cache) return cache;
  const res = await fetch('data/units.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`units.json ${res.status}`);
  const json = await res.json();
  cache = json.units;
  return cache;
}

export function findUnit(units, no) {
  return units.find((u) => u.unit === Number(no)) || null;
}

// 단어·어구와 뜻 (뜻이 있는 것만, 같은 뜻은 하나만)
export function vocab(unit) {
  const seen = new Set();
  const out = [];
  for (const [kind, list] of [['word', unit.words], ['phrase', unit.phrases]]) {
    for (const it of list || []) {
      if (!it.en || !it.ko || seen.has(it.ko)) continue;
      seen.add(it.ko);
      out.push({ kind, en: it.en, ko: it.ko, level: it.level || 'basic' });
    }
  }
  return out;
}

// 두 단어가 한 문제에 함께 나오면 헷갈리는지 (예: glass/glasses → 안경, sock/socks)
export function conflicts(a, b) {
  const ea = a.en.toLowerCase();
  const eb = b.en.toLowerCase();
  if (ea.startsWith(eb) || eb.startsWith(ea)) return true;
  const tokens = (s) => s.split(/[,()\s]+/).filter((t) => t.length > 0);
  const ta = new Set(tokens(a.ko));
  return tokens(b.ko).some((t) => ta.has(t));
}

// 서로 헷갈리지 않는 단어 n개 고르기
export function pickDistinct(list, n, shuffleFn, exclude = []) {
  const out = [];
  for (const it of shuffleFn(list)) {
    if (out.length >= n) break;
    if ([...exclude, ...out].some((o) => o === it || conflicts(o, it))) continue;
    out.push(it);
  }
  return out;
}

// 질문과 대답 짝 (functions의 q + practice의 q). 질문이나 대답이 비어 있으면 뺌
export function qaPairs(unit) {
  const seen = new Set();
  const out = [];
  const add = (q, a, level, from) => {
    if (!q || !a) return;
    const key = `${q}|${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ unit: unit.unit, q, a, level: level || 'basic', from });
  };
  for (const f of unit.functions || []) for (const a of f.a || []) add(f.q, a, f.level, 'function');
  for (const p of unit.practice || []) add(p.q, p.a, p.level, 'practice');
  return out;
}

// 같은 "종류"의 질문이면 서로의 대답이 그럴듯해서 오답 보기로 쓰지 않음
// 예) How much are the glasses? / How much are the socks? → 같은 종류
// What time do you ...? 는 대답에 동사가 그대로 나와 구분되므로 질문 전체를 종류로 봄
export function kindOf(q) {
  const s = q.toLowerCase().replace(/[?.!,]/g, '').trim();
  if (s.startsWith('what time')) return s;
  return s.split(/\s+/).slice(0, 3).join(' ');
}

export function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
