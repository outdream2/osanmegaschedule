// src/hooks/useScanUnregisteredMode.ts
// 2026-08-23 · #197 · 스캔 미분류 상품 처리 방식 · 사용자 개인 선택
//   · "modal" (default · #179) · ScanPage 내 즉시 등록 모달
//   · "page"  (신규 · #197)   · 상품정보 페이지 (매장>매입>상품정보) 로 이동 후 자동 등록 모달
//   · localStorage · 개인 preference · 서버 KV 아님 (개인별)
// 소비처
//   · ScanPage · onOpenCreate branch
//   · MyPage or PermissionsPage (개인 설정) · 토글 UI

import { useCallback, useEffect, useState } from "react";

export type ScanUnregisteredMode = "modal" | "page";
export const SCAN_UNREGISTERED_MODE_KEY = "megatown_scan_unregistered_mode";
export const DEFAULT_SCAN_UNREGISTERED_MODE: ScanUnregisteredMode = "modal";

function readMode(): ScanUnregisteredMode {
  try {
    const raw = localStorage.getItem(SCAN_UNREGISTERED_MODE_KEY);
    if (raw === "page" || raw === "modal") return raw;
  } catch { /* noop */ }
  return DEFAULT_SCAN_UNREGISTERED_MODE;
}

function writeMode(mode: ScanUnregisteredMode): void {
  try { localStorage.setItem(SCAN_UNREGISTERED_MODE_KEY, mode); } catch { /* noop */ }
}

/**
 * 스캔 미분류 상품 처리 방식 · 개인 preference
 * (읽기 · 쓰기 · 이벤트 sync 지원)
 */
export function useScanUnregisteredMode(): {
  mode: ScanUnregisteredMode;
  setMode: (m: ScanUnregisteredMode) => void;
} {
  const [mode, setModeState] = useState<ScanUnregisteredMode>(() => readMode());

  const setMode = useCallback((m: ScanUnregisteredMode) => {
    setModeState(m);
    writeMode(m);
    try {
      window.dispatchEvent(new CustomEvent("scan-unregistered-mode-changed", { detail: m }));
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    const handler = () => setModeState(readMode());
    window.addEventListener("scan-unregistered-mode-changed", handler);
    window.addEventListener("storage", (e: StorageEvent) => {
      if (e.key === SCAN_UNREGISTERED_MODE_KEY) setModeState(readMode());
    });
    return () => {
      window.removeEventListener("scan-unregistered-mode-changed", handler);
    };
  }, []);

  return { mode, setMode };
}

// ─── 페이지 이동 시 · 상품 코드 전달 (sessionStorage) ────────────────
// ProductInfoPage 진입 시 자동 등록 모달 오픈에 사용
export const SCAN_PENDING_PRODUCT_CODE_KEY = "megatown_scan_pending_product_code";

export function setScanPendingProductCode(code: string): void {
  try { sessionStorage.setItem(SCAN_PENDING_PRODUCT_CODE_KEY, code); } catch { /* noop */ }
}

export function consumeScanPendingProductCode(): string | null {
  try {
    const code = sessionStorage.getItem(SCAN_PENDING_PRODUCT_CODE_KEY);
    if (code) sessionStorage.removeItem(SCAN_PENDING_PRODUCT_CODE_KEY);
    return code;
  } catch { return null; }
}
