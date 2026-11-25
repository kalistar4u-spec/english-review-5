"""units.json의 핵심 표현을 원어민 신경망 음성 mp3로 미리 만듦.

사용: python tools/make_audio.py   (먼저 pip install edge-tts)
- 목소리: en-US-JennyNeural (미국 영어, 또렷한 일반 목소리)
- 보통 속도: audio/<이름>.mp3, 천천히: audio/slow/<이름>.mp3 (-35%)
- audio/index.json: { "문장 그대로": "<이름>" } — 앱(js/speech.js)이 이 표를 보고 파일을 틂
- 이미 있는 파일은 다시 만들지 않음(units.json이 바뀌면 새 문장만 추가됨)
"""
import asyncio
import json
import re
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "audio"
VOICE = "en-US-JennyNeural"
SLOW_RATE = "-35%"


def slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:60] or "x"


def collect_texts() -> list[str]:
    data = json.loads((ROOT / "data" / "units.json").read_text(encoding="utf-8"))
    texts: list[str] = []
    for u in data["units"]:
        for w in u.get("words", []) + u.get("phrases", []) + u.get("forms", []):
            texts.append(w.get("en", ""))
        for f in u.get("functions", []):
            texts.append(f.get("q", ""))
            texts.extend(f.get("a", []))
        for p in u.get("practice", []):
            texts.append(p.get("q", ""))
            texts.append(p.get("a", ""))
    seen, out = set(), []
    for t in (t.strip() for t in texts):
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def speakable(text: str) -> str:
    # 단어 하나도 문장처럼 끝나게 마침표를 붙임(끝소리 보존)
    return text if re.search(r"[.?!]$", text) else text + "."


async def make(text: str, path: Path, rate: str = "+0%") -> None:
    if path.exists() and path.stat().st_size > 0:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            await edge_tts.Communicate(speakable(text), VOICE, rate=rate).save(str(path))
            return
        except Exception as err:  # 네트워크가 잠깐 끊기면 다시 시도
            if attempt == 2:
                raise
            print(f"  다시 시도: {text} ({err})", file=sys.stderr)
            await asyncio.sleep(2)


async def main() -> None:
    texts = collect_texts()
    index: dict[str, str] = {}
    used: dict[str, str] = {}
    for t in texts:
        name = slug(t)
        if name in used and used[name] != t:  # 이름이 겹치면 번호를 붙임
            n = 2
            while f"{name}-{n}" in used:
                n += 1
            name = f"{name}-{n}"
        used[name] = t
        index[t] = name
    for i, (t, name) in enumerate(index.items(), 1):
        await make(t, OUT / f"{name}.mp3")
        await make(t, OUT / "slow" / f"{name}.mp3", SLOW_RATE)
        print(f"{i}/{len(index)} {t}")
    (OUT / "index.json").write_text(
        json.dumps({"voice": VOICE, "files": index}, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"완료: {len(index)}개 문장, 파일 {len(index) * 2}개")


if __name__ == "__main__":
    asyncio.run(main())
