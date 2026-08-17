// 2026-08-16 · 프레임워크 · Toast 상태 + 타임아웃 통일
// 사용:
//   const { toast, show } = useToast();
//   show("저장되었습니다"); show("실패", 4000, "error");
//   {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}
import { useCallback, useEffect, useRef, useState } from "react";

export type ToastTone = "info" | "success" | "error" | "warn";
export interface Toast { message: string; tone: ToastTone }

export function useToast(defaultMs = 2500) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setToast(null);
  }, []);

  const show = useCallback((message: string, ms?: number, tone: ToastTone = "info") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, tone });
    timerRef.current = setTimeout(() => setToast(null), ms ?? defaultMs);
  }, [defaultMs]);

  // 편의 · tone 프리셋
  const showSuccess = useCallback((message: string, ms?: number) => show(message, ms, "success"), [show]);
  const showError = useCallback((message: string, ms?: number) => show(message, ms ?? 4000, "error"), [show]);
  const showWarn = useCallback((message: string, ms?: number) => show(message, ms ?? 3500, "warn"), [show]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { toast, show, showSuccess, showError, showWarn, clear };
}

/**
 * 배지 스타일 · tone 별 · 2026-08-17 v2 · 세련 (폰트 +2 · shadow 강화 · 딥네이비 액센트)
 *   · text-[13px] · py-1.5 (폰트 +2 규칙 · 40대+ 가독성)
 *   · shadow · 즉시 + 원거리 (Attio/Linear 톤)
 *   · Linear-style · rounded-xl (rounded-full 대신 · 뉴모피즘 지양)
 */
export function toastClass(tone: ToastTone): string {
  const base = "inline-flex items-center gap-1.5 text-[13px] font-bold px-3 py-1.5 rounded-xl border shadow-[0_2px_8px_-2px_rgba(10,46,74,0.15),0_8px_24px_-8px_rgba(10,46,74,0.20)]";
  switch (tone) {
    case "success": return `${base} text-emerald-700 bg-emerald-50 border-emerald-200`;
    case "error":   return `${base} text-rose-700 bg-rose-50 border-rose-200`;
    case "warn":    return `${base} text-amber-700 bg-amber-50 border-amber-200`;
    default:        return `${base} text-brand-deep bg-brand-tint border-brand/15`;
  }
}
