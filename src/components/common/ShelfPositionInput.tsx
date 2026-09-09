// src/components/common/ShelfPositionInput.tsx
// 2026-09-08 · 진열장 안 상세위치 입력 (층·칸·순서 3자리)
//   · C안 · 3-stepper (버튼 없이 · +/- 버튼 · 값 표시 · 키보드 입력도 허용)
//   · 값 형식 · 3자리 문자열 "332" · 각 자리 · 0~9 or A~Z
//   · null → "미입력" 배지 · required=true 인데 빈 값 → 붉은 강조
//   · 사용처 · 상품편집 모달 · 실재고 저장 UI · 관리자 화면
// 2026-09-08 · 실시간 중복 검증 · productCode·displayLocation·storageKey 지정 시 · debounce 500ms · 서버 조회 · 중복이면 붉은 경고
//
// 사용 예:
//   <ShelfPositionInput value={"332"} onChange={setV} required label="매장1" />
//   <ShelfPositionInput
//     value={"332"} onChange={setV} required label="매장1"
//     productCode="8806..." displayLocation="1A" storageKey="store1"
//   />

import React, { useMemo, useEffect, useState } from "react";
import { Minus, Plus, AlertTriangle } from "lucide-react";
import { api } from "../../lib/apiClient";

export interface ShelfPositionInputProps {
  value: string | null | undefined;   // 3자리 or null (미입력)
  onChange: (next: string | null) => void;
  label?: React.ReactNode;             // "매장1" 등 · 상단 라벨
  required?: boolean;                  // true · 미입력 시 빨간 강조
  disabled?: boolean;
  compact?: boolean;                   // true · 인라인 (리스트 내부 등)
  className?: string;
  // 2026-09-08 · 실시간 중복 검증 · 3개 다 있으면 활성
  productCode?: string;                // 자기 자신 제외용
  displayLocation?: string | null;     // 진열구역 · 유일성 판정 기준
  storageKey?: string;                 // shelf_positions key · store1·warehouse1 등
}

interface ConflictInfo {
  conflict: boolean;
  product_code?: string;
  product_name?: string;
}

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function normalizeDigit(v: string): string {
  const c = v.trim().toUpperCase();
  return CHARSET.includes(c) ? c : "1";
}

function bumpDigit(cur: string, delta: 1 | -1): string {
  const idx = CHARSET.indexOf(cur);
  const next = (idx + delta + CHARSET.length) % CHARSET.length;
  return CHARSET[next];
}

function splitValue(v: string | null | undefined): [string, string, string] {
  if (!v || v.length !== 3) return ["1", "1", "1"];
  return [normalizeDigit(v[0]), normalizeDigit(v[1]), normalizeDigit(v[2])];
}

const STEPPER_LABELS = ["층", "칸", "순서"] as const;

