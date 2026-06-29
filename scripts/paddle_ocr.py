#!/usr/bin/env python3
"""
PaddleOCR helper — reads JSON from stdin, writes JSON to stdout.
stdin:  {"data": "<base64 image>", "mimeType": "image/jpeg"}
stdout: {"success": true, "headers": [...], "rows": [...], "meta": {...}}
"""
import sys, json, base64, tempfile, os, re, logging, statistics

logging.disable(logging.CRITICAL)
os.environ["FLAGS_call_stack_level"] = "0"
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

KW = ["품목","품명","상품명","수량","단가","금액","규격","단위","공급가액","세액","적요","번호"]
TOTAL_KW = re.compile(r"합\s*계|소\s*계|총\s*계|합\s*금|총\s*금")


def bbox_to_center(bbox):
    xs = [p[0] for p in bbox]
    ys = [p[1] for p in bbox]
    return (min(xs)+max(xs))/2, (min(ys)+max(ys))/2, max(ys)-min(ys)


def group_into_rows(lines):
    """Group text blocks by Y proximity → list of row groups (each group sorted by X).

    핵심 수정:
    1. 임계값을 전체 글자 높이 중앙값 × 0.55 로 고정 (행별 h 변동에 흔들리지 않음)
    2. 그룹 비교 기준을 cur_anchor (그룹 시작 y)로 고정 — 드리프트 차단
    """
    if not lines:
        return []
    lines = sorted(lines, key=lambda l: l["y"])

    h_median = statistics.median(l["h"] for l in lines)
    thr = max(8, h_median * 0.55)

    groups = []
    cur = [lines[0]]
    cur_anchor = lines[0]["y"]

    for line in lines[1:]:
        if abs(line["y"] - cur_anchor) < thr:
            cur.append(line)
        else:
            groups.append(sorted(cur, key=lambda l: l["x"]))
            cur = [line]
            cur_anchor = line["y"]

    if cur:
        groups.append(sorted(cur, key=lambda l: l["x"]))
    return groups


def _is_mostly_numeric(row):
    """셀의 50% 이상이 숫자 토큰이면 True (합계/데이터 행 구별)."""
    num = sum(1 for c in row if re.fullmatch(r"[\d,.\s]+", c.strip()))
    return len(row) > 0 and num / len(row) >= 0.5


def find_header_row(row_groups):
    """Return (header_idx, col_xs, header_texts).

    개선사항:
    1. 합계/소계/총계 키워드가 있는 행은 헤더 후보 제외
    2. 숫자 토큰 비율 ≥ 50%인 행 제외
    3. 정확 일치(==) 먼저, 부분 일치는 fallback
    """
    text_rows = [[item["text"] for item in g] for g in row_groups]

    def is_candidate(row):
        joined = " ".join(row)
        if TOTAL_KW.search(joined):
            return False
        if _is_mostly_numeric(row):
            return False
        return True

    # 1단계: 엄격 — KW 정확 일치 2개 이상 + 3컬럼 이상
    for i, row in enumerate(text_rows):
        if not is_candidate(row):
            continue
        hits = sum(1 for cell in row if any(k == cell.strip() for k in KW))
        if hits >= 2 and len(row) >= 3:
            return i, [item["x"] for item in row_groups[i]], text_rows[i]

    # 2단계: 부분 일치 2개 이상 + 3컬럼 이상
    for i, row in enumerate(text_rows):
        if not is_candidate(row):
            continue
        hits = sum(1 for cell in row if any(k in cell for k in KW))
        if hits >= 2 and len(row) >= 3:
            return i, [item["x"] for item in row_groups[i]], text_rows[i]

    # 3단계: 부분 일치 1개 이상 + 3컬럼 이상 (최후 수단)
    for i, row in enumerate(text_rows):
        if not is_candidate(row):
            continue
        if len(row) >= 3 and any(any(k in cell for k in KW) for cell in row):
            return i, [item["x"] for item in row_groups[i]], text_rows[i]

    return -1, [], []


