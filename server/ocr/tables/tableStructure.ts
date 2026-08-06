// server/ocr/tableStructure.ts
// Microsoft Table Transformer (TATR) 래퍼 — 표 셀 grid 검출용
//
// 모델: Xenova/table-transformer-structure-recognition (ONNX, MIT)
// 라이브러리: @huggingface/transformers (transformers.js v4+)
//
// 역할:
//   PP-OCRv5 는 텍스트 boxes 를 잘 뽑지만 "이 텍스트가 몇번째 행·몇번째 열" 인지 모름.
//   TATR 이 표 구조(행 경계 · 열 경계 · 셀)를 이미지 픽셀 좌표로 반환.
//   두 결과를 조합하면 정확한 셀 정렬 가능.
//
// 반환값:
//   { rows: BBox[], cols: BBox[], cells: BBox[] }
//   각 BBox = { x1, y1, x2, y2, score }
//
// 라벨:
//   "table"                 — 표 전체 영역
//   "table row"             — 각 행
//   "table column"          — 각 열
//   "table cell"            — 각 셀 (선택적, 모델 버전에 따라)
//   "table column header"   — 헤더 열
//   "table spanning cell"   — 병합 셀

export type BBox = { x1: number; y1: number; x2: number; y2: number; score: number };
export type TableStructure = {
  rows: BBox[];
  cols: BBox[];
  cells: BBox[];
  headers: BBox[];  // "table column header" 라벨
  tables: BBox[];   // "table" 라벨 (전체 표 영역)
};

let pipelinePromise: Promise<any> | null = null;
let RawImageCls: any = null;

async function getPipeline(): Promise<any> {
  if (pipelinePromise) return pipelinePromise;
  pipelinePromise = (async () => {
    try {
      const mod: any = await import("@huggingface/transformers");
      const { pipeline, RawImage } = mod;
      RawImageCls = RawImage;
      // 첫 실행 시 ~115MB 다운로드 후 로컬 캐시
      const detector = await pipeline("object-detection", "Xenova/table-transformer-structure-recognition");
      console.log("[TATR] Table Transformer structure recognition 모델 초기화 완료");
      return detector;
    } catch (e: any) {
      pipelinePromise = null;
      throw new Error(`TATR 로드 실패: ${e?.message ?? e}. @huggingface/transformers 설치 확인.`);
    }
  })();
  return pipelinePromise;
}

/**
 * 이미지에서 표 구조(행/열/셀 경계) 검출
 * @param b64 base64 이미지 데이터
 * @param threshold 검출 임계값 (기본 0.7)
 */
export async function detectTableStructure(b64: string, threshold = 0.7): Promise<TableStructure> {
  const detector = await getPipeline();
  const buf = Buffer.from(b64, "base64");
  // RawImage.fromBlob 은 브라우저용, Node 는 fromBuffer or from URL
  // fromBuffer 시그니처는 (buf, mimeType) 지만 lint 회피용 any
  const img = await RawImageCls.fromBlob(new Blob([buf as any], { type: "image/jpeg" }));

  const results: Array<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>
    = await detector(img, { threshold });

  const toBBox = (r: any): BBox => ({
    x1: r.box.xmin,
    y1: r.box.ymin,
    x2: r.box.xmax,
    y2: r.box.ymax,
    score: r.score,
  });

  const rows: BBox[] = [];
  const cols: BBox[] = [];
  const cells: BBox[] = [];
  const headers: BBox[] = [];
  const tables: BBox[] = [];

  for (const r of results) {
    const label = String(r.label ?? "").toLowerCase();
    const bb = toBBox(r);
    if (label === "table row") rows.push(bb);
    else if (label === "table column") cols.push(bb);
    else if (label === "table cell") cells.push(bb);
    else if (label === "table column header") headers.push(bb);
    else if (label === "table") tables.push(bb);
  }

  // 정렬
  rows.sort((a, b) => a.y1 - b.y1);
  cols.sort((a, b) => a.x1 - b.x1);

  console.log(`[TATR] 표 구조: rows=${rows.length}, cols=${cols.length}, cells=${cells.length}, headers=${headers.length}`);
  return { rows, cols, cells, headers, tables };
}

/**
 * 텍스트 박스 (x, y, w, h) 를 (row_idx, col_idx) 셀 좌표로 매핑
 * @param textCx 텍스트 중심 x
 * @param textCy 텍스트 중심 y
 * @returns { rowIdx, colIdx } 또는 null (표 밖)
 */
export function assignToCell(
  textCx: number,
  textCy: number,
  structure: TableStructure
): { rowIdx: number; colIdx: number } | null {
  const rowIdx = structure.rows.findIndex(r => textCy >= r.y1 && textCy <= r.y2);
  const colIdx = structure.cols.findIndex(c => textCx >= c.x1 && textCx <= c.x2);
  if (rowIdx < 0 || colIdx < 0) return null;
  return { rowIdx, colIdx };
}

/**
 * 서버 부팅 시 pre-warm (선택적)
 */
export async function prewarmTatr(): Promise<void> {
  try { await getPipeline(); }
  catch (e: any) { console.warn("[TATR] prewarm 실패 (무시):", e?.message); }
}
