// =============================================================================
// SCHEDULE V1 · PHASE 3-0 · DATA INTEGRITY GATE · READ-ONLY LIVE AUDIT
// 2026-10-07
//
// 안전 규칙 (사용자 명시):
//   - 모든 호출 SELECT 전용. INSERT/UPDATE/DELETE 금지.
//   - 발견한 P0 자동 수정 금지.
//   - 이름 → ID 복구 금지. position → employee 추정 금지.
//   - 박부장 historical row (leave_requests.id='297371b0-...') 보존.
//
// 실행:
//   node scripts/schedule-phase-3-data-integrity.mjs > tmp/_phase-3-audit.json
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!URL || !KEY) {
  console.error("SUPABASE_URL / SUPABASE_KEY 미설정");
  process.exit(1);
}
const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const PRESERVED_LEAVE_ID = "297371b0-c0fb-4706-b783-7a42414c299c";
const OFF_TYPES = ["휴무", "월차", "지정휴무", "결근"];
const HALF_DAY_TYPES = ["오전반차", "오후반차"];
const OFF_OR_HALF = new Set([...OFF_TYPES, ...HALF_DAY_TYPES]);
const LEAVE_TYPES = new Set(["월차", "오전반차", "오후반차"]);

const result = { generatedAt: new Date().toISOString(), sections: {} };

async function pageAll(table, select, pageSize = 1000) {
  let from = 0;
  const rows = [];
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table} · ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function tableCount(table, filter) {
  try {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) return { error: error.message };
    return count ?? 0;
  } catch (e) {
    return { error: e?.message ?? String(e) };
  }
}

function isLikelyDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function daysBetweenInclusive(a, b) {
  if (!isLikelyDate(a) || !isLikelyDate(b)) return null;
  const d1 = new Date(a + "T00:00:00Z").getTime();
  const d2 = new Date(b + "T00:00:00Z").getTime();
  return Math.round((d2 - d1) / 86400000) + 1;
}
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

async function probeTable(t) {
  try {
    const { count, error, status } = await supabase.from(t).select("*", { count: "exact", head: true });
    return { exists: !error, count: count ?? null, status, error: error?.message };
  } catch (e) {
    return { exists: false, error: e?.message ?? String(e) };
  }
}
async function sampleColumns(table) {
  const { data, error } = await supabase.from(table).select("*").limit(1);
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { columns: [] };
  return { columns: Object.keys(data[0]) };
}

async function probeColumn(table, col) {
  const { error } = await supabase.from(table).select(col).limit(0);
  return !error;
}

