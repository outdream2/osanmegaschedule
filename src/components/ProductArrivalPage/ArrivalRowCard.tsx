// ArrivalRowCard · 2026-08-18 · 상품입고 카드형 재설계
//   · 테이블 → 카드 리스트 (Linear/Attio/Notion 2026 톤)
//   · 상단: 공급사 + 입고시각 + 상품명 + 규격/코드
//   · 하단: 큰 수량 stepper + 2-state pill (일치/불일치) + 삭제
//   · 상태별 좌측 accent stripe · 최근 sky ring · 부드러운 shadow
// 2026-09-01 · #92 · 구역 지정 UI 추가 (RealMapSelector 재사용)
// 2026-09-01 · #93 · 명세서 상태 · 3종→2종 · 기한임박 UI 제거 (expiring 데이터 필드는 유지)

import React, { useRef, useEffect, useState, useMemo } from "react";
import { devLog, devWarn } from "../../lib/devLog";
import { Box, Hash, Building2, CheckCircle2, XCircle, Trash2, MapPin, Check, Warehouse, Store, Package, TrendingUp, ArrowRight } from "lucide-react";
import type { ProductInfo } from "../../lib/productsCache";
import { StepperInput } from "../common/StepperInput";
import { Badge } from "../common/Badge";
import { RealMapSelector } from "../ScanPage/RealMapSelector";
// 2026-09-01 · 실재고 UI 벤치마킹 · 창고/매장 자동 분류 · 관련 구역 표시
import { resolveWarehouseVisibility, classifyArrivalSlot, assignZonesToSlots, type ArrivalSlot } from "../../lib/warehouseZoneMap";
// 2026-09-08 · 상세 진열위치 뱃지 · 매장/창고 구역 옆에 3자리 표시
import { useShelfPositionsMap } from "../../hooks/useShelfPositionsMap";
import { ShelfPositionsInlineTable } from "../common/ShelfPositionsInlineTable";

export type ItemStatus = "pending" | "match" | "mismatch";

export interface ArrivalCardItem {
  key: string;
  code: string;
  product: ProductInfo | null;
  qty: number;
  status: ItemStatus;
  expiring: boolean;
  addedAt: number;
  /** 2026-09-01 · #92 · 입고 구역 · 매장1 zone (row.location · products.location 반영) */
  location: string | null;
  /** 2026-09-14 · #138 · 매장별 독립 zone · 매장2·매장3 · inventory_checks.store*_zone 저장 */
  store2Zone?: string | null;
  store3Zone?: string | null;
  /** 2026-09-02 · #78 · 사입 단가 (사용자 입력 · 선택) */
  unitPrice?: number | null;
  /** 2026-09-02 · #78 · 유통기한 (선택 · YYYY-MM-DD) */
  expiryDate?: string | null;
}

interface ArrivalRowCardProps {
  item: ArrivalCardItem;
  isRecent: boolean;
  onUpdateQty: (key: string, delta: number) => void;
  onSetQty: (key: string, qty: number) => void;
  onSetStatus: (key: string, status: ItemStatus) => void;
  onRemove: (key: string) => void;
  /** 2026-09-01 · #92 · 구역 변경 핸들러 · 매장1 zone (row.location) */
  onSetLocation: (key: string, location: string | null) => void;
  /** 2026-09-14 · #138 · 매장별 독립 zone · 매장2·매장3 zone 변경 · DB 즉시 저장 */
  onSetStore2Zone?: (key: string, zone: string | null) => void;
  onSetStore3Zone?: (key: string, zone: string | null) => void;
  /** 사입 단가 (선택) */
  onSetUnitPrice?: (key: string, unitPrice: number | null) => void;
  /** 유통기한 날짜 (비고란 저장 · 선택 · expiring=true 시 노출) */
  onSetExpiryDate?: (key: string, expiryDate: string | null) => void;
  /** 유통기한 임박 체크박스 */
  onSetExpiring?: (key: string, expiring: boolean) => void;
}

