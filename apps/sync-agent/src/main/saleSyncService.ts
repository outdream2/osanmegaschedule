// apps/sync-agent/src/main/saleSyncService.ts
// 2026-10-05 · 사용자 지시 · BUY sync 패턴 그대로 적용 (단순 identity 매칭)
//
// 설계:
//   · identity = sale_date + product_name + buyer_name (사용자 명시)
//   · compare fields = total_stock + unit_cost + unit_sale + sale_total + margin (사용자 명시)
//   · sale_total 은 identity 아님 · 금액 바뀌면 CHANGED 로 잡힘
//   · SHA256 / occurrence index / fingerprint 금지 (사용자 명시)
//   · 단순 string key 매칭 · BUY sync 동형 패턴
//   · identity 없음 → NEW → INSERT
//   · identity 있음 + compare 동일 → SAME
//   · identity 있음 + compare 다름 → CHANGED → UPDATE
//   · DELETE 자동 X

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";
import { appendSyncHistory } from "./syncHistoryStore";
import { buildSalePayload, type ErpSaleRow, type SalePayload } from "../../../../src/shared/erp/erpSaleMapper";

const COMPARE_FIELDS = ["total_stock", "unit_cost", "unit_sale", "sale_total", "margin"] as const;

type DbRow = Record<string, unknown>;

function identityKey(sale_date: string, product_name: string, buyer_name: string): string {
  return `${sale_date}|${product_name}|${buyer_name}`;
}

function sameNumeric(a: unknown, b: unknown): boolean {
  const na = a === null || a === undefined || a === "" ? null : Number(a);
  const nb = b === null || b === undefined || b === "" ? null : Number(b);
  if (na === null && nb === null) return true;
  if (na === null || nb === null) return false;
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return na === nb;
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size) as T[]);
  return out;
}

export interface SaleSyncInput {
  readonly erpRows: readonly ErpSaleRow[];
}

export interface SaleChangeDetail {
  readonly db: unknown;
  readonly erp: unknown;
}

export interface SaleSyncEntry {
  readonly identity: string;
  readonly action: "NEW" | "CHANGED" | "SAME";
  readonly sale_date: string;
  readonly product_name: string;
  readonly buyer_name: string;
  readonly changes?: Record<string, SaleChangeDetail>;
}

export interface SaleSyncCheckResult {
  readonly supabaseFetchedAt: string;
  readonly erpTotal: number;
  readonly saleDateMin: string | null;
  readonly saleDateMax: string | null;
  readonly dbRowsMatched: number;
  readonly new: number;
  readonly changed: number;
  readonly same: number;
  readonly entries: ReadonlyArray<SaleSyncEntry>;
}

export interface SaleSyncApplyResult extends SaleSyncCheckResult {
  readonly allowWrite: boolean;
  readonly inserted: number;
  readonly updated: number;
  readonly updatedCells: number;
  readonly skippedSame: number;
  readonly failed: number;
  readonly errors: ReadonlyArray<{ identity: string; message: string }>;
  readonly message?: string;
}

function extractDateRange(rows: readonly ErpSaleRow[]): { min: string | null; max: string | null } {
  let min: string | null = null;
  let max: string | null = null;
  for (const r of rows) {
    const d = r.SaleDate == null ? null : String(r.SaleDate).trim();
    if (!d) continue;
    if (min === null || d < min) min = d;
    if (max === null || d > max) max = d;
  }
  return { min, max };
}

const DB_SELECT_COLS = ["id", "sale_date", "product_name", "buyer_name", ...COMPARE_FIELDS].join(", ");

