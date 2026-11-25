# English Review 5

초등학교 5학년 영어 7~11단원의 필수 단어와 표현을 듣기·말하기·읽기·쓰기로 복습하는 웹앱입니다.

- 배포 주소: https://kalistar4u-spec.github.io/english-review-5/
- 고친 기록: [CHECKLIST.md](CHECKLIST.md)
- AI에게 시킨 말: [docs/ai-prompts.md](docs/ai-prompts.md)
- 고치기 전/후 화면: `screenshots/`
- 영상 코드: `video/`

## 파일 구조

- `index.html` 학생 화면(학급 코드+번호로 입장 → 단원 → 진단 5문제로 단계 추천 → 듣기·읽기·말하기·쓰기)
- `css/style.css` 디자인
- `js/app.js` 화면 전환, `js/data.js` 학습 데이터, `js/speech.js` 소리·음성 인식 감지, `js/store.js` 기기 저장
- `js/activities/` 듣기·읽기·말하기·쓰기 활동, 진단 퀴즈, 결과 화면
- `js/level.js` 단계(기초/기본/도전)별 문항 고르기, `js/compare.js` 따라 말하기 단어별 비교
- `data/units.json` 7~11단원 핵심 표현(검수본)
- `audio/` 원어민 신경망 음성 mp3(보통·천천히)와 `index.json`, `tools/make_audio.py`로 생성(`pip install edge-tts`)
- `tools/capture.mjs` 화면 캡처·콘솔 오류 점검 (`node tools/capture.mjs tools/shots-02-student-flow.json`, 먼저 `python -m http.server 5173` 실행)
