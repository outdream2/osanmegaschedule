// src/components/common/ShelfPositionsEditModal.tsx
// 2026-09-09 · #15 · 상세구역 편집 모달 · 사용자 지시
//   · 좌측 · 예시 그림 (선반 층·칸·순서 시각화)
//   · 우측 · 표 형태 · [위치] [구역] [층] [칸] [순서] 헤더
//   · 저장 · PATCH /api/products/:code/shelf-positions · atomic replace
//   · invalidateShelfPositionsMap + inventory-checks-updated dispatch

import React, { useEffect, useMemo, useState } from "react";
import { X, Minus, Plus } from "lucide-react";
import { api } from "../../lib/apiClient";
import { useStorageLocations } from "../../hooks/useStorageLocations";
import { invalidateShelfPositionsMap } from "../../hooks/useShelfPositionsMap";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import { useToast, toastClass } from "../../hooks/useToast";
import type { ShelfPositions } from "../../lib/shelfPositions";

export interface ShelfPositionsEditModalProps {
  productCode: string;
  productName?: string;
  displayLocation?: string | null;
  initial?: ShelfPositions | null;
  /** 2026-09-09 · 사용자 지시 · 매장 클릭 → 매장만 · 창고 클릭 → 창고만 · undefined 면 전체 */
  kindFilter?: "store" | "warehouse";
  /** 2026-09-09 · 사용자 지시 · 개별 위치 편집 · 예: "store1" → 매장1 하나만 표시 · locationCode 우선 */
  locationCode?: string;
  onClose: () => void;
  onSaved?: (next: ShelfPositions) => void;
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
  if (!v || v.length !== 3) return ["", "", ""];
  return [normalizeDigit(v[0]), normalizeDigit(v[1]), normalizeDigit(v[2])];
}

// 3자리 조합 · 하나라도 비어있으면 null
function joinDigits(digits: [string, string, string]): string | null {
  if (digits.some(d => !d)) return null;
  return digits.join("");
}

