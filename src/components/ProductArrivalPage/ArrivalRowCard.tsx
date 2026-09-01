// ArrivalRowCard · 2026-08-18 · 상품입고 카드형 재설계
//   · 테이블 → 카드 리스트 (Linear/Attio/Notion 2026 톤)
//   · 상단: 공급사 + 입고시각 + 상품명 + 규격/코드
//   · 하단: 큰 수량 stepper + 2-state pill (일치/불일치) + 삭제
//   · 상태별 좌측 accent stripe · 최근 sky ring · 부드러운 shadow
// 2026-09-01 · #92 · 구역 지정 UI 추가 (RealMapSelector 재사용)
// 2026-09-01 · #93 · 명세서 상태 · 3종→2종 · 기한임박 UI 제거 (expiring 데이터 필드는 유지)

import React, { useRef, useEffect, useState, useMemo } from "react";
import { Box, Hash, Building2, CheckCircle2, XCircle, Trash2, MapPin, Check, Warehouse, Store, Package } from "lucide-react";
import type { ProductInfo } from "../../lib/productsCache";
import { StepperInput } from "../common/StepperInput";
import { Badge } from "../common/Badge";
import { RealMapSelector } from "../ScanPage/RealMapSelector";
// 2026-09-01 · 실재고 UI 벤치마킹 · 창고/매장 자동 분류 · 관련 구역 표시
import { resolveWarehouseVisibility, classifyArrivalSlot, assignZonesToSlots, type ArrivalSlot } from "../../lib/warehouseZoneMap";

export type ItemStatus = "pending" | "match" | "mismatch";

export interface ArrivalCardItem {
  key: string;
  code: string;
  product: ProductInfo | null;
  qty: number;
  status: ItemStatus;
  expiring: boolean;
  addedAt: number;
  /** 2026-09-01 · #92 · 입고 구역 */
  location: string | null;
}

