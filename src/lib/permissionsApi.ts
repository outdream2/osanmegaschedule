// src/lib/permissionsApi.ts
// 2026-09-14 · 프레임워크 · 페이지 권한 API 클라이언트 래퍼
//   · server/routes/settings/settings.ts (permissions endpoints)
//   · GET · POST · 6 곳 · 프리미티브 통합

import { api } from "./apiClient";
import type { PagePermissions } from "../types";

/** GET /api/permissions · 페이지 권한 조회 */
export async function getPagePermissions(): Promise<Partial<PagePermissions>> {
  const { data } = await api.get<Partial<PagePermissions>>("/api/permissions");
  return data ?? {};
}

/** POST /api/permissions · 페이지 권한 저장 (관리자만) */
export async function savePagePermissions(
  permissions: PagePermissions | Partial<PagePermissions>,
  employeeId?: number | null
): Promise<void> {
  await api.post("/api/permissions", { permissions, employeeId });
}
