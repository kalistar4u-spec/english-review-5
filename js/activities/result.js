// 활동을 마쳤을 때 보이는 결과 화면 (오답 노트·보충 학습은 다음 작업에서 넓힘)
import { h, mount } from '../ui.js';

// results: [{ correct, label, right, mine }]
export function renderResult(root, { title, results, saveFailed, onRetry, onBack }) {
  const right = results.filter((r) => r.correct).length;
  const wrong = results.filter((r) => !r.correct);
  mount(root, 
    h('h1', { text: `${title} 끝` }),
    h('p', { class: 'score' },
      h('span', { class: 'big', text: String(right) }), ` / ${results.length} 맞혔어요`),
    saveFailed
      ? h('div', { class: 'notice notice-error' },
          h('p', { text: '기록을 이 기기에 저장하지 못했어요. 브라우저의 저장 공간이 꽉 찼거나 시크릿 창일 수 있어요. 선생님께 알려 주세요.' }))
      : null,
    wrong.length
      ? [
          h('h2', { text: '다시 볼 것' }),
          h('ul', { class: 'review' },
            wrong.map((r) =>
              h('li', {},
                h('span', { class: 'en', text: r.label }),
                r.right ? h('span', { text: ` → ${r.right}` }) : null,
                r.mine ? h('span', { class: 'mine', text: `내가 고른 답: ${r.mine}` }) : null,
              ))),
        ]
      : h('div', { class: 'notice' }, h('p', { text: '모두 맞혔어요. 다른 활동도 해 보세요.' })),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: onRetry, text: '한 번 더 하기' }),
      h('button', { class: 'btn btn-line', type: 'button', onclick: onBack, text: '다른 활동 고르기' }),
    ),
  );
  root.querySelector('h1').focus?.();
}
