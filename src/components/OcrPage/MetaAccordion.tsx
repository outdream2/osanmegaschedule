import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { OcrMeta } from "./types";
import { fmt } from "./types";

interface MetaAccordionProps {
  meta: OcrMeta[];
}

export const MetaAccordion: React.FC<MetaAccordionProps> = ({ meta }) => {
  const [expandedPage, setExpandedPage] = useState<number | null>(null);

  if (meta.length === 0) return null;

  return (
    <div className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <span className="font-bold text-gray-900 text-sm">페이지별 요약</span>
      </div>
      <div className="divide-y divide-gray-50">
        {meta.map((m) => (
          <div key={m.page}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition cursor-pointer"
              onClick={() => setExpandedPage(expandedPage === m.page ? null : m.page)}
            >
              <span className="text-sm font-semibold text-gray-700">페이지 {m.page}</span>
              <div className="flex items-center gap-3">
                {m.date && <span className="text-xs text-gray-500">{m.date}</span>}
                {m.total != null && <span className="text-xs font-bold text-amber-700">{fmt(m.total)}원</span>}
                {expandedPage === m.page
                  ? <ChevronUp size={14} className="text-gray-400" />
                  : <ChevronDown size={14} className="text-gray-400" />}
              </div>
            </button>
            {expandedPage === m.page && (
              <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {m.supplier && <div><span className="text-gray-400">공급자: </span><span className="font-semibold text-gray-700">{m.supplier}</span></div>}
                {m.recipient && <div><span className="text-gray-400">수신자: </span><span className="font-semibold text-gray-700">{m.recipient}</span></div>}
                {m.date && <div><span className="text-gray-400">일자: </span><span className="font-semibold text-gray-700">{m.date}</span></div>}
                {m.subtotal != null && <div><span className="text-gray-400">공급가액: </span><span className="font-semibold text-gray-700">{fmt(m.subtotal)}원</span></div>}
                {m.vat != null && <div><span className="text-gray-400">부가세: </span><span className="font-semibold text-gray-700">{fmt(m.vat)}원</span></div>}
                {m.total != null && <div><span className="text-gray-400">합계: </span><span className="font-bold text-amber-700">{fmt(m.total)}원</span></div>}
                {m._rawText && (
                  <div className="col-span-full">
                    <p className="text-gray-400 mb-1">원문 응답:</p>
                    <pre className="text-[10px] text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto">{m._rawText}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
