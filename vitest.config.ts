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
    ],
    globals: false,
    environment: "node", // 기본 · jsdom 은 파일별 지시자 opt-in
    reporters: ["default"],
  },
});
