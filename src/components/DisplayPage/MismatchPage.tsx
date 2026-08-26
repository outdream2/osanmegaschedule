// src/components/DisplayPage/MismatchPage.tsx
// 2026-08-26 · 사용자 지시 · 배치구역 불일치 페이지 · 인너 탭 2개
//   · 탭 1 · 배치구역 불일치 (전산구역·실제위치 둘 다 있고 mismatch)
//   · 탭 2 · 구역미지정상품 (전산구역 또는 실제위치 미배정)

import React, { useState } from "react";
import { SplitRightTabs } from "../common/SplitRightTabs";
import { ZoneMismatchTab } from "./ZoneMismatchTab";
import { UnassignedProductsTab } from "./UnassignedProductsTab";

export const MismatchPage: React.FC = () => {
  const [inner, setInner] = useState<"mismatch" | "unassigned">("mismatch");

  return (
    <div className="flex flex-col gap-3">
      {/* 인너 탭 · 배치구역 불일치 · 구역미지정상품 */}
      <div className="bg-white rounded-xl border border-line overflow-hidden">
        <SplitRightTabs
          tabs={[
            { key: "mismatch",   label: "배치구역 불일치" },
            { key: "unassigned", label: "구역미지정상품" },
          ]}
          active={inner}
          onSelect={(k) => setInner(k as typeof inner)}
          bg="bg-zinc-50/40"
        />
      </div>
      {inner === "mismatch" ? <ZoneMismatchTab /> : <UnassignedProductsTab />}
    </div>
  );
};

export default MismatchPage;
