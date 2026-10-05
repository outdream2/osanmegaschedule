// apps/sync-agent/src/renderer/src/screens/ErpSection.tsx
// 2026-10-03 · PHASE 1 · ERP 조회 3 탭 (사용자 지시)
//   · [사업장 상품관리] [상품 재고 현황] [매입 현황]
//   · 각 탭 독립 state · SectionBoundary 로 격리됨 (Dashboard 쪽에서)

import React, { useCallback, useEffect, useState } from "react";
import { ErpQueryView, type ColumnSpec, type ErpQueryResult } from "../components/ErpQueryView";

type TabKey = "products" | "inventory" | "buy" | "sale";
type ErpDataset = "PRODUCT_LIST" | "INVENTORY_STATUS" | "BUY_STATUS" | "SALE_STATUS";
const TAB_TO_DATASET: Record<TabKey, ErpDataset> = {
  products:  "PRODUCT_LIST",
  inventory: "INVENTORY_STATUS",
  buy:       "BUY_STATUS",
  sale:      "SALE_STATUS",
};

interface FetchHistoryEntry {
  id: string;
  dataset: ErpDataset;
  fetchedAt: string;
  ok: boolean;
  rowCount: number;
  queryFrom?: string;
  queryTo?: string;
  soapMs?: number;
  totalMs?: number;
  stage?: string;
  error?: string;
}

