// 기기 안 저장(localStorage). 이름 등 개인정보는 저장하지 않고 학급 코드와 번호만 둠
// er5.student  : { classCode, studentNo }
// er5.attempts : [{ unit, skill, level, itemId, correct, answer, at, classCode, studentNo, sent }]
//   sent=false 는 아직 서버(Supabase)로 보내지 않은 기록 (서버 연결은 다음 작업)

const STUDENT_KEY = 'er5.student';
const ATTEMPTS_KEY = 'er5.attempts';

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
export function addAttempt({ unit, skill, level, itemId, correct, answer }) {
  const student = getStudent();
  const list = getAttempts();
  list.push({
    unit,
    skill,
    level,
    itemId,
    correct: !!correct,
    answer: String(answer ?? ''),
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
