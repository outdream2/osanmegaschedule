// 2026-10-06 · PHASE 1 · schedule 영역 orphan READ-ONLY audit
//
// 목적:
//   - employees 삭제 시 ON DELETE CASCADE 가 없으므로 schedules / leave_requests /
//     employee_contracts / resignation_requests 에 orphan row 가 쌓일 수 있음.
//   - FK 추가 전에 현재 orphan 상태 (count + sample ID 20개) 를 확인.
//
// 안전 규칙:
//   - 절대 INSERT / UPDATE / DELETE 하지 않는다 (READ ONLY).
//   - 이름으로 데이터를 복원하지 않는다 (사용자 지시).
//   - 발견한 orphan 을 자동으로 수정하지 않는다 (보고만).
//
// 실행:
//   node scripts/schedule-orphan-audit-2026-10-06.mjs
//
// 환경변수:
//   SUPABASE_URL, SUPABASE_KEY (service_role 권장 · 그렇지 않으면 RLS 로 결과가 불완전할 수 있음)

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_KEY 미설정 (.env 확인)");
  process.exit(1);
}
const supabase = createClient(url, key);

// 1. employees.id 전체 수집 (유효 참조 셋)
async function loadEmployeeIds() {
  const ids = new Set();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("employees")
      .select("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`employees · ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) ids.add(Number(r.id));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return ids;
}

// 2. 특정 테이블의 참조 컬럼 값 전체 수집 + orphan 선별 (count + 20개 샘플)
async function auditOrphans(table, fkCol, employeeIds, options = {}) {
  const pkCol = options.pkCol || "id";
  const ids = [];
  const orphanSamples = [];
  let from = 0;
  const PAGE = 1000;
  let totalRows = 0;
  while (true) {
    const sel = `${pkCol}, ${fkCol}`;
    const { data, error } = await supabase
      .from(table)
      .select(sel)
      .range(from, from + PAGE - 1);
    if (error) {
      if (/relation .* does not exist|table .* does not exist/i.test(error.message)) {
        return { table, exists: false, totalRows: 0, orphans: 0, orphanSamples: [], err: error.message };
      }
      throw new Error(`${table} · ${error.message}`);
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      totalRows++;
      const fkVal = r[fkCol];
      if (fkVal == null) {
        orphanSamples.push({ pk: r[pkCol], fkCol, fkVal: null, reason: "FK NULL" });
      } else if (!employeeIds.has(Number(fkVal))) {
        orphanSamples.push({ pk: r[pkCol], fkCol, fkVal: Number(fkVal), reason: "employee not found" });
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return {
    table,
    exists: true,
    totalRows,
    orphans: orphanSamples.length,
    orphanSamples: orphanSamples.slice(0, 20),
  };
}

async function main() {
  console.log("===== SCHEDULE PHASE 1 · ORPHAN AUDIT (READ-ONLY) · 2026-10-06 =====\n");

  console.log("[1] employees.id 셋 로드...");
  const employeeIds = await loadEmployeeIds();
  console.log(`    총 employees row: ${employeeIds.size}\n`);

  const targets = [
    { table: "schedules", fkCol: "employeeId", pkCol: "id" },
    { table: "leave_requests", fkCol: "employee_id", pkCol: "id" },
    { table: "employee_contracts", fkCol: "employee_id", pkCol: "id" },
    { table: "resignation_requests", fkCol: "employee_id", pkCol: "id" },
  ];

  const results = [];
  for (const t of targets) {
    console.log(`[2] ${t.table}.${t.fkCol} orphan 조사...`);
    try {
      const r = await auditOrphans(t.table, t.fkCol, employeeIds, { pkCol: t.pkCol });
      results.push(r);
      if (!r.exists) {
        console.log(`    테이블 없음 (${r.err})\n`);
        continue;
      }
      console.log(`    total=${r.totalRows} · orphans=${r.orphans}`);
      if (r.orphans > 0) {
        console.log(`    orphan sample (최대 20):`);
        for (const s of r.orphanSamples) {
          console.log(`      pk=${s.pk} · ${s.fkCol}=${s.fkVal} · ${s.reason}`);
        }
      }
      console.log("");
    } catch (e) {
      console.log(`    ERROR · ${e?.message ?? e}\n`);
      results.push({ table: t.table, error: String(e?.message ?? e) });
    }
  }

  console.log("===== 요약 =====");
  for (const r of results) {
    if (!r.exists && r.err) {
      console.log(`  ${r.table.padEnd(26)} TABLE_MISSING`);
    } else if (r.error) {
      console.log(`  ${r.table.padEnd(26)} ERROR · ${r.error}`);
    } else {
      console.log(`  ${r.table.padEnd(26)} total=${r.totalRows} · orphans=${r.orphans}`);
    }
  }

  const hasOrphan = results.some(r => (r.orphans ?? 0) > 0);
  const anyMissing = results.some(r => r.exists === false);
  console.log("");
  if (hasOrphan) {
    console.log("[결정] orphan > 0 발견 → FK migration 적용 금지. 사용자 수동 확인 필요.");
    process.exit(2);
  } else if (anyMissing) {
    console.log("[결정] 일부 테이블 없음. 존재 테이블의 orphan 은 0.");
    process.exit(0);
  } else {
    console.log("[결정] orphan=0 · FK migration (schedule_phase_1_fk_constraints_2026-10-06.sql) 적용 안전.");
    process.exit(0);
  }
}

main().catch(err => {
  console.error("[FATAL]", err?.message ?? err);
  process.exit(1);
});
