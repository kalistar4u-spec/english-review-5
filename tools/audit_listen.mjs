// 듣기 문제 전수 점검: node tools/audit_listen.mjs [단원마다 만들 횟수=300]
// - 보기에 정답이 정확히 한 번 있는지, 보기가 겹치지 않는지, 보기가 4개(뜻)/3개(대답)인지
// - 오답 보기 중에 사실 정답이 될 수 있는 것이 없는지(같은 질문의 다른 대답, 같은 영어의 다른 뜻)
// - 들려줄 문장의 음성 파일이 있는지
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.fetch = async () => { throw new Error('offline'); }; // speech.js가 불러오는 index는 점검에 필요 없음
const { buildItems } = await import('../js/activities/listen.js');
const { vocab, qaPairs } = await import('../js/data.js');

const units = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8')).units;
const audio = JSON.parse(readFileSync(join(root, 'audio/index.json'), 'utf8')).files;
const runs = Number(process.argv[2] || 300);

// 질문별로 맞는 대답 모두, 영어별로 맞는 뜻 모두
const answersOf = new Map();
for (const u of units) for (const p of qaPairs(u)) {
  if (!answersOf.has(p.q)) answersOf.set(p.q, new Set());
  answersOf.get(p.q).add(p.a);
}
const meaningsOf = new Map();
for (const u of units) for (const w of [...u.words, ...u.phrases]) {
  if (!meaningsOf.has(w.en)) meaningsOf.set(w.en, new Set());
  meaningsOf.get(w.en).add(w.ko);
}

const problems = new Map();
const add = (msg) => problems.set(msg, (problems.get(msg) || 0) + 1);
let total = 0;
for (const u of units) {
  for (let r = 0; r < runs; r++) {
    for (const it of buildItems(u, units)) {
      total += 1;
      const where = `${u.unit}단원 [${it.type}] "${it.say}"`;
      const hits = it.options.filter((o) => o === it.answer).length;
      if (hits !== 1) add(`${where}: 보기에 정답 "${it.answer}"이 ${hits}번 → ${it.options.join(' / ')}`);
      if (new Set(it.options).size !== it.options.length) add(`${where}: 보기가 겹침 → ${it.options.join(' / ')}`);
      const want = it.type === 'meaning' ? 4 : 3;
      if (it.options.length !== want) add(`${where}: 보기 ${it.options.length}개(기대 ${want})`);
      const valid = it.type === 'meaning' ? meaningsOf.get(it.say) : answersOf.get(it.say);
      for (const o of it.options) if (o !== it.answer && valid?.has(o)) add(`${where}: 오답 보기 "${o}"도 정답이 될 수 있음`);
      if (!audio[it.say]) add(`${where}: 음성 파일 없음`);
      else if (!existsSync(join(root, 'audio', audio[it.say] + '.mp3'))) add(`${where}: mp3 파일 없음`);
    }
  }
}
console.log(`만든 문제 ${total}개 (단원마다 ${runs}번)`);
if (!problems.size) console.log('문제 없음');
for (const [m, n] of problems) console.log(`${n}회  ${m}`);
process.exit(problems.size ? 1 : 0);
