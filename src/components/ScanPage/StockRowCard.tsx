// StockRowCard · 통합 카드형 실재고 입력 · 2026-08-18 · #95 재설계
//   · 모바일 우선 · PC 동일 (SplitPanel 안 좁은 폭 대응)
//   · 접힘 기본 (상품명 + 5-way strip + 합계) → 탭 시 확장 (5-slot editor)
//   · 최근 스캔·값 있음 자동 확장 · Linear/Attio/Notion 2026 톤
//
// 시각 계층
//   1) 상단 · 상품명 (17px bold) · code/spec (11px mono) · 우측 총 합계 (28px bold)
//   2) chip strip · 5 색 dot + label + 합계값 (한눈에 5-way 상태)
//   3) 확장 · 5-slot editor (현재/입력/합계 · 매장은 구역 편집 포함)
//   4) 액션 · 이력·진열요청·삭제
//
// 안전
//   · patchRow/removeRow/onHistory/requestDisplay 시그니처 그대로 · handlers 무변경
//   · StockRow 타입 그대로 사용
//   · StockActionsCell 재사용 (기존 3버튼 그대로)

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Box, Hash, ChevronDown, ChevronUp, MapPin, Check, X } from "lucide-react";
import type { StockRow } from "./stockRowTypes";
import { calcRowTotal, calcSlotTotal, calcTotalAdded } from "./stockRowTypes";
import { StatusPill } from "../common/StatusPill";
import { StepperInput as CommonStepperInput } from "../common/StepperInput";
import { StockActionsCell } from "./StockActionsCell";
import { Clock as ClockIcon } from "lucide-react";
// 2026-08-25 · 사용자 지시 · 매장구역 Tier 3 · Selector 통합 · 데이터 정합성 100%
import { RealMapSelector } from "./RealMapSelector";
// 2026-08-26 · 사용자 지시 · zone → 창고 매핑 · 해당 상품 소속 창고만 표시
// 2026-09-01 · #92 · 구역 선택 → 자동 슬롯 판정
import { resolveWarehouseVisibility, classifyArrivalSlot } from "../../lib/warehouseZoneMap";

// ─── 5-slot 정의 (창고2 · 매장3) ─────────────────────────────────
interface SlotDef {
  key: string;
  label: string;      // "창1"
  full: string;       // "창고1"
  addKey: keyof StockRow;
  prevKey: keyof StockRow;
  zoneKey?: keyof StockRow;
  shelfCode: string;  // "warehouse1" · shelf_positions map 키
  dot: string;        // "bg-orange-500"
  text: string;       // "text-orange-700"
  softBg: string;     // "bg-orange-50/50"
}

// 2026-08-25 · 사용자 지시 · 톤 통일 · 창고 (창1·창2) 같은 cyan · 매장 (매1·매2·매3) 같은 violet
//   · product_storage.png 톤 · WAREHOUSE_TONE / STORE_TONE 통일
const SLOTS: readonly SlotDef[] = [
  { key: "w1", label: "창1", full: "창고1", addKey: "warehouse1AddQty", prevKey: "prevWarehouse1Qty",                          shelfCode: "warehouse1", dot: "bg-cyan-500",   text: "text-cyan-700",   softBg: "bg-cyan-50/60"   },
  { key: "w2", label: "창2", full: "창고2", addKey: "warehouse2AddQty", prevKey: "prevWarehouse2Qty",                          shelfCode: "warehouse2", dot: "bg-cyan-500",   text: "text-cyan-700",   softBg: "bg-cyan-50/60"   },
  { key: "s1", label: "매1", full: "매장1", addKey: "store1AddQty",     prevKey: "prevStore1Qty",     zoneKey: "store1Zone",   shelfCode: "store1",     dot: "bg-violet-500", text: "text-violet-700", softBg: "bg-violet-50/60" },
  { key: "s2", label: "매2", full: "매장2", addKey: "store2AddQty",     prevKey: "prevStore2Qty",     zoneKey: "store2Zone",   shelfCode: "store2",     dot: "bg-violet-500", text: "text-violet-700", softBg: "bg-violet-50/60" },
  { key: "s3", label: "매3", full: "매장3", addKey: "store3AddQty",     prevKey: "prevStore3Qty",     zoneKey: "store3Zone",   shelfCode: "store3",     dot: "bg-violet-500", text: "text-violet-700", softBg: "bg-violet-50/60" },
] as const;