// ─── 좌측 예시 그림 · 선반 층·칸·순서 시각화 ────────────────────────
// 2026-09-09 · 사용자 지시 · 원점 = 왼쪽 맨 위 (1층 1칸)
//   · 층 · 맨 위부터 1 · 아래로 증가
//   · 칸 · 왼쪽부터 1 · 오른쪽으로 증가
//   · 순서 · 왼쪽에서 오른쪽으로 증가 (각 칸 안 · 앞→뒤)
const ShelfExampleDiagram: React.FC = () => (
  <div className="flex flex-col gap-3 p-4 bg-gradient-to-br from-brand-tint/40 to-white rounded-xl border border-brand-deep/10">
    <p className="text-[13px] font-bold text-brand-deep tracking-tight">
      3자리 = 층 · 칸 · 순서
    </p>
    <div className="flex flex-col gap-1.5">
      {/* 층·칸 시각화 · 맨 위 = 1층 · 아래로 증가 · 왼쪽 = 1칸 · 오른쪽으로 증가 */}
      <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">층 · 칸</span>
      {[1, 2, 3].map(floor => (
        <div key={floor} className="flex items-center gap-1.5">
          <span className="text-[14px] font-bold text-zinc-500 tabular-nums w-10 text-right shrink-0">
            {floor}층
          </span>
          <div className="flex-1 grid grid-cols-3 gap-1 border-2 border-b-4 border-zinc-300 rounded-md bg-white/60 p-1">
            {[1, 2, 3].map(col => (
              <div
                key={col}
                className={`h-9 rounded text-[13px] font-semibold text-zinc-500 flex items-center justify-center border border-dashed border-zinc-200 ${
                  floor === 1 && col === 1 ? "bg-indigo-100 border-indigo-400 text-indigo-700" : "bg-zinc-50/70"
                }`}
                title={floor === 1 && col === 1 ? "원점 · 1층 1칸 (예: 111)" : `${floor}층 ${col}칸`}
              >
                {col}칸
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>

    {/* 순서 시각화 · 한 칸 안 · 왼쪽 = 1순서 · 오른쪽으로 증가 (앞 → 뒤) */}
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">순서 · 한 칸 안</span>
      <div className="flex items-center gap-1.5">
        <span className="text-[14px] font-bold text-zinc-500 tabular-nums w-10 text-right shrink-0">
          앞→뒤
        </span>
        <div className="flex-1 flex items-center gap-1 border-2 border-zinc-300 rounded-md bg-white/60 p-1">
          {[1, 2, 3].map(seq => (
            <div
              key={seq}
              className={`flex-1 h-9 rounded text-[13px] font-semibold flex items-center justify-center border border-dashed ${
                seq === 1 ? "bg-indigo-100 border-indigo-400 text-indigo-700" : "bg-zinc-50/70 border-zinc-200 text-zinc-500"
              }`}
              title={seq === 1 ? "1순서 · 앞" : `${seq}순서`}
            >
              {seq}순서
            </div>
          ))}
        </div>
      </div>
    </div>
    <div className="flex flex-col gap-1 pt-2 border-t border-brand-deep/10">
      <p className="text-[12px] text-zinc-500 font-semibold">규칙</p>
      <ul className="text-[12px] text-zinc-700 leading-relaxed space-y-0.5 list-none">
        <li>· 층 · 맨 위 = <b>1층</b> · 아래로 증가</li>
        <li>· 칸 · 왼쪽 = <b>1칸</b> · 오른쪽으로 증가</li>
        <li>· 순서 · 왼쪽 = <b>1순서</b> · 오른쪽으로 증가 (앞→뒤)</li>
      </ul>
      <p className="text-[13px] text-zinc-700 leading-relaxed mt-1">
        <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold tabular-nums mr-1">1-1-1</span>
        · 원점 · <b>왼쪽 맨 위</b>
      </p>
      <p className="text-[12px] text-zinc-400">
        · 각 자리 · 0~9 · A~Z
      </p>
    </div>
  </div>
);

// ─── 큰 3자리 stepper · 라벨 + input + 버튼 · 반응형 · 2026-09-09 · 사용자 지시 ────
const BigDigitStepper: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBump: (delta: 1 | -1) => void;
  disabled?: boolean;
  tone: "store" | "warehouse";
}> = ({ label, value, onChange, onBump, disabled, tone }) => {
  const focusRing = tone === "store" ? "focus:ring-indigo-200 focus:border-indigo-500" : "focus:ring-cyan-200 focus:border-cyan-500";
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[13px] font-bold text-zinc-500 tracking-wide uppercase">{label}</span>
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => onBump(-1)}
          disabled={disabled}
          className="w-9 h-11 rounded-lg bg-white border-2 border-zinc-200 hover:bg-zinc-50 hover:border-zinc-400 flex items-center justify-center text-ink-soft disabled:opacity-50 cursor-pointer transition"
          title={`${label} 감소`}
          tabIndex={-1}
        >
          <Minus size={14} strokeWidth={2.5} />
        </button>
        <input
          lang="ko" type="text"
          value={value}
          maxLength={1}
          onChange={(e) => {
            const v = e.target.value.slice(-1);
            if (v === "") { onChange(""); return; }
            onChange(normalizeDigit(v));
          }}
          disabled={disabled}
          className={`w-12 h-11 text-center text-[22px] font-bold tabular-nums rounded-lg border-2 border-zinc-200 focus:outline-none focus:ring-2 transition ${focusRing}`}
          placeholder="-"
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => onBump(+1)}
          disabled={disabled}
          className="w-9 h-11 rounded-lg bg-white border-2 border-zinc-200 hover:bg-zinc-50 hover:border-zinc-400 flex items-center justify-center text-ink-soft disabled:opacity-50 cursor-pointer transition"
          title={`${label} 증가`}
          tabIndex={-1}
        >
          <Plus size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};

export const ShelfPositionsEditModal: React.FC<ShelfPositionsEditModalProps> = ({
  productCode, productName, displayLocation, initial, kindFilter, locationCode, onClose, onSaved,
}) => {
  const locations = useStorageLocations();
  // 우선순위: locationCode > kindFilter > 전체
  const activeLocs = useMemo(
    () => locations
      .filter(l => l.active)
      .filter(l => locationCode ? l.code === locationCode : (!kindFilter || l.kind === kindFilter))
      .sort((a, b) => a.sort_order - b.sort_order),
    [locations, kindFilter, locationCode],
  );
  // 각 위치별 · 3자리 digit 상태
  const [draft, setDraft] = useState<Record<string, [string, string, string]>>(() => {
    const seed: Record<string, [string, string, string]> = {};
    for (const loc of activeLocs) {
      seed[loc.code] = splitValue(initial?.[loc.code]);
    }
    return seed;
  });
  const [saving, setSaving] = useState(false);
  const { toast, showSuccess, showError } = useToast();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const setDigit = (code: string, idx: number, v: string) => {
    setDraft(prev => {
      const cur = prev[code] ?? ["", "", ""];
      const next: [string, string, string] = [...cur];
      next[idx] = v;
      return { ...prev, [code]: next };
    });
  };
  const bumpDigitAt = (code: string, idx: number, delta: 1 | -1) => {
    setDraft(prev => {
      const cur = prev[code] ?? ["", "", ""];
      const base = cur[idx] === "" ? "1" : cur[idx];
      const next: [string, string, string] = [...cur];
      next[idx] = bumpDigit(base, delta);
      // 다른 자리 비어있으면 · 1 로 채움 (사용자 편의)
      for (let i = 0; i < 3; i++) if (next[i] === "") next[i] = "1";
      return { ...prev, [code]: next };
    });
  };
  const clearRow = (code: string) => {
    setDraft(prev => ({ ...prev, [code]: ["", "", ""] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // kindFilter 있으면 · 편집한 kind 만 payload · 나머지는 initial 유지 (merge)
      const payload: ShelfPositions = { ...(initial ?? {}) };
      for (const loc of activeLocs) {
        const val = joinDigits(draft[loc.code] ?? ["", "", ""]);
        payload[loc.code] = val;
      }
      await api.patch(`/api/products/${encodeURIComponent(productCode)}/shelf-positions`, {
        shelf_positions: payload,
      });
      invalidateShelfPositionsMap();
      window.dispatchEvent(new CustomEvent("inventory-checks-updated"));
      showSuccess("상세구역 저장 완료");
      onSaved?.(payload);
      onClose();
    } catch (e: any) {
      console.error("[ShelfPositionsEditModal] save error", e);
      showError(e?.response?.data?.error?.message ?? e?.message ?? "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(10, 46, 74, 0.35)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      {toast && <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>}
      <div
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-line"
        style={{ boxShadow: "0 1px 3px rgba(10,46,74,0.12), 0 8px 32px -8px rgba(10,46,74,0.24)" }}
      >
        {/* 헤더 */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-line bg-zinc-50/60 shrink-0">
          <div className="w-1.5 rounded-full bg-brand-deep self-stretch" />
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-bold text-ink leading-tight tracking-tight">
              {activeLocs.length === 1 ? `${activeLocs[0].name} 상세구역 편집` : "상세구역 편집"}
            </div>
            {productName && (
              <div className="text-[13px] text-ink-soft mt-1 truncate">
                {productName}
                {displayLocation && <span className="ml-1.5 text-zinc-400">· {displayLocation}</span>}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-8 h-8 rounded-lg bg-white border border-line hover:border-brand-deep hover:bg-brand-tint flex items-center justify-center text-ink-soft hover:text-brand-deep cursor-pointer shrink-0 transition-colors disabled:opacity-40"
            title="닫기 (ESC)"
            aria-label="닫기"
          >
            <X size={14} />
          </button>
        </div>

        {/* 바디 · 좌측 예시 그림 + 우측 카드 리스트 · 반응형 (md 이하 stack) */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col md:flex-row gap-5">
            {/* 좌측 · 예시 그림 · md 이상만 사이드 · sm 은 상단 */}
            <div className="md:w-[240px] shrink-0">
              <ShelfExampleDiagram />
            </div>

            {/* 우측 · 위치별 카드 리스트 */}
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              {activeLocs.length === 0 && (
                <div className="text-[14px] text-ink-soft">활성화된 저장 위치가 없습니다</div>
              )}
              {activeLocs.map(loc => {
                const digits = draft[loc.code] ?? ["", "", ""];
                const empty = digits.every(d => !d);
                const missing = loc.required_detail && empty;
                const isStore = loc.kind === "store";
                const accentBg = isStore ? "bg-indigo-500" : "bg-cyan-500";
                const nameCls = isStore ? "text-indigo-700" : "text-cyan-700";
                const cardBg = isStore ? "bg-indigo-50/40" : "bg-cyan-50/40";
                const cardBorder = missing ? "border-rose-300" : isStore ? "border-indigo-200/70" : "border-cyan-200/70";
                return (
                  <div
                    key={loc.code}
                    className={`relative rounded-2xl border-2 ${cardBorder} ${cardBg} p-4 flex flex-col gap-4 transition`}
                  >
                    {/* 카드 상단 · 위치명 + 구역 + 지우기 */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2 h-8 rounded-full ${accentBg} shrink-0`} />
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className={`text-[20px] font-bold leading-none tracking-tight ${nameCls}`}>
                              {loc.name}
                            </span>
                            <span className="text-[12px] font-semibold text-zinc-400 uppercase tracking-wide">
                              {isStore ? "매장" : "창고"}
                              {loc.required_detail && <span className="text-rose-500 ml-1">*</span>}
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1.5 mt-1">
                            <span className="text-[12px] font-semibold text-zinc-400 uppercase">구역</span>
                            <span className="text-[15px] font-bold text-zinc-700 tabular-nums">
                              {displayLocation ?? "-"}
                            </span>
                          </div>
                        </div>
                      </div>
                      {!empty && (
                        <button
                          type="button"
                          onClick={() => clearRow(loc.code)}
                          disabled={saving}
                          className="text-[13px] text-zinc-400 hover:text-rose-500 font-medium disabled:opacity-40 shrink-0 h-8 px-2 rounded-md hover:bg-rose-50 transition"
                          title="지우기"
                        >
                          지우기
                        </button>
                      )}
                    </div>

                    {/* 카드 하단 · 층 · 칸 · 순서 stepper · flex-wrap 반응형 */}
                    <div className="flex items-end justify-center gap-3 sm:gap-5 flex-wrap pt-1 border-t border-white/50">
                      <BigDigitStepper
                        label="층"
                        value={digits[0]}
                        onChange={(v) => setDigit(loc.code, 0, v)}
                        onBump={(d) => bumpDigitAt(loc.code, 0, d)}
                        disabled={saving}
                        tone={loc.kind}
                      />
                      <div className="text-[24px] font-light text-zinc-300 self-center pb-3">-</div>
                      <BigDigitStepper
                        label="칸"
                        value={digits[1]}
                        onChange={(v) => setDigit(loc.code, 1, v)}
                        onBump={(d) => bumpDigitAt(loc.code, 1, d)}
                        disabled={saving}
                        tone={loc.kind}
                      />
                      <div className="text-[24px] font-light text-zinc-300 self-center pb-3">-</div>
                      <BigDigitStepper
                        label="순서"
                        value={digits[2]}
                        onChange={(v) => setDigit(loc.code, 2, v)}
                        onBump={(d) => bumpDigitAt(loc.code, 2, d)}
                        disabled={saving}
                        tone={loc.kind}
                      />
                    </div>

                    {missing && (
                      <p className="text-[12px] font-semibold text-rose-500 -mt-1">필수 · 층·칸·순서 입력 필요</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-line bg-zinc-50/60 shrink-0">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
            {saving ? <Spinner size={11} /> : null}
            저장
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ShelfPositionsEditModal;
