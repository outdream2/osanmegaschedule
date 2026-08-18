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
import { EyeOff, Eye, Loader2, X } from "lucide-react";
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
    // 2026-08-17 v2 · backdrop-brand + shadow-brand-modal · Modal 통일
    <div
      className="fixed inset-0 z-50 backdrop-brand flex items-center justify-center p-1 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-brand-modal w-full max-w-2xl max-h-[98vh] sm:max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 2026-08-17 · 최신 트렌드 · accent bar + 딥네이비 통일 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-zinc-50/60">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-[3px] h-[24px] rounded-full bg-brand-deep shrink-0" />
            <div className="w-10 h-10 rounded-xl bg-brand-deep flex items-center justify-center shadow-sm shrink-0">
              <EyeOff size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-[17px] font-bold text-ink tracking-tight">숨김 항목 관리</div>
              <div className="text-[13px] font-medium text-ink-soft mt-0.5">
                숨김 처리된 상품 · 검색·발주 리스트에서 노출되지 않음
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-white border border-line hover:border-brand-deep hover:bg-brand-tint text-ink-soft hover:text-brand-deep transition-colors cursor-pointer flex items-center justify-center shrink-0"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-zinc-100 bg-white">
          <span className="text-[11px] font-bold text-zinc-500">
            총 <span className="text-amber-700 font-bold">{list.length}</span>개 숨김
          </span>
          <button
            onClick={() => onRefresh()}
            disabled={loading}
            className="text-[10px] font-bold text-zinc-500 hover:text-zinc-800 border border-line hover:border-zinc-400 rounded-lg px-2 py-1 cursor-pointer transition"
          >
            {loading ? "..." : "새로고침"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-zinc-50">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-zinc-400 text-sm">
              <Loader2 size={14} className="animate-spin mr-2" />
              불러오는 중...
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-2">
              <EyeOff size={28} className="opacity-40" />
              <div className="text-sm font-bold">숨김 처리된 상품이 없습니다</div>
              <div className="text-[11px]">정보확인 창에서 "숨기기"로 항목 추가 가능</div>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 bg-white">
              {list.map((p) => {
                const code = String(p.product_code ?? "");
                const busy = busyCode === code;
                return (
                  <li key={`hidden-${code}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-amber-50/30 transition">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-zinc-800 truncate" title={p.product_name}>{p.product_name}</div>
                      <div className="text-[10px] font-mono text-zinc-400 truncate">
                        #{code}
                        {p.supplier ? ` · ${p.supplier}` : ""}
                        {(p as any).spec ? ` · ${(p as any).spec}` : ""}
                        {p.current_stock != null ? ` · 재고 ${p.current_stock}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => onUnhide(code)}
                      disabled={busy}
                      className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-wait rounded-lg px-2.5 py-1.5 cursor-pointer transition"
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
