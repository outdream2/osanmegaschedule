// 2026-08-16 · #112-E1 Phase 2 · 본인 or 관리자 검증 프레임워크
// 사용자 지시 · 반복 패턴 · 즉시 헬퍼화
import type { Request } from "express";
import { supabase } from "../../src/supabase/client";
import { getSession, type JwtPayload } from "../middleware/requireAuth";

export type OwnershipResult =
  | { ok: true; session: JwtPayload; isAdmin: boolean; row: any }
  | { ok: false; status: number; error: string };

interface Options {
  /** DB 테이블명 (예: "leave_requests") */
  table: string;
  /** 리소스 id (req.params.id 등) */
  id: string | number;
  /** ownership 컬럼명 (기본 "employee_id") */
  ownerCol?: string;
  /** 함께 조회할 컬럼 (기본 owner + status) · session/row 로 접근 */
  select?: string;
  /** admin level (기본 9) */
  adminLevel?: number;
}

/**
 * 세션 확인 + 리소스 조회 + 본인/관리자 검증 · 재사용 가능한 프레임워크
 * @returns { ok, session, isAdmin, row } 또는 { ok:false, status, error }
 */
export async function checkOwnershipOrAdmin(req: Request, opts: Options): Promise<OwnershipResult> {
  const session = getSession(req);
  if (!session) return { ok: false, status: 401, error: "인증이 필요합니다" };
  const { table, id, ownerCol = "employee_id", select, adminLevel = 9 } = opts;
  const isAdmin = (session.level ?? 0) >= adminLevel;
  if (isAdmin) return { ok: true, session, isAdmin, row: null };
  const cols = select ?? `${ownerCol}, status`;
  const { data: row, error } = await supabase.from(table).select(cols).eq("id", id).maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!row) return { ok: false, status: 404, error: "리소스를 찾을 수 없습니다" };
  if ((row as any)[ownerCol] !== session.sub) return { ok: false, status: 403, error: "본인 소유만 접근 가능합니다" };
  return { ok: true, session, isAdmin: false, row };
}
