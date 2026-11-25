// 소리 내기(speechSynthesis, en-US)와 음성 인식 기능 감지

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
let voice = null;
let voicesReady = null;
let current = null; // 지금 읽고 있는 발화(가비지 컬렉션 방지)
let seq = 0; // speak 호출 번호(가장 마지막 것만 소리 냄)

export function canSpeak() {
  return !!synth && typeof window.SpeechSynthesisUtterance === 'function';
}

export function canRecognize() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function pickVoice(list) {
  const en = list.filter((v) => /^en[-_]US/i.test(v.lang));
  // 발음이 자연스러운 목소리를 먼저 고름. 기계음에 가까운 기기 기본 목소리는 잘못된 발음을 익힐 수 있어 마지막에 씀
  //   1) 신경망 목소리(Microsoft ... Natural)  2) Google US English  3) 그 밖의 온라인 목소리  4) 기기 목소리
  const multi = (v) => /multilingual/i.test(v.name); // 다국어 목소리는 영어 발음이 흔들릴 수 있어 뒤로
  return (
    en.find((v) => /natural/i.test(v.name) && !multi(v)) ||
    en.find((v) => /google/i.test(v.name)) ||
    en.find((v) => /natural/i.test(v.name)) ||
    en.find((v) => !v.localService) ||
    en[0] ||
    list.find((v) => /^en/i.test(v.lang)) ||
    null
  );
}

// 목소리 목록은 늦게 도착하는 브라우저가 있어 잠깐 기다림
function loadVoices() {
  if (!canSpeak()) return Promise.resolve(null);
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const now = synth.getVoices();
    if (now.length) { voice = pickVoice(now); resolve(voice); return; }
    const done = () => { voice = pickVoice(synth.getVoices()); resolve(voice); };
    synth.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1200);
  });
  return voicesReady;
}

export async function hasEnglishVoice() {
  await loadVoices();
  return !!voice;
}

// 영어 문장 읽어 주기. slow=true면 천천히
export async function speak(text, { slow = false } = {}) {
  if (!canSpeak()) return false;
  // 나중에 부른 speak가 있으면 이 소리는 내지 않음(앞 문제 소리가 다음 문제에서 나오지 않게)
  const my = ++seq;
  await loadVoices();
  // 끊김 대책 2: 읽는 중이면 멈추고, 멈춘 직후 바로 읽으면 앞·뒤가 잘리는 브라우저가 있어 잠깐 쉼
  if (synth.speaking || synth.pending) {
    synth.cancel();
    await new Promise((r) => setTimeout(r, 150));
  }
  if (my !== seq) return false;
  // 끊김 대책 3: 단어 하나만 읽으면 끝소리가 잘리는 목소리가 있어 마침표를 붙여 문장처럼 끝냄
  const said = /[.?!]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
  const u = new SpeechSynthesisUtterance(said);
  u.lang = 'en-US';
  if (voice) u.voice = voice;
  u.rate = slow ? 0.6 : 0.9;
  // 끊김 대책 1: 읽는 동안 발화 객체를 붙잡아 둠(놓치면 크롬 계열에서 중간에 멈춤)
  current = u;
  return new Promise((resolve) => {
    const done = (ok) => { if (current === u) current = null; resolve(ok); };
    u.onend = () => done(true);
    u.onerror = () => done(false);
    synth.speak(u);
    // 일시 정지 상태로 남아 있는 브라우저를 깨움
    if (synth.paused) synth.resume();
  });
}

export function stopSpeaking() {
  seq += 1; // 기다리던 speak도 취소
  if (canSpeak() && (synth.speaking || synth.pending)) synth.cancel();
  current = null;
}

// 점검용: 지금 고른 목소리 이름 (듣기 화면 아래에 작게 보임)
export async function voiceInfo() {
  await loadVoices();
  return voice ? `${voice.name} (${voice.lang}${voice.localService ? ', 기기' : ', 온라인'})` : '영어 목소리 없음';
}