const WARN_THRESHOLD = 100;

// 2026-08-18 · 공용 StepperInput 프리미티브 사용 (common/StepperInput) · 중복 코드 제거
const StepperInput = CommonStepperInput;

// ─── 구역 편집 · 매장 전용 · 2026 트렌드 (Linear/Notion inline chip · pin icon + autosave 표시)
// 2026-08-25 · 사용자 지시 · Tier 3 · Selector 통합 (자유입력 제거 · 데이터 정합성 100%)
//   · ZONE_DEFS 기반 RealMapSelector 모달 · 오타·존재 안 하는 구역 원천 차단
const ZoneInline: React.FC<{
  value: string | null;
  onChange: (v: string | null) => void;
  erpSpec?: string;
}> = ({ value, onChange, erpSpec }) => {
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
      {/* 선택 버튼 · 클릭 시 모달 오픈 · 값 있으면 채워진 pill · 없으면 dashed placeholder */}
      <button
        type="button"
        onClick={() => setSelectorOpen(true)}
        className={[
          "inline-flex items-center gap-1.5 h-9 rounded-full px-3 border-2 transition-all duration-150 cursor-pointer",
          "text-[14px] font-bold tabular-nums tracking-tight",
          filled
            ? "bg-brand-tint border-brand-deep/30 text-brand-deep shadow-[inset_0_1px_0_rgba(255,255,255,0.60)] hover:border-brand-deep/60"
            : "bg-white border-dashed border-zinc-300 text-zinc-500 hover:border-brand-deep/50 hover:bg-zinc-50",
        ].join(" ")}
        title={filled ? `매장구역: ${value} · 클릭 시 변경` : "클릭 · 매장구역 선택"}
      >
        <MapPin size={13} fill={filled ? "currentColor" : "none"} className={filled ? "text-brand-deep" : "text-zinc-400"} />
        <span>{filled ? value : "매장구역 선택"}</span>
      </button>

      {/* autosave flash · Notion-style · brief "저장됨" */}
      {savedFlash && (
        <span className="inline-flex items-center gap-1 text-[15px] font-semibold text-emerald-700 animate-in fade-in duration-200">
          <Check size={11} strokeWidth={3} />
          저장됨
        </span>
      )}

      {/* ERP 지정 위치 (있으면 · helper text) */}
      {erpSpec && !savedFlash && (
        <span className="inline-flex items-center gap-0.5 text-[15px] text-ink-soft tabular-nums font-medium" title={`ERP 지정 위치 · ${erpSpec}`}>
          <span className="text-zinc-300">·</span> ERP {erpSpec}
        </span>
      )}

      {/* RealMapSelector · ZONE_DEFS 기반 · 자유입력 X · 데이터 정합성 100% */}
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

// 기존 ZoneInput 유지 (다른 곳 참조 방지)
const ZoneInput = ZoneInline;

// ─── 2026-09-01 · #92 · 미지정 신규 상품 전용 · 구역 자동 배정 버튼 ───────────────
const AutoZonePicker: React.FC<{ onAssign: (loc: string) => void }> = ({ onAssign }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 px-1 py-2 bg-indigo-50/60 rounded-lg border border-indigo-100">
      <MapPin size={13} className="text-indigo-400 shrink-0" />
      <span className="text-[15px] font-semibold text-indigo-700">구역 선택 시 슬롯 자동 배정</span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[15px] font-bold text-indigo-700 bg-indigo-100 border border-indigo-200 hover:bg-indigo-200 transition cursor-pointer"
      >
        <MapPin size={11} />
        구역 선택
      </button>
      {open && (
        <RealMapSelector
          current={null}
          onSelect={(loc) => { onAssign(loc); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
};

// ─── 카드 컴포넌트 ───────────────────────────────────────────────
interface StockRowCardProps {
  row: StockRow;
  isRecent: boolean;
  requestingKey: string | null;
  onPatch: (key: string, patch: Partial<StockRow>) => void;
  onRemove: (key: string) => void;
  onHistory: (code: string, name: string) => void;
  onRequestDisplay: (row: StockRow) => void;
  // 2026-08-23 · #204 · 개별 저장 (bulk endpoint · items=[one])
  onSaveRow?: (key: string) => Promise<void> | void;
  // 2026-08-25 · 유통기한 임박 토글 · product.expiry_date 업데이트
  onToggleExpiry?: (row: StockRow) => Promise<void> | void;
}

export const StockRowCard: React.FC<StockRowCardProps> = React.memo(({
  row, isRecent, requestingKey, onPatch, onRemove, onHistory, onRequestDisplay,
  onSaveRow, onToggleExpiry,
}) => {
  // 2026-08-25 · 유통기한 임박 · product.expiry_date 있으면 빨간 강조
  const hasExpiryFlag = !!((row.product as { expiry_date?: string | null }).expiry_date && String((row.product as { expiry_date?: string | null }).expiry_date).trim());
  const rowTotal = calcRowTotal(row);
  const totalAdded = calcTotalAdded(row); // 현재 실재고 합계 (pre-fill 후 = 현재 저장값)
  // dirty: 입력값이 이전 저장값과 다를 때 저장 버튼 활성화
  const isDirty = SLOTS.some(s => {
    const add = row[s.addKey] as number | "";
    const prev = row[s.prevKey] as number | null | undefined;
    if (add === "") return false;
    return Number(add) !== (prev ?? 0);
  });
  const hasAdd = isDirty;
  // 2026-08-23 · #204 · 이번 세션에 개별 저장 완료 여부 · 저장 후 카드 자동 접힘
  const savedThisSession = !!row.savedThisSession;

  const isWarn = useMemo(() => {
    const a = (v: number | "") => v !== "" ? Number(v) : 0;
    return SLOTS.some(s => a(row[s.addKey] as any) >= WARN_THRESHOLD);
  }, [row]);

  // 2026-08-23 · #204 · 자동 확장 규칙
  //   · isRecent (최근 스캔) 은 유지 · 다음 스캔이 오면 자동 접힘
  //   · savedThisSession 이면 hasAdd 무시 (저장 완료 후 사용자가 열지 않는 한 접힘)
  //   · 이상값 (isWarn) 은 계속 강조
  const autoExpanded = isRecent || (hasAdd && !savedThisSession) || isWarn;
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const expanded = autoExpanded || manuallyExpanded;
  // 2026-08-23 · #204 · 저장 진행 상태 (버튼 disable 방지)
  const [saving, setSaving] = useState(false);
  const handleSaveClick = async () => {
    if (!onSaveRow || saving || !hasAdd) return;
    setSaving(true);
    try { await onSaveRow(row.key); } finally { setSaving(false); }
  };

  // product.spec 파싱 (매장별 ERP 위치)
  const specParts = String((row.product as any).spec ?? "").split("/").map(s => s.trim());

  // 2026-08-26 · 사용자 지시 · 해당 상품 소속 창고만 표시 · location / display_location 기반
  const productZone = String(
    (row.product as any).location
    ?? (row.product as any).display_location
    ?? ""
  );
  const { showW1, showW2 } = useMemo(() => resolveWarehouseVisibility(productZone), [productZone]);

  // 2026-09-01 · 사용자 지시 · 매장구역 선택 시 해당 슬롯만 노출 (창고는 prev재고 있을 때만)
  //   · store{N}Zone 지정 → 해당 매장만 표시 · 창고는 prevW1/W2 > 0 or addQty 있을 때만
  //   · 완전 미지정 → 5슬롯 모두 (신규 편집 UX 유지)
  //   · [+ 매장 추가] 버튼: zone 미지정 상품 + 아직 표시 안 된 매장 있을 때만
  const slotVis = useMemo(() => {
    const hasS1Zone = !!(row.store1Zone && String(row.store1Zone).trim());
    const hasS2Zone = !!(row.store2Zone && String(row.store2Zone).trim());
    const hasS3Zone = !!(row.store3Zone && String(row.store3Zone).trim());
    const hasAnyZone = hasS1Zone || hasS2Zone || hasS3Zone;

    const hasW1 = (row.prevWarehouse1Qty ?? 0) > 0 || (row.warehouse1AddQty !== "" && Number(row.warehouse1AddQty) !== 0);
    const hasW2 = (row.prevWarehouse2Qty ?? 0) > 0 || (row.warehouse2AddQty !== "" && Number(row.warehouse2AddQty) !== 0);
    const hasPrevS1 = (row.prevStore1Qty ?? 0) > 0;
    const hasPrevS2 = (row.prevStore2Qty ?? 0) > 0;
    const hasPrevS3 = (row.prevStore3Qty ?? 0) > 0;

    const hasS1 = hasS1Zone || hasPrevS1;
    const hasS2 = hasS2Zone || hasPrevS2;
    const hasS3 = hasS3Zone || hasPrevS3;

    const anyAssigned = hasAnyZone || hasW1 || hasW2 || hasPrevS1 || hasPrevS2 || hasPrevS3;

    return { hasAnyZone, hasW1, hasW2, hasS1, hasS2, hasS3, anyAssigned };
  }, [
    row.store1Zone, row.store2Zone, row.store3Zone,
    row.prevWarehouse1Qty, row.prevWarehouse2Qty,
    row.warehouse1AddQty, row.warehouse2AddQty,
    row.prevStore1Qty, row.prevStore2Qty, row.prevStore3Qty,
  ]);

  // [+ 매장 추가] · zone 미지정 상품에서만 사용 (zone 있으면 해당 슬롯만 고정 표시)
  const initialStoreCount = useMemo(() => {
    if (slotVis.hasS3) return 3;
    if (slotVis.hasS2) return 2;
    return 1;
  }, [slotVis.hasS2, slotVis.hasS3]);
  const [storeCount, setStoreCount] = useState<number>(initialStoreCount);
  useEffect(() => {
    setStoreCount(prev => Math.max(prev, initialStoreCount));
  }, [initialStoreCount]);
  const visibleStoreCount = Math.min(3, Math.max(1, storeCount));

  const visibleSlots = useMemo(() => {
    const { anyAssigned, hasAnyZone, hasS1, hasS2, hasS3 } = slotVis;
    // 2026-09-03 · #74 · 사용자 지시 · '해당 창고만 표시' · 배타적 필터
    //   · 상품 location · 창고1 zone (24·25·26·27·7B·8A) → showW1=true, showW2=false
    //   · 창고2 zone → showW2=true, showW1=false
    //   · location null · 미지정 → 둘 다 표시 (사용자가 선택)
    //   · 매장 슬롯 · zone 지정 or 재고 있으면 표시
    if (!anyAssigned) {
      return SLOTS.filter(s => {
        if (s.key === "w1") return showW1;
        if (s.key === "w2") return showW2;
        return true; // 매장은 모두 표시 (미지정 시)
      });
    }
    return SLOTS.filter(s => {
      if (s.key === "w1") return showW1;
      if (s.key === "w2") return showW2;
      if (s.key === "s1") return hasAnyZone ? hasS1 : visibleStoreCount >= 1;
      if (s.key === "s2") return hasAnyZone ? (hasS2 || visibleStoreCount >= 2) : visibleStoreCount >= 2;
      if (s.key === "s3") return hasAnyZone ? (hasS3 || visibleStoreCount >= 3) : visibleStoreCount >= 3;
      return true;
    });
  }, [slotVis, showW1, showW2, visibleStoreCount]);

  // [+ 매장 추가] · zone 여부 관계 없이 3개 미만이면 표시
  const canAddStore = visibleStoreCount < 3;

  return (
    <div
      className={[
        "group relative bg-white rounded-2xl border transition-all duration-200",
        "shadow-[0_1px_2px_rgba(10,46,74,0.04),0_1px_3px_rgba(10,46,74,0.03)]",
        "hover:shadow-[0_2px_6px_rgba(10,46,74,0.06),0_4px_12px_-2px_rgba(10,46,74,0.04)]",
        // 2026-08-25 · 유통기한임박 표시 (사용자 지시 · 빨갛게)
        hasExpiryFlag
          ? "border-red-300 bg-red-50/40 shadow-[0_0_0_2px_rgba(239,68,68,0.10)]"
          : isRecent
            ? "border-brand-deep/40 shadow-[0_0_0_3px_rgba(10,46,74,0.06),0_1px_3px_rgba(10,46,74,0.05)]"
            : isWarn
              ? "border-amber-200"
              : "border-line/70",
      ].join(" ")}
    >
      {/* ─── 헤더 · 탭하면 접힘 토글 */}
      <div className="w-full flex items-start gap-3 px-4 py-3">
        {/* 좌측 · 상품명 · 코드 · 현재고/추가/합계 요약 */}
        <button
          type="button"
          onClick={() => setManuallyExpanded(v => !v)}
          className="flex-1 min-w-0 flex flex-col gap-1 text-left cursor-pointer"
        >
          {/* Row 1: 상품명 + 배지 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="text-[16px] font-bold text-ink tracking-tight leading-snug break-keep">
              {row.product.name}
            </h4>
            {isWarn && <StatusPill tone="amber" size="xs">이상값</StatusPill>}
            {hasExpiryFlag && <StatusPill tone="rose" size="xs">유통기한 임박</StatusPill>}
          </div>
          {/* Row 2: spec + code */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(row.product as any).spec && (
              <span className="inline-flex items-center gap-1 text-[14px] font-semibold
                text-zinc-500 bg-zinc-100/70 rounded px-1.5 py-0.5">
                <Box size={9} className="text-zinc-400" />
                {(row.product as any).spec}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[14px] font-mono
              text-zinc-400 bg-zinc-100/60 rounded px-1.5 py-0.5">
              <Hash size={9} className="text-zinc-300" />
              {row.code}
            </span>
          </div>
          {/* Row 3: ERP현재고 · 실재고 · 손실 */}
          {(() => {
            const erpQty = Number((row.product as any).current_stock ?? 0);
            const actualQty = totalAdded; // 이번 세션 입력한 실재고 합계
            const hasActual = actualQty > 0;
            const lossQty = erpQty - actualQty;
            return (
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="inline-flex flex-col items-center leading-none bg-zinc-100/80 rounded-lg px-2.5 py-1.5 min-w-[46px]">
                  <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">ERP</span>
                  <span className={`text-[20px] font-extrabold tabular-nums mt-0.5 leading-none ${erpQty > 0 ? "text-zinc-700" : "text-zinc-300"}`}>
                    {erpQty}
                  </span>
                </span>
                <span className="text-zinc-300 text-[15px] font-light">vs</span>
                <span className="inline-flex flex-col items-center leading-none bg-sky-50 border border-sky-200/70 rounded-lg px-2.5 py-1.5 min-w-[46px]">
                  <span className="text-[11px] font-bold text-sky-600 uppercase tracking-wide">실재고</span>
                  <span className={`text-[20px] font-extrabold tabular-nums mt-0.5 leading-none ${actualQty > 0 ? "text-sky-700" : "text-zinc-300"}`}>
                    {actualQty > 0 ? actualQty : "-"}
                  </span>
                </span>
                {hasActual && (
                  <>
                    <span className="text-zinc-300 text-[15px] font-light">=</span>
                    <span className={`inline-flex flex-col items-center leading-none rounded-lg px-2.5 py-1.5 min-w-[46px] border ${
                      lossQty < 0 ? "bg-rose-50 border-rose-200/70" : lossQty > 0 ? "bg-amber-50 border-amber-200/70" : "bg-emerald-50 border-emerald-200/70"
                    }`}>
                      <span className={`text-[11px] font-bold uppercase tracking-wide ${lossQty < 0 ? "text-rose-600" : lossQty > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                        {lossQty < 0 ? "손실" : lossQty > 0 ? "이상" : "일치"}
                      </span>
                      <span className={`text-[20px] font-extrabold tabular-nums mt-0.5 leading-none ${lossQty < 0 ? "text-rose-600" : lossQty > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                        {lossQty > 0 ? `+${lossQty}` : lossQty}
                      </span>
                    </span>
                  </>
                )}
              </div>
            );
          })()}
          {/* chip strip · 접힘 시만 · 5-way 실재고 요약 */}
          {!expanded && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {visibleSlots.map(s => {
                const add = row[s.addKey] as number | "";
                const hasVal = add !== "" && Number(add) > 0;
                return (
                  <span
                    key={s.key}
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 border ${
                      hasVal ? `${s.softBg} border-transparent` : "bg-transparent border-line/60"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${hasVal ? "" : "opacity-40"}`} />
                    <span className={`text-[14px] font-semibold ${hasVal ? s.text : "text-zinc-400"}`}>{s.label}</span>
                    <span className={`text-[13px] font-bold tabular-nums ${hasVal ? "text-ink" : "text-zinc-300"}`}>
                      {add !== "" ? Number(add) : "-"}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </button>

        {/* 우측 · 유통기한임박 버튼 + chevron */}
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {onToggleExpiry && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleExpiry(row); }}
              className={[
                "inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[13px] font-bold cursor-pointer transition",
                hasExpiryFlag
                  ? "bg-red-500 text-white hover:bg-red-600 shadow-sm"
                  : "bg-white text-zinc-500 border border-line hover:bg-red-50 hover:border-red-300 hover:text-red-600",
              ].join(" ")}
              title={hasExpiryFlag ? "유통기한 임박 해제" : "유통기한 임박 표시"}
            >
              <ClockIcon size={11} />
              {hasExpiryFlag ? "임박해제" : "임박"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setManuallyExpanded(v => !v)}
            className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-zinc-100 text-ink-soft group-hover:text-brand-deep transition-colors cursor-pointer"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* ─── 확장 · 5-slot editor + 액션
            2026-08-25 · 사용자 지시 · 창고 2개 위 · 매장 3개 아래 · grid 배치
            · 창고 · 2-col grid (cyan 톤 공유)
            · 매장 · 3-col grid (violet 톤 공유)
            · 컴팩트 셀 · label + prev + stepper + zone (매장만) 세로 스택
       */}
      {expanded && (() => {
        // 2026-08-26 · 창고 · 매장 모두 visibleSlots 사용 (해당 상품 · 필요한 것만)
        const warehouses = visibleSlots.filter(s => !s.zoneKey);
        const stores = visibleSlots.filter(s => !!s.zoneKey);

        // 2026-09-01 · #92 · 구역 선택 → 자동 슬롯 배정 핸들러 (신규·완전 미지정 상품 전용)
        //   · classifyArrivalSlot 으로 창고1/창고2/매장 판정
        //   · w1/w2 → 해당 창고에 구역 저장 (w1zone/w2zone 미존재 · StockRow 에 없음 → 무시)
        //   · s1/s2/s3 → store1Zone/store2Zone/store3Zone 순차 자동 배정
        //   · 이미 배정된 슬롯 있으면 스킵
        const handleAutoZoneAssign = (locationCode: string) => {
          const slot = classifyArrivalSlot(locationCode);
          if (!slot) return;
          const patch: Partial<StockRow> = {};
          if (slot === "s1" && !row.store1Zone) {
            patch.store1Zone = locationCode;
          } else if (slot === "s2" && !row.store2Zone) {
            patch.store2Zone = locationCode;
          } else if (slot === "s3" && !row.store3Zone) {
            patch.store3Zone = locationCode;
          } else if ((slot === "w1" || slot === "w2") && !row.store1Zone) {
            // 창고 코드 → 매장1에 붙이기 (창고 zone 은 product.location 기준 · 여기선 store 슬롯 제어)
            patch.store1Zone = locationCode;
          }
          if (Object.keys(patch).length > 0) onPatch(row.key, patch);
        };
        const renderSlot = (s: typeof SLOTS[number], i: number, isStore: boolean) => {
          const prev = row[s.prevKey] as number | null | undefined;
          const add  = row[s.addKey]  as number | "";
          const hasAddVal = add !== "" && Number(add) !== 0;
          const spec = s.zoneKey ? (specParts[i] ?? "") : "";
          const canClearSlot = isStore && (hasAddVal || (s.zoneKey && !!row[s.zoneKey as keyof StockRow]));
          const clearSlot = () => {
            const patch: Partial<StockRow> = { [s.addKey]: "" as any };
            if (s.zoneKey) (patch as any)[s.zoneKey] = null;
            onPatch(row.key, patch);
          };
          // 창고 슬롯 zone key
          const warehouseZoneKey = s.key === "w1" ? "warehouse1Zone" : s.key === "w2" ? "warehouse2Zone" : null;
          const currentZone = warehouseZoneKey
            ? (row[warehouseZoneKey as keyof StockRow] as string | null)
            : (s.zoneKey ? (row[s.zoneKey as keyof StockRow] as string | null) : null);

          return (
            <div key={s.key} className={`relative rounded-lg border ${s.softBg} border-zinc-200/70 p-2.5 flex flex-col gap-2`}>
              {canClearSlot && (
                <button
                  type="button"
                  onClick={clearSlot}
                  className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-white/90 border border-zinc-300 hover:bg-rose-500 hover:border-rose-600 hover:text-white text-zinc-500 transition cursor-pointer shadow-sm"
                  title="입력값·구역 초기화"
                  aria-label="슬롯 초기화"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
              {/* 슬롯 헤더: 위치명 */}
              <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
                <span className={`w-1.5 h-6 rounded-full ${s.dot} shrink-0 self-center`} />
                <span className={`text-[16px] font-bold ${s.text} truncate`}>{s.full}</span>
                {prev != null && prev !== (add !== "" ? Number(add) : prev) && (
                  <span className="text-[13px] text-zinc-400 tabular-nums">이전 {prev}</span>
                )}
              </div>
              {/* 구역 선택 (창고 + 매장 공통) · 옆에 상세구역 표시 · 2026-09-09 · 사용자 지시 */}
              {warehouseZoneKey ? (
                <ZoneInline
                  value={currentZone}
                  onChange={v => onPatch(row.key, { [warehouseZoneKey]: v } as Partial<StockRow>)}
                />
              ) : (s.zoneKey && (
                <ZoneInline
                  value={currentZone}
                  onChange={v => onPatch(row.key, { [s.zoneKey!]: v } as Partial<StockRow>)}
                  erpSpec={spec || undefined}
                />
              ))}
              {(() => {
                const shelfMap = (row.product as { shelf_positions?: Record<string, string | null> } | undefined)?.shelf_positions;
                const detail = shelfMap?.[s.shelfCode];
                if (!detail || String(detail).trim() === "") return null;
                // 2026-09-09 · 사용자 지시 · 매장구역 pill 톤과 통일 · 슬롯별 색상 (매장=indigo · 창고=cyan)
                const isStore = s.key.startsWith("s");
                const toneCls = isStore
                  ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                  : "bg-cyan-50 border-cyan-200 text-cyan-700";
                const subCls  = isStore ? "text-indigo-500" : "text-cyan-500";
                return (
                  <span
                    className={`inline-flex items-center gap-1 h-9 rounded-full px-2.5 border-2 text-[14px] font-bold tabular-nums tracking-tight ${toneCls}`}
                    title={`${s.full} 상세구역 · ${detail}`}
                  >
                    <span className={`text-[11px] font-semibold uppercase tracking-wide ${subCls}`}>상세</span>
                    {detail}
                  </span>
                );
              })()}
              <div className="flex items-center gap-1.5">
                <StepperInput
                  value={add}
                  onChange={v => onPatch(row.key, { [s.addKey]: v } as Partial<StockRow>)}
                  placeholder="실재고 수량"
                />
              </div>
            </div>
          );
        };
        const w1Slot = visibleSlots.find(s => s.key === "w1");
        const w2Slot = visibleSlots.find(s => s.key === "w2");
        const s1Slot = visibleSlots.find(s => s.key === "s1");
        const s2Slot = visibleSlots.find(s => s.key === "s2");
        const s3Slot = visibleSlots.find(s => s.key === "s3");
        const STORE_IDX: Record<string, number> = { s1: 0, s2: 1, s3: 2 };
        return (
          <div className="border-t border-line/60 px-4 py-3 flex flex-col gap-2.5">
            {/* 완전 미지정 신규 상품 · 구역 먼저 선택 → 자동 슬롯 배정 */}
            {!slotVis.anyAssigned && (
              <AutoZonePicker onAssign={handleAutoZoneAssign} />
            )}
            {/* Row 1 · 창고(1 혹은 2) + 매장1 나란히 · w1 없으면 w2가 Row 1 왼쪽 */}
            <div className="grid grid-cols-2 gap-2">
              {w1Slot
                ? renderSlot(w1Slot, 0, false)
                : w2Slot
                  ? renderSlot(w2Slot, 1, false)
                  : <div />}
              {s1Slot ? renderSlot(s1Slot, STORE_IDX["s1"], true) : <div />}
            </div>
            {/* Row 2 · 매장2 + 매장3 (있을 때만 · 항상 2칸으로 매장1과 너비 동일) */}
            {(s2Slot || s3Slot) && (
              <div className="grid grid-cols-2 gap-2">
                {s2Slot ? renderSlot(s2Slot, STORE_IDX["s2"], true) : <div />}
                {s3Slot ? renderSlot(s3Slot, STORE_IDX["s3"], true) : null}
              </div>
            )}
            {canAddStore && (
              <button
                type="button"
                onClick={() => setStoreCount(c => Math.min(3, c + 1))}
                className="inline-flex items-center gap-1.5 self-start h-8 px-3 rounded-lg text-[14px] font-bold text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 hover:border-violet-300 transition cursor-pointer active:scale-95"
                title={`매장${visibleStoreCount + 1} 추가`}
              >
                + 매장 추가 ({visibleStoreCount}/3)
              </button>
            )}
            {/* Row 3 · 창고2 · w1과 w2 둘 다 있을 때만 별도 행 */}
            {w1Slot && w2Slot && (
              <div className="grid grid-cols-1">
                {renderSlot(w2Slot, 1, false)}
              </div>
            )}

          {/* 액션 · 개별 [저장] 버튼 + StockActionsCell */}
          <div className="mt-1 pt-2 border-t border-line/50 flex items-center justify-between gap-2 flex-wrap">
            {onSaveRow ? (
              <button
                type="button"
                onClick={handleSaveClick}
                disabled={saving || !hasAdd}
                className={[
                  "inline-flex items-center gap-1 h-8 px-3 rounded-lg text-[14px] font-bold cursor-pointer transition",
                  saving
                    ? "bg-zinc-100 text-zinc-400 cursor-wait"
                    : savedThisSession
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                      : hasAdd
                        ? "bg-brand-deep text-white hover:bg-[#0d3a5c] active:bg-[#08253a] shadow-sm"
                        : "bg-zinc-100 text-zinc-400 cursor-not-allowed",
                ].join(" ")}
                title={hasAdd ? (savedThisSession ? "저장됨 · 다시 저장 (덮어쓰기)" : "이 행만 저장") : "입력값이 있어야 저장 가능"}
                aria-label={savedThisSession ? "다시 저장" : "이 행만 저장"}
              >
                {saving ? "저장 중..." : savedThisSession ? "✓ 저장됨" : "저장"}
              </button>
            ) : <span />}
            <StockActionsCell
              row={row}
              requestingKey={requestingKey}
              onHistory={onHistory}
              onRequestDisplay={onRequestDisplay}
              onRemove={onRemove}
            />
          </div>
        </div>
        );
      })()}
    </div>
  );
});
StockRowCard.displayName = "StockRowCard";
