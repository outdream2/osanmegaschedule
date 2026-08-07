// src/utils/contractUtils.ts
// 근로계약서 관련 순수 유틸 · ContractWriterPage 에서 이동 (god-phase1)
// T-Z (2026-08-05)

// 계약유형 short label (저장·전송 형식)
//   · "정규직"    → "정규"
//   · "계약직" + N개월 → "계약N" (예: 계약2 · 계약12)
//   · "알바"/"일용"/"인턴" → 그대로
// 근거: 사용자 요청 · StaffManagePage 정렬·필터·자동배지 (autoContractBadge 는 개월수 유지)
export function shortContractLabel(fullType: string, months?: string | number | null): string {
  const t = String(fullType ?? "").trim();
  if (!t) return "";
  // 이미 short 형식 (정규 · 계약N) 이면 그대로
  if (t === "정규" || /^계약\d+$/.test(t)) return t;
  // 정규직 → 정규
  if (t === "정규직" || t.startsWith("정규")) return "정규";
  // 계약직 + N개월 → 계약N
  if (t === "계약직" || t.startsWith("계약")) {
    const m = String(months ?? "").trim();
    if (m && /^\d+$/.test(m)) return `계약${m}`;
    return "계약";
  }
  // 그 외 (알바 · 일용 · 인턴 · custom) 은 그대로
  return t;
}

// T-Z · read 시 하위호환 · "정규직" · "계약직" · "계약2" 등을 { display, months } 로 정규화
//   · 반환 display 는 form 내부 표시용 (UI 드롭다운 · 정규직 / 계약직 유지)
//   · 반환 months 는 있으면 form.contractMonths 로 세팅
export function parseContractTypeForRead(saved: string | null | undefined): { display: string; months: string | null } {
  const s = String(saved ?? "").trim();
  if (!s) return { display: "", months: null };
  if (s === "정규" || s === "정규직") return { display: "정규직", months: null };
  // "계약N" 형식
  const m = s.match(/^계약(\d+)$/);
  if (m) return { display: "계약직", months: m[1] };
  if (s === "계약" || s === "계약직") return { display: "계약직", months: null };
  // 알바·일용·인턴·custom
  return { display: s, months: null };
}
