// src/components/LandingPage/PeriodCoverageWidget.tsx
// 2026-08-22 · Framework Phase 4 · LandingPage 대형 파일 분리 · PeriodCoverageWidget 이관
// 재고/매입 데이터 기간 커버리지 (월 × 초/중/하순)
import React, { useEffect, useState } from "react";
import { api } from "../../lib/apiClient";
import { StatusPill } from "../common/StatusPill";
import { Badge } from "../common/Badge";
import { useToast, toastClass } from "../../hooks/useToast";

export type CoverageResp = {
  periods?: Array<{ ym: string; early: number; mid: number; late: number; total: number }>;
  missing?: Array<{ ym: string; period_type: string }>;
  warning?: string;
};

export const PeriodCoverageWidget: React.FC<{
  endpoint: string;
  label: string;
  color: "indigo" | "sky";
  refreshTrigger?: any;
}> = ({ endpoint, label, color, refreshTrigger }) => {
  const { toast, showError } = useToast();
  const [data, setData] = useState<CoverageResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setLoading(true);
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    api.get<CoverageResp>(endpoint)
      .then(({ data: j }) => setData(j ?? { periods: [], missing: [] }))
      .catch(() => {
        setData({ periods: [], missing: [] });
        showError("커버리지 데이터 로드 실패");
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, refreshTrigger]);
  const ptxt: Record<string, string> = { early: "초순", mid: "중순", late: "하순" };
  const cellClsFilled = color === "indigo"
    ? "bg-indigo-100 text-indigo-800 border-indigo-300"
    : "bg-sky-100 text-sky-800 border-sky-300";
  const cellClsEmpty = "bg-rose-50 text-rose-500 border-rose-200 border-dashed";
  if (!data && !loading) return null;
  const periods = data?.periods ?? [];
  const missingCount = (data?.missing ?? []).length;
  return (
    <div className="mb-4 border border-line rounded-xl overflow-hidden">
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
      <button type="button" onClick={() => setCollapsed(c => !c)}
        className={`w-full flex items-center justify-between px-3 py-2 bg-zinc-50 hover:bg-zinc-100 transition cursor-pointer`}>
        <div className="flex items-center gap-2 min-w-0">
          <Badge tone={color} shape="pill" size="xs">{label}</Badge>
          {loading ? (
            <span className="text-[10px] text-zinc-400 font-mono">로딩...</span>
          ) : periods.length === 0 ? (
            <span className="text-[10px] text-zinc-400">아직 데이터 없음</span>
          ) : (
            <>
              <span className="text-[10px] font-mono text-zinc-500">
                {periods[0].ym} ~ {periods[periods.length - 1].ym}
              </span>
              {missingCount > 0 && (
                <StatusPill tone="rose" size="xs" dot pulse>빈 기간 {missingCount}건</StatusPill>
              )}
            </>
          )}
        </div>
        <span className={`text-zinc-400 text-xs shrink-0 transition-transform ${collapsed ? "" : "rotate-180"}`}>▲</span>
      </button>
      {!collapsed && (
        <div className="px-3 py-2 bg-white">
          {periods.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-2">임포트된 데이터가 없어요. 위에서 xlsx 를 업로드해주세요.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] font-mono">
                  <thead>
                    <tr className="text-zinc-400 text-[9px] uppercase">
                      <th className="text-left px-1 py-1">월</th>
                      <th className="text-center px-1 py-1">초순</th>
                      <th className="text-center px-1 py-1">중순</th>
                      <th className="text-center px-1 py-1">하순</th>
                      <th className="text-right px-1 py-1">합계</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {periods.map(p => (
                      <tr key={p.ym}>
                        <td className="px-1 py-1 font-bold text-zinc-700 whitespace-nowrap">{p.ym}</td>
                        {(["early", "mid", "late"] as const).map(pt => {
                          const v = p[pt];
                          const filled = v > 0;
                          return (
                            <td key={pt} className="px-1 py-0.5 text-center">
                              <span className={`inline-block min-w-[42px] px-1.5 py-0.5 rounded border text-[10px] font-bold ${filled ? cellClsFilled : cellClsEmpty}`}
                                title={filled ? `${ptxt[pt]}: ${v}건` : `${p.ym} ${ptxt[pt]} 데이터 없음`}>
                                {filled ? v : "–"}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-1 py-1 text-right font-bold text-zinc-600">{p.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {missingCount > 0 && (() => {
                // 월별로 빈 슬롯 그룹핑 → "2026-03: 중순, 하순" 형태로 압축
                const byMonth = new Map<string, string[]>();
                for (const m of (data?.missing ?? [])) {
                  const label = ptxt[m.period_type] ?? m.period_type;
                  const arr = byMonth.get(m.ym) ?? [];
                  arr.push(label);
                  byMonth.set(m.ym, arr);
                }
                // 완전 빈 월 (초/중/하 다 없는) 별도 표시
                const fullyEmptyMonths: string[] = [];
                const partialMonths: Array<{ ym: string; slots: string[] }> = [];
                for (const [ym, slots] of byMonth) {
                  if (slots.length === 3) fullyEmptyMonths.push(ym);
                  else partialMonths.push({ ym, slots });
                }
                return (
                  <div className="mt-2 text-[11px] bg-amber-50/60 border border-amber-200 rounded-lg px-3 py-2 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-500 text-sm">📅</span>
                      <span className="font-bold text-amber-700">데이터 없는 기간 {missingCount}개</span>
                      <span className="text-[9px] text-amber-500 font-semibold">해당 기간 xlsx 업로드 필요</span>
                    </div>
                    {fullyEmptyMonths.length > 0 && (
                      <div className="flex items-start gap-1.5">
                        <span className="text-[9px] font-bold text-rose-600 rounded px-1.5 py-0.5 shrink-0 mt-0.5">완전공백</span>
                        <div className="text-[11px] text-rose-700 font-mono">
                          {fullyEmptyMonths.slice(0, 8).join(" · ")}
                          {fullyEmptyMonths.length > 8 && <span className="text-rose-400"> +{fullyEmptyMonths.length - 8}개월</span>}
                        </div>
                      </div>
                    )}
                    {partialMonths.length > 0 && (
                      <div className="flex flex-col gap-0.5">
                        {partialMonths.slice(0, 6).map(({ ym, slots }) => (
                          <div key={ym} className="flex items-center gap-1.5 text-[10px]">
                            <span className="font-mono font-bold text-amber-800 w-16">{ym}</span>
                            <div className="flex gap-1">
                              {slots.map(s => (
                                <Badge key={s} tone={s === "초순" ? "sky" : s === "중순" ? "indigo" : "violet"} size="xs">{s}</Badge>
                              ))}
                              <span className="text-zinc-400 text-[9px]">누락</span>
                            </div>
                          </div>
                        ))}
                        {partialMonths.length > 6 && (
                          <div className="text-[10px] text-zinc-400 mt-0.5">... 그 외 {partialMonths.length - 6}개월</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
};
