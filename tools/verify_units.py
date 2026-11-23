"""단원 .md 파일을 지도서 PDF 원문과 문장 단위로 대조해 정확도 보고서를 만든다.

사용법:
    python tools/verify_units.py <PDF 폴더> <저장소 폴더>

- 영어 문장/어구: md의 목록·표에서 뽑아 PDF 텍스트에 그대로 있는지 확인
- 해석(한국어): Let's Read 표의 해석 칸을 PDF 텍스트와 확인
- '뜻(보충)' 칸은 지도서에 없는 보충 자료라 정확도 계산에서 빼고 따로 센다
"""
import sys, os, re, glob
import pymupdf

pdf_dir, repo = sys.argv[1], sys.argv[2]

def norm(s):
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("‌", "").replace("​", "").replace("〔", "[").replace("〕", "]")
    s = re.sub(r"\s+", " ", s)
    return s.strip().lower()

def norm_ko(s):
    return re.sub(r"\s+", "", norm(s))

SPEAKER = re.compile(r"^-\s*([^:]{1,20}):\s*(.+)$")
SENT = re.compile(r"(?<=[.!?])\s+")
HANGUL = re.compile(r"[가-힣]")

def items_from_md(text):
    """(kind, value, section) 목록을 돌려준다."""
    items, section, header = [], "", []
    for line in text.splitlines():
        if line.startswith("## "):
            section, header = line[3:].strip(), []
            continue
        if line.startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if set("".join(cells)) <= set("-: "):
                continue
            if not header:
                header = cells
                continue
            for h, c in zip(header, cells):
                if not c:
                    continue
                if "보충" in h:
                    items.append(("supplement", c, section))
                elif h == "해석":
                    items.append(("ko", c, section))
                elif h in ("기능",):
                    continue
                else:
                    for part in re.split(r"\s+/\s+", c):
                        items.append(("en", part, section))
            continue
        if section in ("언어 형식",) or line.startswith("- ") and section not in ("",):
            m = SPEAKER.match(line)
            body = m.group(2) if m else line[2:]
            if section == "" or body.startswith("출처") or body.startswith("주제"):
                continue
            for part in re.split(r"\s+/\s+", body):
                items.append(("en", part, section))
    out = []
    for kind, val, sec in items:
        if kind == "en":
            for s in SENT.split(val):
                s = s.strip()
                if s and not HANGUL.search(s):
                    out.append((kind, s, sec))
        else:
            out.append((kind, val, sec))
    return out

summary = []
os.makedirs(os.path.join(repo, "verify"), exist_ok=True)
for md in sorted(glob.glob(os.path.join(repo, "data", "units", "unit*.md"))):
    unit = int(re.search(r"unit(\d+)", md).group(1))
    pdf = [p for p in glob.glob(os.path.join(pdf_dir, "*.pdf")) if f"학년 {unit}단원" in os.path.basename(p)][0]
    doc = pymupdf.open(pdf)
    raw = "\n".join(page.get_text() for page in doc)
    en_src, ko_src = norm(raw), norm_ko(raw)
    items = items_from_md(open(md, encoding="utf-8").read())
    checked, ok, bad, supp = 0, 0, [], 0
    for kind, val, sec in items:
        if kind == "supplement":
            supp += 1
            continue
        checked += 1
        hit = (norm(val).rstrip(".!?") in en_src) if kind == "en" else (norm_ko(val) in ko_src)
        if hit:
            ok += 1
        else:
            bad.append((sec, kind, val))
    acc = 100.0 * ok / checked if checked else 0
    summary.append((unit, checked, ok, acc, supp, len(bad)))
    lines = [f"# {unit}단원 검수 보고서", "",
             f"- 원본: `{os.path.basename(pdf)}` ({doc.page_count}쪽)",
             f"- 대조 항목: {checked}개 (영어 문장·어구, Let's Read 해석)",
             f"- 원문과 일치: {ok}개",
             f"- **정확도: {acc:.1f}%** (기준 90% 이상)",
             f"- 보충 자료(뜻 풀이, 지도서에 없어 대조 제외): {supp}개 — 교사 확인 필요", ""]
    if bad:
        lines += ["## 원문과 다른 항목", "", "| 구역 | 종류 | md 내용 |", "|---|---|---|"]
        lines += [f"| {s} | {k} | {v} |" for s, k, v in bad]
    else:
        lines += ["원문과 다른 항목이 없습니다."]
    open(os.path.join(repo, "verify", f"unit{unit:02d}-check.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")

total_c = sum(s[1] for s in summary); total_ok = sum(s[2] for s in summary)
for u, c, ok, acc, supp, nb in summary:
    print(f"unit {u}: {ok}/{c} = {acc:.1f}%  (보충 {supp}, 불일치 {nb})")
print(f"TOTAL: {total_ok}/{total_c} = {100*total_ok/total_c:.1f}%")
