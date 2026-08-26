// 2026-08-26 · Framework Phase 4 · large-file 분리
// VendorDetailModal.tsx activeTab==="purchase" 섹션 추출
//   최근 매입 이력 + PurchaseHistoryList 래퍼

import React from "react";
import { Package } from "lucide-react";
import { PurchaseHistoryList, type PurchaseHistoryRow } from "../common/PurchaseHistoryList";
import { SectionTitle } from "./VendorDetailModal.helpers";
import type { PurchaseRow } from "./VendorDetailModal.types";

interface Props {
  purchases: PurchaseRow[];
  purchLoading: boolean;
}

export const VendorDetailPurchasePanel: React.FC<Props> = ({ purchases, purchLoading }) => (
  <div className="space-y-3">
    <SectionTitle
      icon={<Package size={13} />}
      title="최근 매입 이력"
      color="amber"
      hint={purchLoading ? "로딩..." : `${purchases.length}건`}
    />
    <div className="rounded-lg border border-line overflow-hidden bg-white flex flex-col" style={{ maxHeight: 520 }}>
      <PurchaseHistoryList
        rows={purchases as unknown as PurchaseHistoryRow[]}
        loading={purchLoading}
        showSupplier={false}
        showProduct
        showRowNumber
        showFooterSum
        emptyText="매입 이력 없음"
      />
    </div>
  </div>
);
