// apps/sync-agent/src/main/erpAutoScheduler.ts
// 2026-10-05 · Dataset 별 독립 ERP 자동 Scheduler (사용자 지시)
//
// 설계:
//   · PRODUCT / BUY / INVENTORY / SALE / VENDOR 각자 독립 cron job
//   · 사용자 설정 (config.ts erpAutoScheduler.datasets[*]) 기반 interval + time + weekday
//   · 설정 변경 시 live reschedule (해당 dataset 만 stop/start · 다른 dataset 영향 X)
//   · process-local mutex (syncRunning) 유지 · AUTO/AUTO · AUTO/MANUAL 충돌 방지
//   · 기존 apply*Sync service 그대로 호출 (별도 import 로직 X)
//   · VENDOR 는 Vendor ERP sync 완성 전까지 trigger 시 no-op (사용자 지시)

import cron, { ScheduledTask } from "node-cron";
import { loadConfig, patchConfig, type DatasetSchedule, type ScheduleInterval } from "./config";
import { enqueueFetchAwait } from "./erpSyncOrchestrator";
import { applyProductSync } from "./productSyncService";
import { applyBuySync } from "./buySyncService";
import { applyStockHistorySync } from "./stockHistorySyncService";
import { applySaleSync } from "./saleSyncService";
import { loadCandidateFull } from "./snapshotStore";
import { getSupabaseClient } from "./supabaseClient";
import type { ErpBuyRow } from "../../../../src/shared/erp/erpBuyMapper";
import type { ErpInventoryRow, InventoryMetadata } from "../../../../src/shared/erp/erpInventoryMapper";
import type { ErpSaleRow } from "../../../../src/shared/erp/erpSaleMapper";

export type SchedulerDataset = "PRODUCT" | "BUY" | "INVENTORY" | "SALE" | "VENDOR";
const DATASET_ORDER: SchedulerDataset[] = ["PRODUCT", "BUY", "INVENTORY", "SALE", "VENDOR"];

let syncRunning = false;
const jobs: Partial<Record<SchedulerDataset, ScheduledTask>> = {};
const nextRunCache: Partial<Record<SchedulerDataset, string>> = {};
// 2026-10-05 · #138 · dataset-level pending (coalescing)
//   · 다른 sync 실행 중 발화된 dataset 은 pending 플래그 설정
//   · 현재 sync 완료 후 pending=true 인 dataset 1회 자동 실행 (coalesce)
//   · 같은 dataset 다중 pending 은 1개로 coalesce (손실 방지 · 중복 방지)
const pending: Partial<Record<SchedulerDataset, boolean>> = {};

/** 사용자 preset interval → cron expression
 *  · 2026-10-05 · 사용자 지시 · interval 기반 (2h/4h/6h/12h) 도 기준시간 사용
 *    예: 4h · 기준 09:00 → 09, 13, 17, 21, 01, 05 (6개 시간 explicit cron)
 */
function parseTime(t: string | undefined): { h: number; m: number } {
  const [hh, mm] = (t || "02:00").split(":");
  return { h: Math.max(0, Math.min(23, parseInt(hh || "0", 10))), m: Math.max(0, Math.min(59, parseInt(mm || "0", 10))) };
}

function genHoursFromBase(baseH: number, every: number): string {
  const set = new Set<number>();
  // baseH 로부터 앞뒤 모두 every 간격으로 24h 안
  for (let h = baseH; h < 24; h += every) set.add(h);
  for (let h = baseH - every; h >= 0; h -= every) set.add(h);
  return [...set].sort((a, b) => a - b).join(",");
}

function intervalToCron(sch: DatasetSchedule): string | null {
  switch (sch.interval as ScheduleInterval) {
    case "30min":  return "*/30 * * * *";
    case "1h":     { const { m } = parseTime(sch.time); return `${m} * * * *`; }
    case "2h":     { const { h, m } = parseTime(sch.time); return `${m} ${genHoursFromBase(h, 2)} * * *`; }
    case "4h":     { const { h, m } = parseTime(sch.time); return `${m} ${genHoursFromBase(h, 4)} * * *`; }
    case "6h":     { const { h, m } = parseTime(sch.time); return `${m} ${genHoursFromBase(h, 6)} * * *`; }
    case "12h":    { const { h, m } = parseTime(sch.time); return `${m} ${genHoursFromBase(h, 12)} * * *`; }
    case "daily":  { const { h, m } = parseTime(sch.time); return `${m} ${h} * * *`; }
    case "weekly": { const { h, m } = parseTime(sch.time); return `${m} ${h} * * ${sch.weekday ?? 0}`; }
    default: return null;
  }
}

