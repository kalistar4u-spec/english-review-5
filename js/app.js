// 화면 전환 (주소 #/ 뒤를 보고 화면을 그림)
//   #/            입장(학급 코드+번호) 또는 단원 목록
//   #/enter       입장 화면
//   #/units       단원 목록
//   #/unit/7      단원 화면(영역 고르기)
//   #/unit/7/listen, #/unit/7/read   활동
import { loadUnits, findUnit } from './data.js';
import { canSpeak, canRecognize, stopSpeaking } from './speech.js';
import { getStudent, saveStudent, myAttempts, addAttempt, summarize } from './store.js';
import { h, mount, toast } from './ui.js';
import * as listen from './activities/listen.js';
import * as read from './activities/read.js';

const app = document.getElementById('app');
const who = document.getElementById('who');

const SKILLS = [
  { key: 'listen', name: '듣기', desc: '단어와 질문을 듣고 알맞은 것 고르기', module: listen },
  { key: 'read', name: '읽기', desc: '질문과 대답 잇기, 문장 순서 맞추기', module: read },
  { key: 'speak', name: '말하기', desc: '듣고 따라 말하기', module: null },
  { key: 'write', name: '쓰기', desc: '철자 채우기, 문장 만들기', module: null },
];

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
  const empty = mine.length === 0;
  mount(app, 
    h('h1', { text: '복습할 단원을 고르세요' }),
    h('p', { class: 'lead', text: empty
      ? '아직 푼 문제가 없어요. 단원을 하나 골라 시작해 보세요.'
      : `지금까지 ${mine.length}문제를 풀었어요.` }),
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

/* 단원 화면: 영역 고르기 */
function viewUnit(unit) {
  setTitle(`${unit.unit}단원`);
  const mine = myAttempts().filter((a) => a.unit === unit.unit);
  const keys = (unit.functions || []).filter((f) => f.q || (f.a && f.a.length));
  mount(app, 
    h('a', { class: 'back', href: '#/units', text: '← 단원 목록' }),
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
    h('h2', { text: '무엇을 할까요?' }),
    h('div', { class: 'skills' },
      SKILLS.map((sk) => {
        const s = summarize(mine.filter((a) => a.skill === sk.key));
        let stat = s.total ? `${s.total}문제 중 ${s.right}개 맞힘` : '아직 안 했어요';
        if (!sk.module) stat = '준비 중이에요';
        else if (sk.key === 'listen' && !canSpeak()) stat = '이 브라우저는 소리가 나오지 않아 글자로 풀어요';
        return h('button', {
          class: 'skill', type: 'button', disabled: !sk.module,
          onclick: () => go(`#/unit/${unit.unit}/${sk.key}`),
        },
          h('span', { class: 'name', text: sk.name }),
          h('span', { class: 'desc', text: sk.desc }),
          h('span', { class: 'stat', text: stat }));
      })),
    canRecognize() ? null : h('p', { class: 'muted', text: '이 브라우저는 음성 인식이 되지 않아요. 말하기는 녹음해서 스스로 들어 보는 방식으로 열릴 예정이에요.' }),
  );
}

/* 활동 */
function viewActivity(unit, units, key) {
  const sk = SKILLS.find((s) => s.key === key && s.module);
  if (!sk) { go(`#/unit/${unit.unit}`); return; }
  setTitle(`${unit.unit}단원 ${sk.name}`);
  let warned = false;
  const record = (attempt) => {
    const ok = addAttempt(attempt);
    if (!ok && !warned) { warned = true; toast('기록을 저장하지 못했어요. 계속 풀 수는 있어요.'); }
    return ok;
  };
  sk.module.run(app, { unit, units, record, onBack: () => go(`#/unit/${unit.unit}`) });
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

  if (parts[0] === 'unit') {
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
