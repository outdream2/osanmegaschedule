// apps/sync-agent/src/renderer/src/screens/ErpSection.tsx
// 2026-10-03 · PHASE 1 · ERP 조회 3 탭 (사용자 지시)
//   · [사업장 상품관리] [상품 재고 현황] [매입 현황]
//   · 각 탭 독립 state · SectionBoundary 로 격리됨 (Dashboard 쪽에서)

import React, { useState } from "react";
import { ErpQueryView, type ColumnSpec, type ErpQueryResult } from "../components/ErpQueryView";

type TabKey = "products" | "inventory" | "buy";

const TABS: Array<{ key: TabKey; label: string; icon: string; sub: string }> = [
  { key: "products",  label: "사업장 상품관리", icon: "📦", sub: "Product_List · SvcProductBiz · pagination" },
  { key: "inventory", label: "상품 재고 현황", icon: "📊", sub: "Inventory_Status · SvcInventoryBiz · 42 col" },
  { key: "buy",       label: "매입 현황",       icon: "💰", sub: "Buy_Status · SvcBuyBiz · DevStartDate/EndDate" },
];

// 각 탭 표시 컬럼 · ERP response 가 돌아와야 최종 확정 가능 · 1차는 공통 field 추정
const PRODUCT_COLS: ColumnSpec[] = [
  { erp: "PCode", label: "상품코드" },
  { erp: "ProductName", label: "상품명" },
  { erp: "CCorpName", label: "공급사" },
  { erp: "CostPrice", label: "매입가", align: "right" },
  { erp: "SalePrice", label: "판매가", align: "right" },
  { erp: "UnitCode", label: "단위" },
  { erp: "IsSaleStatusName", label: "판매상태" },
];
// 2026-10-03 · 사용자 지시 · 재고 Excel Import 기준 재구성
//   · 재고 Excel column: 상품코드/상품명/공급사명/공급사코드/기초재고/입고/판매/폐기/사내소비/재고조정/종료재고
//   · Inventory_Status ERP field 매핑 (상세보기 modal 로 field 이름 확정 가능)
//   · PrvStock = 이전재고 · BuyStock = 매입 · SaleStock = 판매
//   · 추측 금지 원칙 · row 클릭 상세 modal 에서 사용자가 42 col 전체 확인
const INVENTORY_COLS: ColumnSpec[] = [
  { erp: "PCode", label: "상품코드" },
  { erp: "ProductName", label: "상품명" },
  { erp: "CCorpName", label: "공급사" },
  { erp: "UnitCode", label: "단위" },
  { erp: "PrvStock", label: "이전재고", align: "right" },
  { erp: "BuyStock", label: "매입", align: "right" },
  { erp: "SaleStock", label: "판매", align: "right" },
  { erp: "PlusStock", label: "조정+", align: "right" },
  { erp: "MinusStock", label: "조정-", align: "right" },
];
const BUY_COLS: ColumnSpec[] = [
  { erp: "PCode", label: "상품코드" },
  { erp: "ProductName", label: "상품명" },
  { erp: "CCorpName", label: "공급사" },
  { erp: "BuyDate", label: "매입일" },
  { erp: "BuyQty", label: "수량", align: "right" },
  { erp: "UnitCost", label: "단가", align: "right" },
  { erp: "BuyTotal", label: "합계", align: "right" },
];

