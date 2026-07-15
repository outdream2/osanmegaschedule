// src/components/shared/HiddenManagerModal.tsx
// 숨김 관리 모달 (2026-07-15 · StockManage/SalesTrend 공용)
//
// 사용법:
//   <HiddenManagerModal
//     open={hiddenModalOpen}
//     onClose={() => setHiddenModalOpen(false)}
//     list={hiddenList}
//     loading={hiddenLoading}
//     busyCode={hiddenUnhideBusyCode}
//     onRefresh={loadHiddenList}
//     onUnhide={unhideProduct}
//   />
//
// 두 페이지 JSX 완전 동일 · 픽셀 단위로 같은 디자인

import React from "react";
import { EyeOff, Eye, Loader2 } from "lucide-react";
import type { HiddenProduct } from "../../hooks/useHiddenManager";

interface Props {
  open: boolean;
  onClose: () => void;
  list: HiddenProduct[];
  loading: boolean;
  busyCode: string | null;
  onRefresh: () => void | Promise<void>;
  onUnhide: (code: string) => void | Promise<void>;
}

export const HiddenManagerModal: React.FC<Props> = ({
  open, onClose, list, loading, busyCode, onRefresh, onUnhide,
}) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-1 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[98vh] sm:max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md">
              <EyeOff size={18} className="text-white" />
            </div>
            <div>
              <div className="text-base font-black text-slate-800">숨김 항목 관리</div>
              <div className="text-[11px] font-semibold text-slate-500 mt-0.5">
                숨김 처리된 상품 · 검색·발주 리스트에서 노출되지 않음
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-3xl leading-none font-black w-9 h-9 rounded-lg hover:bg-white/70 transition cursor-pointer flex items-center justify-center shrink-0"
          >×</button>
        </div>
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 bg-white">
          <span className="text-[11px] font-bold text-slate-500">
            총 <span className="text-amber-700 font-black">{list.length}</span>개 숨김
          </span>
          <button
            onClick={() => onRefresh()}
            disabled={loading}
            className="text-[10px] font-bold text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-400 rounded-lg px-2 py-1 cursor-pointer transition"
          >
            {loading ? "..." : "새로고침"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
              <Loader2 size={14} className="animate-spin mr-2" />
              불러오는 중...
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <EyeOff size={28} className="opacity-40" />
              <div className="text-sm font-bold">숨김 처리된 상품이 없습니다</div>
              <div className="text-[11px]">정보확인 창에서 "숨기기"로 항목 추가 가능</div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 bg-white">
              {list.map((p) => {
                const code = String(p.product_code ?? "");
                const busy = busyCode === code;
                return (
                  <li key={`hidden-${code}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-amber-50/30 transition">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black text-slate-800 truncate" title={p.product_name}>{p.product_name}</div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        #{code}
                        {p.supplier ? ` · ${p.supplier}` : ""}
                        {p.real_map ? ` · ${p.real_map}` : ""}
                        {p.current_stock != null ? ` · 재고 ${p.current_stock}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => onUnhide(code)}
                      disabled={busy}
                      className="shrink-0 flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-wait rounded-lg px-2.5 py-1.5 cursor-pointer transition"
                      title="숨김 해제 · 다시 검색·발주 리스트에 표시"
                    >
                      {busy ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}
                      다시 표시
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
