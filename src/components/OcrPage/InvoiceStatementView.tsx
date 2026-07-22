// src/components/OcrPage/InvoiceStatementView.tsx
// 2026-07-22 · 파싱 결과를 거래명세서 형태로 렌더링하는 독립 컴포넌트
//
// 목적: 로컬 파싱 or Gemini 파싱 결과 (OcrPageResult[]) 를 받아 페이지별 거래명세서 카드로 표시.
//   RawOcrTable 은 편집·매칭·확정까지 다 하는 종합 UI · 이건 순수 뷰어 (파싱 결과 확인용).
//
// 사용:
//   <InvoiceStatementView pages={pages} title="Gemini 파싱 결과" />

import React from "react";
import type { OcrPageResult } from "./types";

export interface InvoiceStatementViewProps {
  pages: OcrPageResult[];
  /** 카드 상단 라벨 (예: "로컬 파싱 결과") */
  title?: string;
  /** 색상 테마 · 로컬=emerald / Gemini=violet / 기본=slate */
  theme?: "emerald" | "violet" | "slate";
  /** 접힘 여부 (details/summary) · 기본 true */
  collapsible?: boolean;
  /** 최초 열림 상태 · 기본 false */
  defaultOpen?: boolean;
}

const THEME = {
  emerald: {
    border: "border-emerald-200",
    bgHeader: "bg-emerald-50",
    text: "text-emerald-700",
    accent: "text-emerald-600",
  },
  violet: {
    border: "border-violet-200",
    bgHeader: "bg-violet-50",
    text: "text-violet-700",
    accent: "text-violet-600",
  },
  slate: {
    border: "border-slate-200",
    bgHeader: "bg-slate-50",
    text: "text-slate-700",
    accent: "text-slate-600",
  },
};

const fmt = (n: number | string | null | undefined): string => {
  if (n == null || n === "") return "-";
  const num = typeof n === "string" ? Number(n.replace(/,/g, "")) : n;
  if (!Number.isFinite(num)) return String(n);
  return num.toLocaleString("ko-KR");
};

type ThemeStyle = (typeof THEME)[keyof typeof THEME];
interface InvoicePageCardProps { page: OcrPageResult; theme: ThemeStyle }
const InvoicePageCard: React.FC<InvoicePageCardProps> = ({ page, theme }) => {
  const rowsCount = page.rows?.length ?? 0;
  const supplier = page.meta?.supplier ?? "미상";
  const date = page.meta?.date ?? "-";
  const total = page.meta?.total ?? null;
  // 헤더 별 컬럼 인덱스 찾기 (유연 매칭)
  const findCol = (names: string[]): number => {
    for (const n of names) {
      const i = (page.headers ?? []).indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const nameCol = findCol(["품명", "제품명", "상품명"]);
  const specCol = findCol(["규격"]);
  const qtyCol = findCol(["수량"]);
  const priceCol = findCol(["단가"]);
  const amountCol = findCol(["금액"]);
  const expiryCol = findCol(["유통기한", "유효기한", "소비/사용기한"]);

  return (
    <div className={`bg-white border ${theme.border} rounded-lg overflow-hidden shadow-sm`}>
      <div className={`${theme.bgHeader} px-3 py-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b ${theme.border}`}>
        <span className={`text-[12px] font-black ${theme.text}`}>page {page.page}</span>
        <span className={`text-[14px] font-black ${theme.text}`}>{supplier}</span>
        <span className="text-[11px] text-slate-500">거래일 {date}</span>
        <span className={`text-[12px] font-bold ${theme.accent} ml-auto`}>
          합계 {fmt(total)} 원 · {rowsCount}행
        </span>
      </div>
      {rowsCount === 0 ? (
        <div className="px-3 py-4 text-center text-[12px] text-slate-400">상품 행 없음</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="px-2 py-1.5 text-slate-500 font-bold w-10 text-center">#</th>
                <th className="px-2 py-1.5 text-slate-500 font-bold">품명</th>
                <th className="px-2 py-1.5 text-slate-500 font-bold w-16">규격</th>
                <th className="px-2 py-1.5 text-slate-500 font-bold w-14 text-right">수량</th>
                <th className="px-2 py-1.5 text-slate-500 font-bold w-20 text-right">단가</th>
                <th className="px-2 py-1.5 text-slate-500 font-bold w-24 text-right">금액</th>
                <th className="px-2 py-1.5 text-slate-500 font-bold w-24">유통기한</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-2 py-1 text-slate-400 text-center">{i + 1}</td>
                  <td className="px-2 py-1 text-slate-800 font-semibold">{nameCol >= 0 ? String(r[nameCol] ?? "-") : "-"}</td>
                  <td className="px-2 py-1 text-slate-600">{specCol >= 0 ? String(r[specCol] ?? "-") : "-"}</td>
                  <td className="px-2 py-1 text-slate-700 text-right tabular-nums">{qtyCol >= 0 ? fmt(r[qtyCol] as any) : "-"}</td>
                  <td className="px-2 py-1 text-slate-700 text-right tabular-nums">{priceCol >= 0 ? fmt(r[priceCol] as any) : "-"}</td>
                  <td className="px-2 py-1 text-slate-900 font-bold text-right tabular-nums">{amountCol >= 0 ? fmt(r[amountCol] as any) : "-"}</td>
                  <td className="px-2 py-1 text-slate-500">{expiryCol >= 0 ? String(r[expiryCol] ?? "-") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function InvoiceStatementView({
  pages,
  title,
  theme: themeKey = "slate",
  collapsible = true,
  defaultOpen = false,
}: InvoiceStatementViewProps) {
  const theme = THEME[themeKey];
  const totalRows = pages.reduce((s, p) => s + (p.rows?.length ?? 0), 0);
  const totalSum = pages.reduce((s, p) => s + (typeof p.meta?.total === "number" ? p.meta.total : 0), 0);

  const body = (
    <div className="flex flex-col gap-2 mt-2">
      {pages.length === 0 ? (
        <div className="text-[12px] text-slate-400 text-center py-4">파싱된 페이지 없음</div>
      ) : (
        pages.map(p => <InvoicePageCard key={p.page} page={p} theme={theme} />)
      )}
    </div>
  );

  if (!collapsible) {
    return (
      <div className="w-full">
        {title && <div className={`text-[13px] font-black ${theme.text}`}>{title}</div>}
        {body}
      </div>
    );
  }

  return (
    <details className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2" open={defaultOpen}>
      <summary className={`cursor-pointer text-[13px] font-bold ${theme.text} select-none flex flex-wrap items-baseline gap-x-3`}>
        <span>📋 {title ?? "거래명세서 뷰"}</span>
        <span className="text-[11px] text-slate-500 font-normal">
          {pages.length}페이지 · {totalRows}행 · 합계 {fmt(totalSum)} 원
        </span>
      </summary>
      {body}
    </details>
  );
}
