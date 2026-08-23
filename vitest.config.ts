import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "server/**/*.test.ts",
      "server/**/__tests__/**/*.test.ts",
      "src/lib/**/*.test.ts",
      "src/shared/**/*.test.ts",
      // 2026-08-16 · 클라이언트 훅 · React 렌더 필요 · jsdom env (파일별 // @vitest-environment jsdom 로 opt-in)
      "src/hooks/**/*.test.ts",
      "src/hooks/**/*.test.tsx",
      // 2026-08-18 · common 프레임워크 컴포넌트 · jsdom (파일별 지시자 필요)
      "src/components/common/**/*.test.tsx",
      "src/components/common/**/*.test.ts",
      "src/lib/**/*.test.tsx",
      // 2026-08-19 · pure util 함수 · node env · 순수 로직 검증
      "src/utils/**/*.test.ts",
      // 2026-08-20 · constants (side-effect free lookup) · label/zone maps
      "src/constants/**/*.test.ts",
      // 2026-08-20 · types · pure defaults + formatters
      "src/types.test.ts",
      // 2026-08-20 · layout · pure helpers (sideNavGroups) + tsx (BottomNav)
      "src/components/layout/**/*.test.ts",
      "src/components/layout/**/*.test.tsx",
      // 2026-08-20 · 페이지 · 로컬 pure helpers (utils / handlers)
      "src/components/DayTimelineModal/**/*.test.ts",
      "src/components/DayTimelineModal/**/*.test.tsx",
      "src/components/OcrPage/**/*.test.ts",
      "src/components/OcrPage/**/*.test.tsx",
      // 2026-08-21 · styles 토큰 · pure 상수/className
      "src/styles/**/*.test.ts",
      // 2026-08-21 · ScanPage · pure helpers (calcSlotTotal · calcRowTotal 등)
      "src/components/ScanPage/**/*.test.ts",
      // 2026-08-23 · ScanPage panels · jsdom · #179 canManageProducts + onOpenCreate props
      "src/components/ScanPage/**/*.test.tsx",
      // 2026-08-21 · BarcodeScanner · pure helpers (extractBarcodeDigits · 이미지 처리)
      "src/components/BarcodeScanner/**/*.test.ts",
      // 2026-08-23 · #177 · ProductInfoPage · CreateModal + page (jsdom · 파일별 지시자)
      "src/components/ProductInfoPage/**/*.test.tsx",
      // 2026-08-23 · OrderManagePage · #182 등 · jsdom 컴포넌트 테스트
      "src/components/OrderManagePage/**/*.test.tsx",
    ],
    globals: false,
    environment: "node", // 기본 · jsdom 은 파일별 지시자 opt-in
    reporters: ["default"],
  },
});
