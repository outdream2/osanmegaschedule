import * as React from "react"

const MOBILE_BREAKPOINT = 768 // 2026-08-12 · 사용자 지시 · iPad Mini 세로(768px) 포함 태블릿에서 사이드바 노출

// 2026-08-12 · 초기값 · window 존재 시 실제 innerWidth 로 즉시 판정 (SSR-safe · 첫 렌더 flicker 제거)
function initialMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(initialMobile)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
