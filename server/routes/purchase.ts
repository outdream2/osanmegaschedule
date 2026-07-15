// server/routes/purchase.ts
// 매입상세현황 xlsx 임포트 + 조회 API (2026-07-15)
//   - 개별 매입 건마다 1행 (재고현황 xlsx 는 기간 합계 · 이건 상세)
//   - 새 테이블: purchase_details
//
// ─── DB 스키마 (Supabase SQL Editor 에서 실행 필요) ────────────────
// CREATE TABLE IF NOT EXISTS purchase_details (
//   id BIGSERIAL PRIMARY KEY,
//   purchase_date DATE NOT NULL,
//   supplier_code TEXT,
//   supplier_name TEXT,
//   product_code TEXT NOT NULL,
//   product_name TEXT,
//   spec TEXT,
//   quantity NUMERIC DEFAULT 0,
//   unit_price NUMERIC DEFAULT 0,
//   amount NUMERIC DEFAULT 0,
//   vat NUMERIC DEFAULT 0,
//   total NUMERIC DEFAULT 0,
//   imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
// );
// -- upsert 중복 방지용 유니크 제약 (같은 일자·공급사·상품·수량·금액 이면 동일 건)
// CREATE UNIQUE INDEX IF NOT EXISTS purchase_details_dedupe_idx
//   ON purchase_details (purchase_date, COALESCE(supplier_code,''), product_code, quantity, amount);
// -- 조회 인덱스
// CREATE INDEX IF NOT EXISTS purchase_details_product_date_idx
//   ON purchase_details (product_code, purchase_date DESC);
// CREATE INDEX IF NOT EXISTS purchase_details_supplier_date_idx
//   ON purchase_details (supplier_name, purchase_date DESC);
// ────────────────────────────────────────────────────────────────

import express from "express";
import XLSX from "xlsx";
import { supabase } from "../../src/supabase/client";

const router = express.Router();

// ─── 유틸 ────────────────────────────────────────────────────────
const parseNum = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Excel 시리얼 or 문자열 → YYYY-MM-DD
const parseDate = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 100000) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed?.y) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const m = /^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
};

