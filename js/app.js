// 화면 전환 (주소 #/ 뒤를 보고 화면을 그림)
//   #/            입장(학급 코드+번호) 또는 단원 목록
//   #/enter       입장 화면
//   #/units       단원 목록
//   #/unit/7      단원 화면(영역 고르기)
//   #/unit/7/listen, read, speak, write   활동
//   #/unit/7/diagnose                    진단 5문항 → 단계 추천
//   #/notes                              오답 노트(단원·영역별)
//   #/fix/easy/7/write                   보충 학습(한 단계 쉬운 문제+힌트)
//   #/fix/retry/7/write                  오답 노트 다시 풀기
import { loadUnits, findUnit } from './data.js';
import { canSpeak, canRecognize, stopSpeaking } from './speech.js';
import { getStudent, saveStudent, myAttempts, addAttempt, summarize, getStage, setStage } from './store.js';
import { STAGE_INFO, stageName } from './level.js';
import { h, mount, toast } from './ui.js';
import * as listen from './activities/listen.js';
import * as read from './activities/read.js';
import * as speakAct from './activities/speak.js';
import * as write from './activities/write.js';
import * as diagnose from './activities/diagnose.js';
import * as remedial from './activities/remedial.js';
import { beginActivity, track, todayPlan, wrongNotes, groupNotes, itemLabel, skillBars, SKILL_NAMES } from './feedback.js';

const app = document.getElementById('app');
const who = document.getElementById('who');

const SKILLS = [
  { key: 'listen', name: '듣기', desc: '단어와 질문을 듣고 알맞은 것 고르기', module: listen },
  { key: 'read', name: '읽기', desc: '질문과 대답 잇기, 문장 순서 맞추기', module: read },
  { key: 'speak', name: '말하기', desc: '원어민 소리를 듣고 따라 말하기', module: speakAct },
  { key: 'write', name: '쓰기', desc: '철자 빈칸 채우기, 단어 카드로 문장 만들기', module: write },
];