/** 다음 실행 시각 추정 (cron 식 → 간단 계산 · UI 표시용)
 *   · interval 기반 (2h/4h/6h/12h) 은 기준시간(sch.time) 기반 explicit hours 사용
 */
function estimateNextRun(sch: DatasetSchedule): string | null {
  const now = new Date();
  const next = new Date(now);
  const { h: baseH, m: baseM } = parseTime(sch.time);
  const findNextFromHours = (allowedHours: number[]) => {
    // 오늘 중 baseM 분 · allowedHours 안 다음 시각 · 없으면 내일 첫 시각
    for (const hh of allowedHours) {
      const cand = new Date(now);
      cand.setHours(hh, baseM, 0, 0);
      if (cand.getTime() > now.getTime()) { next.setTime(cand.getTime()); return; }
    }
    const first = allowedHours[0] ?? baseH;
    next.setDate(now.getDate() + 1);
    next.setHours(first, baseM, 0, 0);
  };
  switch (sch.interval) {
    case "30min":  next.setMinutes(Math.ceil((now.getMinutes() + 1) / 30) * 30, 0, 0); break;
    case "1h": {
      next.setMinutes(baseM, 0, 0);
      if (next.getTime() <= now.getTime()) next.setHours(now.getHours() + 1);
      break;
    }
    case "2h":  findNextFromHours(genHoursFromBase(baseH, 2).split(",").map(Number).sort((a, b) => a - b)); break;
    case "4h":  findNextFromHours(genHoursFromBase(baseH, 4).split(",").map(Number).sort((a, b) => a - b)); break;
    case "6h":  findNextFromHours(genHoursFromBase(baseH, 6).split(",").map(Number).sort((a, b) => a - b)); break;
    case "12h": findNextFromHours(genHoursFromBase(baseH, 12).split(",").map(Number).sort((a, b) => a - b)); break;
    case "daily": {
      next.setHours(baseH, baseM, 0, 0);
      if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
      break;
    }
    case "weekly": {
      next.setHours(baseH, baseM, 0, 0);
      const dayDiff = ((sch.weekday ?? 0) - now.getDay() + 7) % 7;
      next.setDate(now.getDate() + dayDiff);
      if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 7);
      break;
    }
    default: return null;
  }
  return next.toISOString();
}

/** PCode → BarCode map (BUY/INVENTORY sync 공용) */
async function buildPCodeToBarcodeMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const prod = loadCandidateFull<{ PCode?: unknown; BarCode?: unknown }>("PRODUCT_LIST");
  if (prod && prod.rows.length > 0) {
    for (const r of prod.rows) {
      const pc = String(r.PCode ?? "").trim();
      const bc = String(r.BarCode ?? "").trim();
      if (pc && bc) map.set(pc, bc);
    }
    if (map.size > 0) return map;
  }
  const sb = getSupabaseClient();
  if (!sb) return map;
  let from = 0;
  while (true) {
    const { data } = await sb.from("products").select("pcode, product_code").not("pcode", "is", null).range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ pcode: string | null; product_code: string | null }>) {
      const pc = String(r.pcode ?? "").trim();
      const bc = String(r.product_code ?? "").trim();
      if (pc && bc) map.set(pc, bc);
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  return map;
}

function defaultPeriod(): { startDate: string; endDate: string } {
  const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 30);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { startDate: fmt(start), endDate: fmt(end) };
}

// 2026-10-05 · A안 (사용자 지시) · INVENTORY identity 안정화
//   · 과거 defaultPeriod() 는 매 실행마다 period_end="오늘" → stock_history.(period_start,period_end,st_code,pcode) identity 매번 변경 → 4007 전부 NEW
//   · AUTO scheduler 는 "당월 1일 ~ 당월 말일" 고정 사용 · 같은 월 안에서 identity 일정 유지
//   · 수동 조회 UI 는 그대로 (사용자가 직접 지정한 기간 유지 · 변경 범위 X)
//   · 월 전환 시 자연스럽게 새 identity 로 이동 (의도된 설계)
function currentMonthPeriod(): { startDate: string; endDate: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { startDate: fmt(start), endDate: fmt(end) };
}

interface RunResult {
  dataset: SchedulerDataset;
  ok: boolean;
  skipped: boolean;
  summary?: string;
}