const findCol = (headers: string[], patterns: RegExp[]): number => {
  for (const p of patterns) {
    const i = headers.findIndex(h => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

// ═════════════════════════════════════════════════════════════════
// POST /api/upload-purchase-details
//   body: xlsx binary (application/octet-stream)
//   query: managerId (권한 확인 · level >= 9)
// ═════════════════════════════════════════════════════════════════
router.post(
  "/api/upload-purchase-details",
  express.raw({ type: "application/octet-stream", limit: "50mb" }),
  async (req, res) => {
    try {
      // 권한
      const managerId = String(req.query.managerId ?? "").trim();
      if (managerId) {
        const { data: emp } = await supabase.from("employees").select("level").eq("id", Number(managerId)).maybeSingle();
        if ((emp?.level ?? 0) < 9) return res.status(403).json({ error: "level 9 이상 관리자만 가능합니다" });
      } else {
        return res.status(403).json({ error: "managerId 필요" });
      }

      // 파일 검증
      if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "파일이 없습니다" });
      }
      const buf = req.body as Buffer;
      const isXlsx = buf[0] === 0x50 && buf[1] === 0x4B;
      const isXls = buf[0] === 0xD0 && buf[1] === 0xCF;
      if (!isXlsx && !isXls) return res.status(400).json({ error: "xlsx/xls 파일만 가능합니다" });

      // 파싱
      const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const arr = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
      if (arr.length < 2) return res.status(400).json({ error: "데이터가 부족합니다" });

      // 헤더 감지 · Row0(카테고리 병합) + Row1(실제 컬럼) 결합 지원
      //   병합 카테고리 헤더 예: "정상매입(수량/금액) · 반품(수량/금액) · 매입합계(수량/금액)"
      //   실제 컬럼 예:         "수량 · 금액 · 수량 · 금액 · 수량 · 금액"
      //   → Row1 값이 Row0 카테고리 없이 중복되므로, Row0 카테고리를 접두어로 붙여 유니크한 이름 생성
      const scoreRow = (row: any[]) => new Set((row ?? []).map(v => String(v ?? "").trim()).filter(Boolean)).size;
      const row0S = scoreRow(arr[0]);
      const row1S = scoreRow(arr[1] ?? []);
      // Row0 병합 여부 판정: 같은 값 반복이 많으면 병합 카테고리 헤더
      const row0Arr = (arr[0] ?? []) as any[];
      const row0HasDup = row0Arr.length > 0 && new Set(row0Arr.map(v => String(v ?? "").trim()).filter(Boolean)).size < row0Arr.filter(v => String(v ?? "").trim()).length;
      // 결합 헤더 생성 (Row0가 병합 카테고리인 경우) or Row1 단독 (일반)
      let headers: string[] = [];
      let dataRows: any[][] = [];
      if (row0HasDup && arr.length >= 3) {
        // Row0 = 카테고리 병합 · Row1 = 실제 컬럼 · Row2+ = 데이터
        // 중복되는 label ("수량"·"금액" 같은 것)만 카테고리 접두어 붙임 (유니크는 그대로)
        //   예: "코드"(유니크) → "코드" · "수량"(3중복) → "정상매입_수량", "반품_수량", "매입합계_수량"
        const row1Arr = (arr[1] ?? []) as any[];
        const labelCounts = new Map<string, number>();
        row1Arr.forEach(h => {
          const l = String(h ?? "").trim();
          if (l) labelCounts.set(l, (labelCounts.get(l) ?? 0) + 1);
        });
        headers = row1Arr.map((h, i) => {
          const label = String(h ?? "").trim();
          const cat = String(row0Arr[i] ?? "").trim();
          const isDup = (labelCounts.get(label) ?? 0) > 1;
          if (isDup && cat && cat !== label) return `${cat}_${label}`;
          return label;
        });
        dataRows = arr.slice(2);
      } else {
        const headerRowIdx = row1S > row0S ? 1 : 0;
        headers = (arr[headerRowIdx] as any[]).map(h => String(h ?? "").trim());
        dataRows = arr.slice(headerRowIdx + 1);
      }

      // query 로 받는 임포트 컨텍스트 (매입일자 없는 요약 파일용)
      const fromDate = String(req.query.from ?? "").trim();
      const toDate = String(req.query.to ?? "").trim();
      const forcedSupplier = String(req.query.supplier ?? "").trim();
      // 파일명에서 날짜 추출 시도 (예: 매입상세현황_2026-0701_07-15.xlsx)
      const filenameHint = String(req.query.filename ?? "").trim();
      let inferredFrom = fromDate;
      let inferredTo = toDate;
      if ((!inferredFrom || !inferredTo) && filenameHint) {
        const m = filenameHint.match(/(\d{4})[-_]?(\d{2})(\d{2})[-_](\d{2})[-_]?(\d{2})/);
        if (m) {
          inferredFrom = inferredFrom || `${m[1]}-${m[2]}-${m[3]}`;
          inferredTo = inferredTo || `${m[1]}-${m[4]}-${m[5]}`;
        }
      }
      // 초/중/하순 자동 판정 (재고 xlsx 와 동일 규칙 · 종료일 dd 기준)
      const detectPeriodType = (isoDate: string): "early" | "mid" | "late" | null => {
        const dd = Number(isoDate.slice(8, 10));
        if (!Number.isFinite(dd) || dd < 1 || dd > 31) return null;
        return dd <= 10 ? "early" : dd <= 20 ? "mid" : "late";
      };
      const periodType = inferredTo ? detectPeriodType(inferredTo) : null;
      const summaryPeriodStart = inferredFrom || null;

      // 컬럼 매핑 (변형 헤더 광범위 대응 + 결합 카테고리 헤더)
      const dateI = findCol(headers, [/^매입\s*일자?$/, /^매입일$/, /^일자$/, /^날짜$/, /^발행일자?$/, /^입고\s*일자?$/, /purchase[_ ]?date/i]);
      const supNameI = findCol(headers, [/^공급사(?:명)?$/, /^거래처(?:명)?$/, /^매입처(?:명)?$/, /supplier[_ ]?name/i]);
      const supCodeI = findCol(headers, [/^공급사\s*코드$/, /^거래처\s*코드$/, /supplier[_ ]?code/i]);
      const codeI = findCol(headers, [/^상품\s*코드$/, /^코드$/, /^품목\s*코드$/, /product[_ ]?code/i]);
      const nameI = findCol(headers, [/^상품\s*명$/, /^품명$/, /^품목명$/, /^명$/, /product[_ ]?name/i]);
      const specI = findCol(headers, [/^규격$/, /^spec$/i]);
      // 수량/금액 · "매입합계_수량", "매입합계_금액" 우선 · 없으면 단독 "수량"/"금액"
      const qtyI = findCol(headers, [/^매입합계[_ ]?수량$/, /^매입[_ ]?수량$/, /^수량$/, /quantity/i, /^qty$/i]);
      const priceI = findCol(headers, [/^매입합계[_ ]?평균매입단가$/, /^평균매입단가$/, /^매입[_ ]?단가$/, /^단가$/, /unit[_ ]?price/i]);
      const amountI = findCol(headers, [/^매입합계[_ ]?금액$/, /^매입[_ ]?금액$/, /^공급\s*가액?$/, /^금액$/, /amount/i]);
      const vatI = findCol(headers, [/^부가세$/, /^세액$/, /vat/i, /tax/i]);
      const totalI = findCol(headers, [/^합계$/, /^총액$/, /^합계\s*금액$/, /total/i]);
      const returnQtyI = findCol(headers, [/^반품[_ ]?수량$/]);
      const returnAmtI = findCol(headers, [/^반품[_ ]?금액$/]);

      // 필수: 상품코드 · 매입일자는 완화 (컬럼 없어도 query/파일명 fallback)
      if (codeI < 0) {
        return res.status(400).json({
          error: `필수 컬럼(상품코드)을 찾을 수 없습니다. 감지된 헤더: ${headers.join(", ")}`,
          detected: { dateI, codeI, supNameI, supCodeI, nameI, qtyI, priceI, amountI, vatI, totalI, returnQtyI, returnAmtI },
        });
      }
      if (dateI < 0 && !inferredTo) {
        return res.status(400).json({
          error: `매입일자 컬럼이 없고 파일명/query 에서도 기간을 파악하지 못했습니다. 파일명(예: xxx_YYYYMMDD_MMDD.xlsx) 형식이거나 ?from=YYYY-MM-DD&to=YYYY-MM-DD 파라미터가 필요합니다.`,
          detected_headers: headers,
        });
      }

      // 데이터 파싱
      const now = new Date().toISOString();
      const parsed: Record<string, any>[] = [];
      const skipped: string[] = [];
      // 요약 파일 모드: 매입일자 컬럼 없이 기간 대표일(종료일) 사용
      const summaryDate = inferredTo || inferredFrom || null;
      for (const r of dataRows) {
        if (!Array.isArray(r)) continue;
        const code = String(r[codeI] ?? "").trim();
        if (!code) continue;
        let date: string | null = null;
        if (dateI >= 0) date = parseDate(r[dateI]);
        if (!date) date = summaryDate;
        if (!date) { skipped.push(`code=${code} · 일자 없음`); continue; }
        // 매입 수량/금액 (매입합계 우선)
        const qty = qtyI >= 0 ? parseNum(r[qtyI]) : 0;
        const amt = amountI >= 0 ? parseNum(r[amountI]) : 0;
        // 반품 있으면 순매입 = 매입 - 반품 (이미 매입합계에 반영됐으므로 참고용 저장만)
        const returnQty = returnQtyI >= 0 ? parseNum(r[returnQtyI]) : 0;
        const returnAmt = returnAmtI >= 0 ? parseNum(r[returnAmtI]) : 0;
        // 매입 수량 0이면 스킵 (합계=0인 상품은 이 기간 매입 없음)
        if (qty === 0 && amt === 0) continue;
        // period_type: 개별 date 있으면 그 dd 로 판정, 아니면 요약 파일 periodType 사용
        const rowPeriodType = dateI >= 0 ? detectPeriodType(date) : periodType;
        parsed.push({
          purchase_date: date,
          period_start_date: summaryPeriodStart, // 요약 파일이면 시작일 · 상세 파일이면 null
          period_type: rowPeriodType,             // early/mid/late
          supplier_code: supCodeI >= 0 ? String(r[supCodeI] ?? "").trim() || null : null,
          supplier_name: supNameI >= 0 ? String(r[supNameI] ?? "").trim() || forcedSupplier || null : (forcedSupplier || null),
          product_code: code,
          product_name: nameI >= 0 ? String(r[nameI] ?? "").trim() || null : null,
          spec: specI >= 0 ? String(r[specI] ?? "").trim() || null : null,
          quantity: qty - returnQty, // 순매입 수량 (반품 차감)
          unit_price: priceI >= 0 ? parseNum(r[priceI]) : 0,
          amount: amt - returnAmt, // 순매입 금액
          vat: vatI >= 0 ? parseNum(r[vatI]) : 0,
          total: totalI >= 0 ? parseNum(r[totalI]) : (amt - returnAmt),
          imported_at: now,
        });
      }

      if (parsed.length === 0) {
        return res.status(400).json({ error: "유효한 매입 데이터가 없습니다", skipped });
      }

      console.log(`[upload-purchase] 파싱 ${parsed.length}행 · skip ${skipped.length}행 · headers=${JSON.stringify(headers)}`);
      console.log(`[upload-purchase] col idx: date=${dateI} sup=${supNameI} code=${codeI} name=${nameI} qty=${qtyI} price=${priceI} amount=${amountI} returnQty=${returnQtyI} returnAmt=${returnAmtI}`);

      // 임포트 시점에는 products 조인 하지 않음 (2026-07-15 사용자 정책)
      //   · xlsx 원본 그대로 저장 → 최소 실패 지점
      //   · 조회 시점(GET /api/purchase-details 등)에 필요시 products 로 supplier/name/spec 채움
      //   · 장점: products.supplier 변경 시 즉시 반영 · 임포트 속도 개선

      // 저장 전략 (2026-07-15 · 사용자 실제 케이스 반영 · 단순화):
      //   1) 우선 1행 프로브: 스키마 감지 (period 컬럼 존재 · 유니크 제약 존재)
      //   2) 기간 기존 rows 삭제 (재임포트 · inferredFrom/To 있을 때)
      //   3) 감지 결과 따라 최적 전략으로 chunk 반복
      let inserted = 0;
      let firstError: string | null = null;

      // 1) 프로브: 첫 행 시도해서 DB 스키마·제약 파악
      const probe = parsed[0];
      let stripPeriodCols = false;
      let useSimpleInsert = false;
      {
        const probeRow = { ...probe, product_code: `__PROBE__${Date.now()}` };
        const r = await supabase.from("purchase_details").upsert([probeRow], { onConflict: "purchase_date,supplier_code,product_code,quantity,amount", ignoreDuplicates: true });
        if (r.error) {
          if (/relation .* does not exist/i.test(r.error.message)) {
            return res.status(500).json({
              error: "purchase_details 테이블이 없습니다. server/routes/purchase.ts 상단 주석의 SQL 을 Supabase 에서 실행해주세요.",
              sql_hint: "CREATE TABLE purchase_details ...",
            });
          }
          if (/period_type|period_start_date/i.test(r.error.message)) stripPeriodCols = true;
          if (/unique|exclusion constraint/i.test(r.error.message)) useSimpleInsert = true;
          // 두번째 프로브: 감지된 값으로 재시도
          const p2: any = stripPeriodCols
            ? (({ period_type, period_start_date, ...rest }: any) => rest)(probeRow)
            : probeRow;
          const r2 = useSimpleInsert
            ? await supabase.from("purchase_details").insert([p2])
            : await supabase.from("purchase_details").upsert([p2], { onConflict: "purchase_date,supplier_code,product_code,quantity,amount", ignoreDuplicates: true });
          if (r2.error) {
            // 두번째도 실패 · 세번째 (period strip + plain insert)
            if (!useSimpleInsert && /unique|exclusion/i.test(r2.error.message)) useSimpleInsert = true;
            if (!stripPeriodCols && /period_type|period_start_date/i.test(r2.error.message)) stripPeriodCols = true;
          }
        }
        // 프로브 row 삭제 (이미 저장됐다면)
        await supabase.from("purchase_details").delete().like("product_code", "__PROBE__%");
        console.log(`[upload-purchase] 스키마 감지: stripPeriodCols=${stripPeriodCols} · useSimpleInsert=${useSimpleInsert}`);
      }

      // 2) 같은 기간 재임포트: 기존 rows 삭제
      //    forceOverwrite=false (기본) · 기존 데이터 있으면 409 로 응답 · 클라이언트에서 confirm 후 재요청
      const forceOverwrite = String(req.query.force ?? "").trim() === "true";
      let deletedCount = 0;
      if (inferredFrom && inferredTo) {
        try {
          const { count: pre } = await supabase.from("purchase_details").select("*", { count: "exact", head: true })
            .gte("purchase_date", inferredFrom).lte("purchase_date", inferredTo);
          const existingCount = pre ?? 0;
          if (existingCount > 0 && !forceOverwrite) {
            // 확인 대기 · 클라이언트에게 알림
            return res.status(409).json({
              needsConfirm: true,
              existingCount,
              period: { from: inferredFrom, to: inferredTo, type: periodType },
              message: `기간 ${inferredFrom} ~ ${inferredTo} 에 이미 ${existingCount}행 존재. 덮어쓰시겠습니까?`,
            });
          }
          if (existingCount > 0) {
            const { error: delErr } = await supabase.from("purchase_details").delete()
              .gte("purchase_date", inferredFrom).lte("purchase_date", inferredTo);
            if (delErr) { console.warn(`[upload-purchase] 기간 삭제 실패 (계속): ${delErr.message}`); }
            else {
              deletedCount = existingCount;
              console.log(`[upload-purchase] 기간 ${inferredFrom} ~ ${inferredTo} 기존 ${deletedCount}행 삭제 (덮어쓰기 확인됨)`);
              useSimpleInsert = true;
            }
          }
        } catch (e: any) { console.warn(`[upload-purchase] 기간 확인/삭제 예외: ${e?.message}`); }
      }

      // 3) 감지된 전략으로 저장
      const preprocessRows = (rows: any[]) => stripPeriodCols
        ? rows.map(({ period_type, period_start_date, ...rest }) => rest)
        : rows;
      const doInsert = async (rows: any[]) => useSimpleInsert
        ? await supabase.from("purchase_details").insert(rows)
        : await supabase.from("purchase_details").upsert(rows, { onConflict: "purchase_date,supplier_code,product_code,quantity,amount", ignoreDuplicates: true });

      const CHUNK = 500;
      for (let i = 0; i < parsed.length; i += CHUNK) {
        const chunk = preprocessRows(parsed.slice(i, i + CHUNK));
        const { error } = await doInsert(chunk);
        if (error) {
          console.error(`[upload-purchase] chunk ${i}: ${error.message}`);
          if (!firstError) firstError = error.message;
        } else {
          inserted += chunk.length;
        }
      }

      // 임포트 로그 저장 (app_settings · stock 과 동일 패턴)
      //   Supabase default 1000행 제한 때문에 purchase_details 스캔으로는 이력 못 뽑음 → 별도 저장
      try {
        const { data: logData } = await supabase.from("app_settings").select("value").eq("key", "purchase_import_log").maybeSingle();
        const prevLogs = Array.isArray(logData?.value) ? (logData.value as any[]) : [];
        const logEntry = {
          timestamp: new Date().toISOString(),
          imported_at: now,
          count: inserted,
          total: parsed.length,
          deletedCount,
          period_start_date: inferredFrom || null,
          purchase_date: inferredTo || null,
          period_type: periodType,
          filename: filenameHint || null,
        };
        const newLogs = [logEntry, ...prevLogs].slice(0, 100);
        await supabase.from("app_settings").upsert(
          { key: "purchase_import_log", value: newLogs, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      } catch (e: any) { console.warn("[upload-purchase] 로그 저장 실패 (계속):", e?.message); }

      return res.json({
        ok: true,
        total: parsed.length,
        inserted,
        skipped: skipped.length,
        skipped_reasons: skipped.slice(0, 20),
        first_error: firstError,
        detected_headers: headers,
      });
    } catch (err: any) {
      console.error("[upload-purchase] 예외:", err?.message, err?.stack);
      return res.status(500).json({ error: err?.message ?? "임포트 실패" });
    }
  },
);

// ═════════════════════════════════════════════════════════════════
// GET /api/purchase-details/import-log
//   임포트 배치별 요약 (imported_at 그룹 · 각 배치의 기간·행수)
// ═════════════════════════════════════════════════════════════════
router.get("/api/purchase-details/import-log", async (_req, res) => {
  try {
    // app_settings 에서 로그 조회 (임포트 시 append · Supabase 1000행 제한 회피)
    const { data } = await supabase.from("app_settings").select("value").eq("key", "purchase_import_log").maybeSingle();
    const logs = Array.isArray(data?.value) ? (data.value as any[]) : [];
    // 프론트 호환 형식으로 매핑
    const batches = logs.map(l => ({
      imported_at: l.imported_at ?? l.timestamp,
      count: l.count ?? 0,
      startDate: l.period_start_date ?? l.purchase_date ?? "",
      endDate: l.purchase_date ?? "",
      periodStart: l.period_start_date ?? null,
      periodType: l.period_type ?? null,
      filename: l.filename ?? null,
    }));
    res.json({ batches });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "임포트 로그 조회 실패" });
  }
});

