// src/components/shared/HiddenManagerModal.tsx
// 숨김 관리 모달 · 2026-08-18 · <Modal> + <IconTile> + <StatusPill> 프레임워크 통합
//   · StockManage/SalesTrend 공용 · 픽셀 단위 동일 디자인 유지
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

import React from "react";
import { EyeOff, Eye } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Modal } from "../common/Modal";
import { IconTile } from "../common/IconTile";
import { StatusPill } from "../common/StatusPill";
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      titleAccent
      icon={<IconTile icon={<EyeOff size={16} />} tone="brand" size="lg" shape="rounded-xl" />}
      title={
        <div className="min-w-0">
          <div className="text-[17px] font-bold text-ink tracking-tight">숨김 항목 관리</div>
          <div className="text-[13px] font-medium text-ink-soft mt-0.5">
            숨김 처리된 상품 · 검색·발주 리스트에서 노출되지 않음
          </div>
        </div>
      }
      headerRight={<StatusPill tone="amber" size="md">{list.length}건</StatusPill>}
    >
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-[13px] font-semibold text-ink-soft">
          총 <span className="text-amber-700 font-bold tabular-nums">{list.length}</span>개 숨김
        </span>
        <button
          onClick={() => onRefresh()}
          disabled={loading}
          className="text-[12px] font-bold text-ink-soft hover:text-ink border border-line hover:border-brand-deep rounded-lg px-2.5 py-1 cursor-pointer transition"
        >
          {loading ? "..." : "새로고침"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size={16} tone="brand" label="불러오는 중..." labelSize={14} />
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-ink-soft gap-2">
          <EyeOff size={30} className="opacity-40" />
          <div className="text-[15px] font-bold text-ink">숨김 처리된 상품이 없습니다</div>
          <div className="text-[12px] text-ink-soft">정보확인 창에서 "숨기기"로 항목 추가 가능</div>
        </div>
      ) : (
        <ul className="divide-y divide-line/60 -mx-1">
          {list.map((p) => {
            const code = String(p.product_code ?? "");
            const busy = busyCode === code;
            return (
              <li key={`hidden-${code}`} className="flex items-center justify-between gap-3 px-2 py-2.5 hover:bg-amber-50/40 transition rounded-lg">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-ink truncate tracking-tight" title={p.product_name}>{p.product_name}</div>
                  <div className="text-[11px] font-mono text-ink-soft truncate mt-0.5">
                    #{code}
                    {p.supplier ? ` · ${p.supplier}` : ""}
                    {(p as any).spec ? ` · ${(p as any).spec}` : ""}
                    {p.current_stock != null ? ` · 재고 ${p.current_stock}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => onUnhide(code)}
                  disabled={busy}
                  className="shrink-0 inline-flex items-center gap-1 text-[12px] font-bold text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-wait rounded-lg px-3 py-1.5 cursor-pointer transition"
                  title="숨김 해제 · 다시 검색·발주 리스트에 표시"
                >
                  {busy ? <Spinner size={12} tone="emerald" /> : <Eye size={12} />}
                  다시 표시
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
};