const TABS: Array<{ key: TabKey; label: string; icon: string; sub: string }> = [
  { key: "products",  label: "사업장 상품관리", icon: "📦", sub: "Product_List · SvcProductBiz · pagination" },
  { key: "inventory", label: "상품 재고 현황", icon: "📊", sub: "Inventory_Status · SvcInventoryBiz · 42 col" },
  { key: "buy",       label: "매입 현황",       icon: "💰", sub: "Buy_Status · SvcBuyBiz · DevStartDate/EndDate" },
  { key: "sale",      label: "판매현황",        icon: "🧾", sub: "Sale_Status · SvcSaleBiz · StartDate/EndDate" },
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
// 2026-10-04 · Inventory_Status 실측 응답 keys (4007-row snapshot 기준):
//   PCode · ProductName · CCorpName(공급사) · UnitCode · LocationName · CostPrice
//   PrvStock · BuyStock · SaleStock · PlusStock · MinusStock · ...
//   최상위 대원칙 (api값만 사용) · BarCode 는 응답에 없으므로 UI column 에서 제외 (join 금지)
const INVENTORY_COLS: ColumnSpec[] = [
  { erp: "PCode", label: "상품코드" },
  { erp: "ProductName", label: "상품명" },
  { erp: "CCorpName", label: "공급사" },
  { erp: "UnitCode", label: "단위" },
  { erp: "LocationName", label: "위치" },
  { erp: "PrvStock", label: "이전재고", align: "right" },
  { erp: "BuyStock", label: "매입", align: "right" },
  { erp: "SaleStock", label: "판매", align: "right" },
  { erp: "PlusStock", label: "조정+", align: "right" },
  { erp: "MinusStock", label: "조정-", align: "right" },
];
// 2026-10-04 · 매입현황 실측 응답 keys (5-row 2026-10-03 snapshot 기준):
//   BmCode · BuyDate · PCode · ProductName · CorpNameView(공급사) · StockCnt(수량) · UnitCost · BuyTotal · ROWNUM · ...
//   최상위 대원칙 (api값만 사용) · BarCode 는 응답에 없으므로 UI column 에서 제외 (join 금지)
const BUY_COLS: ColumnSpec[] = [
  { erp: "BuyDate", label: "매입일" },
  { erp: "BmCode", label: "거래번호" },
  { erp: "ROWNUM", label: "라인" },
  { erp: "PCode", label: "상품코드" },
  { erp: "ProductName", label: "상품명" },
  { erp: "CorpNameView", label: "공급사" },
  { erp: "StockCnt", label: "수량", align: "right" },
  { erp: "UnitCost", label: "단가", align: "right" },
  { erp: "BuyTotal", label: "합계", align: "right" },
];
// 2026-10-04 · 판매현황 · 실측 응답 keys (292-row 2026-10-04 snapshot 기준):
//   SaleDate · ProductName · BuyerCorpNameView · TotalStock(=수량) · UnitCost · UnitSale · SaleTotal · Margin
//   envelope RowArea 에 BarCode 추가 요청 중 (요청 파라미터만 수정 · 데이터 조작 X)
//   응답에 BarCode 포함되면 자동 표시 · 안 오면 빈 셀 (api 값만 사용 · join 금지)
const SALE_COLS: ColumnSpec[] = [
  { erp: "SaleDate", label: "판매일" },
  { erp: "BarCode", label: "바코드" },
  { erp: "ProductName", label: "상품명" },
  { erp: "BuyerCorpNameView", label: "거래처" },
  { erp: "TotalStock", label: "수량", align: "right" },
  { erp: "UnitCost", label: "매입단가", align: "right" },
  { erp: "UnitSale", label: "판매단가", align: "right" },
  { erp: "SaleTotal", label: "합계", align: "right" },
  { erp: "Margin", label: "마진", align: "right" },
];

export const ErpSection: React.FC = () => {
  const [tab, setTab] = useState<TabKey>("inventory");
  // 2026-10-03 · 사용자 지시 · 3 탭 전부 기간 조회 가능
  const todayISO = new Date().toISOString().slice(0, 10);
  const [buyStart, setBuyStart] = useState(todayISO);
  const [buyEnd, setBuyEnd] = useState(todayISO);
  const [invStart, setInvStart] = useState(todayISO);
  const [invEnd, setInvEnd] = useState(todayISO);
  // 2026-10-04 · 판매현황 조회기간
  const [saleStart, setSaleStart] = useState(todayISO);
  const [saleEnd, setSaleEnd] = useState(todayISO);
  // 상품관리는 ERP Fiddler 가 StartDate/EndDate 빈값 · 기간 필터 사용 X · UI 미노출

  // 2026-10-03 · Product_List pagination 진행률 수신 (사용자 혼란 방지)
  //   · metadata totalPages 알면 % 표시 · 모르면 pages 만
  const [productProgress, setProductProgress] = useState<{
    page: number;
    rowsAccum: number;
    done?: boolean;
    totalPages?: number;
    totalRowsExpected?: number;
  } | null>(null);
  useEffect(() => {
    if (!window.api.onErpProductProgress) return;
    const unsub = window.api.onErpProductProgress((p) => {
      setProductProgress(p);
      if (p.done) setTimeout(() => setProductProgress(null), 2000);
    });
    return unsub;
  }, []);
  // 2026-10-03 · concurrency 설정 · default 5 · 1 선택 시 순차 조회 (fallback)
  const [productConcurrency, setProductConcurrency] = useState<1 | 3 | 5>(5);

  return (
    <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-200">
        <div className="text-[16px] font-bold text-zinc-900">🔗 Iregen ERP 데이터 조회 및 로컬저장</div>
        <div className="text-[12px] text-zinc-500 mt-0.5">ERP에서 최신 데이터를 조회하여 로컬에 저장합니다. 저장된 데이터는 Supabase 동기화에 사용됩니다.</div>
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
            queryLabel={`상품 전체 조회 (동시 ${productConcurrency})`}
            queryFn={() => window.api.erpProductList({ pageSize: 50, concurrency: productConcurrency })}
            displayCols={PRODUCT_COLS}
            searchFields={["PCode", "ProductName", "CCorpName"]}
            searchPlaceholder="상품코드 · 상품명 · 공급사 검색 (전체 대상)"
            conditionsSlot={
              <div className="flex flex-col gap-1 text-[12px] text-zinc-600">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="font-semibold">동시 조회:</label>
                  {([5, 3, 1] as const).map((n) => (
                    <label key={n} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="productConcurrency"
                        checked={productConcurrency === n}
                        onChange={() => setProductConcurrency(n)}
                        className="w-3.5 h-3.5 accent-brand-deep cursor-pointer"
                      />
                      <span className={productConcurrency === n ? "font-bold text-brand-deep" : ""}>
                        {n}{n === 1 ? " (순차 fallback)" : ""}
                      </span>
                    </label>
                  ))}
                </div>
                {productProgress && !productProgress.done && (
                  <ProductProgressBar progress={productProgress} />
                )}
                {productProgress?.done && (
                  <div className="text-emerald-600 font-semibold">
                    ✓ 완료 · 총 {productProgress.rowsAccum.toLocaleString()}건
                  </div>
                )}
                {!productProgress && (
                  <div className="text-zinc-500">
                    ~4,000 상품 · 50건/페이지 · metadata 추출 성공 시 병렬 5 사용
                  </div>
                )}
              </div>
            }
          />
        )}

        {tab === "inventory" && (
          <ErpQueryView
            name="inventory"
            queryLabel="재고 현황 조회"
            queryFn={() => window.api.erpInventoryQuery({ startDate: invStart, endDate: invEnd })}
            displayCols={INVENTORY_COLS}
            searchFields={["PCode", "ProductName", "CCorpName"]}
            searchPlaceholder="상품코드 · 상품명 · 공급사 검색 (전체 대상)"
            conditionsSlot={
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[12px] text-zinc-600 font-semibold">확정일 기준</label>
                <input
                  type="date"
                  value={invStart}
                  onChange={(e) => setInvStart(e.target.value)}
                  className="border border-zinc-300 rounded-lg px-2 py-1.5 text-[12px]"
                />
                <span className="text-zinc-400">~</span>
                <input
                  type="date"
                  value={invEnd}
                  onChange={(e) => setInvEnd(e.target.value)}
                  className="border border-zinc-300 rounded-lg px-2 py-1.5 text-[12px]"
                />
              </div>
            }
          />
        )}

        {tab === "buy" && (
          <ErpQueryView
            name="buy"
            queryLabel="매입 조회"
            queryFn={() => window.api.erpBuyStatus({ startDate: buyStart, endDate: buyEnd })}
            displayCols={BUY_COLS}
            searchFields={["PCode", "ProductName", "CorpNameView"]}
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

        {/* 2026-10-04 · 사용자 지시 · 각 탭 아래 "조회 저장 이력" 섹션 (하단 공통) */}
        <FetchHistoryPanel dataset={TAB_TO_DATASET[tab]} tabKey={tab} />

        {/* 2026-10-04 · 판매현황 · SvcSaleBiz · StartDate/EndDate */}
        {tab === "sale" && (
          <ErpQueryView
            name="sale"
            queryLabel="판매 조회"
            queryFn={() => window.api.erpSaleStatus({ startDate: saleStart, endDate: saleEnd })}
            displayCols={SALE_COLS}
            searchFields={["BarCode", "ProductName", "BuyerCorpNameView"]}
            searchPlaceholder="바코드 · 상품명 · 거래처 검색 (전체 대상)"
            conditionsSlot={
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[12px] text-zinc-600 font-semibold">조회기간</label>
                <input
                  type="date"
                  value={saleStart}
                  onChange={(e) => setSaleStart(e.target.value)}
                  className="border border-zinc-300 rounded-lg px-2 py-1.5 text-[12px]"
                />
                <span className="text-zinc-400">~</span>
                <input
                  type="date"
                  value={saleEnd}
                  onChange={(e) => setSaleEnd(e.target.value)}
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
      erpInventoryQuery: (opts?: { startDate?: string; endDate?: string }) => Promise<ErpQueryResult>;
      erpInventoryQueryRaw: () => Promise<ErpQueryResult>;
      erpProductList: (opts?: { pageSize?: number; maxPages?: number; concurrency?: number }) => Promise<ErpQueryResult>;
      erpBuyStatus: (opts?: { startDate?: string; endDate?: string }) => Promise<ErpQueryResult>;
      erpSaleStatus: (opts?: { startDate?: string; endDate?: string }) => Promise<ErpQueryResult>;
      onErpProductProgress?: (cb: (p: { page: number; rowsAccum: number; done?: boolean }) => void) => () => void;
      [key: string]: any;
    };
  }
}

// 2026-10-04 · 신규 history-index entry (snapshotHistoryStore v2)
interface HistoryEntryV2 {
  snapshotId: string;
  dataset: ErpDataset;
  trigger: "AUTO" | "MANUAL" | "INITIAL_SYNC" | "SCHEDULED";
  fetchedAt: string;
  rowCount: number;
  queryFrom?: string;
  queryTo?: string;
  actualPath: string;
}

// 2026-10-04 · 사용자 지시 · ERP 직접 조회 저장 이력 패널
//   · history-index.json (실체 보존) 우선 로드 · 각 entry [보기] 클릭 → history/{snapshotId}.json.gz
//   · legacy fetch-history.json 은 보존 (실체 없는 과거 entry 는 "데이터 파일 없음" 표시)
const FetchHistoryPanel: React.FC<{ dataset: ErpDataset; tabKey: TabKey }> = ({ dataset, tabKey }) => {
  const [v2, setV2] = useState<HistoryEntryV2[] | null>(null);
  const [legacy, setLegacy] = useState<FetchHistoryEntry[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [snapshotView, setSnapshotView] = useState<{ snapshotId: string; rows: Record<string, unknown>[]; total: number } | null>(null);
  const [loadingSnap, setLoadingSnap] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r1 = await window.api.erpGetHistoryIndex({ dataset });
      if (r1.ok && Array.isArray(r1.entries)) setV2(r1.entries as unknown as HistoryEntryV2[]);
      const r2 = await window.api.erpGetFetchHistory({ dataset, limit: 20 });
      if (r2.ok) setLegacy(r2.history as unknown as FetchHistoryEntry[]);
    } catch { /* ignore */ }
  }, [dataset]);
  useEffect(() => { load(); }, [load]);
  // v2 가 없을 때만 legacy fallback (하위호환)
  const history = (v2 && v2.length > 0) ? null : legacy;

  // 탭 전환 시 자동 reload (dataset 변경)
  useEffect(() => { load(); }, [tabKey, load]);

  const formatDate = (iso?: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const viewSnapshot = async (snapshotId: string) => {
    setLoadingSnap(snapshotId);
    try {
      const r = await window.api.erpLoadHistorySnapshot({ dataset, snapshotId, limit: 500 });
      if (r.ok && Array.isArray(r.rows)) {
        setSnapshotView({ snapshotId, rows: r.rows as Record<string, unknown>[], total: r.total ?? 0 });
      } else {
        setSnapshotView({ snapshotId, rows: [], total: 0 });
      }
    } finally { setLoadingSnap(null); }
  };

  const totalCount = (v2?.length ?? 0) + (history?.length ?? 0);

  return (
    <div className="mt-4 pt-3 border-t border-zinc-200">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-semibold text-zinc-700">📜 로컬 저장 이력 ({dataset})</span>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-[10px] text-zinc-500 hover:text-zinc-700">🔄 새로고침</button>
          <button onClick={() => setExpanded((s) => !s)} className="text-[10px] text-brand-deep hover:underline">
            {expanded ? "접기" : `보기 (${totalCount})`}
          </button>
        </div>
      </div>
      {totalCount === 0 ? (
        <div className="text-[11px] text-zinc-500">조회 이력 없음 · 위에서 조회하면 자동으로 저장됩니다.</div>
      ) : (
        <>
          <div className="text-[11px] text-zinc-600">
            {v2 && v2.length > 0 ? (
              <>
                최근 조회: <span className="font-semibold text-zinc-800">{formatDate(v2[0].fetchedAt)}</span>
                {" · "}
                <span className="px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-semibold">{v2[0].trigger}</span>
                {" · "}{v2[0].rowCount.toLocaleString()}건
                {v2[0].queryFrom && <> · 기간 {v2[0].queryFrom}~{v2[0].queryTo}</>}
              </>
            ) : history && history.length > 0 && (
              <>
                최근 조회: <span className="font-semibold text-zinc-800">{formatDate(history[0].fetchedAt)}</span>
                {" · "}
                <span className={history[0].ok ? "text-emerald-700" : "text-rose-700"}>{history[0].ok ? "성공" : "실패"}</span>
                {" · "}{history[0].rowCount.toLocaleString()}건
                {history[0].queryFrom && <> · 기간 {history[0].queryFrom}~{history[0].queryTo}</>}
              </>
            )}
          </div>
          {expanded && (
            <div className="mt-1 max-h-[260px] overflow-y-auto border border-zinc-200 rounded">
              <table className="min-w-full text-[10px]">
                <thead className="bg-zinc-50 sticky top-0">
                  <tr>
                    <th className="px-1.5 py-1 text-left">조회시각</th>
                    <th className="px-1.5 py-1 text-left">트리거</th>
                    <th className="px-1.5 py-1 text-right">rows</th>
                    <th className="px-1.5 py-1 text-left">조회기간</th>
                    <th className="px-1.5 py-1 text-left">실체</th>
                    <th className="px-1.5 py-1 text-left">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {v2 && v2.map((h) => (
                    <tr key={h.snapshotId} className="border-t border-zinc-100 hover:bg-zinc-50">
                      <td className="px-1.5 py-1">{formatDate(h.fetchedAt)}</td>
                      <td className="px-1.5 py-1 text-[9px] font-semibold text-sky-700">{h.trigger}</td>
                      <td className="px-1.5 py-1 text-right tabular-nums">{h.rowCount.toLocaleString()}</td>
                      <td className="px-1.5 py-1 text-[9.5px] text-zinc-500">{h.queryFrom ? `${h.queryFrom}~${h.queryTo}` : "-"}</td>
                      <td className="px-1.5 py-1 text-emerald-700">✓</td>
                      <td className="px-1.5 py-1">
                        <button
                          onClick={() => viewSnapshot(h.snapshotId)}
                          disabled={loadingSnap === h.snapshotId}
                          className="text-[9.5px] text-brand-deep hover:underline disabled:opacity-40"
                        >
                          {loadingSnap === h.snapshotId ? "로딩..." : "보기"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {/* Legacy entries (실체 없음 · 보기 비활성) */}
                  {(!v2 || v2.length === 0) && history && history.map((h) => (
                    <tr key={h.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                      <td className="px-1.5 py-1">{formatDate(h.fetchedAt)}</td>
                      <td className="px-1.5 py-1 text-[9px] text-zinc-400">legacy</td>
                      <td className="px-1.5 py-1 text-right tabular-nums">{h.rowCount.toLocaleString()}</td>
                      <td className="px-1.5 py-1 text-[9.5px] text-zinc-500">{h.queryFrom ? `${h.queryFrom}~${h.queryTo}` : "-"}</td>
                      <td className="px-1.5 py-1 text-zinc-400">—</td>
                      <td className="px-1.5 py-1 text-[9.5px] text-zinc-400" title="이 조회의 실제 데이터 파일은 보존되지 않았습니다.">파일 없음</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* snapshot 보기 inline viewer */}
          {snapshotView && (
            <div className="mt-2 p-2 bg-white border border-brand-deep rounded">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-brand-deep">
                  📄 snapshot · {snapshotView.snapshotId.slice(0, 8)}... · 총 {snapshotView.total.toLocaleString()}건 (상위 {snapshotView.rows.length}건)
                </span>
                <button onClick={() => setSnapshotView(null)} className="text-[10px] text-zinc-500 hover:text-zinc-700">닫기</button>
              </div>
              {snapshotView.rows.length === 0 ? (
                <div className="text-[11px] text-zinc-500">데이터 없음 (0 rows snapshot)</div>
              ) : (
                <div className="max-h-[280px] overflow-auto border border-zinc-200 rounded">
                  <table className="min-w-full text-[9.5px]">
                    <thead className="bg-zinc-50 sticky top-0">
                      <tr>
                        {Object.keys(snapshotView.rows[0]).slice(0, 10).map((k) => (
                          <th key={k} className="px-1 py-1 text-left font-semibold">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {snapshotView.rows.slice(0, 100).map((r, i) => (
                        <tr key={i} className="border-t border-zinc-100">
                          {Object.keys(snapshotView.rows[0]).slice(0, 10).map((k) => (
                            <td key={k} className="px-1 py-1 max-w-[120px] truncate">{String(r[k] ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// 2026-10-03 · Product_List 진행률 바 (사용자 지시)
const ProductProgressBar: React.FC<{ progress: { page: number; rowsAccum: number; totalPages?: number; totalRowsExpected?: number } }> = ({ progress }) => {
  const pct =
    progress.totalPages && progress.totalPages > 0
      ? Math.min(100, Math.round((progress.page / progress.totalPages) * 100))
      : progress.totalRowsExpected && progress.totalRowsExpected > 0
        ? Math.min(100, Math.round((progress.rowsAccum / progress.totalRowsExpected) * 100))
        : null;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-[12px] text-brand-deep font-semibold mb-1">
        <span>
          {progress.totalRowsExpected
            ? `${progress.rowsAccum.toLocaleString()} / ${progress.totalRowsExpected.toLocaleString()}건`
            : `${progress.rowsAccum.toLocaleString()}건 조회`}
          {" · "}
          {progress.totalPages
            ? `${progress.page} / ${progress.totalPages} pages`
            : `${progress.page} pages 완료`}
        </span>
        {pct !== null && <span>{pct}%</span>}
      </div>
      <div className="w-full bg-zinc-200 rounded h-2 overflow-hidden">
        <div
          className="bg-brand-deep h-full transition-all duration-300"
          style={{ width: pct !== null ? `${pct}%` : "15%" }}
        />
      </div>
    </div>
  );
};

export default ErpSection;
