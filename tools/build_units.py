"""검수를 마친 data/units/unitNN.md를 앱이 읽는 data/units.json으로 바꾼다.

사용법: python tools/build_units.py <저장소 폴더>

단계(level) 기준
- basic(기초): 신출 어휘, 단원 핵심 어구(Word Chant), 의사소통 기능의 기본 문답
- core(기본): 주요 표현 연습 문답(Practice), 언어 형식 문장
- challenge(도전): 같은 핵심 표현을 힌트 없이 문장 전체로 듣고·말하고·쓰기(활동 방식으로 난이도를 올림)

저작권 때문에 교과서 대화문과 읽기 글은 저장소에 두지 않고, 핵심 표현만 담는다(2026-11-23 결정).
"""
import sys, os, re, glob, json

repo = sys.argv[1]
SPEAKER = re.compile(r"^-\s*([^:]{1,20}):\s*(.+)$")

def rows(block):
    out, header = [], None
    for line in block:
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if set("".join(cells)) <= set("-: "):
            continue
        if header is None:
            header = cells
            continue
        out.append(dict(zip(header, cells)))
    return out

def bullets(block):
    return [l[2:].strip() for l in block if l.startswith("- ")]

units = []
for md in sorted(glob.glob(os.path.join(repo, "data", "units", "unit*.md"))):
    text = open(md, encoding="utf-8").read().splitlines()
    num = int(re.search(r"unit(\d+)", md).group(1))
    title = text[0].split(". ", 1)[1].strip()
    sections, cur = {}, None
    meta = {}
    for line in text[1:]:
        if line.startswith("## "):
            cur = line[3:].strip()
            sections[cur] = []
        elif cur:
            sections[cur].append(line)
        elif line.startswith("- 주제:"):
            meta["topic"] = line.split(":", 1)[1].strip()
        elif line.startswith("- 출처:"):
            meta["source"] = line.split(":", 1)[1].strip()

    u = {"unit": num, "title": title, "topic": meta.get("topic", ""), "source": meta.get("source", ""),
         "functions": [], "forms": [], "words": [], "phrases": [], "practice": [], "dialogs": [], "reading": None}
    for name, block in sections.items():
        if name == "의사소통 기능":
            for r in rows(block):
                u["functions"].append({"label": r["기능"], "q": r["묻기"], "a": [a.strip() for a in r["답하기"].split(" / ") if a.strip()], "level": "basic"})
        elif name == "언어 형식":
            u["forms"] = [{"en": s, "level": "core"} for s in bullets(block)]
        elif name == "신출 어휘":
            u["words"] = [{"en": r["단어"], "ko": r["뜻(보충)"], "level": "basic"} for r in rows(block)]
        elif "표현" in name and not name.startswith("주요 표현"):
            for r in rows(block):
                en = r.get("표현") or r.get("단어")
                item = {"en": en, "ko": r.get("뜻(보충)", ""), "level": "basic"}
                if "과거" in r:
                    item["base"], item["past"] = r["현재"], r["과거"]
                u["phrases"].append(item)
        elif name.startswith("주요 표현 연습"):
            for b in bullets(block):
                q, a = [x.strip() for x in b.split(" / ", 1)]
                u["practice"].append({"q": q, "a": a, "level": "core"})
        elif name.startswith("Let's Read"):
            sub = name.split("—", 1)[1].strip() if "—" in name else ""
            u["reading"] = {"title": sub, "lines": [{"en": r["영어"], "ko": r["해석"]} for r in rows(block)], "level": "challenge"}
        elif name in ("Fun Talk 1", "Fun Talk 2", "Talk Like This", "Practice 2"):
            lines = []
            for b in bullets(block):
                m = SPEAKER.match("- " + b)
                lines.append({"who": m.group(1).strip(), "text": m.group(2).strip()} if m else {"who": "", "text": b})
            u["dialogs"].append({"name": name, "lines": lines, "level": "challenge"})
    units.append(u)

out = os.path.join(repo, "data", "units.json")
json.dump({"generatedFrom": "data/units/*.md (verify/ 검수 통과본)", "units": units}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
for u in units:
    print(u["unit"], u["title"], "| words", len(u["words"]), "phrases", len(u["phrases"]), "practice", len(u["practice"]),
          "dialogs", len(u["dialogs"]), "reading", len(u["reading"]["lines"]) if u["reading"] else 0)
