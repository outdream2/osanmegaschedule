import React from "react";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import type { RawPage } from "./types";

// ── 컬럼 상수 ────────────────────────────────────────────────────────────────
export const SCHEMA_ORDER = ["공급처","일자","품명","수량","단가","금액","세액","규격","유통기한","단위","비고"];
// "에누리"/"에누리액"은 할인 금액으로 계산에 사용하므로 HIDDEN에서 제외
// "유통기한"은 SCHEMA_ORDER 에 포함 → HIDDEN 에서 제외
export const HIDDEN_COLS  = new Set(["번호", "배치번호", "Batch No", "BatchNo", "BATCH NO", "소비기한", "사용기한", "소비/사용기한", "보험코드"]);
export const NUM_COLS     = new Set(["수량","단가","금액","세액"]);

// ── 숫자 포맷 ─────────────────────────────────────────────────────────────────
export function fmt(v: number) { return v.toLocaleString("ko-KR"); }

// ── fallback 페이지 판별 ──────────────────────────────────────────────────────
export function isFallback(headers: string[]) {
  return headers.length <= 1 &&
    (headers[0] === "원문 텍스트" || headers[0] === "원문 응답" || headers.length === 0);
}

// ── 통합 헤더 빌드 ────────────────────────────────────────────────────────────
export function buildMasterHeaders(pages: RawPage[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const hasSupplier = pages.some(p => p.meta.supplier);
  for (const col of SCHEMA_ORDER) {
    if (col === "공급처") {
      if (hasSupplier) { out.push(col); seen.add(col); }
      continue;
    }
    if (pages.some(p => p.headers.includes(col))) {
      out.push(col); seen.add(col);
    }
  }
  for (const p of pages) {
    for (const h of p.headers) {
      if (!seen.has(h) && !isFallback([h]) && !HIDDEN_COLS.has(h)) {
        out.push(h); seen.add(h);
      }
    }
  }
  return out;
}

// ── 행 정렬 ──────────────────────────────────────────────────────────────────
export function alignRow(
  row: (string | number | null)[],
  src: string[],
  dst: string[]
): (string | number | null)[] {
  return dst.map(h => { const i = src.indexOf(h); return i >= 0 ? row[i] : null; });
}

// ── 점수 색상 ─────────────────────────────────────────────────────────────────
export function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 50) return "text-amber-500";
  return "text-rose-500";
}

// ── 점수 아이콘 ───────────────────────────────────────────────────────────────
export function ScoreIcon({ score }: { score: number }) {
  if (score >= 80) return <CheckCircle size={12} className="text-emerald-500 shrink-0" />;
  if (score >= 50) return <AlertTriangle size={12} className="text-amber-400 shrink-0" />;
  return <XCircle size={12} className="text-rose-400 shrink-0" />;
}

// ── 숫자 파싱 ─────────────────────────────────────────────────────────────────
export const parseNumber = (val: any): number => {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const clean = String(val).replace(/[^0-9.-]/g, "");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};

// ── 말줄임표 렌더링 ───────────────────────────────────────────────────────────
export function renderTextWithBreaks(text: string): React.ReactNode {
  const parts = text.split(/\.{3}|…/);
  if (parts.length <= 1) return text;
  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {part}
          {i < parts.length - 1 && <br />}
        </React.Fragment>
      ))}
    </>
  );
}