// DELETE /api/purchase-details/import-log · 이력 초기화
router.delete("/api/purchase-details/import-log", async (_req, res) => {
  try {
    await supabase.from("app_settings").upsert(
      { key: "purchase_import_log", value: [], updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "이력 초기화 실패" });
  }
});

// ═════════════════════════════════════════════════════════════════
// GET /api/purchase-details/coverage
//   기간별(월 × 초중하순) 데이터 유무 커버리지 조회
//   응답: { periods: [{ ym: "2026-07", early: 12, mid: 0, late: 8 }, ...], missing: [{ ym, period_type }] }
// ═════════════════════════════════════════════════════════════════
router.get("/api/purchase-details/coverage", async (req, res) => {
  try {
    const from = String(req.query.from ?? "").trim();
    const to = String(req.query.to ?? "").trim();
    // 매입 이력 로그(app_settings)에서 임포트된 기간 정보 조회 (Supabase 1000행 제한 회피)
    //   각 배치의 period_start_date ~ purchase_date · period_type 로 커버리지 집계
    const { data: logData } = await supabase.from("app_settings").select("value").eq("key", "purchase_import_log").maybeSingle();
    const logs = Array.isArray(logData?.value) ? (logData.value as any[]) : [];
    // 배치별 → (ym, period_type) 집계
    const bucket = new Map<string, { early: number; mid: number; late: number }>();
    for (const l of logs) {
      const d = String(l.purchase_date ?? l.period_start_date ?? "");
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      if (from && d < from) continue;
      if (to && d > to) continue;
      const ym = d.slice(0, 7);
      let pt = String(l.period_type ?? "");
      if (!pt) {
        const dd = Number(d.slice(8, 10));
        pt = dd <= 10 ? "early" : dd <= 20 ? "mid" : "late";
      }
      const cur = bucket.get(ym) ?? { early: 0, mid: 0, late: 0 };
      if (pt === "early" || pt === "mid" || pt === "late") cur[pt] += Number(l.count ?? 0) || 1;
      bucket.set(ym, cur);
    }
    // 정렬 · 첫 월 ~ 마지막 월 사이 결측 월도 채움
    const yms = Array.from(bucket.keys()).sort();
    if (yms.length > 0) {
      const [y0, m0] = yms[0].split("-").map(Number);
      const [y1, m1] = yms[yms.length - 1].split("-").map(Number);
      const all: string[] = [];
      for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); ) {
        all.push(`${y}-${String(m).padStart(2, "0")}`);
        m++; if (m > 12) { m = 1; y++; }
      }
      for (const ym of all) if (!bucket.has(ym)) bucket.set(ym, { early: 0, mid: 0, late: 0 });
    }
    const periods = Array.from(bucket.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, v]) => ({ ym, ...v, total: v.early + v.mid + v.late }));
    const missing: Array<{ ym: string; period_type: string }> = [];
    for (const p of periods) {
      if (p.early === 0) missing.push({ ym: p.ym, period_type: "early" });
      if (p.mid === 0)   missing.push({ ym: p.ym, period_type: "mid" });
      if (p.late === 0)  missing.push({ ym: p.ym, period_type: "late" });
    }
    res.json({ periods, missing });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "커버리지 조회 실패" });
  }
});

