// 따라 말하기: 목표 문장과 인식된 말을 단어별로 비교
// - 대소문자·문장 부호 무시, 숫자 말(seven thirty)과 숫자(7:30)를 같게 봄
// - 줄임말(I'd, They're, What's)은 풀어서 비교 (인식기가 They are 로 적어도 맞게)
// - 순서를 지키는 가장 긴 공통 부분(LCS)으로 맞은 단어를 찾음

const NUM = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', twenty: '20',
  thirty: '30', forty: '40', fifty: '50', sixty: '60', hundred: '100',
};
const SAME = { too: 'to', two: 'to', '2': 'to', four: 'for', '4': 'for', grandmother: 'grandma', okay: 'ok' };
const CONTRACT = [
  [/\bi'd\b/g, 'i would'], [/\bi'm\b/g, 'i am'], [/(\w)'re\b/g, '$1 are'], [/\bwhat's\b/g, 'what is'],
  [/\bit's\b/g, 'it is'], [/\bthat's\b/g, 'that is'], [/(\w)n't\b/g, '$1 not'],
];

// 한 단어(또는 인식 결과 전체)를 비교용 토큰 목록으로
export function canon(text) {
  let s = String(text).toLowerCase().replace(/[’‘`]/g, "'");
  for (const [re, to] of CONTRACT) s = s.replace(re, to);
  s = s.replace(/(\d),(\d{3})/g, '$1$2') // 50,000 → 50000
    .replace(/(\d):(\d\d)/g, '$1 $2') // 7:30 → 7 30
    .replace(/\bp\.\s?e\.?/g, 'pe')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/'/g, '');
  return s.split(/\s+/).filter(Boolean).map((t) => SAME[NUM[t] || t] || NUM[t] || t);
}

const isNum = (t) => /^\d+$/.test(t);

// 여러 단어로 된 숫자 합치기: 20 thousand → 20000, 20 5 → 25. items: [{ tok, owners }]
function mergeNumbers(items) {
  const out = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev && isNum(prev.tok) && it.tok === 'thousand') {
      prev.tok = String(Number(prev.tok) * 1000); prev.owners = [...prev.owners, ...it.owners];
    } else if (prev && isNum(prev.tok) && isNum(it.tok) && Number(prev.tok) >= 20 && Number(prev.tok) < 100
      && Number(prev.tok) % 10 === 0 && Number(it.tok) < 10) {
      prev.tok = String(Number(prev.tok) + Number(it.tok)); prev.owners = [...prev.owners, ...it.owners];
    } else out.push({ ...it, owners: [...it.owners] });
  }
  return out;
}

// 인식기가 시각을 붙여 적은 경우(330, 730) → 3 30, 7 30
function splitTimes(items) {
  const out = [];
  for (const it of items) {
    const m = /^(\d{1,2})([1-5]\d)$/.exec(it.tok);
    if (m && Number(it.tok) % 100 !== 0) { out.push({ tok: m[1], owners: it.owners }, { tok: m[2], owners: it.owners }); }
    else out.push(it);
  }
  return out;
}

// target 문장과 heard(인식 결과)를 비교
// → { words: [{ text, ok }], right, total, ratio }
export function compareWords(target, heard) {
  const words = String(target).trim().split(/\s+/).filter(Boolean);
  const flat = mergeNumbers(words.flatMap((w, i) => canon(w).map((tok) => ({ tok, owners: [i] }))));
  const h = splitTimes(mergeNumbers(canon(heard).map((tok) => ({ tok, owners: [] })))).map((x) => x.tok);
  const n = flat.length;
  const m = h.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = flat[i].tok === h[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const hit = new Array(n).fill(false);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (flat[i].tok === h[j]) { hit[i] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const result = words.map((text, i) => {
    const mine = flat.map((f, k) => (f.owners.includes(i) ? hit[k] : null)).filter((x) => x !== null);
    return { text, ok: mine.length > 0 && mine.every(Boolean) };
  });
  const right = result.filter((w) => w.ok).length;
  return { words: result, right, total: result.length, ratio: result.length ? right / result.length : 0 };
}

// 인식 후보 여러 개 중 가장 많이 맞은 것
export function bestOf(target, transcripts) {
  let best = null;
  for (const t of transcripts) {
    const r = { heard: t, ...compareWords(target, t) };
    if (!best || r.ratio > best.ratio) best = r;
  }
  return best;
}
