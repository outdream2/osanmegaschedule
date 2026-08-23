// ArrivalRowCard · 2026-08-18 · 상품입고 카드형 재설계
//   · 테이블 → 카드 리스트 (Linear/Attio/Notion 2026 톤)
//   · 상단: 공급사 + 입고시각 + 상품명 + 규격/코드
//   · 하단: 큰 수량 stepper + 3-state pill (일치/불일치/기한임박) + 삭제
//   · 상태별 좌측 accent stripe · 최근 sky ring · 부드러운 shadow

import React from "react";
import { Box, Hash, Building2, CheckCircle2, XCircle, Clock, Trash2 } from "lucide-react";
import type { ProductInfo } from "../../lib/productsCache";
import { StepperInput } from "../common/StepperInput";
import { Badge } from "../common/Badge";

export type ItemStatus = "pending" | "match" | "mismatch";

export interface ArrivalCardItem {
  key: string;
  code: string;
  product: ProductInfo | null;
  qty: number;
  status: ItemStatus;
  expiring: boolean;
  addedAt: number;
}

interface ArrivalRowCardProps {
  item: ArrivalCardItem;
  isRecent: boolean;
  onUpdateQty: (key: string, delta: number) => void;
  onSetQty: (key: string, qty: number) => void;
  onSetStatus: (key: string, status: ItemStatus) => void;
  onToggleExpiring: (key: string) => void;
  onRemove: (key: string) => void;
}

export const ArrivalRowCard: React.FC<ArrivalRowCardProps> = React.memo(({
  item, isRecent, onUpdateQty, onSetQty, onSetStatus, onToggleExpiring, onRemove,
}) => {
  const d = new Date(item.addedAt);
  const arrivedAt = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const isMatch    = item.status === "match";
  const isMismatch = item.status === "mismatch";
  const isPending  = item.status === "pending";

  // 좌측 accent stripe (상태 우선 · expiring 은 amber)
  const stripeCls =
    isMatch    ? "before:bg-emerald-400" :
    isMismatch ? "before:bg-rose-400"    :
    item.expiring ? "before:bg-amber-400" :
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

        {/* 액션 영역 · 수량 stepper + 3-state pill + 삭제 */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {/* 수량 Stepper · 2026-08-18 · 공용 StepperInput 프레임워크 */}
          <div className="w-[132px]">
            <StepperInput
              value={item.qty}
              onChange={(v) => onSetQty(item.key, v === "" ? 0 : v)}
              size="lg"
              decLabel="수량 감소"
              incLabel="수량 증가"
            />
          </div>

          {/* 3-state pill · 일치·불일치·유통기한 · segmented (h-11 통일) */}
          <div
            role="group"
            aria-label="일치 · 불일치 · 유통기한"
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
            {/* 기한임박 · 독립 toggle */}
            <button
              aria-pressed={item.expiring}
              onClick={() => onToggleExpiring(item.key)}
              title="유통기한임박 · 독립 토글"
              className={[
                "flex items-center justify-center gap-1 px-2.5 min-w-[68px] border-l border-line",
                "text-[13px] font-bold transition-all duration-150 cursor-pointer",
                item.expiring
                  ? "bg-amber-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                  : "text-zinc-500 hover:text-amber-700 hover:bg-white",
              ].join(" ")}
            >
              <Clock size={13} strokeWidth={item.expiring ? 2.5 : 2} />
              기한임박
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

        {/* pending 힌트 */}
        {isPending && !item.expiring && (
          <Badge tone="amber" size="xs" className="self-start">수량 확인 필요</Badge>
        )}
      </div>
    </div>
  );
});
ArrivalRowCard.displayName = "ArrivalRowCard";