async function runDataset(ds: SchedulerDataset): Promise<RunResult> {
  if (syncRunning) {
    console.log(`[erpAutoScheduler/${ds}] syncRunning · skip`);
    return { dataset: ds, ok: false, skipped: true, summary: "다른 동기화 실행 중 · skip" };
  }
  syncRunning = true;
  try {
    if (ds === "VENDOR") {
      return { dataset: ds, ok: false, skipped: true, summary: "Vendor ERP sync 미구현 · pending" };
    }
    if (ds === "PRODUCT") {
      await enqueueFetchAwait("PRODUCT_LIST");
      const cand = loadCandidateFull("PRODUCT_LIST");
      if (!cand) return { dataset: ds, ok: false, skipped: true, summary: "candidate 없음" };
      if (cand.meta.validation?.blockingErrors) return { dataset: ds, ok: false, skipped: true, summary: "validation blocked" };
      const r = await applyProductSync({ allowWrite: true });
      return { dataset: ds, ok: r.ok, skipped: false, summary: `INSERT ${r.insertedRows ?? 0} · UPDATE ${r.updatedRows} · 실패 ${r.failed}` };
    }
    if (ds === "BUY") {
      const { startDate, endDate } = defaultPeriod();
      await enqueueFetchAwait("BUY_STATUS", { startDate, endDate });
      const cand = loadCandidateFull<ErpBuyRow>("BUY_STATUS");
      if (!cand) return { dataset: ds, ok: false, skipped: true, summary: "candidate 없음" };
      if (cand.meta.validation?.blockingErrors) return { dataset: ds, ok: false, skipped: true, summary: "validation blocked" };
      const pcodeToBarcodeMap = await buildPCodeToBarcodeMap();
      const r = await applyBuySync({ erpRows: cand.rows, pcodeToBarcodeMap, allowWrite: true });
      return { dataset: ds, ok: r.failed === 0 && r.identityModified === 0 && r.webModified === 0, skipped: false, summary: `INSERT ${r.inserted} · UPDATE ${r.updated} · 실패 ${r.failed}` };
    }
    if (ds === "INVENTORY") {
      // 2026-10-05 · A안 · 당월 고정 range (identity 안정화)
      //   · getLatestFetchMeta() 사용 중단 · AUTO scheduler 는 항상 당월 start/end 로 통일
      //   · metadata 도 동일 range 사용 (identity 일관성)
      const { startDate, endDate } = currentMonthPeriod();
      await enqueueFetchAwait("INVENTORY_STATUS", { startDate, endDate });
      const cand = loadCandidateFull<ErpInventoryRow>("INVENTORY_STATUS");
      if (!cand) return { dataset: ds, ok: false, skipped: true, summary: "candidate 없음" };
      if (cand.meta.validation?.blockingErrors) return { dataset: ds, ok: false, skipped: true, summary: "validation blocked" };
      const metadata: InventoryMetadata = { period_start: startDate, period_end: endDate };
      const pcodeToBarcodeMap = await buildPCodeToBarcodeMap();
      const r = await applyStockHistorySync({ erpRows: cand.rows, metadata, pcodeToBarcodeMap, allowWrite: true });
      return { dataset: ds, ok: r.failed === 0 && r.identityModified === 0 && r.protectedModified === 0, skipped: false, summary: `INSERT ${r.inserted} · UPDATE ${r.updated} · 실패 ${r.failed}` };
    }
    if (ds === "SALE") {
      const { startDate, endDate } = defaultPeriod();
      await enqueueFetchAwait("SALE_STATUS", { startDate, endDate });
      const cand = loadCandidateFull<ErpSaleRow>("SALE_STATUS");
      if (!cand) return { dataset: ds, ok: false, skipped: true, summary: "candidate 없음" };
      const r = await applySaleSync({ erpRows: cand.rows, allowWrite: true });
      // 2026-10-05 · Fix C · SUCCESS = failed=0 AND inserted=new (전체 NEW row INSERT 완료)
      //   · NOTHING_TO_DO (new=0, inserted=0) → ok=true (성공 · 동기화 불필요)
      //   · new>0 but inserted<new → ok=false (일부 미삽입)
      const saleOk = r.failed === 0 && r.inserted === r.new;
      return { dataset: ds, ok: saleOk, skipped: false, summary: r.message ?? `INSERT ${r.inserted}/${r.new} · 실패 ${r.failed}` };
    }
    return { dataset: ds, ok: false, skipped: true, summary: "unknown dataset" };
  } catch (err) {
    return { dataset: ds, ok: false, skipped: false, summary: (err as Error).message };
  } finally {
    syncRunning = false;
  }
}