def align_row(group, col_xs):
    """Assign each text block to the nearest header column.

    개선: 평균 컬럼 간격의 0.6배보다 멀면 무시 (잡음 셀 차단).
    """
    if len(col_xs) >= 2:
        avg_gap = (col_xs[-1] - col_xs[0]) / (len(col_xs) - 1)
        max_dist = avg_gap * 0.6
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
            row[nearest] = row[nearest] + " " + item["text"]
    return row


def extract_meta(text):
    meta = {}
    m = re.search(r"(\d{4})[년.\-\/]\s*(\d{1,2})[월.\-\/]\s*(\d{1,2})[일]?", text)
    if m:
        meta["date"] = f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
    m = re.search(r"공\s*급\s*자\s*[:\s]*([가-힣a-zA-Z0-9()（）\s]{2,20})", text)
    if m:
        meta["supplier"] = m.group(1).strip().split("  ")[0]
    m = re.search(r"공\s*급\s*받\s*는\s*자?\s*[:\s]*([가-힣a-zA-Z0-9()（）\s]{2,20})", text)
    if m:
        meta["recipient"] = m.group(1).strip().split("  ")[0]
    totals = []
    for pat in [r"합\s*계[^\d]*(\d[\d,]+)", r"총\s*금\s*액[^\d]*(\d[\d,]+)", r"공\s*급\s*가\s*액[^\d]*(\d[\d,]+)"]:
        m = re.search(pat, text)
        if m:
            totals.append(int(m.group(1).replace(",", "")))
    if totals:
        meta["total"] = max(totals)
    return meta


def parse_num(s):
    if s is None:
        return None
    c = str(s).replace(",", "").strip()
    try:
        v = float(c)
        return int(v) if v == int(v) else v
    except:
        return s


def build_result(row_groups):
    text_rows = [[item["text"] for item in g] for g in row_groups]
    full_text = "\n".join(" ".join(r) for r in text_rows)
    meta = extract_meta(full_text)

    header_idx, col_xs, headers = find_header_row(row_groups)

    if header_idx < 0:
        return {
            "headers": ["원문 텍스트"],
            "rows": [[" ".join(r)] for r in text_rows],
            "meta": meta,
            "rawText": full_text,
        }

    rows = []
    for group in row_groups[header_idx + 1:]:
        aligned = align_row(group, col_xs)
        non_empty = [c for c in aligned if c is not None and str(c).strip()]
        if len(non_empty) < 2:
            continue
        # 합계 행 제외
        joined = " ".join(str(c) for c in aligned if c)
        if TOTAL_KW.search(joined):
            continue
        cells = [parse_num(c) for c in aligned]
        rows.append(cells)

    if not rows:
        return {
            "headers": ["원문 텍스트"],
            "rows": [[" ".join(r)] for r in text_rows],
            "meta": meta,
            "rawText": full_text,
        }

    return {"headers": headers, "rows": rows, "meta": meta, "rawText": full_text}


def main():
    try:
        data = json.loads(sys.stdin.buffer.read())
        img_bytes = base64.b64decode(data["data"])

        suffix = ".png" if "png" in (data.get("mimeType") or "") else ".jpg"

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(img_bytes)
            tmp = f.name

        try:
            from paddleocr import PaddleOCR
            ocr = PaddleOCR(use_angle_cls=True, lang="korean", use_gpu=False, show_log=False)
            result = ocr.ocr(tmp, cls=True)

            lines = []
            if result and result[0]:
                for det in result[0]:
                    bbox, (text, conf) = det
                    x, y, h = bbox_to_center(bbox)
                    lines.append({"text": text, "conf": float(conf), "x": x, "y": y, "h": h})

            row_groups = group_into_rows(lines)
            parsed = build_result(row_groups)
            sys.stdout.buffer.write(
                json.dumps({"success": True, **parsed}, ensure_ascii=False).encode("utf-8")
            )
        finally:
            os.unlink(tmp)

    except Exception as e:
        import traceback
        sys.stdout.buffer.write(
            json.dumps({
                "success": False,
                "error": str(e),
                "detail": traceback.format_exc(),
            }, ensure_ascii=False).encode("utf-8")
        )


if __name__ == "__main__":
    main()
