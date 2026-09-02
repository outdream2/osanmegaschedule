// src/components/OcrPage/BalanceConfigTab.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · OcrPage 에서 이관
// 잔고항목 지정 탭 · 공급처별 잔고 label 매핑
// 프레임워크: Card
import React from "react";
// 2026-09-02 · 프레임워크 · axios → api.* (인증·에러 프레임워크 통합)
import { api } from "../../lib/apiClient";
import { Card } from "../common/Card";
import type { OcrPageResult } from "./types";
import { BALANCE_LABEL_OPTIONS } from "./OcrPage.types";

interface BalanceConfigTabProps {
  pages: OcrPageResult[];
  config: Record<string, string>;
  onConfigChange: (vendor: string, label: string) => void;
}

export const BalanceConfigTab: React.FC<BalanceConfigTabProps> = ({ pages, config, onConfigChange }) => {
  const [dbVendors, setDbVendors] = React.useState<string[]>([]);

  React.useEffect(() => {
    api.get<{ supplier_name: string }[]>("/api/supplier-balance-configs")
      .then(({ data }) => {
        const names = data.map(x => x.supplier_name);
        setDbVendors(names);
      })
      .catch(() => {});
  }, []);

  const knownVendors = React.useMemo(() => {
    const fromPages = pages.map(p => p.meta.supplier).filter(Boolean) as string[];
    const all = new Set([...dbVendors, ...fromPages]);
    return [...all].sort();
  }, [pages, dbVendors]);

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-4 flex flex-col gap-4">
      <Card clip padding="none">
        <div className="px-4 py-3 border-b border-zinc-100 bg-orange-50 flex items-center gap-2">
          <span className="text-xs font-bold text-orange-800">잔고항목 지정</span>
          <span className="text-[15px] text-orange-500">공급처별로 잔고로 표시할 항목을 지정하세요. 확정표에 주황색으로 표시됩니다.</span>
        </div>
        {knownVendors.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-xs">
            OCR을 실행하면 공급처가 자동으로 등록됩니다.
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-orange-50 border-b border-orange-100">
                <th className="px-4 py-2 text-left font-bold text-orange-900">공급처</th>
                <th className="px-4 py-2 text-left font-bold text-orange-900">잔고 항목</th>
              </tr>
            </thead>
            <tbody>
              {knownVendors.map(vendor => (
                <tr key={vendor} className="border-t border-gray-50 hover:bg-orange-50/30">
                  <td className="px-4 py-2 font-semibold text-gray-700">{vendor}</td>
                  <td className="px-4 py-2">
                    <select
                      className="border border-line rounded px-2 py-1 text-xs outline-none focus:border-brand-deep bg-white"
                      value={config[vendor] ?? "(없음)"}
                      onChange={e => onConfigChange(vendor, e.target.value)}
                    >
                      {BALANCE_LABEL_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};
