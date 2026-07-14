// server/routes/ocrDeletedRows.ts
// 1차보정 테이블에서 사용자가 삭제한 행 · DB 영구 기억 · 다음 스캔부터 자동 필터
//
// 서명(signature) = normSupplier(supplier) + "|" + normName(product_name)
//   같은 공급사 + 같은 (정규화) 품명 조합은 유일하게 결정됨

import { Router } from "express";
import { supabase } from "../../src/supabase/client";
import { normSupplier } from "../ocr/match";

/** 품명 정규화 (서명용): 소문자·공백·특수문자·괄호 제거 */
function normName(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .replace(/[\s\-_()（）,·./[\]{}「」『』@*※~+【】<>《》"'`^!?:;|]/g, "")
    .trim();
}

export const ocrDeletedRowsRouter = Router();

/**
 * GET /api/ocr-deleted-rows
 *   전체 삭제 목록 조회 (프론트에서 매치 필터에 사용)
 * GET /api/ocr-deleted-rows?supplier=경방신약
 *   특정 공급사만
 */
ocrDeletedRowsRouter.get("/api/ocr-deleted-rows", async (req, res) => {
  try {
    const supplier = String(req.query.supplier ?? "").trim();
    let q = supabase.from("ocr_deleted_rows").select("*").order("deleted_at", { ascending: false });
    if (supplier) {
      q = q.eq("supplier_norm", normSupplier(supplier));
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    res.json({ rows: data ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "조회 실패" });
  }
});

/**
 * POST /api/ocr-deleted-rows
 *   body: { items: [{ supplier, name }, ...] } 또는 { supplier, name }
 *   중복 서명은 upsert (에러 무시)
 */
ocrDeletedRowsRouter.post("/api/ocr-deleted-rows", async (req, res) => {
  try {
    const b = req.body ?? {};
    const items: Array<{ supplier: string; name: string }> = Array.isArray(b.items)
      ? b.items
      : (b.supplier && b.name ? [{ supplier: b.supplier, name: b.name }] : []);
    if (items.length === 0) return res.status(400).json({ error: "supplier·name 필요" });

    const rows = items
      .map(it => {
        const supplierNorm = normSupplier(String(it.supplier ?? ""));
        const nameNorm = normName(String(it.name ?? ""));
        if (!supplierNorm || !nameNorm) return null;
        return {
          supplier_norm: supplierNorm,
          name_norm: nameNorm,
          supplier_raw: String(it.supplier),
          name_raw: String(it.name),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (rows.length === 0) return res.status(400).json({ error: "유효한 항목 없음" });

    // signature 는 GENERATED · onConflict 로 중복 스킵
    const { data, error } = await supabase
      .from("ocr_deleted_rows")
      .upsert(rows, { onConflict: "signature", ignoreDuplicates: true })
      .select();
    if (error) throw new Error(error.message);
    res.json({ inserted: data?.length ?? 0, total: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "저장 실패" });
  }
});

/**
 * DELETE /api/ocr-deleted-rows/:id — 특정 삭제 기록 복구 (다시 표시되도록)
 */
ocrDeletedRowsRouter.delete("/api/ocr-deleted-rows/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    const { error } = await supabase.from("ocr_deleted_rows").delete().eq("id", id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "삭제 실패" });
  }
});

/**
 * 서버 사이드 헬퍼 · pages 응답 만들기 전에 rows 필터에 사용 (선택적)
 * 지금은 프론트에서 필터하므로 미사용 · 필요 시 통합 가능
 */
export async function getDeletedRowSignatures(): Promise<Set<string>> {
  try {
    const { data } = await supabase.from("ocr_deleted_rows").select("signature");
    return new Set((data ?? []).map((r: any) => String(r.signature ?? "")));
  } catch {
    return new Set();
  }
}
