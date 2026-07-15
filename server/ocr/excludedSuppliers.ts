// server/ocr/excludedSuppliers.ts
// OCR 공급사 추출에서 제외할 이름 리스트 (2026-07-15 · 별도 파일로 분리)
//
// 관리 방식:
//   1) 이 파일의 DEFAULT_EXCLUDED_SUPPLIERS 배열을 수정 → 재배포로 즉시 반영
//   2) 환경변수로 추가 확장 가능:
//      - OCR_RECIPIENT_COMPANY / REP / ADDRESS / EXCLUDED_LOGISTICS / EXCLUDED_SUPPLIERS
//      - OCR_RECIPIENT_NAMES / OCR_RECIPIENT (하위 호환)
//   3) 정규식 이스케이프 자동 처리 · (주) 같은 특수문자 안전
//
// 카테고리:
//   ▷ 자체 약국 (수신처) — 공급받는쪽 상호
//   ▷ 배송사 · 물류사 — 공급사로 오인식되기 쉬움
//   ▷ 수신처 담당자 — 상호 근처에 사람 이름 붙어 오추출되는 경우
//   ▷ 수신처 주소 조각 — OCR 이 주소를 상호로 오인식하는 경우

export const DEFAULT_EXCLUDED_SUPPLIERS: string[] = [
  // ── 자체 약국 (수신처) ─────────────────────────────────────
  //   OCR 오독 관대: 팜↔탐↔팔↔탕
  "코스트팜", "코스트탐", "코스트팔", "코스트탕",
  "Costpharm", "Costphara",
  "메가타운", "메가타운약국",

  // ── 배송사 · 물류사 ──────────────────────────────────────
  //   공급사로 오인식되기 쉬움
  "(주)홈우드", "홈우드",
  "고려택배", "고려택배물류센터",
  "한진택배", "롯데택배", "CJ대한통운", "우체국택배", "로젠택배",

  // ── 수신처 담당자 (본인 약국 직원) ─────────────────────────
  //   예: "코스트팜약국(직/최) 차인대" → "차인대" 제외
  "차인대",

  // ── 수신처 주소 조각 ──────────────────────────────────────
  //   OCR 이 주소를 상호로 오인식하는 경우
  "경기 용인시 용구대로 2427-1",
  "용인시기흥구용구대로 2427-1",
  "용구대로 2427-1",
  "마동(마북동)",
];

// ═══════════════════════════════════════════════════════════════════════
// 사업자번호 blacklist (2026-07-15 · 3101805493 오학습 사고 대응)
//   수신처(우리 약국) 사업자번호이므로 공급사가 될 수 없음
//   OCR 이 명세서 상단 등록번호 라인에서 수신처 번호를 잘못 인식해도
//   이 리스트에 있는 번호는 자동으로 스킵 → vendors 오학습 방지
//
// 관리 방식:
//   1) 배열 수정 → 재배포로 즉시 반영
//   2) 하이픈 유무 관계없이 매칭 (숫자만 추출해서 비교)
//   3) 환경변수 OCR_EXCLUDED_BUSINESS_NUMBERS 로 확장 가능 (`|` 구분)
// ═══════════════════════════════════════════════════════════════════════
export const DEFAULT_EXCLUDED_BUSINESS_NUMBERS: string[] = [
  "3101805493",  // (S)코스트팜약국 · 수신처 · 4중복 오학습 사고 (id 152/153/155/156 삭제됨)
];

// 사업자번호 정규화: 하이픈/공백 제거 · 숫자만
export function normalizeBizNum(s: string): string {
  return String(s ?? "").replace(/\D/g, "");
}

// 주어진 사업자번호가 blacklist 에 있는지
export function isExcludedBusinessNumber(bizNum: string): boolean {
  const norm = normalizeBizNum(bizNum);
  if (!norm) return false;
  const envRaw = process.env.OCR_EXCLUDED_BUSINESS_NUMBERS ?? "";
  const envExtra = envRaw ? envRaw.split(/[|,]/).map(s => normalizeBizNum(s)).filter(Boolean) : [];
  const all = new Set<string>([
    ...DEFAULT_EXCLUDED_BUSINESS_NUMBERS.map(normalizeBizNum),
    ...envExtra,
  ]);
  return all.has(norm);
}
