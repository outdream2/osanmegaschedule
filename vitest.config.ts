import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/**/*.test.ts", "server/**/__tests__/**/*.test.ts"],
    globals: false,
    // 서버측만 · 브라우저 API 필요 없음
    environment: "node",
    // 리포트 짧게
    reporters: ["default"],
  },
});
