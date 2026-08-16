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

/** 배지 스타일 · tone 별 · settingsTypography SET_BADGE 호환 */
export function toastClass(tone: ToastTone): string {
  const base = "inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full border";
  switch (tone) {
    case "success": return `${base} text-emerald-600 bg-emerald-50 border-emerald-200`;
    case "error":   return `${base} text-rose-600 bg-rose-50 border-rose-200`;
    case "warn":    return `${base} text-amber-600 bg-amber-50 border-amber-200`;
    default:        return `${base} text-indigo-600 bg-indigo-50 border-indigo-200`;
  }
}
