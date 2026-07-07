// 재임포트 덮어쓰기 검증
//   1. 첫 임포트: 2026-07-01 ~ 2026-07-07 (부분) · 3개 상품
//   2. 두 번째 임포트: 2026-07-01 ~ 2026-07-10 (전체) · 5개 상품
//      → 같은 period_start_date=2026-07-01 이므로 첫 임포트 3행 완전 삭제 후 5행 INSERT
//   3. 다른 기간 임포트: 2026-07-11 ~ 2026-07-20 · 2개 상품
//      → 별개 period_start_date · 위 5행 그대로 유지, 별도 2행 추가
//   4. 로그 · DB 검증 후 정리
import "dotenv/config";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const BASE = "http://localhost:3000";

const TEST_CODES = ["TESTA0001","TESTA0002","TESTA0003","TESTA0004","TESTA0005"];

let pass = 0, fail = 0;
const step = (label: string, ok: boolean, detail?: any) => {
  const mark = ok ? "✅" : "❌";
  console.log(`  ${mark}  ${label}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`);
  ok ? pass++ : fail++;
};

function buildXlsx(codes: string[]) {
  const rows: any[][] = [
    ["세부구분","세부구분","세부구분","세부구분","세부구분","세부구분","세부구분","재고 정보","재고 정보","재고 정보","재고 정보","재고 정보","재고 정보","재고 정보","재고금액","재고금액","재고금액","재고금액","재고금액"],
    ["공급사코드","공급사명","코드","명","규격","i","상품유형","시작일 재고","입고계","판매출고계","폐기","사내소비","재고조정 반영수량","종료일 재고","과세","공급가액","부가세","면세","합계"],
  ];
  for (const [i, code] of codes.entries()) {
    rows.push([`T${i}`,`TEST_SUP_${i}`, code, `테스트상품${code}`, "T", "과직", "수량", 10+i, 5, 3, 0, 0, 0, 12+i, 100+i, 90+i, 10, 0, 100+i]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "재고");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function upload(startDate: string, endDate: string, codes: string[]) {
  const { data: mgr } = await s.from("employees").select("id").gte("level", 9).limit(1);
  if (!mgr?.[0]) throw new Error("no manager");
  const params = new URLSearchParams({
    managerId: String(mgr[0].id),
    snapshot_date: endDate,
    start_date: startDate,
  });
  const res = await fetch(`${BASE}/api/upload-stock?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: buildXlsx(codes),
  });
  return { status: res.status, body: await res.json() };
}

async function countByPeriodStart(startDate: string): Promise<number> {
  const { count } = await s
    .from("stock_history")
    .select("*", { count: "exact", head: true })
    .eq("period_start_date", startDate)
    .in("product_code", TEST_CODES);
  return count ?? 0;
}

async function cleanup() {
  await s.from("stock_history").delete().in("product_code", TEST_CODES);
  // 로그도 정리
  const { data } = await s.from("app_settings").select("value").eq("key", "stock_import_log").maybeSingle();
  const arr = Array.isArray(data?.value) ? data.value : [];
  const filtered = arr.filter((e: any) =>
    e.snapshot_date !== "2026-07-07" &&
    e.snapshot_date !== "2026-07-10" &&
    e.snapshot_date !== "2026-07-20"
  );
  await s.from("app_settings").upsert({ key: "stock_import_log", value: filtered, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

(async () => {
  console.log("──────── 재임포트 덮어쓰기 flow 테스트 ────────\n");

  // 시작 전 클린업
  await cleanup();

  // (1) 첫 임포트: 7/1 ~ 7/7 (부분) · 3개
  console.log("① 7/1 ~ 7/7 부분 임포트 (3개 상품)");
  {
    const r = await upload("2026-07-01", "2026-07-07", TEST_CODES.slice(0, 3));
    step("업로드 200", r.status === 200, r.body);
    step(`history=3 응답 확인`, r.body.history === 3, { history: r.body.history });
    step(`deleted=0 (신규 기간)`, r.body.deleted === 0, { deleted: r.body.deleted });
    const c = await countByPeriodStart("2026-07-01");
    step(`DB period_start_date=2026-07-01 rows=3`, c === 3, { count: c });
  }

  // (2) 두 번째 임포트: 7/1 ~ 7/10 (전체) · 5개 상품
  console.log("\n② 7/1 ~ 7/10 전체 임포트 (5개 상품) — 같은 기간 재임포트");
  {
    const r = await upload("2026-07-01", "2026-07-10", TEST_CODES);
    step("업로드 200", r.status === 200, r.body);
    step(`history=5 새로 저장`, r.body.history === 5, { history: r.body.history });
    step(`deleted=3 이전 rows 완전 삭제`, r.body.deleted === 3, { deleted: r.body.deleted });
    const c = await countByPeriodStart("2026-07-01");
    step(`DB period_start_date=2026-07-01 rows=5 (덮어쓰기 완료)`, c === 5, { count: c });
    // snapshot_date 는 새 종료일로 갱신됐어야 함
    const { data: sample } = await s.from("stock_history").select("snapshot_date").eq("period_start_date", "2026-07-01").in("product_code", TEST_CODES).limit(1);
    step(`snapshot_date 갱신=2026-07-10`, sample?.[0]?.snapshot_date === "2026-07-10", sample?.[0]);
  }

  // (3) 다른 기간 임포트: 7/11 ~ 7/20 · 2개 (별개 기간)
  console.log("\n③ 7/11 ~ 7/20 임포트 (2개 상품) — 별개 기간");
  {
    const r = await upload("2026-07-11", "2026-07-20", TEST_CODES.slice(0, 2));
    step("업로드 200", r.status === 200, r.body);
    step(`history=2 신규 저장`, r.body.history === 2, { history: r.body.history });
    step(`deleted=0 (다른 기간 · 영향 없음)`, r.body.deleted === 0, { deleted: r.body.deleted });
    const cEarly = await countByPeriodStart("2026-07-01");
    step(`이전 초순 rows=5 그대로 유지`, cEarly === 5, { count: cEarly });
    const cMid = await countByPeriodStart("2026-07-11");
    step(`신규 중순 rows=2`, cMid === 2, { count: cMid });
  }

  // (4) 상품 하나의 10일 판매추이 조회 (product_code=TESTA0001)
  console.log("\n④ 상품 TESTA0001 의 기간별 조회");
  {
    const { data } = await s
      .from("stock_history")
      .select("period_start_date, snapshot_date, period_type, sale_qty, purchase_qty, closing_stock")
      .eq("product_code", "TESTA0001")
      .order("period_start_date", { ascending: true });
    console.log("    기간별 timeline:");
    for (const r of data ?? []) {
      console.log(`      ${(r as any).period_start_date} ~ ${(r as any).snapshot_date}  (${(r as any).period_type})  판매=${(r as any).sale_qty} 매입=${(r as any).purchase_qty} 종료=${(r as any).closing_stock}`);
    }
    step("TESTA0001 시계열 조회 성공 (2건)", (data?.length ?? 0) === 2);
  }

  // (5) 클린업
  await cleanup();
  console.log("\n(테스트 데이터 · 로그 정리 완료)");

  console.log(`\n합계: PASS ${pass} · FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error(e);
  await cleanup();
  process.exit(1);
});