async function triggerAndRecord(ds: SchedulerDataset): Promise<void> {
  const started = new Date().toISOString();
  console.log(`[SCHEDULER] ${ds} triggered: ${started}`);
  if (syncRunning) {
    // 2026-10-05 · #138 pending/coalescing · 다른 sync 중이면 pending 등록 · 완료 후 1회 재시도
    pending[ds] = true;
    console.log(`[SCHEDULER] ${ds} skipped: sync already running · pending=true (coalesced)`);
    recordRun(ds, started, "SKIPPED");
    return;
  }
  console.log(`[SCHEDULER] ${ds} sync started`);
  let r: RunResult;
  try {
    r = await runDataset(ds);
  } catch (err) {
    console.log(`[SCHEDULER] ${ds} sync failed: ${(err as Error).message}`);
    recordRun(ds, started, "FAILED");
    return;
  }
  if (r.skipped) {
    console.log(`[SCHEDULER] ${ds} sync skipped: ${r.summary ?? ""}`);
    recordRun(ds, started, "SKIPPED");
  } else if (r.ok) {
    console.log(`[SCHEDULER] ${ds} sync completed: ${r.summary ?? ""}`);
    recordRun(ds, started, "SUCCESS");
  } else {
    console.log(`[SCHEDULER] ${ds} sync failed: ${r.summary ?? ""}`);
    recordRun(ds, started, "PARTIAL");
  }
  // 2026-10-05 · #138 · pending coalesce drain
  //   · 이 dataset 실행 중 다른 trigger 가 pending=true 걸어둔 경우 flush
  //   · 다른 dataset 의 pending 도 체크 (DATASET_ORDER 순서로)
  for (const other of DATASET_ORDER) {
    if (pending[other]) {
      pending[other] = false;
      console.log(`[SCHEDULER] ${other} pending drain · running now (coalesced)`);
      // 즉시 재진입 방지 · setImmediate 로 외부 call stack 분리
      setImmediate(() => { void triggerAndRecord(other); });
      break; // 한 번에 하나만 drain · 완료 후 recursion 로 다음 drain
    }
  }
}

function recordRun(ds: SchedulerDataset, startedAt: string, result: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED"): void {
  try {
    const cfg = loadConfig();
    const cur = cfg.erpAutoScheduler?.datasets?.[ds];
    if (!cur) return;
    const nextRun = estimateNextRun(cur);
    // 2026-10-05 · lastRun 기록 (trigger 자체 기록 · success/skip/failed 모두)
    //   · 주의 · patchConfig 호출 시 config:patch IPC 거치지 않으므로 rescheduleDataset 자동 호출 X
    patchConfig({
      erpAutoScheduler: {
        datasets: {
          [ds]: { ...cur, lastRunAt: startedAt, lastRunResult: result as never, nextRunAt: nextRun ?? undefined },
        } as never,
      },
    } as never);
    nextRunCache[ds] = nextRun ?? "";
  } catch (err) {
    console.warn(`[SCHEDULER] ${ds} record 실패: ${(err as Error).message}`);
  }
}

export function isAutoSyncRunning(): boolean { return syncRunning; }

export function stopDataset(ds: SchedulerDataset): void {
  const j = jobs[ds];
  if (j) { j.stop(); delete jobs[ds]; }
}

export function startDataset(ds: SchedulerDataset): void {
  stopDataset(ds);
  const cfg = loadConfig();
  const sch = cfg.erpAutoScheduler?.datasets?.[ds];
  if (!sch?.enabled) return;
  const expr = intervalToCron(sch);
  if (!expr || !cron.validate(expr)) {
    console.warn(`[erpAutoScheduler/${ds}] cron 식 유효하지 않음 · ${expr}`);
    return;
  }
  jobs[ds] = cron.schedule(expr, () => { void triggerAndRecord(ds); });
  nextRunCache[ds] = estimateNextRun(sch) ?? "";
  console.log(`[erpAutoScheduler/${ds}] 등록 · ${expr} · 다음 실행 ${nextRunCache[ds]}`);
}

export function startErpAutoScheduler(): void {
  for (const ds of DATASET_ORDER) startDataset(ds);
}

export function stopErpAutoScheduler(): void {
  for (const ds of DATASET_ORDER) stopDataset(ds);
}

export function rescheduleDataset(ds: SchedulerDataset): void {
  stopDataset(ds);
  startDataset(ds);
}

/** UI 노출용 · 각 dataset 현재 설정 + lastRun + nextRun */
export function getSchedulerStatus(): Record<SchedulerDataset, DatasetSchedule & { active: boolean; nextRunAt?: string }> {
  const cfg = loadConfig();
  const dsConf = cfg.erpAutoScheduler?.datasets ?? ({} as Record<SchedulerDataset, DatasetSchedule>);
  const out = {} as Record<SchedulerDataset, DatasetSchedule & { active: boolean; nextRunAt?: string }>;
  for (const ds of DATASET_ORDER) {
    const sch = dsConf[ds] ?? ({ enabled: false, interval: "30min", time: "02:00", weekday: 0 } as DatasetSchedule);
    out[ds] = { ...sch, active: !!jobs[ds], nextRunAt: nextRunCache[ds] ?? estimateNextRun(sch) ?? undefined };
  }
  return out;
}
