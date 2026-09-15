// apps/sync-agent/src/renderer/src/types.ts
// 2026-09-15 · Phase 2 · Renderer 측 · Config 타입 (preload 와 동기 · shared)

export type FileKind = "products" | "stock" | "purchase";

export interface LastRun {
  at: string;
  status: "success" | "failed" | "skipped";
  message?: string;
  fileName?: string;
}

export interface RendererConfig {
  server: { baseUrl: string };
  auth: { email?: string; hasToken: boolean };
  folders: Partial<Record<FileKind, string>>;
  schedules: Partial<Record<FileKind, string>>;
  lastRun: Partial<Record<FileKind, LastRun>>;
  autoStart: boolean;
  showNotifications: boolean;
}

export interface ImportResult {
  ok: boolean;
  kind: FileKind;
  filesProcessed: number;
  filesFailed: number;
  message: string;
}