// 화면을 떠날 때 정리할 것(마이크·음성 인식·녹음)
let cleanup = null;
const setCleanup = (fn) => { cleanup = fn; };
function runCleanup() {
  const fn = cleanup;
  cleanup = null;
  try { fn?.(); } catch (err) { console.warn(err); }
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function renderWho() {
  const s = getStudent();
  if (!s) { who.hidden = true; return; }
  who.hidden = false;
  mount(who, 
    h('span', {}, '학급 ', h('strong', { text: s.classCode }), ` · ${s.studentNo}번`),
    h('button', { class: 'link-btn', type: 'button', text: '번호 바꾸기', onclick: () => go('#/enter') }),
  );
}

function setTitle(text) {
  document.title = text ? `${text} · English Review 5` : 'English Review 5 · 5학년 영어 복습';
}

/* 입장 화면 */
function viewEnter() {
  setTitle('들어가기');
  const last = getStudent();
  const codeInput = h('input', {
    id: 'classCode', name: 'classCode', type: 'text', inputmode: 'text', autocomplete: 'off',
    autocapitalize: 'characters', spellcheck: 'false', maxlength: '12', value: last?.classCode || '',
    'aria-describedby': 'classCodeHint classCodeError',
  });
  const noInput = h('input', {
    id: 'studentNo', name: 'studentNo', type: 'number', inputmode: 'numeric', min: '1', max: '40',
    value: last?.studentNo || '', 'aria-describedby': 'studentNoError',
  });
  const codeErr = h('p', { class: 'error', id: 'classCodeError', hidden: true });
  const noErr = h('p', { class: 'error', id: 'studentNoError', hidden: true });

  const showErr = (input, el, msg) => {
    el.textContent = msg || '';
    el.hidden = !msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };

  const submit = (e) => {
    e.preventDefault();
    const code = codeInput.value.trim().toUpperCase();
    const no = Number(noInput.value);
    let ok = true;
    if (!code) { showErr(codeInput, codeErr, '학급 코드를 적어 주세요.'); ok = false; }
    else if (!/^[A-Z0-9]{2,12}$/.test(code)) { showErr(codeInput, codeErr, '학급 코드는 영어 대문자와 숫자로만 적어요. (2~12자)'); ok = false; }
    else showErr(codeInput, codeErr, '');
    if (!noInput.value) { showErr(noInput, noErr, '내 번호를 적어 주세요.'); ok = false; }
    else if (!Number.isInteger(no) || no < 1 || no > 40) { showErr(noInput, noErr, '번호는 1부터 40 사이의 숫자예요.'); ok = false; }
    else showErr(noInput, noErr, '');
    if (!ok) { (codeErr.hidden ? noInput : codeInput).focus(); return; }
    if (!saveStudent(code, no)) toast('이 기기에 번호를 기억하지 못했어요. 다음에 다시 적어야 해요.');
    renderWho();
    go('#/units');
  };

  mount(app, 
    h('h1', { text: '학급 코드와 번호를 적어 주세요' }),
    h('p', { class: 'lead', text: '이름은 적지 않아요. 선생님이 알려 준 학급 코드와 내 번호만 있으면 돼요.' }),
    last
      ? h('div', { class: 'resume' },
          h('span', {}, '지난번에 쓴 번호: ', h('strong', { text: `${last.classCode} · ${last.studentNo}번` })),
          h('button', { class: 'btn btn-line', type: 'button', text: '이 번호로 들어가기', onclick: () => go('#/units') }))
      : null,
    h('form', { class: 'form', novalidate: true, onsubmit: submit },
      h('div', { class: 'field' },
        h('label', { for: 'classCode', text: '학급 코드' }),
        h('span', { class: 'hint', id: 'classCodeHint', text: '예: 5A3K' }),
        codeInput, codeErr),
      h('div', { class: 'field' },
        h('label', { for: 'studentNo', text: '번호' }),
        noInput, noErr),
      h('div', {}, h('button', { class: 'btn', type: 'submit', text: '들어가기' })),
    ),
  );
}

/* 단원 목록 */
function viewUnits(units) {
  setTitle('단원 고르기');
  const mine = myAttempts();
  mount(app,
    todayBox(mine, units),
    h('h2', { class: 'units-h', text: '복습할 단원을 고르세요' }),
    h('ul', { class: 'rows' },
      units.map((u) => {
        const s = summarize(mine.filter((a) => a.unit === u.unit));
        return h('li', {},
          h('a', { class: 'row-link', href: `#/unit/${u.unit}` },
            h('span', { class: 'row-num', text: String(u.unit) }),
            h('span', {},
              h('span', { class: 'row-title en', lang: 'en', text: u.title }),
              h('span', { class: 'row-topic', text: `${u.unit}단원 · ${u.topic}` })),
            h('span', { class: 'row-stat' + (s.total ? '' : ' empty'), text: s.total ? `${s.total}문제 중 ${s.right}개 맞힘` : '아직 안 했어요' }),
          ));
      })),
  );
}

/* 오늘 할 일: 이어서 하기, 가장 약한 영역·단원, 오답 노트 */
function todayBox(mine, units) {
  const plan = todayPlan(mine, units);
  if (plan.empty) {
    const u = plan.first;
    return h('section', { class: 'today' },
      h('h1', { text: '오늘 할 일' }),
      h('div', { class: 'notice' },
        h('p', {}, h('strong', { text: '아직 푼 문제가 없어요.' })),
        h('p', { text: '문제를 풀면 여기에 영역별 정답률, 가장 약한 영역, 다시 풀 문제가 나타나요. 처음이면 단원에 들어가 진단 5문제로 내 단계를 정해 보세요.' })),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn', href: `#/unit/${u.unit}` }, `${u.unit}단원부터 시작하기`)));
  }
  const { notes } = wrongNotes(mine, units);
  const todo = [];
  if (plan.next) {
    const { unit: u, skill } = plan.next;
    todo.push({
      label: '이어서 하기',
      text: skill
        ? `지난번에 ${plan.last.unit.unit}단원 ${SKILL_NAMES[plan.last.skill]}를 했어요. 이어서 ${u.unit}단원 ${SKILL_NAMES[skill]}를 해 보세요.`
        : `${plan.last.unit.unit}단원 네 영역을 모두 했어요. 다음은 ${u.unit}단원이에요.`,
      href: skill ? `#/unit/${u.unit}/${skill}` : `#/unit/${u.unit}`,
      btn: skill ? `${u.unit}단원 ${SKILL_NAMES[skill]} 하기` : `${u.unit}단원 열기`,
    });
  }
  if (plan.weakSkill && plan.weakUnit) {
    const s = plan.overall[plan.weakSkill];
    const wu = plan.weakUnit;
    const has = notes.some((n) => n.unit === wu.unit.unit && n.skill === plan.weakSkill);
    todo.push({
      label: '가장 약한 곳',
      text: `가장 약한 영역은 ${SKILL_NAMES[plan.weakSkill]}(${s.pct}%)예요. 그중 ${wu.unit.unit}단원이 ${wu.pct}%로 가장 낮아요.`,
      href: has ? `#/fix/easy/${wu.unit.unit}/${plan.weakSkill}` : `#/unit/${wu.unit.unit}/${plan.weakSkill}`,
      btn: has ? `${wu.unit.unit}단원 ${SKILL_NAMES[plan.weakSkill]} 보충 학습` : `${wu.unit.unit}단원 ${SKILL_NAMES[plan.weakSkill]} 다시 하기`,
      warn: true,
    });
  } else {
    todo.push({ label: '가장 약한 곳', text: '80%보다 낮은 영역이 없어요. 아직 안 한 단원이나 도전 단계를 해 보세요.' });
  }
  todo.push(notes.length
    ? { label: '오답 노트', text: `다시 풀 문제가 ${notes.length}개 있어요.`, href: '#/notes', btn: '오답 노트 보기' }
    : { label: '오답 노트', text: '지금은 다시 풀 문제가 없어요.', href: '#/notes', btn: '오답 노트 보기', line: true });

  return h('section', { class: 'today' },
    h('h1', { text: '오늘 할 일' }),
    h('ol', { class: 'todo' }, todo.map((t, i) => h('li', { class: t.warn ? 'warn' : '' },
      h('span', { class: 'todo-n', text: String(i + 1) }),
      h('div', { class: 'todo-body' },
        h('span', { class: 'todo-label', text: t.label }),
        h('p', { text: t.text })),
      t.href ? h('a', { class: 'btn' + (i === 0 ? '' : ' btn-line'), href: t.href, text: t.btn }) : null))),
    h('h2', { text: '영역별 정답률 (모든 단원)' }),
    skillBars(plan.overall, { caption: '모든 단원 영역별 정답률' }),
    h('p', { class: 'muted small', text: `지금까지 ${mine.filter((a) => a.skill in SKILL_NAMES && a.level !== 'remedial').length}문제를 풀었어요. 진단과 보충 학습 문제는 정답률에 넣지 않아요.` }));
}

/* 오답 노트 */
function viewNotes(units) {
  setTitle('오답 노트');
  const mine = myAttempts();
  const { notes, fixed } = wrongNotes(mine, units);
  const head = [
    h('a', { class: 'back', href: '#/units' }, h('span', { class: 'arrow', 'aria-hidden': 'true', text: '←' }), '단원 목록으로'),
    h('h1', { text: '오답 노트' }),
    h('p', { class: 'lead', text: '틀린 문제를 단원·영역별로 모았어요. "다시 풀기"로 맞히면 노트에서 빠져요. 어려우면 "보충 학습"으로 쉬운 문제와 힌트부터 풀어요.' }),
  ];
  if (!mine.some((a) => a.skill in SKILL_NAMES)) {
    mount(app, head, h('div', { class: 'notice' },
      h('p', {}, h('strong', { text: '아직 푼 문제가 없어요.' })),
      h('p', { text: '단원을 골라 듣기·말하기·읽기·쓰기를 풀면 틀린 문제가 여기에 모여요.' })),
    h('a', { class: 'btn', href: '#/units', text: '단원 고르기' }));
    return;
  }
  if (!notes.length) {
    mount(app, head, h('div', { class: 'notice' },
      h('p', {}, h('strong', { text: '지금은 틀린 문제가 없어요.' })),
      h('p', { text: fixed ? `다시 풀어서 고친 문제가 ${fixed}개 있어요. 잘했어요.` : '푼 문제를 모두 맞혔어요. 다른 단원도 해 보세요.' })),
    h('a', { class: 'btn', href: '#/units', text: '단원 고르기' }));
    return;
  }
  const groups = groupNotes(notes);
  const byUnit = new Map();
  for (const g of groups) {
    if (!byUnit.has(g.unit)) byUnit.set(g.unit, []);
    byUnit.get(g.unit).push(g);
  }
  mount(app, head,
    h('p', { class: 'note-sum' }, h('strong', { text: `다시 풀 문제 ${notes.length}개` }), fixed ? ` · 고친 문제 ${fixed}개` : ''),
    [...byUnit].map(([unitNo, gs]) => {
      const u = findUnit(units, unitNo);
      return h('section', { class: 'note-unit' },
        h('h2', {}, `${unitNo}단원 `, h('span', { class: 'en muted', lang: 'en', text: u?.title || '' })),
        gs.map((g) => h('div', { class: 'note-group' },
          h('div', { class: 'note-head' },
            h('h3', { text: `${SKILL_NAMES[g.skill]} · ${g.items.length}문제` }),
            h('div', { class: 'note-btns' },
              h('a', { class: 'btn', href: `#/fix/easy/${g.unit}/${g.skill}`, text: '보충 학습' }),
              h('a', { class: 'btn btn-line', href: `#/fix/retry/${g.unit}/${g.skill}`, text: '다시 풀기' }))),
          h('ul', { class: 'review' }, g.items.map((n) => {
            const l = itemLabel(n);
            return h('li', {},
              h('span', { class: 'en', lang: 'en', text: l.main }),
              l.sub ? h('span', { text: ` ${l.sub}` }) : null,
              n.mine ? h('span', { class: 'mine', text: `내 답: ${n.mine}` }) : null,
              n.wrongTimes > 1 || n.easyDone
                ? h('span', { class: 'note-tags' },
                    n.wrongTimes > 1 ? h('span', { class: 'tag-mini', text: `${n.wrongTimes}번 틀림` }) : null,
                    n.easyDone ? h('span', { class: 'tag-mini ok', text: '보충 학습 맞힘 · 다시 풀기로 확인' }) : null)
                : null);
          })))));
    }));
}

/* 보충 학습 / 다시 풀기 */
function viewFix(units, mode, unit, skill) {
  if (!['easy', 'retry'].includes(mode) || !(skill in SKILL_NAMES)) { go('#/notes'); return; }
  setTitle(`${unit.unit}단원 ${SKILL_NAMES[skill]} ${mode === 'easy' ? '보충 학습' : '다시 풀기'}`);
  const { notes } = wrongNotes(myAttempts(), units);
  let warned = false;
  const record = (attempt) => {
    const ok = addAttempt(attempt);
    if (!ok && !warned) { warned = true; toast('기록을 저장하지 못했어요. 계속 풀 수는 있어요.'); }
    return ok;
  };
  remedial.run(app, {
    mode, unit, skill, units, notes, record,
    onBack: () => go(`#/unit/${unit.unit}`),
    onAgain: (m) => go(`#/fix/${m}/${unit.unit}/${skill}`),
    onChallenge: () => go(`#/unit/${unit.unit}/${skill}`),
  });
}

/* 단원 화면: 영역 고르기 */
function viewUnit(unit) {
  setTitle(`${unit.unit}단원`);
  const mine = myAttempts().filter((a) => a.unit === unit.unit);
  const keys = (unit.functions || []).filter((f) => f.q || (f.a && f.a.length));
  mount(app, 
    h('a', { class: 'back', href: '#/units' }, h('span', { class: 'arrow', 'aria-hidden': 'true', text: '←' }), '단원 목록으로'),
    h('h1', {}, `${unit.unit}단원 `, h('span', { class: 'en', lang: 'en', text: unit.title })),
    h('p', { class: 'lead', text: unit.topic }),
    keys.length
      ? [
          h('h2', { text: '핵심 표현' }),
          h('ul', { class: 'keys' }, keys.map((f) =>
            h('li', {},
              h('span', { class: 'label', text: f.label }),
              h('span', { class: 'en', lang: 'en', text: [f.q, ...(f.a || [])].filter(Boolean).join('  /  ') })))),
        ]
      : null,
    stageSection(unit),
    h('h2', { text: '무엇을 할까요?' }),
    h('div', { class: 'skills' },
      SKILLS.map((sk) => {
        const s = summarize(mine.filter((a) => a.skill === sk.key));
        let stat = s.total ? `${s.total}문제 중 ${s.right}개 맞힘` : '아직 안 했어요';
        if (!sk.module) stat = '준비 중이에요';
        else if (sk.key === 'listen' && !canSpeak()) stat = '이 브라우저는 소리가 나오지 않아 글자로 풀어요';
        else if (sk.key === 'speak' && !canRecognize()) stat = `${stat} · 녹음해서 스스로 평가`;
        return h('button', {
          class: 'skill', type: 'button', disabled: !sk.module,
          onclick: () => go(`#/unit/${unit.unit}/${sk.key}`),
        },
          h('span', { class: 'name', text: sk.name }),
          h('span', { class: 'desc', text: sk.desc }),
          h('span', { class: 'stat', text: stat }));
      })),
    unitNotes(unit),
    canRecognize() ? null : h('p', { class: 'muted', text: '이 브라우저는 음성 인식이 되지 않아요. 말하기는 녹음한 내 목소리와 원어민 소리를 번갈아 듣고 스스로 평가해요.' }),
  );
}

// 단원 화면 아래: 이 단원에서 다시 풀 문제
function unitNotes(unit) {
  const units = [unit];
  const { notes } = wrongNotes(myAttempts().filter((a) => a.unit === unit.unit), units);
  if (!notes.length) return null;
  return h('div', { class: 'notice notice-warn unit-notes' },
    h('p', { text: `이 단원에서 다시 풀 문제가 ${notes.length}개 있어요. 보충 학습으로 쉬운 문제와 힌트부터 풀어 보세요.` }),
    h('a', { class: 'btn btn-line', href: '#/notes', text: '오답 노트 보기' }));
}

/* 단계: 진단 전이면 진단 안내, 정했으면 지금 단계와 바꾸기 버튼 */
function stageSection(unit) {
  const cur = getStage(unit.unit);
  const pick = (s) => {
    if (!setStage(unit.unit, s, { from: 'self' })) toast('단계를 이 기기에 저장하지 못했어요. 이번에만 적용돼요.');
    else toast(`${stageName(s)} 단계로 바꿨어요.`, 2500);
    render();
  };
  if (!cur) {
    return h('section', { class: 'stage-box' },
      h('h2', { text: '내 단계 정하기' }),
      h('p', { text: '처음이면 진단 5문제(듣기·읽기·쓰기)를 풀어 보세요. 맞힌 수로 알맞은 단계를 알려 줘요.' }),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn', href: `#/unit/${unit.unit}/diagnose`, text: '진단 5문제 풀기' }),
        h('button', { class: 'btn btn-line', type: 'button', text: '건너뛰고 기본 단계로', onclick: () => pick('core') })));
  }
  const how = cur.from === 'diagnose' ? `진단에서 ${cur.score}/5 맞혀 추천받았어요.` : '내가 고른 단계예요.';
  return h('section', { class: 'stage-box' },
    h('h2', {}, '내 단계: ', h('span', { class: 'stage-now', text: STAGE_INFO[cur.stage].name })),
    h('p', { class: 'muted' }, `${STAGE_INFO[cur.stage].desc} ${how} `,
      h('a', { href: `#/unit/${unit.unit}/diagnose`, text: '진단 다시 하기' })),
    diagnose.stageButtons(null, cur.stage, pick));
}

/* 활동 */
function viewActivity(unit, units, key) {
  const isDiag = key === 'diagnose';
  const sk = isDiag ? { name: '진단', module: diagnose } : SKILLS.find((s) => s.key === key && s.module);
  if (!sk) { go(`#/unit/${unit.unit}`); return; }
  setTitle(`${unit.unit}단원 ${sk.name}`);
  const stage = getStage(unit.unit)?.stage || 'core';
  let warned = false;
  if (!isDiag) beginActivity({ unit: unit.unit, skill: key, stage });
  // 기록의 level 은 그때 학생의 단계 (진단은 'diagnose')
  const record = (attempt) => {
    const full = { ...attempt, level: isDiag ? 'diagnose' : stage };
    if (!isDiag) track(full);
    const ok = addAttempt(full);
    if (!ok && !warned) { warned = true; toast('기록을 저장하지 못했어요. 계속 풀 수는 있어요.'); }
    return ok;
  };
  const onStage = (s, info) => {
    if (!setStage(unit.unit, s, info)) toast('단계를 이 기기에 저장하지 못했어요. 이번에만 적용돼요.');
    go(`#/unit/${unit.unit}`);
  };
  sk.module.run(app, { unit, units, record, stage, currentStage: getStage(unit.unit)?.stage, setCleanup, onStage, onBack: () => go(`#/unit/${unit.unit}`) });
}

function viewError(err) {
  setTitle('오류');
  console.warn(err);
  mount(app, 
    h('h1', { text: '학습 내용을 불러오지 못했어요' }),
    h('div', { class: 'notice notice-error' },
      h('p', { text: '인터넷 연결을 확인하고 다시 시도해 주세요. 계속 안 되면 선생님께 알려 주세요.' })),
    h('button', { class: 'btn', type: 'button', text: '다시 시도', onclick: () => render() }),
  );
}

async function render() {
  runCleanup();
  stopSpeaking();
  renderWho();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const student = getStudent();

  if (parts[0] === 'enter' || !student) { viewEnter(); return; }

  let units;
  try {
    units = await loadUnits();
  } catch (err) {
    viewError(err);
    return;
  }

  if (parts[0] === 'notes') {
    viewNotes(units);
  } else if (parts[0] === 'fix') {
    const unit = findUnit(units, parts[2]);
    if (!unit) { go('#/notes'); return; }
    viewFix(units, parts[1], unit, parts[3]);
  } else if (parts[0] === 'unit') {
    const unit = findUnit(units, parts[1]);
    if (!unit) { go('#/units'); return; }
    if (parts[2]) viewActivity(unit, units, parts[2]);
    else viewUnit(unit);
  } else {
    viewUnits(units);
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
render();
