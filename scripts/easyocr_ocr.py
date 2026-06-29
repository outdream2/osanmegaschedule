"""
EasyOCR 한국어 거래명세서 구조화 추출 (Gemini 없이 단독 동작)
stdin:  {"data": "<base64>", "mimeType": "image/jpeg"}
stdout: {"success": true, "headers": [...], "rows": [...], "meta": {...}, "rawText": "..."}
"""
import sys, json, base64, io, re, logging, statistics
logging.disable(logging.CRITICAL)
# Windows CP949 stdout → UTF-8 강제
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import numpy as np
from PIL import Image
import easyocr

# ── 거래명세서 헤더 키워드 ────────────────────────────────────────────────────
KW = ["품목","품명","상품명","수량","단가","금액","규격","단위","공급가액","세액","적요","번호","No"]
TOTAL_KW = re.compile(r"합\s*계|소\s*계|총\s*계|합\s*금|총\s*금")


def bbox_center(bbox):
    xs = [p[0] for p in bbox]
    ys = [p[1] for p in bbox]
    h  = max(ys) - min(ys)
    return float(min(xs)), float(min(ys)), float(h) if h > 0 else 12.0


def group_into_rows(lines):
    """bounding box Y 좌표로 같은 행 묶기 — drift 방지 anchor 고정."""
    if not lines:
        return []
    lines = sorted(lines, key=lambda l: l["y"])
    heights = [l["h"] for l in lines if l["h"] > 0]
    med_h = statistics.median(heights) if heights else 12.0
    thr = max(6, med_h * 0.55)

    groups, cur, anchor = [], [lines[0]], lines[0]["y"]
    for line in lines[1:]:
        if abs(line["y"] - anchor) < thr:
            cur.append(line)
        else:
            groups.append(sorted(cur, key=lambda l: l["x"]))
            cur = [line]
            anchor = line["y"]
    if cur:
        groups.append(sorted(cur, key=lambda l: l["x"]))
    return groups


def is_mostly_numeric(row):
    num = sum(1 for c in row if re.fullmatch(r"[\d,.\s]+", c.strip()))
    return len(row) > 0 and num / len(row) >= 0.5


def find_header_row(row_groups):
    """헤더 행 탐색 — 합계행·숫자행 제외, 정확→부분→최후 순."""
    text_rows = [[item["text"] for item in g] for g in row_groups]

    def is_candidate(row):
        joined = " ".join(row)
        if TOTAL_KW.search(joined):
            return False
        if is_mostly_numeric(row):
            return False
        return True

    # 1단계: 정확 일치 2개 이상
    for i, row in enumerate(text_rows):
        if not is_candidate(row):
            continue
        hits = sum(1 for c in row if any(k == c.strip() for k in KW))
        if hits >= 2 and len(row) >= 3:
            return i, [it["x"] for it in row_groups[i]], row

    # 2단계: 부분 일치 2개 이상
    for i, row in enumerate(text_rows):
        if not is_candidate(row):
            continue
        hits = sum(1 for c in row if any(k in c for k in KW))
        if hits >= 2 and len(row) >= 3:
            return i, [it["x"] for it in row_groups[i]], row

    # 3단계: 부분 일치 1개 이상
    for i, row in enumerate(text_rows):
        if not is_candidate(row):
            continue
        if len(row) >= 3 and any(any(k in c for k in KW) for c in row):
            return i, [it["x"] for it in row_groups[i]], row

    return -1, [], []


def align_row(group, col_xs):
    """각 셀을 가장 가까운 헤더 컬럼 X로 배정."""
    if len(col_xs) >= 2:
        avg_gap = (col_xs[-1] - col_xs[0]) / (len(col_xs) - 1)
        max_dist = avg_gap * 0.65
    else:
        max_dist = float("inf")

    row = [None] * len(col_xs)
    for item in group:
        dists = [abs(item["x"] - cx) for cx in col_xs]
        nearest = min(range(len(col_xs)), key=lambda i: dists[i])
        if dists[nearest] > max_dist:
            continue
        if row[nearest] is None:
            row[nearest] = item["text"]
        else:
            row[nearest] += " " + item["text"]
    return row


def parse_num(s):
    if s is None:
        return None
    cleaned = re.sub(r"[,\s]", "", str(s))
    try:
        n = float(cleaned)
        return int(n) if n == int(n) else n
    except ValueError:
        return s


def extract_meta(text):
    meta = {}
    dm = re.search(r"(\d{4})[년.\-\/]\s*(\d{1,2})[월.\-\/]\s*(\d{1,2})[일]?", text)
    if dm:
        meta["date"] = f"{dm[1]}-{dm[2].zfill(2)}-{dm[3].zfill(2)}"
    sm = re.search(r"공\s*급\s*자\s*[:\s]*([가-힣a-zA-Z0-9()（）\s]{2,20})", text)
    if sm:
        meta["supplier"] = sm[1].strip().split()[0]
    rm = re.search(r"공\s*급\s*받\s*는\s*자?\s*[:\s]*([가-힣a-zA-Z0-9()（）\s]{2,20})", text)
    if rm:
        meta["recipient"] = rm[1].strip().split()[0]
    tots = []
    for pat in [r"합\s*계[^\d]*(\d[\d,]+)", r"총\s*금\s*액[^\d]*(\d[\d,]+)", r"공\s*급\s*가\s*액[^\d]*(\d[\d,]+)"]:
        m = re.search(pat, text)
        if m:
            tots.append(int(m[1].replace(",", "")))
    if tots:
        meta["total"] = max(tots)
    return meta


def main():
    inp = json.loads(sys.stdin.buffer.read())
    img_bytes = base64.b64decode(inp["data"])
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    img_arr = np.array(img)

    reader = easyocr.Reader(["ko", "en"], gpu=False, verbose=False)
    results = reader.readtext(img_arr, detail=1, paragraph=False)

    # bounding box → (x, y, h, text) 변환
    lines = []
    for (bbox, text, conf) in results:
        text = text.strip()
        if not text or conf < 0.25:
            continue
        x, y, h = bbox_center(bbox)
        lines.append({"text": text, "x": x, "y": y, "h": h})

    if not lines:
        print(json.dumps({"success": True, "headers": ["원문 텍스트"], "rows": [[""]], "meta": {}, "rawText": ""}, ensure_ascii=False))
        return

    row_groups = group_into_rows(lines)
    raw_text = "\n".join(" ".join(it["text"] for it in g) for g in row_groups)
    meta = extract_meta(raw_text)

    header_idx, col_xs, header_texts = find_header_row(row_groups)

    if header_idx < 0:
        # 헤더 감지 실패 → 원문 반환
        print(json.dumps({"success": True, "headers": ["원문 텍스트"],
                          "rows": [[raw_text]], "meta": meta, "rawText": raw_text}, ensure_ascii=False))
        return

    rows = []
    for group in row_groups[header_idx + 1:]:
        aligned = align_row(group, col_xs)
        non_empty = [c for c in aligned if c is not None and str(c).strip()]
        if len(non_empty) < 2:
            continue
        joined = " ".join(str(c) for c in aligned if c)
        if TOTAL_KW.search(joined):
            continue
        rows.append([parse_num(c) for c in aligned])

    if not rows:
        print(json.dumps({"success": True, "headers": ["원문 텍스트"],
                          "rows": [[raw_text]], "meta": meta, "rawText": raw_text}, ensure_ascii=False))
        return

    print(json.dumps({"success": True, "headers": header_texts, "rows": rows,
                      "meta": meta, "rawText": raw_text}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
