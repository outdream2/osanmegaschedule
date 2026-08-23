// src/components/PharmacistPage/PdfViewerModal.tsx
// 2026-08-03 · 약사 전용 PDF 뷰어 모달 (best-effort 스크린샷 방지)
//
// ── 기능 ──────────────────────────────────────────────────────────
//  · PDF 는 iframe 으로 렌더 (브라우저 내장 뷰어) · CORS 이슈 없음 (같은 도메인 upload/Supabase Public URL)
//  · PDF 아닌 파일 (이미지·Word 등) · 새 창 다운로드 안내
//  · 사용자명 + 접근 시각 워터마크 (pointer-events: none · 대각선 반복)
//
// ── 스크린샷 방지 (best-effort · 완벽 차단 불가능) ─────────────
//  1) contextmenu · copy · cut · dragstart 차단
//  2) keydown · PrintScreen · Ctrl/Cmd + P · Ctrl/Cmd + S · Ctrl/Cmd + C · Ctrl/Cmd + Shift + S
//  3) CSS · user-select: none · 이미지 · -webkit-user-drag: none
//  4) 워터마크 · pointer-events: none · 유출 시 계정 추적용
//
// ※ OS 레벨 스크린샷 (Win+Shift+S · macOS Cmd+Shift+3/4/5) 은 브라우저 JS 로 차단 불가.
//    Print Screen 은 clipboard 차단 정도만 가능 · alert 로 경고 표시.
// 2026-08-23 · Modal v3 재마이그레이션 · backdropIntensity="dark" + zIndex={9999}

import React, { useEffect, useMemo } from "react";
import { FileWarning, Download, ExternalLink } from "lucide-react";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";
import Modal from "../common/Modal";

interface PdfViewerModalProps {
  open: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
  mimeType?: string | null;
  /** 워터마크 · 유출 추적용 (사용자 이름) */
  watermarkText?: string;
}

