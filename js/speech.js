// 소리 내기(speechSynthesis, en-US)와 음성 인식 기능 감지

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
let voice = null;
let voicesReady = null;

export function canSpeak() {
  return !!synth && typeof window.SpeechSynthesisUtterance === 'function';
}

export function canRecognize() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function pickVoice(list) {
  const en = list.filter((v) => /^en[-_]US/i.test(v.lang));
  return (
    en.find((v) => /google/i.test(v.name)) ||
    en.find((v) => /natural|online/i.test(v.name)) ||
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
  await loadVoices();
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  if (voice) u.voice = voice;
  u.rate = slow ? 0.6 : 0.9;
  return new Promise((resolve) => {
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    synth.speak(u);
  });
}

export function stopSpeaking() {
  if (canSpeak()) synth.cancel();
}