async function main() {
  // ---------------- SECTION 1 · TABLE PROBE ----------------
  console.error("[1] probe tables...");
  const tables = [
    "employees",
    "schedules",
    "leave_requests",
    "employee_contracts",
    "resignation_requests",
    "app_settings",
    "reservations",
    "attendance",
  ];
  const tableProbe = {};
  for (const t of tables) tableProbe[t] = await probeTable(t);
  result.sections.s1_tableProbe = tableProbe;

  // ---------------- SECTION 2 · COLUMN SHAPE ----------------
  console.error("[2] column shape...");
  const columnShape = {};
  for (const t of Object.keys(tableProbe)) {
    if (!tableProbe[t].exists) continue;
    const cs = await sampleColumns(t);
    columnShape[t] = cs;
  }
  // probe empty tables for known columns
  const probeMap = {
    employee_contracts: ["id","employee_id","employee_name","start_date","end_date","contract_type","storage_path","created_at"],
    resignation_requests: ["id","employee_id","employee_name","status","reason","approved_at","approved_by","handover_notes","created_at"],
    reservations: ["id","date","time","assigned_employee_id","employee_name_snapshot","vendor_id","purpose","company","contact_name","phone","note","created_at"],
  };
  for (const [t, cols] of Object.entries(probeMap)) {
    if (!tableProbe[t].exists) continue;
    const existing = columnShape[t]?.columns?.length ? columnShape[t].columns : null;
    if (existing && existing.length > 0) continue;
    const confirmed = [];
    for (const c of cols) if (await probeColumn(t, c)) confirmed.push(c);
    columnShape[t] = { columns: confirmed, note: "probed via SELECT limit(0) · table empty" };
  }
  result.sections.s2_columnShape = columnShape;

  // Record missing audit columns
  result.sections.s2_schemaGaps = {
    schedules_has_created_at: !!columnShape.schedules?.columns?.includes("created_at"),
    schedules_has_updated_at: !!columnShape.schedules?.columns?.includes("updated_at"),
    leave_requests_has_half_day_type: !!columnShape.leave_requests?.columns?.includes("half_day_type"),
    leave_requests_has_request_type: !!columnShape.leave_requests?.columns?.includes("request_type"),
    resignation_has_effective_date: !!columnShape.resignation_requests?.columns?.includes("effective_date"),
    app_settings_has_created_at: !!columnShape.app_settings?.columns?.includes("created_at"),
  };

  // ---------------- SECTION 3 · ROW COUNT BASELINE ----------------
  console.error("[3] baseline counts...");
  const rc = {};
  rc.employees = await tableCount("employees");
  rc.employees_retireDate_null = await tableCount("employees", q => q.is("retireDate", null));
  rc.employees_retireDate_empty = await tableCount("employees", q => q.eq("retireDate", ""));
  rc.employees_retireDate_notnull = await tableCount("employees", q => q.not("retireDate", "is", null));
  rc.schedules = await tableCount("schedules");
  rc.schedules_future = await tableCount("schedules", q => q.gte("date", todayStr()));
  rc.schedules_past = await tableCount("schedules", q => q.lt("date", todayStr()));
  rc.leave_requests = await tableCount("leave_requests");
  for (const st of ["approved","pending","rejected","cancelled"]) {
    rc[`leave_${st}`] = await tableCount("leave_requests", q => q.eq("status", st));
  }
  rc.employee_contracts = await tableCount("employee_contracts");
  rc.resignation_requests = await tableCount("resignation_requests");
  rc.reservations = await tableCount("reservations");
  rc.app_settings = await tableCount("app_settings");
  result.sections.s3_counts = rc;

  // ---------------- SECTION 4 · EMPLOYEE MASTER ----------------
  console.error("[4] load employees master...");
  const empSelect = "id, name, position, rank, workplace, employmentType, hireDate, retireDate, level";
  const employees = await pageAll("employees", empSelect);
  const empIdSet = new Set(employees.map(e => Number(e.id)));
  const empById = new Map(employees.map(e => [Number(e.id), e]));
  const today = todayStr();
  const dupIds = (() => {
    const m = new Map();
    for (const e of employees) m.set(e.id, (m.get(e.id) || 0) + 1);
    return [...m.entries()].filter(([, c]) => c > 1);
  })();
  const retireStates = { ACTIVE_NULL: 0, ACTIVE_EMPTY: 0, RETIRED_PAST: 0, RETIRE_FUTURE: 0 };
  for (const e of employees) {
    const r = e.retireDate;
    if (r == null) retireStates.ACTIVE_NULL++;
    else if (r === "") retireStates.ACTIVE_EMPTY++;
    else if (r > today) retireStates.RETIRE_FUTURE++;
    else retireStates.RETIRED_PAST++;
  }
  result.sections.s4_master = {
    totalEmployees: employees.length,
    duplicateIds: dupIds,
    nullIds: employees.filter(e => e.id == null).length,
    retireStates,
  };

  // ---------------- SECTION 5 · SCHEDULE ↔ EMPLOYEE ----------------
  console.error("[5] schedules orphan audit...");
  const schedulesSelect = "id, employeeId, date, type, workingHours, actualHours, memo, source_leave_id";
  const schedules = await pageAll("schedules", schedulesSelect);
  const orphanSchedules = schedules.filter(s => s.employeeId != null && !empIdSet.has(Number(s.employeeId)));
  const orphanCurrentOrFuture = orphanSchedules.filter(s => isLikelyDate(s.date) && s.date >= today);
  result.sections.s5_scheduleOrphan = {
    totalSchedules: schedules.length,
    employeeIdNull: schedules.filter(s => s.employeeId == null).length,
    orphanTotal: orphanSchedules.length,
    orphanCurrentOrFuture: orphanCurrentOrFuture.length,
    orphanSamples: orphanSchedules.slice(0, 50).map(s => ({
      id: s.id, employeeId: s.employeeId, date: s.date, type: s.type,
      workingHours: s.workingHours, source_leave_id: s.source_leave_id,
    })),
  };

  // ---------------- SECTION 6 · 박부장 KNOWN LEGACY ----------------
  console.error("[6] 박부장 recheck...");
  const { data: parkRow } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("id", PRESERVED_LEAVE_ID)
    .maybeSingle();
  result.sections.s6_park = {
    preservedRow: parkRow,
    employee3Exists: empById.has(3),
    employee3: empById.get(3) || null,
    otherRefs: {
      schedules: schedules.filter(s => Number(s.employeeId) === 3).length,
      leaves_total: await tableCount("leave_requests", q => q.eq("employee_id", 3)),
      contracts: await tableCount("employee_contracts", q => q.eq("employee_id", 3)),
      resignations: await tableCount("resignation_requests", q => q.eq("employee_id", 3)),
      reservations: await tableCount("reservations", q => q.eq("assigned_employee_id", 3)),
    },
  };

  // ---------------- SECTION 7 · LEAVES ↔ EMPLOYEES ----------------
  console.error("[7] leaves orphan audit...");
  const leavesSelect = "id, employee_id, employee_name, leave_type, status, start_date, end_date, reason, reviewer_note, reviewed_at, created_at";
  const leaves = await pageAll("leave_requests", leavesSelect);
  const orphanLeaves = leaves.filter(l => l.employee_id != null && !empIdSet.has(Number(l.employee_id)));
  const newOrphanLeaves = orphanLeaves.filter(l => l.id !== PRESERVED_LEAVE_ID);
  result.sections.s7_leaveOrphan = {
    totalLeaves: leaves.length,
    orphanTotal: orphanLeaves.length,
    newOrphan: newOrphanLeaves.length,
    orphanSamples: orphanLeaves.slice(0, 50),
  };

  // ---------------- SECTION 8 · source_leave_id ----------------
  console.error("[8] source_leave_id provenance...");
  const leaveIdSet = new Set(leaves.map(l => l.id));
  const leaveById = new Map(leaves.map(l => [l.id, l]));
  const schedulesWithSrc = schedules.filter(s => s.source_leave_id != null);
  const dangling = schedulesWithSrc.filter(s => !leaveIdSet.has(s.source_leave_id));
  const bySrc = new Map();
  for (const s of schedulesWithSrc) {
    const a = bySrc.get(s.source_leave_id) || []; a.push(s); bySrc.set(s.source_leave_id, a);
  }
  const overProjected = [];
  for (const [srcId, arr] of bySrc) {
    const lr = leaveById.get(srcId);
    if (!lr) continue;
    const expected = daysBetweenInclusive(lr.start_date, lr.end_date);
    if (expected == null) continue;
    if (arr.length > expected) {
      overProjected.push({
        source_leave_id: srcId, status: lr.status, leave_type: lr.leave_type,
        start: lr.start_date, end: lr.end_date, expected, actual: arr.length,
      });
    }
  }
  result.sections.s8_sourceLeave = {
    nonNullCount: schedulesWithSrc.length,
    nullCount: schedules.length - schedulesWithSrc.length,
    dangling: dangling.length,
    danglingSamples: dangling.slice(0, 50).map(s => ({
      scheduleId: s.id, source_leave_id: s.source_leave_id, employeeId: s.employeeId, date: s.date, type: s.type,
    })),
    overProjectedCount: overProjected.length,
    overProjectedSamples: overProjected.slice(0, 50),
  };

  // ---------------- SECTION 9 · LEAVE PROJECTION CONSISTENCY ----------------
  console.error("[9] leave projection consistency...");
  const schedulesBySrc = new Map();
  for (const s of schedulesWithSrc) {
    const a = schedulesBySrc.get(s.source_leave_id) || []; a.push(s); schedulesBySrc.set(s.source_leave_id, a);
  }
  const approvedLeaves = leaves.filter(l => l.status === "approved");
  const approvedNoProjection = approvedLeaves.filter(l => !schedulesBySrc.has(l.id));

  // Build schedule index: emp+date → schedules
  const scheduleIndex = new Map();
  for (const s of schedules) {
    const k = `${s.employeeId}|${s.date}`;
    const a = scheduleIndex.get(k) || []; a.push(s); scheduleIndex.set(k, a);
  }
  const workingOnApprovedLeave = [];
  for (const l of approvedLeaves) {
    if (!isLikelyDate(l.start_date) || !isLikelyDate(l.end_date)) continue;
    let d = new Date(l.start_date + "T00:00:00Z");
    const end = new Date(l.end_date + "T00:00:00Z");
    while (d.getTime() <= end.getTime()) {
      const ds = d.toISOString().slice(0, 10);
      const k = `${l.employee_id}|${ds}`;
      const list = scheduleIndex.get(k) || [];
      for (const s of list) {
        if (!OFF_OR_HALF.has(s.type)) {
          workingOnApprovedLeave.push({
            leaveId: l.id, employeeId: l.employee_id, date: ds, leaveType: l.leave_type,
            scheduleId: s.id, scheduleType: s.type, workingHours: s.workingHours,
          });
        }
      }
      d = new Date(d.getTime() + 86400000);
    }
  }

  const terminatedLeaves = leaves.filter(l => l.status === "cancelled" || l.status === "rejected");
  const terminatedButProjected = [];
  for (const l of terminatedLeaves) {
    const arr = schedulesBySrc.get(l.id);
    if (arr && arr.length > 0) {
      terminatedButProjected.push({
        leaveId: l.id, status: l.status, leave_type: l.leave_type,
        start: l.start_date, end: l.end_date, scheduleRows: arr.length,
        samples: arr.slice(0, 5).map(s => ({ id: s.id, date: s.date, type: s.type })),
      });
    }
  }

  const legacyNullSourceButLeaveType = schedules.filter(
    s => s.source_leave_id == null && LEAVE_TYPES.has(s.type)
  );

  result.sections.s9_leaveProjection = {
    approvedNoProjectionCount: approvedNoProjection.length,
    approvedNoProjectionSamples: approvedNoProjection.slice(0, 50).map(l => ({
      id: l.id, employee_id: l.employee_id, name: l.employee_name,
      start: l.start_date, end: l.end_date, leave_type: l.leave_type,
    })),
    workingOnApprovedLeaveCount: workingOnApprovedLeave.length,
    workingOnApprovedLeaveSamples: workingOnApprovedLeave.slice(0, 50),
    terminatedButProjectedCount: terminatedButProjected.length,
    terminatedButProjectedSamples: terminatedButProjected.slice(0, 50),
    legacyNullSourceButLeaveTypeCount: legacyNullSourceButLeaveType.length,
    legacyNullSourceButLeaveTypeSamples: legacyNullSourceButLeaveType.slice(0, 50).map(s => ({
      id: s.id, employeeId: s.employeeId, date: s.date, type: s.type,
    })),
  };

  // ---------------- SECTION 10 · DUPLICATE ----------------
  console.error("[10] duplicate audit...");
  const dupByEmpDate = new Map();
  const dupByEmpDateType = new Map();
  for (const s of schedules) {
    const k1 = `${s.employeeId}|${s.date}`;
    const k2 = `${s.employeeId}|${s.date}|${s.type}`;
    dupByEmpDate.set(k1, (dupByEmpDate.get(k1) || 0) + 1);
    dupByEmpDateType.set(k2, (dupByEmpDateType.get(k2) || 0) + 1);
  }
  const dupEmpDate = [...dupByEmpDate.entries()].filter(([, c]) => c > 1);
  const dupEmpDateType = [...dupByEmpDateType.entries()].filter(([, c]) => c > 1);
  result.sections.s10_duplicate = {
    duplicateByEmpDateCount: dupEmpDate.length,
    duplicateByEmpDateSamples: dupEmpDate.slice(0, 50).map(([k, c]) => ({ key: k, count: c })),
    duplicateByEmpDateTypeCount: dupEmpDateType.length,
    duplicateByEmpDateTypeSamples: dupEmpDateType.slice(0, 50).map(([k, c]) => ({ key: k, count: c })),
  };

  // ---------------- SECTION 11 · DATE INTEGRITY ----------------
  console.error("[11] date integrity...");
  const dateNull = schedules.filter(s => !s.date);
  const dateInvalid = schedules.filter(s => s.date && !isLikelyDate(s.date));
  const outOfRange = schedules.filter(s => isLikelyDate(s.date) && (s.date < "2020-01-01" || s.date > "2030-12-31"));
  const leaveReversed = leaves.filter(l => isLikelyDate(l.start_date) && isLikelyDate(l.end_date) && l.start_date > l.end_date);
  result.sections.s11_dateIntegrity = {
    schedulesNullDate: dateNull.length,
    schedulesInvalidDateCount: dateInvalid.length,
    schedulesInvalidDateSamples: dateInvalid.slice(0, 30).map(s => ({ id: s.id, date: s.date })),
    schedulesOutOfRangeCount: outOfRange.length,
    schedulesOutOfRangeSamples: outOfRange.slice(0, 30).map(s => ({ id: s.id, date: s.date })),
    leaveReversedCount: leaveReversed.length,
    leaveReversedSamples: leaveReversed.slice(0, 30),
  };

  // ---------------- SECTION 12 · WORKING HOURS ----------------
  console.error("[12] working hours...");
  const whPattern = /^\d{2}:\d{2}-\d{2}:\d{2}$/;
  const whNullOrEmpty = schedules.filter(s => s.workingHours == null || s.workingHours === "");
  const whMalformed = schedules.filter(s => s.workingHours && !whPattern.test(s.workingHours));
  const workingTypeWithoutWh = schedules.filter(s => !OFF_OR_HALF.has(s.type) && (!s.workingHours || s.workingHours === ""));
  const whReversed = schedules.filter(s => {
    if (!s.workingHours || !whPattern.test(s.workingHours)) return false;
    const [a, b] = s.workingHours.split("-");
    return a >= b;
  });
  result.sections.s12_workingHours = {
    nullOrEmptyCount: whNullOrEmpty.length,
    malformedCount: whMalformed.length,
    malformedSamples: whMalformed.slice(0, 30).map(s => ({ id: s.id, wh: s.workingHours, type: s.type })),
    workingTypeWithoutWhCount: workingTypeWithoutWh.length,
    workingTypeWithoutWhSamples: workingTypeWithoutWh.slice(0, 30).map(s => ({
      id: s.id, employeeId: s.employeeId, date: s.date, type: s.type,
    })),
    reversedCount: whReversed.length,
    reversedSamples: whReversed.slice(0, 30),
  };

  // ---------------- SECTION 13 · SCHEDULE TYPE ----------------
  const typeDist = new Map();
  for (const s of schedules) typeDist.set(s.type, (typeDist.get(s.type) || 0) + 1);

  // ---------------- SECTION 14 · TAXONOMY ----------------
  const positionDist = new Map();
  const rankDist = new Map();
  const workplaceDist = new Map();
  const employmentTypeDist = new Map();
  for (const e of employees) {
    positionDist.set(e.position, (positionDist.get(e.position) || 0) + 1);
    rankDist.set(e.rank, (rankDist.get(e.rank) || 0) + 1);
    workplaceDist.set(e.workplace, (workplaceDist.get(e.workplace) || 0) + 1);
    employmentTypeDist.set(e.employmentType, (employmentTypeDist.get(e.employmentType) || 0) + 1);
  }

  console.error("[14] load app_settings...");
  const { data: allSettingsRow } = await supabase
    .from("app_settings").select("key, value, updated_at").eq("key", "all_settings").maybeSingle();
  let allSettings = null;
  if (allSettingsRow && allSettingsRow.value) {
    try {
      allSettings = typeof allSettingsRow.value === "string" ? JSON.parse(allSettingsRow.value) : allSettingsRow.value;
    } catch (e) {
      allSettings = { __parseError: e?.message ?? String(e) };
    }
  }

  function canonList(key) {
    const v = allSettings?.[key];
    if (!Array.isArray(v)) return null;
    return v.map(x => (typeof x === "string" ? x : x?.label ?? x?.name ?? JSON.stringify(x)));
  }
  const scheduleTypesCanonical = canonList("scheduleTypes");
  const positionsCanonical = canonList("positions");
  const ranksCanonical = canonList("ranks");
  const workplacesCanonical = canonList("workplaces");
  const employmentTypesCanonical = canonList("employmentTypes");

  function classifyTaxonomy(dist, canon) {
    if (!canon) return { canon: null, matched: null, unmapped: null };
    const matched = [];
    const unmapped = [];
    for (const [val, cnt] of dist.entries()) {
      if (val == null || val === "") unmapped.push({ val: "(null/empty)", cnt });
      else if (canon.includes(val)) matched.push({ val, cnt });
      else unmapped.push({ val, cnt });
    }
    return { canon, matched, unmapped };
  }
  const typeDistArr = [...typeDist.entries()].map(([type, cnt]) => ({ type, cnt })).sort((a, b) => b.cnt - a.cnt);
  const canonicalScheduleTypes = scheduleTypesCanonical;
  const unmappedScheduleTypes = canonicalScheduleTypes
    ? typeDistArr.filter(d => d.type && !canonicalScheduleTypes.includes(d.type) && !OFF_OR_HALF.has(d.type))
    : null;
  result.sections.s13_scheduleTypes = {
    distribution: typeDistArr,
    canonical: canonicalScheduleTypes,
    offTypesShared: OFF_TYPES,
    halfDayTypesShared: HALF_DAY_TYPES,
    unmappedCount: unmappedScheduleTypes ? unmappedScheduleTypes.length : null,
    unmappedSamples: unmappedScheduleTypes || null,
  };
  result.sections.s14_taxonomy = {
    position: classifyTaxonomy(positionDist, positionsCanonical),
    rank: classifyTaxonomy(rankDist, ranksCanonical),
    workplace: classifyTaxonomy(workplaceDist, workplacesCanonical),
    employmentType: classifyTaxonomy(employmentTypeDist, employmentTypesCanonical),
  };

  // ---------------- SECTION 15 · WAGE ----------------
  console.error("[15] wage integrity...");
  const wageRates = allSettings?.wageRates || null;
  const overrides = allSettings?.employeeWageOverrides || null;
  let overrideStats = null;
  if (overrides && typeof overrides === "object") {
    const keys = Object.keys(overrides);
    const orphan = keys.filter(k => !empIdSet.has(Number(k)));
    overrideStats = {
      count: keys.length,
      orphan: orphan.length,
      orphanSamples: orphan.slice(0, 50).map(k => ({ key: k, value: overrides[k] })),
    };
  }
  const unconfiguredActive = [];
  const activeEmps = employees.filter(e => e.retireDate == null || e.retireDate === "" || e.retireDate > today);
  if (wageRates && typeof wageRates === "object") {
    for (const e of activeEmps) {
      const hasOverride = overrides && (overrides[String(e.id)] != null);
      const posRate = wageRates[e.position];
      if (!hasOverride && (posRate == null || posRate === 0 || posRate === "")) {
        unconfiguredActive.push({ id: e.id, name: e.name, position: e.position });
      }
    }
  }
  result.sections.s15_wage = {
    wageRatesPresent: !!wageRates,
    wageRatesKeys: wageRates ? Object.keys(wageRates) : null,
    wageRates,
    overrides: overrideStats,
    activeEmployeeCount: activeEmps.length,
    unconfiguredActiveCount: wageRates ? unconfiguredActive.length : null,
    unconfiguredActiveSamples: unconfiguredActive.slice(0, 50),
  };

  // ---------------- SECTION 16-17 · LOCK ----------------
  console.error("[16] schedule_lock_* keys...");
  const allKeyRows = await pageAll("app_settings", "key, value, updated_at", 500);
  const scheduleLocks = allKeyRows.filter(r => r.key && r.key.startsWith("schedule_lock_"));
  const validLockRe = /^schedule_lock_\d{4}-\d{2}$/;
  const invalidLockKeys = scheduleLocks.filter(r => !validLockRe.test(r.key));
  const dupKey = (() => {
    const m = new Map();
    for (const r of scheduleLocks) m.set(r.key, (m.get(r.key) || 0) + 1);
    return [...m.entries()].filter(([, c]) => c > 1);
  })();

  function lockIsActive(v) {
    if (v == null) return false;
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const t = v.trim().toLowerCase();
      if (t === "true" || t === "\"true\"" || t === "1") return true;
      try { const parsed = JSON.parse(v); return lockIsActive(parsed); } catch { return false; }
    }
    if (typeof v === "object") return v.locked === true || v === true;
    return false;
  }

  result.sections.s16_lock = {
    totalLockKeys: scheduleLocks.length,
    invalidKeyCount: invalidLockKeys.length,
    invalidKeys: invalidLockKeys.map(r => r.key),
    duplicateKeyCount: dupKey.length,
    duplicateKeys: dupKey,
    locks: scheduleLocks.map(r => ({
      key: r.key, value: r.value, locked: lockIsActive(r.value), updated_at: r.updated_at,
    })),
  };
  // S17: schedules.updated_at 없음 → row-level 추적 불가. observable only.
  result.sections.s17_lockedMonthMutations = {
    rowLevelTrackingPossible: !!columnShape.schedules?.columns?.includes("updated_at"),
    note: "schedules.updated_at 컬럼 없음 → 잠긴 월 수정 흔적 row-level 추적 불가. server-side guard (scheduleLock.ts) 가 유일한 방어선.",
    anomalyCount: null,
  };

  // ---------------- SECTION 18 · CONTRACTS ----------------
  console.error("[18] contracts...");
  if (tableProbe.employee_contracts.count === 0) {
    result.sections.s18_contracts = { total: 0, note: "empty table" };
  } else {
    const contracts = await pageAll("employee_contracts", "id, employee_id, start_date, end_date, contract_type, created_at");
    const orphanContracts = contracts.filter(c => c.employee_id != null && !empIdSet.has(Number(c.employee_id)));
    const activeByEmp = new Map();
    for (const c of contracts) {
      if (c.end_date == null || c.end_date === "") activeByEmp.set(c.employee_id, (activeByEmp.get(c.employee_id) || 0) + 1);
    }
    const multipleActive = [...activeByEmp.entries()].filter(([, c]) => c > 1);
    const contractReversed = contracts.filter(c => isLikelyDate(c.start_date) && isLikelyDate(c.end_date) && c.start_date > c.end_date);
    result.sections.s18_contracts = {
      total: contracts.length,
      orphan: orphanContracts.length,
      orphanSamples: orphanContracts.slice(0, 30),
      multipleActive: multipleActive.length,
      multipleActiveSamples: multipleActive.slice(0, 30),
      reversedCount: contractReversed.length,
      reversedSamples: contractReversed.slice(0, 30),
    };
  }

  // ---------------- SECTION 19 · RESIGNATIONS ----------------
  console.error("[19] resignations...");
  if (tableProbe.resignation_requests.count === 0) {
    result.sections.s19_resignations = { total: 0, note: "empty table · nothing to audit" };
  } else {
    const resignations = await pageAll("resignation_requests", "*");
    const orphanResignations = resignations.filter(r => r.employee_id != null && !empIdSet.has(Number(r.employee_id)));
    const colsPresent = Object.keys(resignations[0] || {});
    // schema has no effective_date / end_date column confirmed. Fallback: approved_at date → infer resign day.
    const schedulesByEmp = new Map();
    for (const s of schedules) {
      const a = schedulesByEmp.get(Number(s.employeeId)) || []; a.push(s); schedulesByEmp.set(Number(s.employeeId), a);
    }
    const resignedButScheduleAfterEmployeeRetire = [];
    const approvedRes = resignations.filter(r => r.status === "approved");
    for (const r of approvedRes) {
      const emp = empById.get(Number(r.employee_id));
      if (!emp || !emp.retireDate || emp.retireDate === "") continue;
      const arr = schedulesByEmp.get(Number(r.employee_id)) || [];
      const future = arr.filter(s => isLikelyDate(s.date) && s.date > emp.retireDate);
      if (future.length > 0) {
        resignedButScheduleAfterEmployeeRetire.push({
          resignationId: r.id, employeeId: r.employee_id, retireDate: emp.retireDate,
          futureCount: future.length,
          samples: future.slice(0, 5).map(s => ({ id: s.id, date: s.date, type: s.type })),
        });
      }
    }
    result.sections.s19_resignations = {
      total: resignations.length,
      columnsPresent: colsPresent,
      orphan: orphanResignations.length,
      orphanSamples: orphanResignations.slice(0, 30),
      resignedButScheduleAfterRetireCount: resignedButScheduleAfterEmployeeRetire.length,
      resignedButScheduleAfterRetireSamples: resignedButScheduleAfterEmployeeRetire.slice(0, 30),
    };
  }

  // ---------------- SECTION 20 · RESERVATIONS ----------------
  console.error("[20] reservations...");
  if (tableProbe.reservations.count === 0) {
    result.sections.s20_reservations = { total: 0, note: "empty table" };
  } else {
    const reservations = await pageAll("reservations", "id, date, time, assigned_employee_id, employee_name_snapshot, vendor_id, created_at");
    const orphanReservations = reservations.filter(r => r.assigned_employee_id != null && !empIdSet.has(Number(r.assigned_employee_id)));
    const retiredWithFutureReservation = [];
    for (const r of reservations) {
      const e = empById.get(Number(r.assigned_employee_id));
      if (!e || !e.retireDate || e.retireDate === "") continue;
      if (isLikelyDate(r.date) && r.date > e.retireDate && r.date >= today) {
        retiredWithFutureReservation.push({
          id: r.id, date: r.date, employeeId: r.assigned_employee_id,
          empName: e.name, retireDate: e.retireDate,
        });
      }
    }
    result.sections.s20_reservations = {
      total: reservations.length,
      orphan: orphanReservations.length,
      orphanSamples: orphanReservations.slice(0, 30),
      retiredWithFutureReservationCount: retiredWithFutureReservation.length,
      retiredWithFutureReservationSamples: retiredWithFutureReservation.slice(0, 30),
    };
  }

  // ---------------- SECTION 21 · SETTINGS STRUCTURE ----------------
  console.error("[21] settings structure...");
  const keyDupMap = new Map();
  for (const r of allKeyRows) keyDupMap.set(r.key, (keyDupMap.get(r.key) || 0) + 1);
  const keyDup = [...keyDupMap.entries()].filter(([, c]) => c > 1);
  const topLevelExpected = ["scheduleTypes","positions","ranks","workplaces","employmentTypes","wageRates","employeeWageOverrides"];
  const missingTopLevel = topLevelExpected.filter(k => !allSettings || !(k in allSettings));
  result.sections.s21_settings = {
    totalKeys: allKeyRows.length,
    keyDuplicateCount: keyDup.length,
    keyDuplicate: keyDup,
    allSettingsPresent: !!allSettings,
    allSettingsKeys: allSettings ? Object.keys(allSettings) : [],
    missingTopLevelCriticalKeys: missingTopLevel,
    allSettingsUpdatedAt: allSettingsRow?.updated_at,
  };

  // ---------------- GATE EVALUATION ----------------
  console.error("[gate] evaluate...");
  const scheduleOrphanCurrentFuture = result.sections.s5_scheduleOrphan.orphanCurrentOrFuture;
  const danglingSourceLeave = result.sections.s8_sourceLeave.dangling;
  const duplicateByEmpDateCount = result.sections.s10_duplicate.duplicateByEmpDateCount;
  const lockKeyInvalid = result.sections.s16_lock.invalidKeyCount;
  const lockKeyDuplicate = result.sections.s16_lock.duplicateKeyCount;
  const parkPreserved = !!(result.sections.s6_park.preservedRow && !result.sections.s6_park.employee3Exists);
  const newOrphanLeavesCount = result.sections.s7_leaveOrphan.newOrphan;
  const workingOnApprovedLeaveCount = result.sections.s9_leaveProjection.workingOnApprovedLeaveCount;
  const terminatedButProjectedCount = result.sections.s9_leaveProjection.terminatedButProjectedCount;
  const whReversedCount = result.sections.s12_workingHours.reversedCount;
  const overrideOrphanCount = result.sections.s15_wage.overrides?.orphan ?? 0;

  const gate = {
    scheduleOrphanCurrentFuture,
    danglingSourceLeave,
    duplicateByEmpDateCount,
    lockKeyInvalid,
    lockKeyDuplicate,
    newOrphanLeavesCount,
    parkPreserved,
    workingOnApprovedLeaveCount,
    terminatedButProjectedCount,
    whReversedCount,
    overrideOrphanCount,
    PASS: scheduleOrphanCurrentFuture === 0
      && danglingSourceLeave === 0
      && duplicateByEmpDateCount === 0
      && lockKeyInvalid === 0
      && lockKeyDuplicate === 0
      && newOrphanLeavesCount === 0
      && parkPreserved,
  };
  result.gate = gate;

  console.log(JSON.stringify(result, null, 2));
  console.error(`\n=== GATE: ${gate.PASS ? "PASS" : "FAIL"} ===`);
  console.error(JSON.stringify(gate, null, 2));
}

main().catch(err => {
  console.error("[FATAL]", err?.stack ?? err?.message ?? err);
  process.exit(1);
});
