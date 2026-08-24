// 2026-08-24 · #253 · 자동 임포트 · KV config + heartbeat 스키마 (서버·클라 공유)
import { z } from "zod";

/** 카테고리별 폴더 경로 · Windows 절대경로 또는 환경변수 (%USERPROFILE% 등) */
export const AutoImportFoldersSchema = z.object({
  products: z.string().max(500).default(""),
  stock:    z.string().max(500).default(""),
  vendors:  z.string().max(500).default(""),
  purchase: z.string().max(500).default(""),
});
export type AutoImportFolders = z.infer<typeof AutoImportFoldersSchema>;

/** 임포트 후 처리 · keep(유지) · move_to_processed(_processed 이동) · delete(삭제) */
export const AutoImportAfterSchema = z.enum(["keep", "move_to_processed", "delete"]);
export type AutoImportAfter = z.infer<typeof AutoImportAfterSchema>;

/** 자동 임포트 config · KV `auto_import_config` */
export const AutoImportConfigSchema = z.object({
  enabled:            z.boolean().default(false),
  folders:            AutoImportFoldersSchema.default({ products: "", stock: "", vendors: "", purchase: "" }),
  folder_auto_create: z.boolean().default(true),
  interval_minutes:   z.number().int().min(5).max(1440).default(10),
  after_import:       AutoImportAfterSchema.default("move_to_processed"),
  auto_rename:        z.boolean().default(true),
});
export type AutoImportConfig = z.infer<typeof AutoImportConfigSchema>;

/** 기본값 · 초기 조회 시 반환 · KV 부재 대응 */
export const DEFAULT_AUTO_IMPORT_CONFIG: AutoImportConfig = {
  enabled: false,
  folders: { products: "", stock: "", vendors: "", purchase: "" },
  folder_auto_create: true,
  interval_minutes: 10,
  after_import: "move_to_processed",
  auto_rename: true,
};

/** Heartbeat · Python 매 실행 후 서버 리포트 */
export const AutoImportHeartbeatSchema = z.object({
  at:                z.string().min(1),              // ISO 8601
  status:            z.enum(["ok", "disabled", "error", "no_folders"]).default("ok"),
  processed:         z.record(z.string(), z.number().int().min(0)).default({}),
  errors:            z.array(z.object({
    category:        z.string(),
    error:           z.string(),
  })).default([]),
  applied_interval:  z.number().int().min(5).max(1440).optional(),
  script_version:    z.string().optional(),
  host:              z.string().optional(),
});
export type AutoImportHeartbeat = z.infer<typeof AutoImportHeartbeatSchema>;

/** Heartbeat status · KV `auto_import_status` · 웹 UI 표시용 */
export interface AutoImportStatus {
  last_heartbeat_at:  string | null;
  last_status:        AutoImportHeartbeat["status"] | null;
  last_processed:     Record<string, number>;
  last_errors:        Array<{ category: string; error: string }>;
  last_script_version: string | null;
  last_host:          string | null;
  updated_at:         string;
}