// ─── 구역 인라인 선택 · ArrivalRowCard 전용 (StockRowCard ZoneInline 동일 패턴)
const ArrivalZoneInline: React.FC<{
  value: string | null;
  onChange: (v: string | null) => void;
}> = ({ value, onChange }) => {
  const filled = value != null && value.trim().length > 0;
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  const handleSelect = (raw: string) => {
    const next = raw.trim() === "" ? null : raw;
    onChange(next);
    setSavedFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setSavedFlash(false), 1600);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => setSelectorOpen(true)}
        className={[
          "inline-flex items-center gap-1.5 h-8 rounded-full px-3 border-2 transition-all duration-150 cursor-pointer",
          "text-[15px] font-bold tabular-nums tracking-tight",
          filled
            ? "bg-indigo-50 border-indigo-300 text-indigo-700 hover:border-indigo-500"
            : "bg-rose-50/60 border-dashed border-rose-300 text-rose-400 hover:border-indigo-300 hover:bg-zinc-50",
        ].join(" ")}
        title={filled ? `매장구역: ${value} · 클릭 시 변경` : "클릭 · 매장구역 선택"}
      >
        <MapPin size={12} fill={filled ? "currentColor" : "none"} className={filled ? "text-indigo-600" : "text-zinc-300"} />
        <span>{filled ? value : "구역 선택"}</span>
      </button>
      {savedFlash && (
        <span className="inline-flex items-center gap-1 text-[15px] font-semibold text-emerald-700 animate-in fade-in duration-200">
          <Check size={11} strokeWidth={3} />
          저장됨
        </span>
      )}
      {selectorOpen && (
        <RealMapSelector
          current={value}
          onSelect={handleSelect}
          onClose={() => setSelectorOpen(false)}
        />
      )}
    </div>
  );
};

// 2026-09-01 · 실재고 UI 벤치마킹 · 슬롯 라벨·톤 (StockRowCard SLOTS 와 동일)
const ARRIVAL_SLOT_META: Record<ArrivalSlot, { label: string; full: string; dot: string; text: string; softBg: string; icon: React.ReactNode }> = {
  w1: { label: "창1", full: "창고1", dot: "bg-cyan-500",   text: "text-cyan-700",   softBg: "bg-cyan-50",   icon: <Warehouse size={11} /> },
  w2: { label: "창2", full: "창고2", dot: "bg-cyan-500",   text: "text-cyan-700",   softBg: "bg-cyan-50",   icon: <Warehouse size={11} /> },
  s1: { label: "매1", full: "매장1", dot: "bg-violet-500", text: "text-violet-700", softBg: "bg-violet-50", icon: <Store size={11} /> },
  s2: { label: "매2", full: "매장2", dot: "bg-violet-500", text: "text-violet-700", softBg: "bg-violet-50", icon: <Store size={11} /> },
  s3: { label: "매3", full: "매장3", dot: "bg-violet-500", text: "text-violet-700", softBg: "bg-violet-50", icon: <Store size={11} /> },
};

// ─── 슬롯 카드 리스트 · B안 · 실재고확인 슬롯 카드 UI 이식 · 구역·상세구역만 편집 · 수량은 하단 단일 유지 ────
// 2026-09-09 · #15 · 사용자 지시 · "창고2 · 1A · 5 / 매장1 · 1A · 5 / + 매장 추가 (1/3)" UI 그대로
import { ShelfPositionsEditModal } from "../common/ShelfPositionsEditModal";
import { formatShelfDetail, type ShelfPositions } from "../../lib/shelfPositions";

