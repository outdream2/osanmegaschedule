import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "server/**/*.test.ts",
      "server/**/__tests__/**/*.test.ts",
      // 2026-08-16 · 클라이언트 · 순수 로직만 (node env · lib/shared)
      "src/lib/**/*.test.ts",
      "src/shared/**/*.test.ts",
    ],
    globals: false,
    environment: "node",
    reporters: ["default"],
  },
});
