// 말하기 활동: 원어민 소리를 듣고 따라 말하기
// - 음성 인식(webkitSpeechRecognition, en-US)이 되면: 인식된 말을 단어별로 비교해 맞은 단어(청록)/다시 말할 단어(황토) 표시
// - 안 되면(웨일북 등): 녹음(MediaRecorder) → 내 목소리와 원어민 소리 번갈아 듣기 → 스스로 평가(잘했어요/조금/다시)
// - 녹음도 안 되면: 소리 내어 따라 말하고 스스로 평가
// 단계: 기초는 단어 위주 + 뜻 + 천천히 먼저 들려 줌, 기본은 단어·문장 섞기, 도전은 문장 전체를 글자 없이 듣고 말하기
import { slug } from '../data.js';
import { wordPool, sentencePool, sentencesAtLeast, questionPool, stageName } from '../level.js';
import { bestOf } from '../compare.js';
import { canSpeak, canRecognize, canRecord, speak, stopSpeaking, playRecording } from '../speech.js';
import { h, mount, shuffle, sample, progress } from '../ui.js';
import { renderResult } from './result.js';

const MODE_KEY = 'er5.speakMode'; // 'record' 이면 음성 인식 대신 녹음 방식

function savedMode() {
  try { return localStorage.getItem(MODE_KEY); } catch { return null; }
}
function saveMode(v) {
  try { v ? localStorage.setItem(MODE_KEY, v) : localStorage.removeItem(MODE_KEY); } catch {}
}

export function pickMode() {
  if (canRecognize() && savedMode() !== 'record') return 'recognize';
  if (canRecord()) return 'record';
  return 'self';
}

export function buildItems(unit, stage) {
  const words = wordPool(unit, stage);
  const sents = sentencesAtLeast(unit, stage, stage === 'challenge' ? 4 : stage === 'basic' ? 2 : 3);
  const toWord = (w) => ({ kind: 'word', en: w.en, ko: w.ko, id: `u${unit.unit}-speak-${slug(w.en)}` });
  const toSent = (s) => ({ kind: 'sentence', en: s.en, ko: '', id: `u${unit.unit}-speak-${slug(s.en)}` });
  let items;
  if (stage === 'basic') {
    items = [...sample(words.filter((w) => w.en.length <= 10), 3).map(toWord), ...sample(sents, 2).map(toSent)];
  } else if (stage === 'challenge') {
    items = [...sample(questionPool(unit), 1).map(toSent), ...sample(sents, 4).map(toSent)];
  } else {
    items = [...sample(words, 2).map(toWord), ...sample(sents, 3).map(toSent)];
  }
  const seen = new Set();
  return items.filter((it) => (seen.has(it.en) ? false : seen.add(it.en)));
}

const RATINGS = [
  { key: 'good', label: '잘했어요', note: '원어민 소리와 거의 같아요.' },
  { key: 'soso', label: '조금 비슷해요', note: '한두 단어가 달라요.' },
  { key: 'again', label: '다시 할래요', note: '한 번 더 녹음해 봐요.' },
];

function recError(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return { text: '마이크를 쓸 수 없어요. 주소창 왼쪽의 자물쇠(사이트 정보)를 눌러 마이크를 "허용"으로 바꾼 뒤 다시 눌러 주세요. 그래도 안 되면 녹음 방식으로 바꿔 보세요.', switchable: true };
    case 'no-speech':
      return { text: '목소리가 들리지 않았어요. 마이크 가까이에서 또박또박 다시 말해 보세요.' };
    case 'audio-capture':
      return { text: '마이크를 찾지 못했어요. 마이크가 연결되어 있는지 확인해 주세요.', switchable: true };
    case 'network':
      return { text: '음성 인식에는 인터넷 연결이 필요해요. 연결을 확인하거나 녹음 방식으로 바꿔 보세요.', switchable: true };
    case 'language-not-supported':
      return { text: '이 브라우저는 영어 음성 인식을 하지 못해요. 녹음 방식으로 바꿔 보세요.', switchable: true };
    default:
      return { text: '음성 인식이 잠시 되지 않아요. 다시 눌러 보거나 녹음 방식으로 바꿔 보세요.', switchable: true };
  }
}

function micError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '마이크 사용이 막혀 있어요. 주소창 왼쪽의 자물쇠(사이트 정보)를 눌러 마이크를 "허용"으로 바꾼 뒤 다시 눌러 주세요. 오늘은 소리 내어 따라 말하고 스스로 평가해도 돼요.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return '마이크를 찾지 못했어요. 마이크가 연결되어 있는지 확인해 주세요. 오늘은 소리 내어 따라 말하고 스스로 평가해도 돼요.';
  }
  return '녹음을 시작하지 못했어요. 다시 눌러 보세요. 오늘은 소리 내어 따라 말하고 스스로 평가해도 돼요.';
}