interface ArrivalZoneSlotListProps {
  productCode: string;
  productName?: string;
  location: string | null;
  onSetLocation: (v: string | null) => void;
  // 2026-09-14 · #138 · 매장2·3 · 매장1과 독립 zone
  store2Zone?: string | null;
  store3Zone?: string | null;
  onSetStore2Zone?: (v: string | null) => void;
  onSetStore3Zone?: (v: string | null) => void;
  relatedSlots: { slot: ArrivalSlot; zone: string | null }[];
  targetSlot: ArrivalSlot | null;
  qty: number;
  shelfPositions?: ShelfPositions | null;
}

const ArrivalZoneSlotList: React.FC<ArrivalZoneSlotListProps> = ({
  productCode, productName, location, onSetLocation,
  store2Zone, store3Zone, onSetStore2Zone, onSetStore3Zone,
  relatedSlots, targetSlot, qty, shelfPositions: propShelfPositions,
}) => {
  const [storeCount, setStoreCount] = useState(1);
  // 2026-09-09 · 사용자 지시 · 슬롯 클릭 시 · 해당 위치 하나만 편집
  const [shelfEditCode, setShelfEditCode] = useState<string | null>(null);
  // 2026-09-09 · 저장 후 · UI 즉시 반영 보장 · 로컬 override state (props 캐시 갱신 지연 방어)
  const [shelfOverride, setShelfOverride] = useState<ShelfPositions | null>(null);
  const shelfPositions = shelfOverride ?? propShelfPositions;
  // 진단 · shelfPositions 갱신 확인
  devLog("[ArrivalZoneSlotList] render", { productCode, propShelfPositions, shelfOverride, effective: shelfPositions });
  const w1 = relatedSlots.find(rs => rs.slot === "w1");
  const w2 = relatedSlots.find(rs => rs.slot === "w2");
  const canAddStore = storeCount < 3;

  const renderWarehouseSlot = (slot: "w1" | "w2", zone: string | null) => {
    const meta = ARRIVAL_SLOT_META[slot];
    const isTarget = targetSlot === slot;
    const shelfKey = slot === "w1" ? "warehouse1" : "warehouse2";
    const shelfDetail = shelfPositions?.[shelfKey];
    const hasDetail = typeof shelfDetail === "string" && shelfDetail.length === 3;
    return (
      <div key={slot} className={`relative rounded-lg border ${meta.softBg} border-zinc-200/70 p-2.5 flex flex-col gap-2`}>
        <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
          <span className={`w-1.5 h-6 rounded-full ${meta.dot} shrink-0 self-center`} />
          <span className={`text-[16px] font-bold ${meta.text} truncate`}>{meta.full}</span>
          {isTarget && (
            <span className="inline-flex items-baseline gap-0.5 text-[13px] font-bold text-emerald-700 tabular-nums">
              <span className="text-[11px] font-semibold text-emerald-600/80">매입</span>
              +{qty}
            </span>
          )}
        </div>
        {zone && (
          <div className="inline-flex items-center gap-1.5 self-start">
            <span className="text-[12px] font-semibold text-zinc-500">구역</span>
            <span className="inline-flex items-center gap-1 h-8 rounded-full px-3 border-2 border-cyan-300 bg-cyan-50 text-cyan-700 text-[14px] font-bold tabular-nums" title={`${meta.full} 진열구역 (자동 배정)`}>
              <MapPin size={12} className="text-cyan-600" />
              {zone}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShelfEditCode(shelfKey)}
          className={[
            "text-[14px] tabular-nums tracking-tight cursor-pointer transition rounded px-1.5 py-0.5 text-left hover:bg-cyan-100/40 self-start",
            hasDetail ? "text-cyan-700 font-semibold" : "text-zinc-400 font-medium",
          ].join(" ")}
          title="창고 상세구역 편집"
        >
          {hasDetail ? `상세 ${formatShelfDetail(shelfDetail)}` : "상세 · 비어있음"}
        </button>
      </div>
    );
  };

  const renderStoreSlot = (idx: 1 | 2 | 3) => {
    const meta = ARRIVAL_SLOT_META[`s${idx}` as ArrivalSlot];
    const shelfKey = `store${idx}`;
    const shelfDetail = shelfPositions?.[shelfKey];
    const hasDetail = typeof shelfDetail === "string" && shelfDetail.length === 3;
    const isPrimary = idx === 1;
    // 2026-09-14 · #138 · 매장별 독립 zone
    //   · 매장1 · location (기존 · products.location)
    //   · 매장2 · store2Zone (inventory_checks.store2_zone)
    //   · 매장3 · store3Zone (inventory_checks.store3_zone)
    const slotZone = idx === 1 ? location : idx === 2 ? (store2Zone ?? null) : (store3Zone ?? null);
    const slotOnChange = idx === 1 ? onSetLocation
      : idx === 2 ? (onSetStore2Zone ?? (() => {}))
      : (onSetStore3Zone ?? (() => {}));
    return (
      <div key={`s${idx}`} className={`relative rounded-lg border ${meta.softBg} border-zinc-200/70 p-2.5 flex flex-col gap-2`}>
        {/* 2026-09-10 · #60 · 사용자 지시 · 매장2·3 · 우측 상단 · X 삭제 버튼 · 클릭 시 storeCount 축소 */}
        {!isPrimary && (
          <button
            type="button"
            onClick={() => setStoreCount(c => Math.max(1, c - 1))}
            className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-white/80 hover:bg-rose-50 border border-zinc-200 hover:border-rose-300 text-zinc-400 hover:text-rose-600 transition cursor-pointer active:scale-90"
            title={`${meta.full} 삭제`}
            aria-label={`${meta.full} 삭제`}
          >
            <span className="text-[16px] font-bold leading-none">×</span>
          </button>
        )}
        <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
          <span className={`w-1.5 h-6 rounded-full ${meta.dot} shrink-0 self-center`} />
          <span className={`text-[16px] font-bold ${meta.text} truncate`}>{meta.full}</span>
        </div>
        {/* 2026-09-14 · #138·#139 · 매장별 독립 zone + 라벨 · 사용자 클릭 · 별도 zone 저장 */}
        <div className="inline-flex items-center gap-1.5 self-start">
          <span className="text-[12px] font-semibold text-zinc-500">구역</span>
          <ArrivalZoneInline value={slotZone} onChange={slotOnChange} />
        </div>
        <button
          type="button"
          onClick={() => setShelfEditCode(shelfKey)}
          className={[
            "text-[14px] tabular-nums tracking-tight cursor-pointer transition rounded px-1.5 py-0.5 text-left hover:bg-indigo-100/40 self-start",
            hasDetail ? "text-indigo-700 font-semibold" : "text-zinc-400 font-medium",
          ].join(" ")}
          title="매장 상세구역 편집"
        >
          {hasDetail ? `상세 ${formatShelfDetail(shelfDetail)}` : "상세 · 비어있음"}
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2.5 pt-1 pb-0.5 border-t border-zinc-100/80 mt-0.5">
      {/* Row 1 · 창고 하나 (있으면) + 매장1 나란히 */}
      <div className="grid grid-cols-2 gap-2">
        {w1 ? renderWarehouseSlot("w1", w1.zone) : w2 ? renderWarehouseSlot("w2", w2.zone) : <div />}
        {renderStoreSlot(1)}
      </div>
      {/* Row 2 · 매장2/3 (storeCount 에 따라) */}
      {storeCount >= 2 && (
        <div className="grid grid-cols-2 gap-2">
          {renderStoreSlot(2)}
          {storeCount >= 3 ? renderStoreSlot(3) : <div />}
        </div>
      )}
      {/* + 매장 추가 (n/3) */}
      {canAddStore && (
        <button
          type="button"
          onClick={() => setStoreCount(c => Math.min(3, c + 1))}
          className="inline-flex items-center gap-1.5 self-start h-8 px-3 rounded-lg text-[14px] font-bold text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 hover:border-violet-300 transition cursor-pointer active:scale-95"
          title={`매장${storeCount + 1} 추가`}
        >
          + 매장 추가 ({storeCount}/3)
        </button>
      )}
      {/* Row 3 · 창고2 · w1 과 w2 둘 다 있을 때만 별도 행 */}
      {w1 && w2 && (
        <div className="grid grid-cols-1">
          {renderWarehouseSlot("w2", w2.zone)}
        </div>
      )}

      {shelfEditCode && (
        <ShelfPositionsEditModal
          productCode={productCode}
          productName={productName}
          displayLocation={location}
          initial={shelfPositions}
          locationCode={shelfEditCode}
          onSaved={(saved) => {
            // 로컬 즉시 반영 · UI 지연 완전 방어
            devLog("[ArrivalZoneSlotList] onSaved override:", saved);
            setShelfOverride(saved);
          }}
          onClose={() => setShelfEditCode(null)}
        />
      )}
    </div>
  );
};

export const ArrivalRowCard: React.FC<ArrivalRowCardProps> = React.memo(({
  item, isRecent, onUpdateQty, onSetQty, onSetStatus, onRemove, onSetLocation,
  onSetStore2Zone, onSetStore3Zone,
  onSetUnitPrice, onSetExpiryDate, onSetExpiring,
}) => {
  void onUpdateQty; // pre-existing unused (StepperInput uses onSetQty)
  const d = new Date(item.addedAt);
  const arrivedAt = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const isMatch    = item.status === "match";
  const isMismatch = item.status === "mismatch";
  const isPending  = item.status === "pending";

  // 2026-09-01 · 실재고 UI 벤치마킹 · 상품 정보 분석 (관련 창고·매장 슬롯)
  //   · 상품 location (진열구역) · 창고1/2 소속 판단
  //   · 사용자가 선택한 입고구역 (item.location) → 자동 슬롯 판정
  //   · 상품 현재고 · 참고 표시
  const productRealMap = item.product?.location ?? item.product?.display_location ?? null;
  const productCategoryCode = item.product?.category_code ?? null;
  const currentStock = Number(item.product?.current_stock ?? 0);
  const optimalStock = Number(item.product?.optimal_stock ?? 0);
  // 2026-09-08 · 상세 진열위치 · 이 상품의 매장/창고 3자리
  const shelfMap = useShelfPositionsMap();
  const shelfPositions = item.code ? shelfMap[item.code] : null;
  // 2026-09-09 · 진단 · shelfMap 반영 여부 확인
  devLog("[ArrivalRowCard] shelfMap size:", Object.keys(shelfMap).length, "has item.code?", item.code, !!shelfMap[item.code], "sample keys:", Object.keys(shelfMap).slice(0, 3));
  const warehouseVis = useMemo(() => resolveWarehouseVisibility(productRealMap), [productRealMap]);
  const slotZones = useMemo(() => assignZonesToSlots(productRealMap, productCategoryCode), [productRealMap, productCategoryCode]);
  const targetSlot = useMemo(() => classifyArrivalSlot(item.location), [item.location]);
  // 2026-09-02 · #74 · 사용자 규칙 · 창고1(24·25·26·27·7B·8A) · 나머지 모두 창고2
  //   · 입고구역 선택 시 · 그 구역의 창고만 표시 (배타적 필터)
  //   · 미선택 시 · 상품 location 기반 · 창고1/창고2 모두 (해당 시)
  const hasLocation = !!item.location;
  const showW1 = hasLocation ? targetSlot === "w1" : warehouseVis.showW1;
  const showW2 = hasLocation ? targetSlot === "w2" : warehouseVis.showW2;
  // 표시할 관련 슬롯 목록 (창고1/창고2) · 매장 slot (s1/s2/s3) 은 창고 소속 규칙과 별개 · 유지
  const relatedSlots: { slot: ArrivalSlot; zone: string | null }[] = [];
  if (showW1) relatedSlots.push({ slot: "w1", zone: slotZones.w1zone ?? (targetSlot === "w1" ? item.location : null) });
  if (showW2) relatedSlots.push({ slot: "w2", zone: slotZones.w2zone ?? (targetSlot === "w2" ? item.location : null) });

  // 좌측 accent stripe (2026-09-01 · #93 · 명세서 상태 2종만 · expiring accent 제거)
  const stripeCls =
    isMatch    ? "before:bg-emerald-400" :
    isMismatch ? "before:bg-rose-400"    :
                 "before:bg-transparent";

  return (
    <div
      className={[
        "relative bg-white rounded-2xl border transition-all duration-200 overflow-hidden",
        "shadow-[0_1px_2px_rgba(10,46,74,0.04),0_1px_3px_rgba(10,46,74,0.03)]",
        "hover:shadow-[0_2px_6px_rgba(10,46,74,0.06),0_4px_12px_-2px_rgba(10,46,74,0.05)]",
        "before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]",
        stripeCls,
        isRecent
          ? "border-sky-300/60 shadow-[0_0_0_3px_rgba(56,189,248,0.10),0_1px_3px_rgba(10,46,74,0.05)]"
          : isMismatch
            ? "border-rose-200/70"
            : isMatch
              ? "border-emerald-200/70"
              : "border-line/70",
      ].join(" ")}
    >
      <div className="pl-4 pr-3 py-3 flex flex-col gap-2.5">

        {/* 상단 · 공급사 pill + 입고 시각 (우측) */}
        <div className="flex items-center gap-2 flex-wrap">
          {item.product?.supplier ? (
            <Badge tone="sky" size="xs" icon={<Building2 size={10} className="text-sky-500" />}>
              {item.product.supplier}
            </Badge>
          ) : (
            <Badge tone="zinc" size="xs">공급사 미지정</Badge>
          )}
          <span className="ml-auto text-[14px] tabular-nums text-ink-soft">
            {arrivedAt}
          </span>
        </div>

        {/* 2026-09-02 · 사용자 지시 · 상품명 + 현재고 (오른쪽) · 폰트 +2 (16→18) */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <h4 className="text-[18px] font-bold text-ink tracking-tight leading-snug break-keep flex-1 min-w-0">
            {item.product?.name ?? <span className="text-rose-500">(미등록 상품)</span>}
          </h4>
          {(currentStock > 0 || item.product) && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[14px] font-bold tabular-nums shrink-0" title="현재 재고 수량 (products.current_stock)">
              <Package size={13} className="text-amber-600" strokeWidth={2.2} />
              <span className="text-[12px] font-semibold text-amber-600/80">현재고</span>
              <span className="text-amber-800 text-[16px] font-extrabold">{currentStock.toLocaleString()}</span>
              <span className="text-[12px] font-semibold text-amber-600/70">개</span>
              {optimalStock > 0 && (
                <span className="text-[12px] font-semibold text-amber-500/80 ml-0.5 pl-1.5 border-l border-amber-200/70">
                  적정 <span className="text-amber-700">{optimalStock.toLocaleString()}</span>개
                </span>
              )}
            </span>
          )}
        </div>

        {/* 규격 · 코드 · 폰트 +2 (11→13) */}
        <div className="flex items-center gap-1.5 flex-wrap -mt-0.5">
          {item.product?.spec && (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5
              text-[15px] font-semibold text-zinc-500 bg-zinc-100/70">
              <Box size={11} className="text-zinc-400" />
              {item.product.spec}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5
            text-[15px] font-mono text-zinc-400 bg-zinc-100/60">
            <Hash size={11} className="text-zinc-300" />
            {item.code}
          </span>
        </div>

        {/* 슬롯 카드 UI · B안 · 실재고확인 슬롯 카드 그대로 이식 · 구역·상세구역만 편집 · 수량은 하단 단일 유지 · 사용자 지시 */}
        <ArrivalZoneSlotList
          productCode={item.code}
          productName={item.product?.product_name ?? item.product?.name ?? undefined}
          location={item.location}
          onSetLocation={(v) => onSetLocation(item.key, v)}
          store2Zone={item.store2Zone ?? null}
          store3Zone={item.store3Zone ?? null}
          onSetStore2Zone={onSetStore2Zone ? (v) => onSetStore2Zone(item.key, v) : undefined}
          onSetStore3Zone={onSetStore3Zone ? (v) => onSetStore3Zone(item.key, v) : undefined}
          relatedSlots={relatedSlots}
          targetSlot={targetSlot}
          qty={item.qty}
          shelfPositions={shelfPositions}
        />
        {/* 창고 상세구역 · 매장 상세구역 · 슬롯 카드 아래 요약 (인라인) · 편집은 슬롯 카드 안에서 */}

        {/* 액션 영역 · 수량 stepper + 2-state pill + 삭제 */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {/* 수량 · 필수 */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] font-semibold text-zinc-400">수량<span className="text-rose-500 ml-0.5">*</span></span>
            <div className={`w-[176px] rounded-lg ${item.qty <= 0 ? "ring-2 ring-rose-300" : ""}`}>
              <StepperInput
                value={item.qty}
                onChange={(v) => onSetQty(item.key, v === "" ? 0 : v)}
                size="lg"
                decLabel="수량 감소"
                incLabel="수량 증가"
              />
            </div>
          </div>

          {/* 2026-09-14 · #139 · 거래명세서 pill · violet·rose 톤 (재고 amber · 예상 sky와 구분 · 검수 도메인 색상) */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] font-semibold text-violet-500/80">거래명세서 검수</span>
            <div
              role="group"
              aria-label="거래명세서 일치 · 불일치"
              className="flex items-stretch h-11 rounded-xl overflow-hidden border-2 border-violet-100 bg-gradient-to-br from-violet-50/40 to-white shadow-[0_1px_2px_rgba(139,92,246,0.06)]"
            >
              {/* 일치 · 검수 통과 · violet 톤 */}
              <button
                role="radio"
                aria-checked={isMatch}
                onClick={() => onSetStatus(item.key, isMatch ? "pending" : "match")}
                title="수량 일치 · 검수 통과"
                className={[
                  "flex items-center justify-center gap-1 px-3 min-w-[72px]",
                  "text-[15px] font-bold transition-all duration-150 cursor-pointer",
                  isMatch
                    ? "bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
                    : "text-violet-500/60 hover:text-violet-700 hover:bg-violet-50",
                ].join(" ")}
              >
                <CheckCircle2 size={14} strokeWidth={isMatch ? 2.5 : 2} />
                일치
              </button>
              {/* 불일치 · 검수 이슈 · rose 톤 (danger) */}
              <button
                role="radio"
                aria-checked={isMismatch}
                onClick={() => onSetStatus(item.key, isMismatch ? "pending" : "mismatch")}
                title="수량 불일치 · 검수 이슈"
                className={[
                  "flex items-center justify-center gap-1 px-3 min-w-[72px] border-l border-violet-100",
                  "text-[15px] font-bold transition-all duration-150 cursor-pointer",
                  isMismatch
                    ? "bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
                    : "text-rose-400/60 hover:text-rose-700 hover:bg-rose-50",
                ].join(" ")}
              >
                <XCircle size={14} strokeWidth={isMismatch ? 2.5 : 2} />
                불일치
              </button>
            </div>
          </div>

          {/* 2026-09-14 · #139 · 예상 현재고 · sky 톤 (재고 amber와 구분 · 미래값 명확) */}
          {isMatch && item.qty > 0 && (
            <div className="inline-flex items-stretch gap-0 shrink-0 rounded-xl overflow-hidden border border-sky-200/80 shadow-[0_1px_2px_rgba(3,105,161,0.05),0_2px_8px_-2px_rgba(3,105,161,0.1)] bg-gradient-to-br from-white to-sky-50/40">
              <div className="inline-flex items-center gap-1.5 px-3 bg-gradient-to-br from-sky-500 to-sky-600 text-white">
                <TrendingUp size={14} strokeWidth={2.4} />
                <span className="text-[14px] font-bold tracking-tight whitespace-nowrap">예상 현재고</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3.5 h-11 min-w-[150px]">
                <span className="text-[15px] font-semibold text-zinc-500 tabular-nums leading-none">{currentStock}</span>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-700 text-[13px] font-bold tabular-nums leading-none">
                  +{item.qty}
                </span>
                <ArrowRight size={13} className="text-sky-400 shrink-0" strokeWidth={2.5} />
                <span className="text-[22px] font-extrabold tabular-nums text-sky-700 leading-none tracking-tight">
                  {currentStock + item.qty}
                </span>
                <span className="text-[13px] font-semibold text-sky-600/70 leading-none">개</span>
              </div>
            </div>
          )}

          {/* 삭제 · 우측 */}
          <button
            onClick={() => onRemove(item.key)}
            className="ml-auto w-9 h-9 flex items-center justify-center rounded-lg
              text-zinc-300 hover:text-rose-500 hover:bg-rose-50
              transition-all duration-150 cursor-pointer"
            title="삭제"
            aria-label="삭제"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* 단가 + 유통기한 임박 */}
        {(onSetUnitPrice || onSetExpiring) && (
          <div className="flex flex-col gap-2 pt-1 border-t border-zinc-100/80">
            <div className="flex items-center gap-3 flex-wrap">
              {onSetUnitPrice && (
                <label className="inline-flex items-center gap-1.5">
                  <span className="text-[16px] font-bold text-zinc-500 tracking-tight shrink-0">
                    단가<span className="text-rose-500 ml-0.5">*</span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={item.unitPrice ?? ""}
                    onChange={(e) => onSetUnitPrice(item.key, e.target.value === "" ? null : Number(e.target.value))}
                    placeholder="0"
                    className={[
                      "w-24 h-8 px-2 rounded-md border text-[14px] tabular-nums text-right focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint",
                      (!item.unitPrice || item.unitPrice <= 0) ? "border-rose-300 bg-rose-50/50" : "border-line",
                    ].join(" ")}
                  />
                  <span className="text-[15px] text-zinc-400">원</span>
                </label>
              )}
              {onSetExpiring && (
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={item.expiring}
                    onChange={(e) => onSetExpiring(item.key, e.target.checked)}
                    className="w-4 h-4 rounded cursor-pointer accent-rose-500"
                  />
                  <span className={`text-[16px] font-bold tracking-tight ${item.expiring ? "text-rose-600" : "text-zinc-500"}`}>
                    유통기한 임박
                  </span>
                </label>
              )}
            </div>
            {/* 유통기한 임박 체크 시 날짜 입력 노출 */}
            {item.expiring && onSetExpiryDate && (
              <label className="inline-flex items-center gap-1.5">
                <span className="text-[14px] font-bold text-zinc-500 tracking-tight shrink-0">유통기한</span>
                <input
                  type="date"
                  value={item.expiryDate ?? ""}
                  onChange={(e) => onSetExpiryDate(item.key, e.target.value || null)}
                  className="h-8 px-2 rounded-md border border-line text-[14px] tabular-nums focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
                />
              </label>
            )}
          </div>
        )}

        {/* pending 힌트 · 2026-09-02 · 사용자 지시 · 폰트 +2 (xs → sm) */}
        {isPending && (
          <Badge tone="amber" size="sm" className="self-start">수량 확인 필요</Badge>
        )}
      </div>
    </div>
  );
});
ArrivalRowCard.displayName = "ArrivalRowCard";
