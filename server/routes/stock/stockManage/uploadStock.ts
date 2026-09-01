// POST /api/upload-stock              xlsx 재고 업로드 (stock_history upsert)
// GET  /api/stock-import-log          임포트 이력 조회
// DELETE /api/stock-import-log        이력 초기화
import { Router } from "express";
import express from "express";
import XLSX from "xlsx";
import { supabase } from "../../../../src/supabase/client";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { authorize } from "../../../middleware/requireAuth";
import { HttpError, badRequest } from "../../../middleware/errorHandler";
import { clearSalesTrendCache, topSalesCache } from "./helpers";

const router = Router();

// GET /api/stock-import-log
router.get("/api/stock-import-log", asyncHandler(async (_req, res) => {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "stock_import_log").maybeSingle();
  res.json(Array.isArray(data?.value) ? data.value : []);
}));

// DELETE /api/stock-import-log
router.delete("/api/stock-import-log", authorize(9), asyncHandler(async (_req, res) => {
  await supabase.from("app_settings").upsert({ key: "stock_import_log", value: [], updated_at: new Date().toISOString() }, { onConflict: "key" });
  res.json({ ok: true });
}));

// POST /api/upload-stock
router.post("/api/upload-stock", authorize(9), express.raw({ type: "application/octet-stream", limit: "50mb" }), asyncHandler(async (req, res) => {
  const { managerId } = req.query as Record<string, string>;
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw badRequest("파일이 없습니다");
  }
  {
    if (managerId) {
      const { data: emp } = await supabase.from("employees").select("level").eq("id", Number(managerId)).maybeSingle();
      if ((emp?.level ?? 0) < 9) throw new HttpError(403, "level 9 이상 관리자만 가능합니다", "FORBIDDEN");
    } else {
      throw new HttpError(403, "managerId 필요", "FORBIDDEN");
    }
    const buf = req.body as Buffer;
    const isXlsx = buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
    const isXls  = buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0;
    if (!isXlsx && !isXls) throw badRequest("xlsx/xls 파일만 가능합니다");

    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // 재고현황 xlsx: 병합된 카테고리 헤더(Row 0)와 실제 컬럼명(Row 1)으로 구성
    const arrRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
    if (arrRows.length < 3) throw badRequest("데이터가 부족합니다");

    const scoreHeaderRow = (row: any[]): number => {
      const nonEmpty = row.map(v => String(v ?? "").trim()).filter(Boolean);
      return new Set(nonEmpty).size;
    };
    const row0Score = scoreHeaderRow(arrRows[0]);
    const row1Score = scoreHeaderRow(arrRows[1]);
    const headerRowIdx = row1Score > row0Score + 2 ? 1 : 0;
    const headers: string[] = arrRows[headerRowIdx].map(h => String(h ?? "").trim());
    const dataRows = arrRows.slice(headerRowIdx + 1);

    const findCol = (patterns: RegExp[]): number => {
      for (const pat of patterns) {
        const idx = headers.findIndex(h => pat.test(h));
        if (idx >= 0) return idx;
      }
      return -1;
    };
    const codeI    = findCol([/^코드$/i, /상품\s*코드/i, /품목\s*번호/i, /product[_ ]?code/i, /^code$/i]);
    const stockI   = findCol([/종료일\s*재고/i, /기말\s*재고/i, /^현재고$/i, /^재고$/i, /current[_ ]?stock/i, /closing[_ ]?stock/i]);
    const nameI    = findCol([/^명$/i, /상품\s*명/i, /제품\s*명/i, /product[_ ]?name/i]);
    const supNameI = findCol([/공급사\s*명/i, /supplier[_ ]?name/i, /^공급사$/i]);
    const supCodeI = findCol([/공급사\s*코드/i, /supplier[_ ]?code/i]);
    const specI    = findCol([/^규격$/i, /^spec$/i]);
    const taxTypeI = findCol([/^i$/i, /과세\s*구분/i, /세금\s*구분/i]);
    const prodTypeI= findCol([/^상품\s*유형$/i, /product[_ ]?type/i]);
    const openI    = findCol([/시작일\s*재고/i, /기초\s*재고/i, /시작\s*재고/i, /전월\s*이월/i, /전기\s*이월/i, /opening[_ ]?stock/i]);
    const purchI   = findCol([/입고\s*계/i, /^입고$/i, /purchase/i]);
    const saleI    = findCol([/판매\s*출고\s*계/i, /^판매$/i, /sale/i]);
    const disposeI = findCol([/^폐기$/i, /disposal/i]);
    const internI  = findCol([/사내\s*소비/i, /internal/i]);
    const adjI     = findCol([/재고\s*조정/i, /adjust/i]);
    const taxableI = findCol([/^과세$/i, /taxable/i]);
    const supplyI  = findCol([/공급\s*가액/i]);
    const vatI     = findCol([/^부가세$/i, /vat/i]);
    const dutyFreeI= findCol([/^면세$/i, /duty[_ ]?free/i]);
    const totalI   = findCol([/^합계$/i, /total/i]);

    if (codeI < 0 || stockI < 0) {
      return res.status(400).json({
        error: `상품코드/재고 컬럼을 찾을 수 없습니다. 감지된 헤더: ${headers.join(", ")}`,
      });
    }

    const parseNum = (v: unknown): number => {
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      if (v == null || v === "") return 0;
      const n = parseFloat(String(v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : 0;
    };

    const snapshotHint = String(req.query.snapshot_date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotHint)) {
      throw badRequest("snapshot_date(종료재고일) 형식 오류 · YYYY-MM-DD 필요");
    }
    const snapshotDate = snapshotHint;
    const startHint = String(req.query.start_date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startHint)) {
      throw badRequest("start_date(시작재고일) 형식 오류 · YYYY-MM-DD 필요");
    }
    const periodStartDate: string = startHint;
    if (periodStartDate > snapshotDate) {
      throw badRequest("start_date(시작재고일)가 종료재고일보다 뒤에 있습니다");
    }
    const periodTypeRaw = String(req.query.period_type ?? "").trim().toLowerCase();
    let periodType: "early" | "mid" | "late" | null =
      periodTypeRaw === "early" || periodTypeRaw === "mid" || periodTypeRaw === "late"
        ? periodTypeRaw
        : null;
    if (!periodType) {
      const dd = Number(snapshotDate.slice(8, 10));
      periodType = dd >= 1 && dd <= 10 ? "early" : dd >= 11 && dd <= 20 ? "mid" : "late";
    }

    type XlsxRow = {
      product_code: string;
      current_stock: number;
      product_name: string | null;
      supplier: string | null;
      spec: string | null;
    };
    const xlsxRows: XlsxRow[] = [];
    const history: Record<string, any>[] = [];
    for (const r of dataRows) {
      if (!Array.isArray(r)) continue;
      const code = String(r[codeI] ?? "").trim();
      if (!code) continue;
      const supName = supNameI >= 0 ? String(r[supNameI] ?? "").trim() : "";
      if (!supName && nameI >= 0 && !String(r[nameI] ?? "").trim()) continue;

      const closing = parseNum(r[stockI]);
      xlsxRows.push({
        product_code:  code,
        current_stock: closing,
        product_name:  nameI >= 0 ? String(r[nameI] ?? "").trim() || null : null,
        supplier:      supName || null,
        spec:          specI >= 0 ? String(r[specI] ?? "").trim() || null : null,
      });

      history.push({
        snapshot_date:     snapshotDate,
        period_start_date: periodStartDate,
        period_type:       periodType,
        product_code:      code,
        supplier_code:     supCodeI >= 0 ? String(r[supCodeI] ?? "").trim() || null : null,
        supplier_name:     supName || null,
        product_name:      nameI >= 0 ? String(r[nameI] ?? "").trim() || null : null,
        spec:              specI >= 0 ? String(r[specI] ?? "").trim() || null : null,
        tax_type:          taxTypeI >= 0 ? String(r[taxTypeI] ?? "").trim() || null : null,
        product_type:      prodTypeI >= 0 ? String(r[prodTypeI] ?? "").trim() || null : null,
        opening_stock:     openI    >= 0 ? parseNum(r[openI])    : 0,
        purchase_qty:      purchI   >= 0 ? parseNum(r[purchI])   : 0,
        sale_qty:          saleI    >= 0 ? parseNum(r[saleI])    : 0,
        disposal_qty:      disposeI >= 0 ? parseNum(r[disposeI]) : 0,
        internal_qty:      internI  >= 0 ? parseNum(r[internI])  : 0,
        adjustment_qty:    adjI     >= 0 ? parseNum(r[adjI])     : 0,
        closing_stock:     closing,
        taxable_amount:    taxableI >= 0 ? parseNum(r[taxableI]) : 0,
        supply_amount:     supplyI  >= 0 ? parseNum(r[supplyI])  : 0,
        vat:               vatI     >= 0 ? parseNum(r[vatI])     : 0,
        duty_free_amount:  dutyFreeI >= 0 ? parseNum(r[dutyFreeI]) : 0,
        total_amount:      totalI   >= 0 ? parseNum(r[totalI])   : 0,
      });
    }
    if (xlsxRows.length === 0) throw badRequest("유효한 데이터가 없습니다");

    console.log(`[upload-stock] snapshot=${snapshotDate} · start=${periodStartDate ?? "(none)"} · period=${periodType} · 파싱=${history.length}행 · rawDataRows=${dataRows.length}행 · headerRowIdx=${headerRowIdx}`);
    console.log(`[upload-stock] col idx: code=${codeI} name=${nameI} sup=${supNameI} spec=${specI} closing=${stockI} opening=${openI} purchase=${purchI} sale=${saleI}`);

    const updated = 0;
    const inserted = 0;

    // ① 같은 기간(period_start_date) 기존 rows 감지
    const forceOverwrite = String(req.query.force ?? "").trim() === "true";
    let deletedCount = 0;
    try {
      const { count: pre } = await supabase
        .from("stock_history")
        .select("*", { count: "exact", head: true })
        .eq("period_start_date", periodStartDate);
      const existingCount = pre ?? 0;
      if (existingCount > 0 && !forceOverwrite) {
        return res.status(409).json({
          needsConfirm: true,
          existingCount,
          period: { from: periodStartDate, to: snapshotDate, type: periodType },
          message: `기간 ${periodStartDate} ~ ${snapshotDate} 에 이미 ${existingCount}행 재고 스냅샷이 존재합니다. 덮어쓰시겠습니까?`,
        });
      }
      if (existingCount > 0) {
        const { error: delErr } = await supabase
          .from("stock_history")
          .delete()
          .eq("period_start_date", periodStartDate);
        if (delErr) {
          console.warn(`[upload-stock] 기존 rows DELETE 실패 (${periodStartDate}):`, delErr.message);
          deletedCount = 0;
        } else {
          deletedCount = existingCount;
          console.log(`[upload-stock] 기간 ${periodStartDate} 기존 ${deletedCount}행 삭제 (덮어쓰기 확인됨)`);
        }
      }
    } catch (e: any) {
      console.warn("[upload-stock] period_start_date 감지/DELETE skip:", e?.message);
    }

    // ② stock_history upsert
    let historyInserted = 0;
    let historyError: string | null = null;
    let periodStartUnsupported = false;
    try {
      const HCHUNK = 500;
      const totalChunks = Math.ceil(history.length / HCHUNK);
      let chunkNo = 0;
      for (let i = 0; i < history.length; i += HCHUNK) {
        chunkNo++;
        const chunkOrig = history.slice(i, i + HCHUNK);
        const chunk = periodStartUnsupported
          ? chunkOrig.map(({ period_start_date, ...rest }) => rest)
          : chunkOrig;
        const { error: hErr } = await supabase
          .from("stock_history")
          .upsert(chunk, { onConflict: "snapshot_date,product_code" });
        if (!hErr) {
          historyInserted += chunk.length;
          console.log(`[upload-stock] chunk ${chunkNo}/${totalChunks} · ${chunk.length}행 저장 성공 (누계 ${historyInserted})`);
          continue;
        }
        if (!periodStartUnsupported && /period_start_date/i.test(hErr.message)) {
          periodStartUnsupported = true;
          console.warn(`[upload-stock] period_start_date 컬럼 없음 → fallback 재시도`);
          const chunkFallback = chunkOrig.map(({ period_start_date, ...rest }) => rest);
          const { error: hErr2 } = await supabase
            .from("stock_history")
            .upsert(chunkFallback, { onConflict: "snapshot_date,product_code" });
          if (!hErr2) {
            historyInserted += chunkFallback.length;
            console.log(`[upload-stock] chunk ${chunkNo}/${totalChunks} · fallback 성공 ${chunkFallback.length}행`);
            continue;
          }
          console.error(`[upload-stock] chunk ${chunkNo}/${totalChunks} · fallback 실패: ${hErr2.message}`);
          if (!historyError) historyError = hErr2.message;
          continue;
        }
        console.error(`[upload-stock] chunk ${chunkNo}/${totalChunks} · 실패 (${chunk.length}행 손실): ${hErr.message}`);
        if (chunk[0]) {
          console.error(`  샘플 첫 행 code=${chunk[0].product_code} name=${chunk[0].product_name} sup=${chunk[0].supplier_name} snap=${chunk[0].snapshot_date}`);
        }
        if (!historyError) historyError = hErr.message;
      }
      console.log(`[upload-stock] 완료: 저장 ${historyInserted}/${history.length}행 (${totalChunks}청크 중 성공)`);
    } catch (e: any) {
      console.error("[upload-stock] stock_history 저장 예외:", e?.message, e?.stack);
      historyError = e?.message ?? "저장 예외";
    }

    if (historyInserted === 0 && historyError) {
      return res.status(500).json({
        error: `stock_history 저장 실패: ${historyError}. Supabase에 stock_history 테이블이 없거나 unique 제약(snapshot_date, product_code)이 없을 수 있습니다. supabase/migrations/20260707_stock_history.sql 적용 필요.`,
        total: xlsxRows.length,
        history: 0,
      });
    }

    // 업로드 완료 → 캐시 무효화
    clearSalesTrendCache();
    topSalesCache.clear();

    // 임포트 로그 저장
    const { data: logData } = await supabase.from("app_settings").select("value").eq("key", "stock_import_log").maybeSingle();
    const prevLogs: unknown[] = Array.isArray(logData?.value) ? logData.value : [];
    const newEntry = {
      timestamp: new Date().toISOString(),
      count: updated,
      inserted,
      total: xlsxRows.length,
      history: historyInserted,
      deleted: deletedCount,
      snapshot_date: snapshotDate,
      start_date: periodStartDate,
      period_type: periodType,
    };
    const logs = [newEntry, ...prevLogs].slice(0, 20);
    await supabase.from("app_settings").upsert({ key: "stock_import_log", value: logs, updated_at: new Date().toISOString() }, { onConflict: "key" });

    res.json({
      ok: true,
      updated,
      inserted,
      total: xlsxRows.length,
      history: historyInserted,
      deleted: deletedCount,
      start_date: periodStartDate,
      period_type: periodType,
      snapshot_date: snapshotDate,
      timestamp: newEntry.timestamp,
    });
  }
}));

export default router;
