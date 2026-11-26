// 활동을 마쳤을 때 보이는 결과 화면 (요구사항 4: 스스로 피드백과 보충 학습)
// 점수 → 스스로 평가(알아요/조금/어려워요) → 잘한 점·더 연습할 점 → 보충 학습 버튼 → 영역별 정답률 막대 → 다시 볼 것
import { h, mount, toast } from '../ui.js';
import { myAttempts, saveReflection, getStage, setStage } from '../store.js';
import { takeSession, skillStats, advise, skillBars, adviceBlock, SKILL_NAMES } from '../feedback.js';
import { setPending } from './remedial.js';

const RATES = [
  { key: 'know', label: '알아요', note: '혼자서도 할 수 있어요.' },
  { key: 'some', label: '조금 알아요', note: '헷갈리는 것이 있어요.' },
  { key: 'hard', label: '어려워요', note: '도움이 더 필요해요.' },
];

function selfCheck(session, right, total) {
  const reply = h('div', { 'aria-live': 'polite' });
  const btns = RATES.map((r) => h('button', {
    class: 'btn btn-line rate-btn', type: 'button', 'aria-pressed': 'false',
    onclick: () => {
      for (const b of btns) b.setAttribute('aria-pressed', String(b === btn(r.key)));
      const ok = saveReflection({ unit: session.unit, skill: session.skill, rating: r.key, score: right, total });
      const pct = total ? right / total : 0;
      let text;
      if (r.key === 'know') text = pct >= 0.8 ? '좋아요. 점수도 높아요. 다른 활동이나 다음 단원도 해 보세요.' : '점수는 조금 낮아요. 아래 "다시 볼 것"을 한 번 더 읽고 보충 학습을 해 보세요.';
      else if (r.key === 'some') text = '보충 학습으로 헷갈린 표현을 한 번 더 익혀 봐요.';
      else text = '괜찮아요. 보충 학습은 더 쉬운 문제와 힌트로 시작해요.';
      const cur = getStage(session.unit)?.stage;
      mount(reply, h('div', { class: 'notice' },
        h('p', { text: ok ? `스스로 평가를 기록했어요. ${text}` : `${text} (이 기기에 저장하지 못했어요)` }),
        r.key === 'hard' && cur && cur !== 'basic'
          ? h('button', { class: 'btn btn-line', type: 'button', text: '다음에는 기초 단계로 하기', onclick: (e) => {
              if (setStage(session.unit, 'basic', { from: 'self' })) { toast('기초 단계로 바꿨어요.', 2500); e.currentTarget.disabled = true; }
            } })
          : null));
    },
  }, h('span', { text: r.label }), h('span', { class: 'rate-note', text: r.note })));
  const btn = (key) => btns[RATES.findIndex((r) => r.key === key)];
  return h('section', { class: 'self-check' },
    h('h2', { text: '스스로 생각하면 어땠나요?' }),
    h('div', { class: 'rate-btns', role: 'group', 'aria-label': '스스로 평가' }, btns),
    reply);
}

// results: [{ correct, label, right, mine }]
export function renderResult(root, { title, results, saveFailed, onRetry, onBack }) {
  const session = takeSession();
  if (!results.length) {
    mount(root,
      h('h1', { text: `${title} 끝` }),
      h('div', { class: 'notice' }, h('p', { text: '이번에는 푼 문제가 없어요. 건너뛴 문제는 기록하지 않아요.' })),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: onRetry, text: '다시 해 보기' }),
        h('button', { class: 'btn btn-line', type: 'button', onclick: onBack, text: '다른 활동 고르기' })));
    return;
  }
  const right = results.filter((r) => r.correct).length;
  const wrong = results.filter((r) => !r.correct);
  const unitNo = session.unit;
  const stats = skillStats(myAttempts().filter((a) => a.unit === unitNo));
  const advice = advise(stats, { stage: session.stage, sessionRight: right, sessionTotal: results.length, skill: session.skill });
  const wrongIds = session.attempts.filter((a) => !a.correct).map((a) => a.itemId);
  const goFix = (mode) => {
    setPending({ unit: unitNo, skill: session.skill, ids: wrongIds });
    location.hash = `#/fix/${mode}/${unitNo}/${session.skill}`;
  };

  mount(root,
    h('h1', { text: `${title} 끝` }),
    h('p', { class: 'score' },
      h('span', { class: 'big', text: String(right) }), ` / ${results.length} 맞혔어요`),
    saveFailed
      ? h('div', { class: 'notice notice-error' },
          h('p', { text: '기록을 이 기기에 저장하지 못했어요. 브라우저의 저장 공간이 꽉 찼거나 시크릿 창일 수 있어요. 오답 노트와 보충 학습에 이번 문제가 빠질 수 있어요. 선생님께 알려 주세요.' }))
      : null,
    selfCheck(session, right, results.length),
    adviceBlock(advice),
    h('div', { class: 'btn-row' },
      wrong.length && wrongIds.length
        ? [
            h('button', { class: 'btn', type: 'button', onclick: () => goFix('easy') },
              h('span', { text: `보충 학습 하기 (${wrongIds.length}문제)` })),
            h('button', { class: 'btn btn-line', type: 'button', onclick: onRetry, text: '처음부터 한 번 더' }),
          ]
        : h('button', { class: 'btn', type: 'button', onclick: onRetry, text: '한 번 더 하기' }),
      h('button', { class: 'btn btn-line', type: 'button', onclick: onBack, text: '다른 활동 고르기' }),
    ),
    wrong.length && wrongIds.length
      ? h('p', { class: 'muted fix-note', text: '보충 학습은 틀린 문제와 같은 표현을 한 단계 쉬운 문제와 힌트로 다시 내요.' })
      : null,
    h('h2', { text: `${unitNo}단원 영역별 정답률 (지금까지)` }),
    skillBars(stats, { caption: `${unitNo}단원 영역별 정답률` }),
    wrong.length
      ? [
          h('h2', { text: '다시 볼 것' }),
          h('ul', { class: 'review' },
            wrong.map((r) =>
              h('li', {},
                h('span', { class: 'en', text: r.label }),
                r.right ? h('span', { text: ` → ${r.right}` }) : null,
                r.mine ? h('span', { class: 'mine', text: `내 답: ${r.mine}` }) : null,
              ))),
          h('p', {}, h('a', { href: '#/notes', text: '오답 노트 전체 보기' })),
        ]
      : h('div', { class: 'notice' }, h('p', { text: `${SKILL_NAMES[session.skill] || '활동'} 문제를 모두 맞혔어요. 다른 활동도 해 보세요.` })),
  );
  root.querySelector('h1').focus?.();
}
