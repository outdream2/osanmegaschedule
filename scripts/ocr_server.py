"""
Python OCR 마이크로서버 — FastAPI + EasyOCR
포트 8001에서 실행, Node.js 메인 서버가 HTTP로 호출
"""
import sys, base64, io, re, statistics, logging
logging.disable(logging.CRITICAL)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import numpy as np
from PIL import Image
import easyocr
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── EasyOCR 리더 (서버 시작 시 1회 로딩) ────────────────────────────────────
print("[OCR Server] EasyOCR 모델 로딩 중...", flush=True)
reader = easyocr.Reader(["ko", "en"], gpu=False, verbose=False)
print("[OCR Server] 모델 로딩 완료. 포트 8001 대기 중.", flush=True)

KW = ["품목","품명","상품명","수량","단가","금액","규격","단위","공급가액","세액","적요","번호","No"]
TOTAL_KW = re.compile(r"합\s*계|소\s*계|총\s*계|합\s*금|총\s*금")


def bbox_center(bbox):
    xs = [p[0] for p in bbox]
    ys = [p[1] for p in bbox]
    return float(min(xs)), float(min(ys)), float(max(ys) - min(ys)) or 12.0


def group_into_rows(lines):
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
    text_rows = [[item["text"] for item in g] for g in row_groups]

    def is_candidate(row):
        return not TOTAL_KW.search(" ".join(row)) and not is_mostly_numeric(row)

    for i, row in enumerate(text_rows):
        if not is_candidate(row): continue
        if sum(1 for c in row if any(k == c.strip() for k in KW)) >= 2 and len(row) >= 3:
            return i, [it["x"] for it in row_groups[i]], row

    for i, row in enumerate(text_rows):
        if not is_candidate(row): continue
        if sum(1 for c in row if any(k in c for k in KW)) >= 2 and len(row) >= 3:
            return i, [it["x"] for it in row_groups[i]], row

    for i, row in enumerate(text_rows):
        if not is_candidate(row): continue
        if len(row) >= 3 and any(any(k in c for k in KW) for c in row):
            return i, [it["x"] for it in row_groups[i]], row

    return -1, [], []


def align_row(group, col_xs):
    if len(col_xs) >= 2:
        avg_gap = (col_xs[-1] - col_xs[0]) / (len(col_xs) - 1)
        max_dist = avg_gap * 0.65
    else:
        max_dist = float("inf")
    row = [None] * len(col_xs)
    for item in group:
        dists = [abs(item["x"] - cx) for cx in col_xs]
        nearest = min(range(len(col_xs)), key=lambda i: dists[i])
        if dists[nearest] > max_dist: continue
        row[nearest] = item["text"] if row[nearest] is None else row[nearest] + " " + item["text"]
    return row


def parse_num(s):
    if s is None: return None
    cleaned = re.sub(r"[,\s]", "", str(s))
    try:
        n = float(cleaned)
        return int(n) if n == int(n) else n
    except ValueError:
        return s


def extract_meta(text):
    meta = {}
    m = re.search(r"(\d{4})[년.\-\/]\s*(\d{1,2})[월.\-\/]\s*(\d{1,2})[일]?", text)
    if m: meta["date"] = f"{m[1]}-{m[2].zfill(2)}-{m[3].zfill(2)}"
    m = re.search(r"공\s*급\s*자\s*[:\s]*([가-힣a-zA-Z0-9()（）\s]{2,20})", text)
    if m: meta["supplier"] = m[1].strip().split()[0]
    m = re.search(r"공\s*급\s*받\s*는\s*자?\s*[:\s]*([가-힣a-zA-Z0-9()（）\s]{2,20})", text)
    if m: meta["recipient"] = m[1].strip().split()[0]
    tots = []
    for pat in [r"합\s*계[^\d]*(\d[\d,]+)", r"총\s*금\s*액[^\d]*(\d[\d,]+)", r"공\s*급\s*가\s*액[^\d]*(\d[\d,]+)"]:
        m = re.search(pat, text)
        if m: tots.append(int(m[1].replace(",", "")))
    if tots: meta["total"] = max(tots)
    return meta


def run_easyocr(img_arr):
    results = reader.readtext(img_arr, detail=1, paragraph=False)
    lines = []
    for (bbox, text, conf) in results:
        text = text.strip()
        if not text or conf < 0.25: continue
        x, y, h = bbox_center(bbox)
        lines.append({"text": text, "x": x, "y": y, "h": h})
    return lines


def build_result(lines):
    if not lines:
        return {"headers": ["원문 텍스트"], "rows": [[""]], "meta": {}, "rawText": ""}

    row_groups = group_into_rows(lines)
    raw_text = "\n".join(" ".join(it["text"] for it in g) for g in row_groups)
    meta = extract_meta(raw_text)
    header_idx, col_xs, header_texts = find_header_row(row_groups)

    if header_idx < 0:
        return {"headers": ["원문 텍스트"], "rows": [[raw_text]], "meta": meta, "rawText": raw_text}

    rows = []
    for group in row_groups[header_idx + 1:]:
        aligned = align_row(group, col_xs)
        non_empty = [c for c in aligned if c is not None and str(c).strip()]
        if len(non_empty) < 2: continue
        if TOTAL_KW.search(" ".join(str(c) for c in aligned if c)): continue
        rows.append([parse_num(c) for c in aligned])

    if not rows:
        return {"headers": ["원문 텍스트"], "rows": [[raw_text]], "meta": meta, "rawText": raw_text}

    return {"headers": header_texts, "rows": rows, "meta": meta, "rawText": raw_text}


# ── API ───────────────────────────────────────────────────────────────────────
class OcrRequest(BaseModel):
    data: str       # base64 이미지
    mimeType: str = "image/jpeg"


@app.get("/health")
def health():
    return {"ok": True, "engine": "easyocr"}


@app.post("/ocr")
def ocr(req: OcrRequest):
    try:
        img_bytes = base64.b64decode(req.data)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        img_arr = np.array(img)
        lines = run_easyocr(img_arr)
        result = build_result(lines)
        print(f"[OCR] 헤더: {result['headers']}, 행수: {len(result['rows'])}", flush=True)
        return {"success": True, **result}
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "detail": traceback.format_exc()}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="warning")
