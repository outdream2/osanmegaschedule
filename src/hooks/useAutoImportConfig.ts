// src/hooks/useAutoImportConfig.ts
// 2026-08-24 · #253 · 자동 임포트 · config 조회·저장 훅 (관리자 lv9 전용)
//   · GET /api/auto-import/config · POST /api/auto-import/config
//   · GET /api/auto-import/status (heartbeat)
//   · 서버 KV `auto_import_config` · `auto_import_status`

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../lib/apiClient";
import {
  AutoImportConfigSchema,
  DEFAULT_AUTO_IMPORT_CONFIG,
  type AutoImportConfig,
  type AutoImportStatus,
} from "../shared/schemas/autoImport";

export type AutoImportSaveState = "idle" | "saving" | "saved" | "error";

export interface UseAutoImportConfigResult {
  config: AutoImportConfig;
  loaded: boolean;
  saveState: AutoImportSaveState;
  saveError: string | null;
  setConfig: (next: AutoImportConfig) => void;
  save: () => Promise<boolean>;
  reload: () => Promise<void>;
}

export function useAutoImportConfig(): UseAutoImportConfigResult {
  const [config, setConfigState] = useState<AutoImportConfig>(DEFAULT_AUTO_IMPORT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<AutoImportSaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get<{ value: unknown }>("/api/auto-import/config");
      const parsed = AutoImportConfigSchema.safeParse(data?.value);
      setConfigState(parsed.success ? parsed.data : DEFAULT_AUTO_IMPORT_CONFIG);
    } catch (e) {
      setConfigState(DEFAULT_AUTO_IMPORT_CONFIG);
      if (e instanceof ApiError && e.status !== 401 && e.status !== 403) {
        setSaveError(`설정 조회 실패: ${e.message}`);
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const setConfig = useCallback((next: AutoImportConfig) => {
    setConfigState(next);
    setSaveState("idle");
    setSaveError(null);
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    setSaveState("saving");
    setSaveError(null);
    try {
      await api.post("/api/auto-import/config", config);
      setSaveState("saved");
      // 3초 후 idle 로 복귀 · UI 배지 자동 hide
      setTimeout(() => setSaveState("idle"), 3000);
      return true;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "저장 실패";
      setSaveState("error");
      setSaveError(msg);
      return false;
    }
  }, [config]);

  return { config, loaded, saveState, saveError, setConfig, save, reload };
}

export interface UseAutoImportStatusResult {
  status: AutoImportStatus | null;
  loaded: boolean;
  reload: () => Promise<void>;
}

/** heartbeat 상태 조회 · 웹 UI 상태 표시 (green/amber/red) 용 */
export function useAutoImportStatus(pollingMs: number = 60_000): UseAutoImportStatusResult {
  const [status, setStatus] = useState<AutoImportStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get<{ value: AutoImportStatus | null }>("/api/auto-import/status");
      setStatus(data?.value ?? null);
    } catch {
      setStatus(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
    if (pollingMs > 0) {
      const id = setInterval(() => { void reload(); }, pollingMs);
      return () => clearInterval(id);
    }
  }, [reload, pollingMs]);

  return { status, loaded, reload };
}

/** heartbeat 신선도 판정 · green(< 1.5*interval min) · amber(< 3*interval) · red(else or null) */
export function computeStatusTone(
  status: AutoImportStatus | null,
  intervalMinutes: number,
): "green" | "amber" | "red" | "gray" {
  if (!status || !status.last_heartbeat_at) return "gray";
  const lastMs = new Date(status.last_heartbeat_at).getTime();
  if (!Number.isFinite(lastMs)) return "gray";
  const ageMs = Date.now() - lastMs;
  const intervalMs = intervalMinutes * 60 * 1000;
  if (ageMs < intervalMs * 1.5) return "green";
  if (ageMs < intervalMs * 3) return "amber";
  return "red";
}