// ═════════════════════════════════════════════════════════════════
// GET /api/purchase-details
//   query: product_code · supplier · from · to · limit
//   상품별 or 공급사별 매입 이력 조회
// ═════════════════════════════════════════════════════════════════
router.get("/api/purchase-details", async (req, res) => {
  try {
    const productCode = String(req.query.product_code ?? "").trim();
    const supplier = String(req.query.supplier ?? "").trim();
    const from = String(req.query.from ?? "").trim();
    const to = String(req.query.to ?? "").trim();
    const limit = Math.max(1, Math.min(5000, parseInt(String(req.query.limit ?? "500"), 10) || 500));

    let q = supabase
      .from("purchase_details")
      .select("id, purchase_date, period_start_date, period_type, supplier_code, supplier_name, product_code, product_name, spec, quantity, unit_price, amount, vat, total")
      .order("purchase_date", { ascending: false })
      .limit(limit);
    if (productCode) q = q.eq("product_code", productCode);
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte("purchase_date", from);
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lte("purchase_date", to);

    const { data, error } = await q;
    if (error) {
      if (/relation .* does not exist/i.test(error.message)) {
        return res.json({ rows: [], warning: "purchase_details 테이블 없음 (임포트 필요)" });
      }
      throw new Error(error.message);
    }
    let rows = data ?? [];

    // 조회 시 products 조인: xlsx 에 없는 supplier/name/spec 보강 + min_order (2026-07-15)
    const codes = Array.from(new Set(rows.map(r => String((r as any).product_code ?? "")).filter(Boolean)));
    if (codes.length > 0) {
      try {
        const PCHUNK = 500;
        const pMap = new Map<string, { supplier: string | null; supplier_code: string | null; product_name: string | null; spec: string | null; min_order: number }>();
        for (let i = 0; i < codes.length; i += PCHUNK) {
          const chunk = codes.slice(i, i + PCHUNK);
          const { data: pd } = await supabase
            .from("products")
            .select("product_code, supplier, supplier_code, product_name, spec, min_order")
            .in("product_code", chunk);
          for (const p of pd ?? []) {
            pMap.set(String((p as any).product_code), {
              supplier: (p as any).supplier ?? null,
              supplier_code: (p as any).supplier_code ?? null,
              product_name: (p as any).product_name ?? null,
              spec: (p as any).spec ?? null,
              min_order: Number((p as any).min_order ?? 0) || 0,
            });
          }
        }
        rows = rows.map((r: any) => {
          const info = pMap.get(String(r.product_code));
          if (!info) return r;
          return {
            ...r,
            supplier_name: r.supplier_name ?? info.supplier,
            supplier_code: r.supplier_code ?? info.supplier_code,
            product_name: r.product_name ?? info.product_name,
            spec: r.spec ?? info.spec,
            min_order: info.min_order,
          };
        });
      } catch (e: any) {
        console.warn("[purchase-details] products 조인 실패 (계속):", e?.message);
      }
    }

    // 매입주기 계산: 각 product_code 별 전체 이력 조회 → (last - first) / (count - 1)
    //   결과 rows 의 각 행에 cycle_days · purchase_count 부착
    if (codes.length > 0) {
      try {
        const cycleMap = new Map<string, { firstDate: string; lastDate: string; count: number; days: number }>();
        const PCHUNK = 500;
        for (let i = 0; i < codes.length; i += PCHUNK) {
          const chunk = codes.slice(i, i + PCHUNK);
          const { data: hist } = await supabase
            .from("purchase_details")
            .select("product_code, purchase_date")
            .in("product_code", chunk);
          const byCode = new Map<string, string[]>();
          for (const r of hist ?? []) {
            const c = String((r as any).product_code ?? "");
            const d = String((r as any).purchase_date ?? "");
            if (!c || !d) continue;
            const arr = byCode.get(c) ?? [];
            arr.push(d);
            byCode.set(c, arr);
          }
          for (const [c, dates] of byCode) {
            if (dates.length < 2) { cycleMap.set(c, { firstDate: dates[0] ?? "", lastDate: dates[0] ?? "", count: dates.length, days: 0 }); continue; }
            dates.sort();
            const first = dates[0], last = dates[dates.length - 1];
            const days = Math.round((new Date(last).getTime() - new Date(first).getTime()) / (86400 * 1000));
            const cycle = dates.length > 1 ? Math.round(days / (dates.length - 1)) : 0;
            cycleMap.set(c, { firstDate: first, lastDate: last, count: dates.length, days: cycle });
          }
        }
        rows = rows.map((r: any) => {
          const info = cycleMap.get(String(r.product_code));
          if (!info) return r;
          return { ...r, cycle_days: info.days, purchase_count_total: info.count, first_purchase_date: info.firstDate };
        });
      } catch (e: any) {
        console.warn("[purchase-details] 매입주기 계산 실패 (계속):", e?.message);
      }
    }

    // 공급사 필터 (조인 후 처리 · products.supplier 보강값도 인식)
    if (supplier) rows = rows.filter((r: any) => String(r.supplier_name ?? "").trim() === supplier);

    res.json({ rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "조회 실패" });
  }
});

