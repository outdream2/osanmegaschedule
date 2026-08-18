// src/components/common/PurchaseHistoryModal.tsx
// 2026-07-22 · 상품 매입 이력 모달 · 리스트에서 매입일 클릭 시 표시
// 2026-08-04 · 내부 표 UI → 공통 PurchaseHistoryList 로 교체 (사용자 요청)
// 2026-08-18 · <Modal> + <IconTile> + <StatusPill> 프레임워크 통합
//
// 사용:
//   {open && <PurchaseHistoryModal productCode={open.code} productName={open.name} onClose={() => setOpen(null)} />}

import React, { useEffect, useState } from "react";
import { TrendingUp, Package } from "lucide-react";
import { PurchaseHistoryList, type PurchaseHistoryRow } from "./PurchaseHistoryList";
import { Modal } from "./Modal";
import { IconTile } from "./IconTile";
import { StatusPill } from "./StatusPill";

interface PurchaseHistoryModalProps {
  productCode: string;
  productName?: string;
  /** 강조할 매입일 (모달 열 때 클릭한 날짜) · 해당 행 배경 하이라이트 */
  highlightDate?: string;
  onClose: () => void;
}

const fmt = (n: number) => (n ?? 0).toLocaleString("ko-KR");
const fmtWon = (n: number): string => {
  if (!Number.isFinite(n)) return "0원";
  if (n >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return `${n.toLocaleString()}원`;
};

export const PurchaseHistoryModal: React.FC<PurchaseHistoryModalProps> = ({
  productCode,
  productName,
  highlightDate,
  onClose,
}) => {
  const [rows, setRows] = useState<PurchaseHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productCode) return;
    setLoading(true);
    setError(null);
    fetch(`/api/purchase-details?product_code=${encodeURIComponent(productCode)}&limit=500`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setRows(Array.isArray(j.rows) ? j.rows : []))
      .catch(e => setError(e?.message ?? "로드 실패"))
      .finally(() => setLoading(false));
  }, [productCode]);

  // 통계
  const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalAmt = rows.reduce((s, r) => s + (Number(r.total ?? r.amount) || 0), 0);
  const avgAmt = rows.length > 0 ? Math.round(totalAmt / rows.length) : 0;
  const avgCycleDays = (() => {
    if (rows.length < 2) return null;
    const dates = rows
      .map(r => (r.purchase_date ? new Date(String(r.purchase_date)).getTime() : NaN))
      .filter(t => Number.isFinite(t))
      .sort((a, b) => a - b);
    if (dates.length < 2) return null;
    let sum = 0;
    for (let i = 1; i < dates.length; i++) sum += (dates[i] - dates[i - 1]);
    return Math.round(sum / (dates.length - 1) / (1000 * 60 * 60 * 24));
  })();

  return (
    <Modal
      open={true}
      onClose={onClose}
      size="md"
      titleAccent
      icon={<IconTile icon={<TrendingUp size={16} />} tone="brand" size="lg" shape="rounded-xl" />}
      title={
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[17px] font-bold text-ink tracking-tight">매입 이력</span>
            <span className="text-[12px] font-mono text-ink-soft">{productCode}</span>
          </div>
          {productName && (
            <div className="text-[13px] font-semibold text-ink-soft truncate mt-0.5" title={productName}>
              <Package size={12} className="inline mr-1 text-ink-soft" />
              {productName}
            </div>
          )}
        </div>
      }
      headerRight={
        !loading && rows.length > 0 ? (
          <StatusPill tone="emerald" size="md">{rows.length}건</StatusPill>
        ) : undefined
      }
    >
      {!loading && rows.length > 0 && (
        <div className="mb-3 flex items-center gap-2 flex-wrap text-[12px] font-medium text-ink-soft">
          <span>총 <b className="text-ink tabular-nums">{fmt(totalQty)}</b>개</span>
          <span className="text-zinc-300">·</span>
          <span className="text-emerald-700 font-bold tabular-nums">{fmtWon(totalAmt)}</span>
          <span className="text-zinc-300">·</span>
          <span title="건당 평균 매입액">평균 <b className="text-brand-deep tabular-nums">{fmtWon(avgAmt)}</b></span>
          {avgCycleDays != null && (
            <>
              <span className="text-zinc-300">·</span>
              <span title="평균 매입주기 (연속 매입일 간격 평균)">주기 <b className="text-sky-700 tabular-nums">{avgCycleDays}일</b></span>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col">
        <PurchaseHistoryList
          rows={rows}
          loading={loading}
          error={error}
          highlightDate={highlightDate}
          showSupplier
          showProduct={false}
          emptyText="매입 이력 없음"
          footerHint={rows.length > 0 ? (
            <>최근순 · 최대 500건 · 클릭한 매입일은 <span className="text-amber-600 font-bold">노랑 하이라이트</span></>
          ) : undefined}
        />
      </div>
    </Modal>
  );
};
