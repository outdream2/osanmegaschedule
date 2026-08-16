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
    ],
    globals: false,
    environment: "node", // 기본 · jsdom 은 파일별 지시자 opt-in
    reporters: ["default"],
  },
});