interface ArrivalRowCardProps {
  item: ArrivalCardItem;
  isRecent: boolean;
  onUpdateQty: (key: string, delta: number) => void;
  onSetQty: (key: string, qty: number) => void;
  onSetStatus: (key: string, status: ItemStatus) => void;
  onRemove: (key: string) => void;
  /** 2026-09-01 · #92 · 구역 변경 핸들러 */
  onSetLocation: (key: string, location: string | null) => void;
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
          "text-[13px] font-bold tabular-nums tracking-tight",
          filled
            ? "bg-indigo-50 border-indigo-300 text-indigo-700 hover:border-indigo-500"
            : "bg-white border-dashed border-zinc-300 text-zinc-400 hover:border-indigo-300 hover:bg-zinc-50",
        ].join(" ")}
        title={filled ? `입고구역: ${value} · 클릭 시 변경` : "클릭 · 구역 선택"}
      >
        <MapPin size={12} fill={filled ? "currentColor" : "none"} className={filled ? "text-indigo-600" : "text-zinc-300"} />
        <span>{filled ? value : "구역 선택"}</span>
      </button>
      {savedFlash && (
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-700 animate-in fade-in duration-200">
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

export const ArrivalRowCard: React.FC<ArrivalRowCardProps> = React.memo(({
  item, isRecent, onUpdateQty, onSetQty, onSetStatus, onRemove, onSetLocation,
}) => {
  void onUpdateQty; // pre-existing unused (StepperInput uses onSetQty)
  const d = new Date(item.addedAt);
  const arrivedAt = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const isMatch    = item.status === "match";
  const isMismatch = item.status === "mismatch";
  const isPending  = item.status === "pending";

  // 2026-09-01 · 실재고 UI 벤치마킹 · 상품 정보 분석 (관련 창고·매장 슬롯)
  //   · 상품의 real_map (진열구역) · 창고1/2 소속 판단
  //   · 사용자가 선택한 입고구역 (item.location) → 자동 슬롯 판정
  //   · 상품 현재고 · 참고 표시
  const productRealMap = item.product?.real_map ?? item.product?.location ?? null;
  const productCategoryCode = item.product?.category_code ?? null;
  const currentStock = Number(item.product?.current_stock ?? 0);
  const optimalStock = Number(item.product?.optimal_stock ?? 0);
  const warehouseVis = useMemo(() => resolveWarehouseVisibility(productRealMap), [productRealMap]);
  const slotZones = useMemo(() => assignZonesToSlots(productRealMap, productCategoryCode), [productRealMap, productCategoryCode]);
  const targetSlot = useMemo(() => classifyArrivalSlot(item.location), [item.location]);
  // 2026-09-01 · fix · 사용자가 선택한 location 이 창고 코드면 · 창고 슬롯 자동 추가
  //   · 이전 · 상품 real_map 만 · 창고 소속 아니면 창고 슬롯 안 나옴 (사용자 지적 버그)
  //   · 수정 · targetSlot=w1/w2 면 해당 슬롯 강제 표시
  const showW1 = warehouseVis.showW1 || targetSlot === "w1";
  const showW2 = warehouseVis.showW2 || targetSlot === "w2";
  // 표시할 관련 슬롯 목록 (창고 · 매장 · 상품 소속 or 사용자 선택 기반)
  const relatedSlots: { slot: ArrivalSlot; zone: string | null }[] = [];
  if (showW1) relatedSlots.push({ slot: "w1", zone: slotZones.w1zone ?? (targetSlot === "w1" ? item.location : null) });
  if (showW2) relatedSlots.push({ slot: "w2", zone: slotZones.w2zone ?? (targetSlot === "w2" ? item.location : null) });
  if (slotZones.s1zone || targetSlot === "s1") relatedSlots.push({ slot: "s1", zone: slotZones.s1zone ?? item.location });
  if (slotZones.s2zone || targetSlot === "s2") relatedSlots.push({ slot: "s2", zone: slotZones.s2zone ?? item.location });
  if (slotZones.s3zone || targetSlot === "s3") relatedSlots.push({ slot: "s3", zone: slotZones.s3zone ?? item.location });

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
          <span className="ml-auto text-[12px] font-mono tabular-nums text-ink-soft">
            {arrivedAt}
          </span>
        </div>

        {/* 상품명 */}
        <h4 className="text-[16px] font-bold text-ink tracking-tight leading-snug break-keep">
          {item.product?.name ?? <span className="text-rose-500">(미등록 상품)</span>}
        </h4>

        {/* 규격 · 코드 */}
        <div className="flex items-center gap-1.5 flex-wrap -mt-0.5">
          {item.product?.spec && (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5
              text-[11px] font-semibold text-zinc-500 bg-zinc-100/70">
              <Box size={9} className="text-zinc-400" />
              {item.product.spec}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5
            text-[11px] font-mono text-zinc-400 bg-zinc-100/60">
            <Hash size={9} className="text-zinc-300" />
            {item.code}
          </span>
        </div>

        {/* 2026-09-01 · #92 · 구역 지정 · 수량 영역 위 */}
        <div className="flex items-center gap-2 pt-0.5 pb-0.5 border-t border-zinc-100/80 mt-0.5">
          <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider shrink-0">입고구역</span>
          <ArrivalZoneInline
            value={item.location}
            onChange={(v) => onSetLocation(item.key, v)}
          />
        </div>

        {/* 2026-09-01 · 실재고 UI 벤치마킹 · 관련 창고·매장 슬롯 · 현재고 · 자동 판정
            · 상품의 real_map 기반 · 소속 슬롯만 표시 (창1/창2/매1/매2/매3 중 해당)
            · 사용자가 선택한 입고구역 → 어느 슬롯에 반영될지 하이라이트
            · 상품에 real_map 또는 현재고 정보가 있을 때만 렌더 (미등록 상품은 skip) */}
        {(relatedSlots.length > 0 || currentStock > 0) && (
          <div className="rounded-xl bg-zinc-50/60 border border-line/60 px-3 py-2 flex flex-col gap-1.5">
            {/* 헤더 · 현재고·적정재고 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">재고 현황</span>
              <span className="ml-auto inline-flex items-center gap-1 text-[13px] font-bold text-zinc-700 tabular-nums">
                <Package size={11} className="text-zinc-400" />
                현재고 {currentStock.toLocaleString()}
                {optimalStock > 0 && (
                  <span className="text-[11px] font-semibold text-zinc-400 ml-1">/ 적정 {optimalStock.toLocaleString()}</span>
                )}
              </span>
            </div>
            {/* 관련 슬롯 chip 리스트 · 자동 판정 슬롯 하이라이트 */}
            {relatedSlots.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {relatedSlots.map(({ slot, zone }) => {
                  const meta = ARRIVAL_SLOT_META[slot];
                  const isTarget = targetSlot === slot;
                  return (
                    <span
                      key={slot}
                      className={[
                        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px] font-bold tabular-nums transition",
                        isTarget
                          ? "border-emerald-400 bg-emerald-50 text-emerald-800 shadow-[0_0_0_2px_rgba(52,211,153,0.15)]"
                          : `border-line ${meta.softBg} ${meta.text}`,
                      ].join(" ")}
                      title={isTarget ? `이번 입고 · ${meta.full} 반영 예정` : meta.full}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                      {zone && <span className="text-[11px] font-mono opacity-70">·{zone}</span>}
                      {isTarget && (
                        <span className="text-[10px] font-bold text-emerald-700 ml-0.5">+{item.qty}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 액션 영역 · 수량 stepper + 2-state pill + 삭제 · 2026-09-01 · #93 · 3종→2종 */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {/* 수량 Stepper · 2026-08-29 · 폭 확장 (132→176) · input 숫자 잘 보이게 · 사용자 지시 */}
          <div className="w-[176px]">
            <StepperInput
              value={item.qty}
              onChange={(v) => onSetQty(item.key, v === "" ? 0 : v)}
              size="lg"
              decLabel="수량 감소"
              incLabel="수량 증가"
            />
          </div>

          {/* 2-state pill · 일치·불일치 · segmented (h-11 통일) · 2026-09-01 · 기한임박 제거 */}
          <div
            role="group"
            aria-label="일치 · 불일치"
            className="flex items-stretch h-11 rounded-xl overflow-hidden border-2 border-line bg-zinc-100/60"
          >
            {/* 일치 */}
            <button
              role="radio"
              aria-checked={isMatch}
              onClick={() => onSetStatus(item.key, isMatch ? "pending" : "match")}
              title="수량 일치 · 클릭 시 선택/해제"
              className={[
                "flex items-center justify-center gap-1 px-2.5 min-w-[64px]",
                "text-[13px] font-bold transition-all duration-150 cursor-pointer",
                isMatch
                  ? "bg-emerald-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                  : "text-zinc-500 hover:text-emerald-700 hover:bg-white",
              ].join(" ")}
            >
              <CheckCircle2 size={13} strokeWidth={isMatch ? 2.5 : 2} />
              일치
            </button>
            {/* 불일치 */}
            <button
              role="radio"
              aria-checked={isMismatch}
              onClick={() => onSetStatus(item.key, isMismatch ? "pending" : "mismatch")}
              title="수량 불일치 · 클릭 시 선택/해제"
              className={[
                "flex items-center justify-center gap-1 px-2.5 min-w-[64px] border-l border-line",
                "text-[13px] font-bold transition-all duration-150 cursor-pointer",
                isMismatch
                  ? "bg-rose-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                  : "text-zinc-500 hover:text-rose-700 hover:bg-white",
              ].join(" ")}
            >
              <XCircle size={13} strokeWidth={isMismatch ? 2.5 : 2} />
              불일치
            </button>
          </div>

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

        {/* pending 힌트 · 2026-09-01 · expiring 조건 제거 (2종 상태만) */}
        {isPending && (
          <Badge tone="amber" size="xs" className="self-start">수량 확인 필요</Badge>
        )}
      </div>
    </div>
  );
});
ArrivalRowCard.displayName = "ArrivalRowCard";
