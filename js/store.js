// 기기 안 저장(localStorage). 이름 등 개인정보는 저장하지 않고 학급 코드와 번호만 둠
// er5.student  : { classCode, studentNo }
// er5.attempts : [{ unit, skill, level, itemId, correct, answer, selfRating, at, classCode, studentNo, sent }]
//   level 은 그때 학생이 고른 단계(basic 기초 / core 기본 / challenge 도전)
// er5.stages   : { "학급코드-번호": { 단원: { stage, from: 'diagnose'|'self', score, at } } }
//   sent=false 는 아직 서버(Supabase)로 보내지 않은 기록 (서버 연결은 다음 작업)

const STUDENT_KEY = 'er5.student';
const ATTEMPTS_KEY = 'er5.attempts';
const STAGES_KEY = 'er5.stages';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function getStudent() {
  const s = read(STUDENT_KEY, null);
  return s && s.classCode && s.studentNo ? s : null;
}

export function saveStudent(classCode, studentNo) {
  return write(STUDENT_KEY, { classCode, studentNo });
}

export function getAttempts() {
  const list = read(ATTEMPTS_KEY, []);
  return Array.isArray(list) ? list : [];
}

// 이 학생(학급 코드+번호)의 기록만
export function myAttempts(student = getStudent()) {
  if (!student) return [];
  return getAttempts().filter((a) => a.classCode === student.classCode && a.studentNo === student.studentNo);
}

// 한 문항 결과 쌓기. 저장 실패면 false
export function addAttempt({ unit, skill, level, itemId, correct, answer, selfRating }) {
  const student = getStudent();
  const list = getAttempts();
  list.push({
    unit,
    skill,
    level,
    itemId,
    correct: !!correct,
    answer: String(answer ?? ''),
    selfRating: selfRating || null,
    at: new Date().toISOString(),
    classCode: student ? student.classCode : null,
    studentNo: student ? student.studentNo : null,
    sent: false,
  });
  return write(ATTEMPTS_KEY, list);
}

export function summarize(list) {
  const total = list.length;
  const right = list.filter((a) => a.correct).length;
  return { total, right };
}

// 단원별 단계(기초/기본/도전). 진단 퀴즈로 추천받거나 학생이 직접 바꿈
export const STAGES = ['basic', 'core', 'challenge'];

function stageKey(student) {
  return student ? `${student.classCode}-${student.studentNo}` : null;
}

export function getStage(unit, student = getStudent()) {
  const key = stageKey(student);
  if (!key) return null;
  const all = read(STAGES_KEY, {});
  const s = all?.[key]?.[unit];
  return s && STAGES.includes(s.stage) ? s : null;
}

export function setStage(unit, stage, { from = 'self', score = null } = {}, student = getStudent()) {
  const key = stageKey(student);
  if (!key || !STAGES.includes(stage)) return false;
  const all = read(STAGES_KEY, {}) || {};
  all[key] = all[key] || {};
  all[key][unit] = { stage, from, score, at: new Date().toISOString() };
  return write(STAGES_KEY, all);
}