/** 파일 확장자/MIME 기반 PDF 여부 판정 */
function isPdf(fileUrl: string, mimeType?: string | null): boolean {
  if (mimeType && /^application\/pdf$/i.test(mimeType)) return true;
  const cleanUrl = (fileUrl || "").split("?")[0].split("#")[0].toLowerCase();
  return cleanUrl.endsWith(".pdf");
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  open, onClose, fileUrl, fileName, mimeType, watermarkText,
}) => {
  const pdf = useMemo(() => isPdf(fileUrl, mimeType), [fileUrl, mimeType]);
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showWarn } = useToast();

  // 접근 시각 (모달 열림 시점 · 워터마크 표시)
  const openedAt = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 스크린샷·복사·인쇄 방지 (best-effort) ─────
  useEffect(() => {
    if (!open) return;

    const warn = () => {
      // 사용자 알림 · debounce (연속 호출 방지)
      const now = Date.now();
      const last = (warn as any)._last ?? 0;
      if (now - last < 1500) return;
      (warn as any)._last = now;
      try {
        showWarn("보안 정책 · 복사·인쇄·저장·스크린샷 · 금지\n(유출 시 워터마크로 추적됩니다)");
      } catch { /* noop */ }
    };

    const preventEvent = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      warn();
      return false;
    };

    const preventKey = (e: KeyboardEvent) => {
      const k = (e.key || "").toLowerCase();
      const meta = e.ctrlKey || e.metaKey;

      // PrintScreen (Windows) · 클립보드에 이미지 복사 방지 (직접 차단은 어렵지만 clipboard 클리어 시도)
      if (k === "printscreen") {
        try { navigator.clipboard?.writeText(""); } catch { /* noop */ }
        e.preventDefault();
        warn();
        return;
      }

      // Ctrl/Cmd + P · Ctrl/Cmd + S · Ctrl/Cmd + C · Ctrl/Cmd + X · Ctrl/Cmd + Shift + S (macOS 스크린샷 · JS 로 안 잡히지만 시도)
      if (meta && ["p", "s", "c", "x", "a"].includes(k)) {
        e.preventDefault();
        e.stopPropagation();
        warn();
        return;
      }
      if (meta && e.shiftKey && ["s", "3", "4", "5"].includes(k)) {
        e.preventDefault();
        warn();
        return;
      }
    };

    // capture: true · iframe 내부 이벤트 잡지 못하지만 최소한 부모 문서 레벨은 방지
    document.addEventListener("contextmenu", preventEvent, true);
    document.addEventListener("copy", preventEvent, true);
    document.addEventListener("cut", preventEvent, true);
    document.addEventListener("dragstart", preventEvent, true);
    document.addEventListener("keydown", preventKey, true);

    // body user-select 잠금 · 마운트 시에만 (해제 필수)
    const prevUserSelect = document.body.style.userSelect;
    const prevWebkitUserSelect = (document.body.style as any).webkitUserSelect;
    document.body.style.userSelect = "none";
    (document.body.style as any).webkitUserSelect = "none";

    return () => {
      document.removeEventListener("contextmenu", preventEvent, true);
      document.removeEventListener("copy", preventEvent, true);
      document.removeEventListener("cut", preventEvent, true);
      document.removeEventListener("dragstart", preventEvent, true);
      document.removeEventListener("keydown", preventKey, true);
      document.body.style.userSelect = prevUserSelect;
      (document.body.style as any).webkitUserSelect = prevWebkitUserSelect;
    };
  }, [open]);

  // iframe src · PDF 뷰어 UI 최소화 옵션 (툴바 · 인쇄·다운로드 버튼 숨김 시도 · 브라우저에 따라 무시될 수 있음)
  const pdfSrc = pdf
    ? `${fileUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`
    : "";

  const watermark = watermarkText || "약사 전용";

  // ── 헤더 title slot (보안 서브텍스트 포함) ─────
  const headerTitle = (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <FileWarning size={16} className="text-amber-400 shrink-0" />
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-white truncate">{fileName || "PDF 뷰어"}</div>
        <div className="text-[10px] text-zinc-400 font-semibold truncate">
          보안 뷰어 · 복사·인쇄·저장 · 스크린샷 금지 · {watermark} · {openedAt}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={headerTitle}
        backdropIntensity="dark"
        zIndex={9999}
        size="full"
        bodyPadding="none"
        className="!max-w-full h-[95vh] flex flex-col !bg-zinc-900 !rounded-none"
        closeOnEsc
        closeOnBackdrop={false}
        headerTint={false}
      >
        {/* ── 본문 (iframe or fallback) ────────── */}
        <div className="flex-1 min-h-0 relative h-full">
          {pdf ? (
            <iframe
              src={pdfSrc}
              title={fileName || "PDF 뷰어"}
              className="w-full h-full border-0 bg-white"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 text-amber-400 flex items-center justify-center">
                <FileWarning size={28} />
              </div>
              <div>
                <div className="text-lg font-bold text-white">PDF 이외 파일</div>
                <div className="text-sm text-zinc-300 font-semibold mt-1">
                  이 뷰어는 PDF 만 지원합니다.<br />
                  아래 버튼으로 새 창에서 열거나 다운로드하세요.
                </div>
                <div className="text-[11px] text-amber-400/80 font-semibold mt-3">
                  ※ 열람 시에도 보안 규정을 준수하세요 (복사·촬영 금지)
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-sm font-bold cursor-pointer transition"
                >
                  <ExternalLink size={14} /> 새 창에서 열기
                </a>
                <a
                  href={fileUrl}
                  download={fileName || undefined}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-bold cursor-pointer transition"
                >
                  <Download size={14} /> 다운로드
                </a>
              </div>
            </div>
          )}

          {/* ── 워터마크 오버레이 (pointer-events:none) ─────
                PDF 를 캡처하더라도 사용자·시각 정보가 화면에 남아 추적 가능 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden select-none"
            style={{ userSelect: "none" }}
          >
            <div
              className="absolute inset-0 opacity-[0.11] text-white font-bold tracking-widest"
              style={{
                transform: "rotate(-24deg) translate(-10%, -10%)",
                fontSize: 22,
                lineHeight: "180px",
                whiteSpace: "nowrap",
                textShadow: "0 0 6px rgba(0,0,0,0.6)",
              }}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="whitespace-nowrap">
                  {`${watermark} · ${openedAt}   `.repeat(10)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
      {/* 2026-08-21 · Framework Phase 3 · toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </>
  );
};

export default PdfViewerModal;