export function run(root, ctx) {
  const { unit, record, onBack, stage = 'core', setCleanup } = ctx;
  const items = buildItems(unit, stage);
  const speakable = canSpeak();
  let mode = pickMode();
  const results = [];
  let saveFailed = false;
  let index = 0;

  // 지금 문항에서 켠 것들(인식기, 녹음기, 마이크, 녹음 주소)을 정리
  let live = { rec: null, mr: null, stream: null, url: null, timer: null };
  const cleanup = () => {
    try { live.rec?.abort(); } catch {}
    try { if (live.mr && live.mr.state !== 'inactive') { live.mr.onstop = null; live.mr.stop(); } } catch {}
    live.stream?.getTracks().forEach((t) => t.stop());
    if (live.url) URL.revokeObjectURL(live.url);
    clearTimeout(live.timer);
    live = { rec: null, mr: null, stream: null, url: null, timer: null };
    stopSpeaking();
  };
  setCleanup?.(cleanup);

  if (!items.length) {
    mount(root,
      h('h1', { text: '문제가 없어요' }),
      h('p', { text: '이 단원에는 아직 말하기 문제를 만들 표현이 없어요.' }),
      h('button', { class: 'btn btn-line', type: 'button', text: '돌아가기', onclick: onBack }));
    return;
  }

  const showItem = () => {
    cleanup();
    const item = items[index];
    const isWord = item.kind === 'word';
    const hideText = stage === 'challenge';
    let best = null; // 음성 인식: 가장 잘 맞은 결과
    let rating = null; // 녹음·스스로 평가: 고른 평가

    // 목표 문장(단어마다 칸을 나눠 색을 칠할 수 있게)
    const wordSpans = item.en.split(/\s+/).map((w) => h('span', { class: 'w', text: w }));
    const target = h('p', { class: 'say-target en', lang: 'en', hidden: hideText }, wordSpans.flatMap((s, i) => (i ? [' ', s] : [s])));
    const revealBtn = hideText
      ? h('button', { class: 'link-btn', type: 'button', text: '글자 보기', onclick: (e) => { target.hidden = false; e.currentTarget.hidden = true; } })
      : null;
    const hint = item.ko && stage !== 'challenge' ? h('p', { class: 'say-ko', text: `뜻: ${item.ko}` }) : null;

    const area = h('div', { class: 'mic-area' });
    const feedback = h('div', { 'aria-live': 'polite' });
    const nextBtn = h('button', {
      class: 'btn', type: 'button', hidden: true,
      text: index + 1 < items.length ? '다음 문제' : '결과 보기',
      onclick: () => { save(); index += 1; index < items.length ? showItem() : finish(); },
    });
    const skipBtn = h('button', {
      class: 'link-btn', type: 'button', text: '이 문제 건너뛰기',
      onclick: () => { index += 1; index < items.length ? showItem() : finish(); },
    });

    const save = () => {
      if (best) {
        const correct = best.ratio >= (stage === 'basic' ? 0.7 : 0.8);
        if (!record({ unit: unit.unit, skill: 'speak', itemId: item.id, correct, answer: best.heard })) saveFailed = true;
        results.push({ correct, label: item.en, right: '', mine: correct ? '' : `들린 말: ${best.heard}` });
      } else if (rating) {
        const correct = rating === 'good';
        const label = RATINGS.find((r) => r.key === rating).label;
        if (!record({ unit: unit.unit, skill: 'speak', itemId: item.id, correct, answer: '', selfRating: rating })) saveFailed = true;
        results.push({ correct, label: item.en, right: '', mine: correct ? '' : `스스로 평가: ${label}` });
      }
    };

    const showNext = () => { nextBtn.hidden = false; skipBtn.hidden = true; };
    const warn = (text, switchable) => mount(feedback,
      h('div', { class: 'notice notice-error' },
        h('p', { text }),
        switchable && canRecord() ? h('button', { class: 'btn btn-line', type: 'button', text: '녹음 방식으로 바꾸기', onclick: () => { saveMode('record'); mode = 'record'; paintArea(); mount(feedback); } }) : null,
        switchable && !canRecord() ? h('button', { class: 'btn btn-line', type: 'button', text: '스스로 평가하기', onclick: () => { mode = 'self'; paintArea(); mount(feedback); } }) : null));

    /* 1) 음성 인식 */
    const paint = (r) => {
      r.words.forEach((w, i) => {
        wordSpans[i].classList.toggle('ok', w.ok);
        wordSpans[i].classList.toggle('miss', !w.ok);
      });
      target.hidden = false;
      if (revealBtn) revealBtn.hidden = true;
      const all = r.right === r.total;
      const pass = r.ratio >= (stage === 'basic' ? 0.7 : 0.8);
      mount(feedback,
        h('div', { class: `feedback${pass ? '' : ' wrong'}` },
          h('strong', { text: all ? '정확하게 말했어요.' : pass ? `잘했어요. ${r.total}단어 중 ${r.right}단어가 잘 들렸어요.` : `${r.total}단어 중 ${r.right}단어가 들렸어요. 황토색 단어를 듣고 다시 말해 보세요.` }),
          h('span', { class: 'heard' }, '들린 말: ', h('span', { class: 'en', lang: 'en', text: r.heard || '(없음)' })),
          h('span', { class: 'legend' }, h('span', { class: 'w ok', text: '청록' }), ' 잘 들린 단어 · ', h('span', { class: 'w miss', text: '황토' }), ' 다시 말해 볼 단어')));
      if (!pass && speakable) speak(item.en, { slow: true });
    };

    const listenOnce = (btn) => {
      const R = window.SpeechRecognition || window.webkitSpeechRecognition;
      let rec;
      try { rec = new R(); } catch { warn(recError('').text, true); return; }
      live.rec = rec;
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.continuous = false;
      rec.maxAlternatives = 5;
      let got = false;
      let failed = false;
      stopSpeaking();
      btn.disabled = true;
      btn.textContent = '듣고 있어요… 말해 보세요';
      btn.classList.add('is-on');
      rec.onresult = (e) => {
        got = true;
        const res = e.results[0];
        const alts = Array.from({ length: res.length }, (_, i) => res[i].transcript);
        const r = bestOf(item.en, alts);
        if (!best || r.ratio >= best.ratio) best = r;
        paint(r);
        showNext();
      };
      rec.onerror = (e) => {
        if (e.error === 'aborted') return;
        failed = true;
        const m = recError(e.error);
        warn(m.text, m.switchable);
        if (e.error !== 'no-speech') showNext();
      };
      rec.onend = () => {
        btn.disabled = false;
        btn.textContent = best ? '● 다시 말하기' : '● 말하기';
        btn.classList.remove('is-on');
        if (!got && !failed) warn(recError('no-speech').text);
      };
      try { rec.start(); } catch { rec.onend(); }
    };

    /* 2) 녹음 → 번갈아 듣기 → 스스로 평가 */
    const rateRow = () => h('div', { class: 'rate' },
      h('p', { class: 'rate-q', text: '원어민 소리와 비교하면 어땠나요?' }),
      h('div', { class: 'rate-btns' }, RATINGS.map((r) =>
        h('button', {
          class: 'btn btn-line rate-btn', type: 'button', 'aria-pressed': 'false',
          onclick: (e) => {
            for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
            target.hidden = false;
            if (revealBtn) revealBtn.hidden = true;
            if (r.key === 'again') {
              rating = rating || 'again';
              mount(feedback, h('div', { class: 'feedback wrong' }, h('strong', { text: '좋아요. 천천히 듣고 한 번 더 해 봐요.' })));
              if (speakable) speak(item.en, { slow: true });
              if (mode === 'record') paintArea();
              showNext();
              return;
            }
            rating = r.key;
            mount(feedback, h('div', { class: `feedback${r.key === 'good' ? '' : ' wrong'}` },
              h('strong', { text: r.key === 'good' ? '잘했어요. 다음 문제로 가요.' : '조금 더 연습하면 돼요. 천천히 듣기를 눌러 다시 들어 보세요.' })));
            showNext();
          },
        }, h('span', { text: r.label }), h('span', { class: 'rate-note', text: r.note })))));

    const reviewRow = () => h('div', { class: 'play-row' },
      h('button', { class: 'btn btn-line', type: 'button', text: '내 목소리 듣기', onclick: () => playRecording(live.url) }),
      speakable ? h('button', { class: 'btn btn-line', type: 'button', text: '원어민 듣기', onclick: () => speak(item.en) }) : null,
      speakable ? h('button', { class: 'btn btn-line', type: 'button', text: '번갈아 듣기',
        onclick: async () => { const url = live.url; await speak(item.en); await new Promise((r) => setTimeout(r, 300)); playRecording(url); } }) : null);

    const startRecording = async (btn) => {
      stopSpeaking();
      btn.disabled = true;
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        btn.disabled = false;
        mode = 'self';
        paintArea();
        mount(feedback, h('div', { class: 'notice notice-error' }, h('p', { text: micError(err) })));
        return;
      }
      live.stream = stream;
      const chunks = [];
      let mr;
      try { mr = new MediaRecorder(stream); } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        mode = 'self'; paintArea();
        mount(feedback, h('div', { class: 'notice notice-error' }, h('p', { text: micError(err) })));
        return;
      }
      live.mr = mr;
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearTimeout(live.timer);
        if (live.url) URL.revokeObjectURL(live.url);
        live.url = chunks.length ? URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })) : null;
        paintArea(true);
        if (!live.url) mount(feedback, h('div', { class: 'notice notice-error' }, h('p', { text: '녹음된 소리가 없어요. 다시 녹음해 보세요.' })));
      };
      mr.start();
      btn.disabled = false;
      btn.textContent = '■ 멈추기';
      btn.classList.add('is-on');
      btn.onclick = () => { if (mr.state !== 'inactive') mr.stop(); };
      live.timer = setTimeout(() => { if (mr.state !== 'inactive') mr.stop(); }, isWord ? 5000 : 9000);
    };

    const paintArea = (recorded = false) => {
      if (mode === 'recognize') {
        const btn = h('button', { class: 'btn btn-mic', type: 'button', text: best ? '● 다시 말하기' : '● 말하기' });
        btn.onclick = () => listenOnce(btn);
        mount(area,
          h('p', { class: 'muted', text: '버튼을 누르고 영어로 말해요. 다 말하면 저절로 멈춰요.' }),
          btn,
          canRecord() ? h('button', { class: 'link-btn switch', type: 'button', text: '인식이 잘 안 되나요? 녹음해서 스스로 들어 보기',
            onclick: () => { saveMode('record'); mode = 'record'; paintArea(); mount(feedback); } }) : null);
      } else if (mode === 'record') {
        const btn = h('button', { class: 'btn btn-mic', type: 'button', text: recorded && live.url ? '● 다시 녹음하기' : '● 녹음하기' });
        btn.onclick = () => startRecording(btn);
        mount(area,
          h('p', { class: 'muted', text: canRecognize()
            ? '녹음한 내 목소리와 원어민 소리를 번갈아 들어 보고 스스로 평가해요.'
            : '이 브라우저는 음성 인식이 되지 않아요. 녹음한 내 목소리와 원어민 소리를 번갈아 들어 보고 스스로 평가해요.' }),
          btn,
          recorded && live.url ? [reviewRow(), rateRow()] : null,
          canRecognize() ? h('button', { class: 'link-btn switch', type: 'button', text: '음성 인식으로 돌아가기',
            onclick: () => { saveMode(null); mode = 'recognize'; paintArea(); mount(feedback); } }) : null);
      } else {
        mount(area,
          h('div', { class: 'notice notice-warn' }, h('p', { text: '이 기기에서는 녹음이나 음성 인식을 쓸 수 없어요. 원어민 소리를 듣고 소리 내어 따라 말한 뒤 스스로 평가해요.' })),
          rateRow());
      }
    };

    const [ptext, pbar] = progress(index + 1, items.length, '말하기');
    mount(root,
      h('div', { class: 'act-head' },
        h('button', { class: 'link-btn back', type: 'button', onclick: () => { cleanup(); onBack(); } }, h('span', { class: 'arrow', 'aria-hidden': 'true', text: '←' }), '그만하고 나가기'),
        ptext),
      pbar,
      h('p', { class: 'ask' }, hideText ? '잘 듣고 문장 전체를 따라 말해 보세요.' : '원어민 소리를 듣고 따라 말해 보세요.',
        h('span', { class: 'stage-tag', text: stageName(stage) })),
      target, hint,
      speakable
        ? h('div', { class: 'play-row' },
            h('button', { class: 'btn btn-line', type: 'button', text: '▶ 듣기', onclick: () => speak(item.en) }),
            stage !== 'challenge' ? h('button', { class: 'btn btn-line', type: 'button', text: '천천히 듣기', onclick: () => speak(item.en, { slow: true }) }) : null,
            revealBtn)
        : h('div', { class: 'notice notice-error' }, h('p', { text: '이 브라우저에서는 영어 소리를 낼 수 없어요. 글자를 보고 소리 내어 읽어 보세요.' })),
      area,
      feedback,
      h('div', { class: 'btn-row' }, nextBtn, skipBtn),
    );
    if (!speakable) { target.hidden = false; if (revealBtn) revealBtn.hidden = true; }
    paintArea();
    if (speakable) speak(item.en, { slow: stage === 'basic' }); // 기초는 천천히 먼저 들려 줌
  };

  const finish = () => {
    cleanup();
    renderResult(root, {
      title: `${unit.unit}단원 말하기`,
      results,
      saveFailed,
      onRetry: () => run(root, ctx),
      onBack,
    });
  };

  showItem();
}
