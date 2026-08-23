import React from "react";
import { Wand2 } from "lucide-react";
import { Spinner } from "../../common/Spinner";
import { Card } from "../../common/Card";
import type { RawPage } from "./types";

interface FallbackPageSectionProps {
  fallbackPages: RawPage[];
  matchingPage: Record<number, boolean>;
  handleMatchPage: (pn: number) => Promise<void>;
  onReparsePage?: ((page: number, supplier: string) => Promise<void>) | null;
}

export const FallbackPageSection: React.FC<FallbackPageSectionProps> = ({
  fallbackPages, matchingPage, handleMatchPage, onReparsePage,
}) => {
  if (!fallbackPages.length) return null;
  return (
    <>
      {fallbackPages.map(p => {
        const supplier = p.meta?.supplier ?? "";
        return (
          <Card key={p.page} variant="flat" padding="none" rounded="2xl" borderColor="border-rose-200" clip className="w-full">
            <div className="px-4 py-2 border-b border-rose-100 bg-rose-50 flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-bold text-rose-700">
                페이지 {p.page} — 표 감지 실패 (원문)
              </span>
              {supplier && (
                <span className="text-[12px] font-bold text-amber-700">공급: {supplier}</span>
              )}
              <button
                type="button"
                onClick={() => handleMatchPage(p.page)}
                disabled={!!matchingPage[p.page]}
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-white bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed rounded px-1.5 py-0.5 whitespace-nowrap"
                title={`${p.page}번 명세서 상품명만 자동보정`}
              >
                {matchingPage[p.page] ? <Spinner size={10} /> : <Wand2 size={10} />}
                {p.page}번 상품명 보정
              </button>
              {onReparsePage && supplier && (
                <button
                  type="button"
                  onClick={() => onReparsePage(p.page, supplier).catch(() => {})}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded px-1.5 py-0.5 whitespace-nowrap"
                  title="이 페이지 재파싱 시도"
                >🔄 재파싱</button>
              )}
            </div>
            <pre className="px-4 py-3 text-[12px] text-gray-600 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {p.rawText ?? p.rows.filter((r: any) => Array.isArray(r)).map((r: any) => r[0]).join("\n")}
            </pre>
          </Card>
        );
      })}
    </>
  );
};
