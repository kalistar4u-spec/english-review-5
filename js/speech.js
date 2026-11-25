// 소리 내기와 음성 인식 기능 감지
// 1순위: 미리 만든 원어민 신경망 음성 파일(audio/, tools/make_audio.py로 생성, en-US-JennyNeural)
// 2순위: 파일이 없는 문장만 브라우저 목소리(speechSynthesis, en-US)로 읽음
//   → 브라우저 목소리는 기기마다 달라 발음이 어색할 수 있어서 파일을 먼저 씀

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
let voice = null;
let voicesReady = null;
let current = null; // 지금 읽고 있는 발화(가비지 컬렉션 방지)
let seq = 0; // speak 호출 번호(가장 마지막 것만 소리 냄)
let audioIndex = null; // { 문장: 파일 이름 }
let audioVoice = '';
let indexReady = null;
const player = typeof Audio === 'function' ? new Audio() : null;

function canSynth() {
  return !!synth && typeof window.SpeechSynthesisUtterance === 'function';
}

function loadIndex() {
  if (indexReady) return indexReady;
  indexReady = fetch('audio/index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { audioIndex = j?.files || null; audioVoice = j?.voice || ''; return audioIndex; })
    .catch(() => null);
  return indexReady;
}
loadIndex();

function fileFor(text) {
  return audioIndex && player ? audioIndex[text.trim()] || null : null;
}

// 소리를 낼 방법이 하나라도 있는지(파일 재생 또는 브라우저 목소리)
export function canSpeak() {
  return !!player || canSynth();
}

export function canRecognize() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function pickVoice(list) {
  const en = list.filter((v) => /^en[-_]US/i.test(v.lang));
  // 발음이 자연스러운 목소리를 먼저 고름: 신경망(Natural) → Google → 온라인 → 기기
  const multi = (v) => /multilingual/i.test(v.name);
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
  if (!canSynth()) return Promise.resolve(null);
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

// 영어 소리를 낼 수 있는지(파일이 있거나 영어 브라우저 목소리가 있음)
export async function hasEnglishVoice() {
  await loadIndex();
  if (audioIndex && player) return true;
  await loadVoices();
  return !!voice;
}

function playFile(name, slow, my) {
  return new Promise((resolve) => {
    player.onended = () => resolve(true);
    player.onerror = () => resolve(false);
    player.src = `audio/${slow ? 'slow/' : ''}${name}.mp3`;
    if (my !== seq) { resolve(false); return; }
    player.play().catch(() => resolve(false));
  });
}

function synthSay(text, slow) {
  const said = /[.?!]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`; // 끝소리 보존
  const u = new SpeechSynthesisUtterance(said);
  u.lang = 'en-US';
  if (voice) u.voice = voice;
  u.rate = slow ? 0.6 : 0.9;
  current = u; // 읽는 동안 붙잡아 둠(놓치면 크롬 계열에서 중간에 멈춤)
  return new Promise((resolve) => {
    const done = (ok) => { if (current === u) current = null; resolve(ok); };
    u.onend = () => done(true);
    u.onerror = () => done(false);
    synth.speak(u);
    if (synth.paused) synth.resume();
  });
}

// 영어 문장 읽어 주기. slow=true면 천천히
export async function speak(text, { slow = false } = {}) {
  if (!canSpeak()) return false;
  const my = ++seq; // 나중에 부른 speak가 있으면 이 소리는 내지 않음
  stopNow();
  await loadIndex();
  if (my !== seq) return false;
  const name = fileFor(text);
  if (name) {
    const ok = await playFile(name, slow, my);
    if (ok || my !== seq) return ok;
    // 파일 재생이 막히면(네트워크 등) 브라우저 목소리로 대신 읽음
  }
  if (!canSynth()) return false;
  await loadVoices();
  if (synth.speaking || synth.pending) {
    synth.cancel();
    await new Promise((r) => setTimeout(r, 150)); // 멈춘 직후 바로 읽으면 잘리는 브라우저가 있음
  }
  if (my !== seq) return false;
  return synthSay(text, slow);
}

function stopNow() {
  if (player && !player.paused) { player.pause(); player.currentTime = 0; }
  if (canSynth() && (synth.speaking || synth.pending)) synth.cancel();
}

export function stopSpeaking() {
  seq += 1; // 기다리던 speak도 취소
  stopNow();
  current = null;
}

// 점검용: 지금 쓰는 목소리 (듣기 화면 아래에 작게 보임)
export async function voiceInfo() {
  await loadIndex();
  if (audioIndex && player) return `원어민 음성 파일 (${audioVoice.replace(/^en-US-|Neural$/g, '')}, 미국 영어)`;
  await loadVoices();
  return voice ? `${voice.name} (${voice.lang}${voice.localService ? ', 기기' : ', 온라인'})` : '영어 목소리 없음';
}