export const ShelfPositionInput: React.FC<ShelfPositionInputProps> = ({
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  compact = false,
  className = "",
  productCode,
  displayLocation,
  storageKey,
}) => {
  const isEmpty = !value || value.length !== 3;
  const [d0, d1, d2] = useMemo(() => splitValue(value), [value]);
  const digits = [d0, d1, d2];

  // 2026-09-08 · 실시간 중복 검증 · 조건 갖춰지면 debounce 500ms 서버 조회
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const canCheck = !!(productCode && displayLocation && storageKey && !isEmpty);
  useEffect(() => {
    if (!canCheck) { setConflict(null); return; }
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        display_location: String(displayLocation),
        key: String(storageKey),
        value: String(value),
        exclude: String(productCode),
      });
      api.get<ConflictInfo>(`/api/inventory-checks/shelf-conflict?${params.toString()}`)
        .then(res => { if (!cancelled) setConflict(res.data ?? { conflict: false }); })
        .catch(() => { if (!cancelled) setConflict(null); })
        .finally(() => { if (!cancelled) setChecking(false); });
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); setChecking(false); };
  }, [canCheck, displayLocation, storageKey, value, productCode]);
  const hasConflict = !!conflict?.conflict;

  const commit = (arr: string[]) => {
    const joined = arr.join("");
    onChange(joined);
  };
  const setDigit = (i: number, next: string) => {
    if (disabled) return;
    const arr = [...digits];
    arr[i] = normalizeDigit(next);
    commit(arr);
  };
  const bump = (i: number, delta: 1 | -1) => {
    if (disabled) return;
    // 미입력 상태에서 처음 버튼 누르면 · "111" 로 초기화 후 · 해당 자리부터 이동
    const base = isEmpty ? ["1", "1", "1"] : [...digits];
    base[i] = bumpDigit(base[i], delta);
    commit(base);
  };
  const clear = () => {
    if (disabled) return;
    onChange(null);
  };

  const missingRequired = required && isEmpty;

  const containerCls = [
    "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 bg-white",
    hasConflict
      ? "border-rose-400 ring-2 ring-rose-200"
      : missingRequired ? "border-rose-300 ring-1 ring-rose-100" : "border-zinc-200",
    disabled ? "opacity-60 cursor-not-allowed" : "",
    className,
  ].join(" ");

  const conflictHint = hasConflict && conflict?.product_name ? (
    <div className="mt-1 flex items-center gap-1 text-[11px] text-rose-600 font-semibold">
      <AlertTriangle size={11} className="shrink-0" />
      <span>이미 사용 중 · {conflict.product_name} (#{conflict.product_code})</span>
    </div>
  ) : null;
  const checkingHint = checking && canCheck && !hasConflict ? (
    <span className="text-[10px] text-zinc-400 ml-1">검사중...</span>
  ) : null;

  if (compact) {
    // 인라인 리드-온리 뱃지 형태 · 편집 X · 표시 전용은 formatShelfPositions 헬퍼 사용 · 여기선 편집 컴팩트
    return (
      <div className="inline-flex flex-col">
        <div className={containerCls}>
          {label && <span className="text-[12px] font-bold text-ink-soft mr-1">{label}</span>}
          {digits.map((d, i) => (
            <DigitStepper
              key={i}
              slotLabel={STEPPER_LABELS[i]}
              value={isEmpty ? "" : d}
              onUp={() => bump(i, +1)}
              onDown={() => bump(i, -1)}
              onType={(v) => setDigit(i, v)}
              disabled={disabled}
              compact
            />
          ))}
          {checkingHint}
          {!isEmpty && !required && (
            <button
              type="button"
              onClick={clear}
              className="text-[11px] text-ink-soft hover:text-rose-500 ml-1"
              title="지우기"
            >지우기</button>
          )}
        </div>
        {conflictHint}
      </div>
    );
  }

  return (
    <div className={className}>
      {label && (
        <div className="text-[13px] font-bold text-ink-soft mb-1 flex items-center gap-1">
          <span>{label}</span>
          {required && <span className="text-rose-500">*</span>}
          {missingRequired && <span className="ml-1 text-[11px] text-rose-500">위치입력 필요</span>}
        </div>
      )}
      <div className={containerCls}>
        {digits.map((d, i) => (
          <DigitStepper
            key={i}
            slotLabel={STEPPER_LABELS[i]}
            value={isEmpty ? "" : d}
            onUp={() => bump(i, +1)}
            onDown={() => bump(i, -1)}
            onType={(v) => setDigit(i, v)}
            disabled={disabled}
          />
        ))}
        {checkingHint}
        {!isEmpty && !required && (
          <button
            type="button"
            onClick={clear}
            className="text-[12px] text-ink-soft hover:text-rose-500 ml-1 px-1"
            title="지우기"
          >지우기</button>
        )}
      </div>
      {conflictHint}
    </div>
  );
};

interface DigitStepperProps {
  slotLabel: string;
  value: string;
  onUp: () => void;
  onDown: () => void;
  onType: (v: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

const DigitStepper: React.FC<DigitStepperProps> = ({ slotLabel, value, onUp, onDown, onType, disabled, compact }) => {
  const sizeCls = compact ? "w-6 h-6 text-[13px]" : "w-8 h-8 text-[15px]";
  return (
    <div className="flex flex-col items-center gap-0.5">
      {!compact && <span className="text-[10px] text-ink-soft leading-none">{slotLabel}</span>}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onDown}
          disabled={disabled}
          className={`${compact ? "w-5 h-5" : "w-6 h-6"} rounded-md bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-ink-soft disabled:opacity-50`}
          title={`${slotLabel} -`}
        ><Minus size={compact ? 10 : 12} /></button>
        <input
          lang="ko" type="text"
          value={value}
          maxLength={1}
          onChange={(e) => {
            const v = e.target.value.slice(-1);
            if (v) onType(v);
          }}
          disabled={disabled}
          className={`${sizeCls} text-center font-bold tabular-nums rounded-md border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-tint`}
          placeholder="-"
          aria-label={slotLabel}
        />
        <button
          type="button"
          onClick={onUp}
          disabled={disabled}
          className={`${compact ? "w-5 h-5" : "w-6 h-6"} rounded-md bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-ink-soft disabled:opacity-50`}
          title={`${slotLabel} +`}
        ><Plus size={compact ? 10 : 12} /></button>
      </div>
    </div>
  );
};

export default ShelfPositionInput;