export const ErpSection: React.FC = () => {
  const [tab, setTab] = useState<TabKey>("inventory");
  // 매입 조회 기간 state · UI 조정 가능 (사용자 지시 · 성공 후 기간 변경 가능)
  const todayISO = new Date().toISOString().slice(0, 10);
  const [buyStart, setBuyStart] = useState(todayISO);
  const [buyEnd, setBuyEnd] = useState(todayISO);
  // 2026-10-03 · 사용자 지시 · Product_List 는 기본 page 1 만 조회 (성공 확인 먼저)
  //   · 체크하면 전체 상품 (약 81 pages · 1 분 소요)
  const [productFull, setProductFull] = useState(false);

  return (
    <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-200">
        <div className="text-[16px] font-bold text-zinc-900">🔗 Iregen ERP 직접 조회 (검증용)</div>
        <div className="text-[12px] text-zinc-500 mt-0.5">버튼 클릭 시 실제 SOAP 호출 · 메모리 전용 · Supabase 미반영</div>
      </div>

      {/* 2026-10-03 · 사용자 지시 · 3 탭 */}
      <div className="flex border-b border-zinc-200 bg-zinc-50">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-4 py-3 text-left transition border-b-2 ${
              tab === t.key
                ? "border-brand-deep bg-white"
                : "border-transparent hover:bg-zinc-100"
            }`}
          >
            <div className="flex items-center gap-2 text-[14px] font-semibold text-zinc-900">
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5 truncate">{t.sub}</div>
          </button>
        ))}
      </div>

      <div className="p-5">
        {/* 2026-10-03 · 각 탭은 독립 state · 한 탭 실패해도 다른 탭/Dashboard 영향 X */}
        {tab === "products" && (
          <ErpQueryView
            name="products"
            queryLabel={productFull ? "전체 상품 조회 (약 1분)" : "상품 조회 (1페이지 · 50건)"}
            queryFn={() => window.api.erpProductList({ pageSize: 50, maxPages: productFull ? 400 : 1 })}
            displayCols={PRODUCT_COLS}
            searchFields={["PCode", "ProductName", "CCorpName"]}
            searchPlaceholder="상품코드 · 상품명 · 공급사 검색 (전체 대상)"
            conditionsSlot={
              <label className="flex items-center gap-2 text-[12px] text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={productFull}
                  onChange={(e) => setProductFull(e.target.checked)}
                  className="w-4 h-4 accent-brand-deep cursor-pointer"
                />
                <span>
                  전체 상품 (약 81 페이지 · 1 분 소요){" "}
                  <span className="text-zinc-400">· 체크 안 하면 1 페이지만 조회</span>
                </span>
              </label>
            }
          />
        )}

        {tab === "inventory" && (
          <ErpQueryView
            name="inventory"
            queryLabel="재고 현황 조회"
            queryFn={() => window.api.erpInventoryQuery()}
            displayCols={INVENTORY_COLS}
            searchFields={["PCode", "ProductName", "CCorpName"]}
            searchPlaceholder="상품코드 · 상품명 · 공급사 검색 (전체 대상)"
          />
        )}

        {tab === "buy" && (
          <ErpQueryView
            name="buy"
            queryLabel="매입 조회"
            queryFn={() => window.api.erpBuyStatus({ startDate: buyStart, endDate: buyEnd })}
            displayCols={BUY_COLS}
            searchFields={["PCode", "ProductName", "CCorpName"]}
            searchPlaceholder="상품코드 · 상품명 · 공급사 검색 (전체 대상)"
            conditionsSlot={
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[12px] text-zinc-600 font-semibold">조회기간</label>
                <input
                  type="date"
                  value={buyStart}
                  onChange={(e) => setBuyStart(e.target.value)}
                  className="border border-zinc-300 rounded-lg px-2 py-1.5 text-[12px]"
                />
                <span className="text-zinc-400">~</span>
                <input
                  type="date"
                  value={buyEnd}
                  onChange={(e) => setBuyEnd(e.target.value)}
                  className="border border-zinc-300 rounded-lg px-2 py-1.5 text-[12px]"
                />
              </div>
            }
          />
        )}
      </div>
    </div>
  );
};

// Type augmentation for window.api (preload 에서 노출)
declare global {
  interface Window {
    api: {
      erpInventoryQuery: () => Promise<ErpQueryResult>;
      erpInventoryQueryRaw: () => Promise<ErpQueryResult>;
      erpProductList: (opts?: { pageSize?: number; maxPages?: number }) => Promise<ErpQueryResult>;
      erpBuyStatus: (opts?: { startDate?: string; endDate?: string }) => Promise<ErpQueryResult>;
      [key: string]: any;
    };
  }
}

export default ErpSection;