// ═════════════════════════════════════════════════════════════════
// GET /api/purchase-details/summary?product_code=X
//   상품별 요약: 최근 매입일 · 총 매입 수량 · 총 매입 금액
// ═════════════════════════════════════════════════════════════════
router.get("/api/purchase-details/summary", async (req, res) => {
  try {
    const productCode = String(req.query.product_code ?? "").trim();
    if (!productCode) return res.status(400).json({ error: "product_code 필요" });

    const { data, error } = await supabase
      .from("purchase_details")
      .select("purchase_date, quantity, amount, total, supplier_name")
      .eq("product_code", productCode)
      .order("purchase_date", { ascending: false })
      .limit(1000);
    if (error) {
      if (/relation .* does not exist/i.test(error.message)) return res.json({ latest: null, totalQty: 0, totalAmount: 0, count: 0 });
      throw new Error(error.message);
    }
    const rows = data ?? [];
    const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const totalAmount = rows.reduce((s, r) => s + (Number(r.total ?? r.amount) || 0), 0);
    res.json({
      product_code: productCode,
      latest: rows[0]?.purchase_date ?? null,
      latest_supplier: rows[0]?.supplier_name ?? null,
      totalQty,
      totalAmount,
      count: rows.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "요약 조회 실패" });
  }
});

export default router;