/** Supabase sales 테이블에서 sale_date 범위 전체 조회 → identity key 로 Map */
async function fetchDbByIdentity(
  sb: SupabaseClient,
  min: string | null,
  max: string | null,
): Promise<Map<string, DbRow>> {
  const map = new Map<string, DbRow>();
  if (!min || !max) return map;
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("sales")
      .select(DB_SELECT_COLS)
      .gte("sale_date", min)
      .lte("sale_date", max)
      .range(from, from + 999);
    if (error) throw new Error(`sales fetch 실패 · ${error.message}`);
    if (!data || data.length === 0) break;
    for (const d of ((data) as unknown) as DbRow[]) {
      const key = identityKey(
        String(d.sale_date ?? ""),
        String(d.product_name ?? ""),
        String(d.buyer_name ?? ""),
      );
      map.set(key, d);
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  return map;
}

interface DiffBundle {
  readonly entries: SaleSyncEntry[];
  readonly inserts: Array<{ identity: string; payload: SalePayload }>;
  readonly updates: Array<{ id: unknown; identity: string; payload: Record<string, unknown>; changedFields: string[] }>;
  readonly stats: {
    erpTotal: number;
    dbRowsMatched: number;
    new: number;
    changed: number;
    same: number;
  };
}

function buildSaleDiff(erpRows: readonly ErpSaleRow[], dbByKey: Map<string, DbRow>): DiffBundle {
  const entries: SaleSyncEntry[] = [];
  const inserts: DiffBundle["inserts"] = [];
  const updates: DiffBundle["updates"] = [];
  let countNew = 0;
  let countChanged = 0;
  let countSame = 0;

  for (const erpRow of erpRows) {
    const payload = buildSalePayload(erpRow);
    const sale_date = String(payload.sale_date ?? "");
    const product_name = String(payload.product_name ?? "");
    const buyer_name = String(payload.buyer_name ?? "");
    const key = identityKey(sale_date, product_name, buyer_name);

    const db = dbByKey.get(key);
    if (!db) {
      inserts.push({ identity: key, payload });
      entries.push({ identity: key, action: "NEW", sale_date, product_name, buyer_name });
      countNew++;
      continue;
    }

    const changes: Record<string, SaleChangeDetail> = {};
    const updatePayload: Record<string, unknown> = {};
    for (const f of COMPARE_FIELDS) {
      const dbVal = db[f];
      const erpVal = (payload as unknown as Record<string, unknown>)[f];
      if (!sameNumeric(dbVal, erpVal)) {
        changes[f] = { db: dbVal ?? null, erp: erpVal ?? null };
        updatePayload[f] = erpVal;
      }
    }

    if (Object.keys(changes).length === 0) {
      entries.push({ identity: key, action: "SAME", sale_date, product_name, buyer_name });
      countSame++;
    } else {
      updates.push({ id: db.id, identity: key, payload: updatePayload, changedFields: Object.keys(changes) });
      entries.push({ identity: key, action: "CHANGED", sale_date, product_name, buyer_name, changes });
      countChanged++;
    }
  }

  return {
    entries,
    inserts,
    updates,
    stats: {
      erpTotal: erpRows.length,
      dbRowsMatched: dbByKey.size,
      new: countNew,
      changed: countChanged,
      same: countSame,
    },
  };
}

/** CHECK · fresh Supabase fetch + diff · DB WRITE 없음 */
export async function runSaleSyncCheck(input: SaleSyncInput): Promise<SaleSyncCheckResult> {
  const sb = getSupabaseClient();
  if (!sb) throw new Error("Supabase client 미설정 · SUPABASE_URL / SUPABASE_KEY 환경변수 확인");

  const supabaseFetchedAt = new Date().toISOString();
  const { min, max } = extractDateRange(input.erpRows);
  const dbByKey = await fetchDbByIdentity(sb, min, max);
  const diff = buildSaleDiff(input.erpRows, dbByKey);

  console.info(
    `[saleSyncService] CHECK · erpTotal=${diff.stats.erpTotal} · range=${min}~${max}` +
    ` · dbMatched=${diff.stats.dbRowsMatched} · NEW=${diff.stats.new} · CHANGED=${diff.stats.changed} · SAME=${diff.stats.same}`,
  );

  return {
    supabaseFetchedAt,
    erpTotal: diff.stats.erpTotal,
    saleDateMin: min,
    saleDateMax: max,
    dbRowsMatched: diff.stats.dbRowsMatched,
    new: diff.stats.new,
    changed: diff.stats.changed,
    same: diff.stats.same,
    entries: diff.entries,
  };
}

/** APPLY · NEW INSERT + CHANGED UPDATE */
export async function applySaleSync(
  input: SaleSyncInput & { allowWrite: boolean },
): Promise<SaleSyncApplyResult> {
  const startedAt = new Date().toISOString();
  const sb = getSupabaseClient();
  if (!sb) throw new Error("Supabase client 미설정");

  const { min, max } = extractDateRange(input.erpRows);
  const dbByKey = await fetchDbByIdentity(sb, min, max);
  const diff = buildSaleDiff(input.erpRows, dbByKey);

  const base: SaleSyncCheckResult = {
    supabaseFetchedAt: startedAt,
    erpTotal: diff.stats.erpTotal,
    saleDateMin: min,
    saleDateMax: max,
    dbRowsMatched: diff.stats.dbRowsMatched,
    new: diff.stats.new,
    changed: diff.stats.changed,
    same: diff.stats.same,
    entries: diff.entries,
  };

  if (!input.allowWrite) {
    return {
      ...base,
      allowWrite: false,
      inserted: 0, updated: 0, updatedCells: 0, skippedSame: diff.stats.same,
      failed: 0, errors: [],
      message: "allowWrite=false · WRITE 안 함 (안전장치)",
    };
  }

  const errors: Array<{ identity: string; message: string }> = [];
  let inserted = 0;
  let updated = 0;
  let updatedCells = 0;
  let failed = 0;

  // INSERT (batch 500)
  for (const batch of chunk(diff.inserts, 500)) {
    const payloads = batch.map((b) => b.payload);
    const { data, error } = await sb.from("sales").insert(payloads).select("id");
    if (error) {
      failed += batch.length;
      if (errors.length < 20) {
        console.error("[saleSyncService] INSERT batch 실패:", error.message);
        errors.push({ identity: batch[0]!.identity, message: `INSERT batch 실패 · ${error.message}` });
      }
    } else {
      inserted += (data?.length ?? 0);
    }
  }

  // UPDATE (Promise.all PAR=10)
  const PAR = 10;
  for (let i = 0; i < diff.updates.length; i += PAR) {
    const slice = diff.updates.slice(i, i + PAR);
    const results = await Promise.all(
      slice.map(async (u) => {
        const { error } = await sb.from("sales").update(u.payload).eq("id", u.id);
        return { u, error: error?.message };
      }),
    );
    for (const r of results) {
      if (r.error) {
        failed++;
        if (errors.length < 20) errors.push({ identity: r.u.identity, message: r.error });
      } else {
        updated++;
        updatedCells += r.u.changedFields.length;
      }
    }
  }

  const ok = failed === 0 && inserted === diff.stats.new && updated === diff.stats.changed;

  // history
  try {
    appendSyncHistory("SALE_STATUS", {
      startedAt,
      completedAt: new Date().toISOString(),
      ok,
      updatedRows: inserted + updated,
      updatedCells,
      skippedSame: diff.stats.same,
      failed,
      webModified: 0,
      identityModified: 0,
      readbackMatched: inserted + updated,
      readbackMismatch: 0,
      erpCacheFetchedAt: null,
      erpCacheRowCount: diff.stats.erpTotal,
    });
  } catch (err) {
    console.warn(`[saleSyncService] 이력 기록 실패 · ${(err as Error).message}`);
  }

  console.info(
    `[saleSyncService] APPLY · erpTotal=${diff.stats.erpTotal} · NEW=${diff.stats.new} · CHANGED=${diff.stats.changed}` +
    ` · inserted=${inserted} · updated=${updated} · failed=${failed} · ok=${ok}`,
  );

  return {
    ...base,
    allowWrite: true,
    inserted,
    updated,
    updatedCells,
    skippedSame: diff.stats.same,
    failed,
    errors,
  };
}
