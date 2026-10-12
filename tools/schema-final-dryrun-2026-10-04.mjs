// 2026-10-04 · READ-ONLY · products 최종 schema DRY-RUN
//   · DB WRITE 0 · DROP 0 · ALTER 0
//   · 산출: (1) DROP_CANDIDATE 샘플+사용처  (2) ERP CHANGED/SAME per column
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ───────────────────────────────────────────────────────────────────────────
// 0. live products schema (location 포함 여부 확정)
// ───────────────────────────────────────────────────────────────────────────
async function liveProductsColumns() {
  const { data, error } = await supabase.from("products").select("*").limit(1);
  if (error) { console.error("products sample err:", error.message); return []; }
  return data && data.length ? Object.keys(data[0]) : [];
}

// column 존재 여부
async function columnExists(table, col) {
  const { error } = await supabase.from(table).select(col).limit(1);
  if (error) {
    if (/column .* does not exist/i.test(error.message)) return false;
    return false;
  }
  return true;
}

// non-null count
async function nonNullCount(table, col) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).not(col, "is", null);
  if (error) return { count: null, err: error.message };
  return { count };
}

// top-N sample values (non-null)
async function sampleValues(table, col, limit = 5) {
  const { data, error } = await supabase.from(table).select(col).not(col, "is", null).limit(limit);
  if (error) return [];
  return (data || []).map(r => r[col]);
}

// ───────────────────────────────────────────────────────────────────────────
// 1. DROP_CANDIDATE 전수 매트릭스
// ───────────────────────────────────────────────────────────────────────────
const DROP_CANDIDATES = [
  "col_i", "product_type", "delivery_price", "delivery_profit_rate", "delivery_margin_rate",
  "app_registered", "image_registered", "preset_registered", "preset_group",
  "promotion_name", "promotion_priority", "promotion_purchase_price",
  "promotion_sale_price", "promotion_profit_rate", "promotion_discount_rate",
  "supplier_type", "management_group", "unit_type",
  "stock_amount", "operator", "point_rate", "sales_commission",
  "total_volume", "unit_volume", "individual_quantity",
  // 보류 (경계)
  "last_modified_at", "registered_at", "wholesale_price1", "individual_code",
  "connection_type", "unit_price",
];

// ───────────────────────────────────────────────────────────────────────────
// 2. ERP_OWNED 전수 CHANGED/SAME (ERP snapshot ↔ DB)
//    identity: pcode ↔ products.pcode
// ───────────────────────────────────────────────────────────────────────────
const ERP_SNAPSHOT = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data/snapshots/product-list-2026-10-03.json"), "utf-8")
);
const erpRows = Array.isArray(ERP_SNAPSHOT) ? ERP_SNAPSHOT : (ERP_SNAPSHOT.rows || []);
console.log(`ERP rows loaded: ${erpRows.length}`);

// erp → db column 매핑 (ERP_OWNED + 사용자 승인 후보)
const MAPPINGS = [
  // 현재 활성
  { erp: "ProductName",    db: "product_name",       nullOverwrite: false, transform: "str"   },
  { erp: "CorpNameView",   db: "supplier",           nullOverwrite: false, transform: "str"   },
  { erp: "CtCode",         db: "supplier_code",      nullOverwrite: false, transform: "str"   },
  { erp: "UnitCode",       db: "unit",               nullOverwrite: false, transform: "str"   },
  { erp: "SaleStatusName", db: "sale_status",        nullOverwrite: false, transform: "str"   },
  { erp: "Brand",          db: "brand",              nullOverwrite: false, transform: "str"   },
  { erp: "Maker",          db: "manufacturer",       nullOverwrite: false, transform: "str"   },
  { erp: "LastBuyDate",    db: "last_purchase_date", nullOverwrite: false, transform: "str"   },
  { erp: "LastSaleDate",   db: "last_sale_date",     nullOverwrite: false, transform: "str"   },
  { erp: "NowStock",       db: "current_stock",      nullOverwrite: true,  transform: "num"   },
  { erp: "LocationName",   db: "display_location",   nullOverwrite: false, transform: "loc"   },
  // 사용자 승인 후보
  { erp: "CostPrice",      db: "purchase_price",     nullOverwrite: false, transform: "num"   },
  { erp: "PriceA",         db: "sale_price",         nullOverwrite: false, transform: "num"   },
  { erp: "McateName",      db: "category",           nullOverwrite: false, transform: "str"   },
  { erp: "RegDate",        db: "registered_at",      nullOverwrite: false, transform: "ts"    },
  { erp: "EditDate",       db: "last_modified_at",   nullOverwrite: false, transform: "ts"    },
];

// LocationName → display_location transform (벽/N매대 변환)
function transformErpLocation(raw) {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split(">").map(s => s.trim());
  const major = parts[0] || "";
  const middle = parts[1] || "";
  if (!major) return null;
  // "벽>21>전체>전체" → "21"
  if (major === "벽") return middle || null;
  // "6매대>Ａ" → "6A"
  const mdMatch = /^(\d+)매대$/.exec(major);
  if (mdMatch) {
    const m = (middle || "").replace(/[Ａ-Ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff21 + 65)); // 전각 A-Z → 반각
    return mdMatch[1] + m;
  }
  // 기타 "뷰티>4번>전체>전체" → "뷰티4" 비슷하게? 코드 참조 필요 — 보수적으로 major+middle
  return (major + (middle || "")).trim() || null;
}

function erpNorm(val, transform) {
  if (val == null) return null;
  if (typeof val === "string" && val.trim() === "") return null;
  if (transform === "num") {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  if (transform === "ts") {
    // ERP: "2026-10-02 17:19:56" → ISO
    const s = String(val).trim();
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`;
    return s;
  }
  if (transform === "loc") {
    return transformErpLocation(String(val));
  }
  return String(val).trim();
}

function dbNorm(val, transform) {
  if (val == null) return null;
  if (typeof val === "string" && val.trim() === "") return null;
  if (transform === "num") {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  if (transform === "ts") {
    // DB timestamp → ISO (may already be ISO with offset or UTC Z)
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return String(val).trim();
    return d.toISOString();
  }
  return String(val).trim();
}

// numeric equal (tolerance 0.001)
function equalVals(a, b, transform) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (transform === "num") {
    return Math.abs(a - b) < 0.001;
  }
  if (transform === "ts") {
    // 시간 비교 — 분 단위까지만 (ERP 가 초까지 주지만 보수적)
    const da = new Date(a);
    const db = new Date(b);
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return a === b;
    return Math.abs(da.getTime() - db.getTime()) < 60_000;
  }
  return String(a) === String(b);
}

// DB rows fetch (pcode → products row) · 전체 pcode non-null
async function fetchDbByPcode(pcodes) {
  const result = new Map();
  const CHUNK = 300;
  for (let i = 0; i < pcodes.length; i += CHUNK) {
    const chunk = pcodes.slice(i, i + CHUNK);
    const sel = [
      "pcode","product_code","product_name","supplier","supplier_code","unit",
      "sale_status","brand","manufacturer","last_purchase_date","last_sale_date",
      "current_stock","display_location","purchase_price","sale_price","category",
      "registered_at","last_modified_at"
    ].join(",");
    const { data, error } = await supabase.from("products").select(sel).in("pcode", chunk);
    if (error) { console.error("db fetch err:", error.message); continue; }
    for (const r of data || []) result.set(String(r.pcode), r);
  }
  return result;
}

async function main() {
  console.log("── Section 0 · live products schema ──");
  const cols = await liveProductsColumns();
  console.log(`cols=${cols.length}`);
  const hasLocation = cols.includes("location");
  const hasDisplayLocation = cols.includes("display_location");
  console.log(`products.location exists? ${hasLocation}`);
  console.log(`products.display_location exists? ${hasDisplayLocation}`);
  fs.writeFileSync(
    path.join(process.cwd(), "tools/_live-schema.json"),
    JSON.stringify({ cols, hasLocation, hasDisplayLocation }, null, 2)
  );

  console.log("\n── Section 1 · DROP_CANDIDATE metrics ──");
  const dropMetrics = [];
  for (const col of DROP_CANDIDATES) {
    const exists = cols.includes(col);
    if (!exists) { dropMetrics.push({ col, exists: false }); continue; }
    const { count } = await nonNullCount("products", col);
    const samples = await sampleValues("products", col, 3);
    dropMetrics.push({ col, exists: true, non_null: count, samples });
    console.log(`  ${col.padEnd(28)} nn=${String(count).padStart(5)} samples=${JSON.stringify(samples).slice(0,80)}`);
  }
  fs.writeFileSync(
    path.join(process.cwd(), "tools/_drop-metrics.json"),
    JSON.stringify(dropMetrics, null, 2)
  );

  console.log("\n── Section 2 · ERP CHANGED/SAME per column (DRY-RUN) ──");
  // pcode → erp row 매핑
  const erpByPcode = new Map();
  for (const r of erpRows) {
    const p = r.PCode && String(r.PCode).trim();
    if (p) erpByPcode.set(p, r);
  }
  const pcodes = Array.from(erpByPcode.keys());
  console.log(`ERP distinct PCode: ${pcodes.length}`);

  const dbByPcode = await fetchDbByPcode(pcodes);
  console.log(`DB rows matched by pcode: ${dbByPcode.size}`);

  // 비교
  const perColStats = new Map();
  for (const m of MAPPINGS) perColStats.set(m.db, {
    erp: m.erp, db: m.db, transform: m.transform, nullOverwrite: m.nullOverwrite,
    MATCHED: 0, SAME: 0, CHANGED: 0, SKIP_ERP_EMPTY: 0, NEW_INSERT: 0,
    examples: [],
    erp_nonempty_in_matched: 0,
  });

  let newInsertCount = 0;
  let matchedCount = 0;

  for (const [pcode, erpRow] of erpByPcode.entries()) {
    const dbRow = dbByPcode.get(pcode);
    if (!dbRow) { newInsertCount++; continue; }
    matchedCount++;

    for (const m of MAPPINGS) {
      const s = perColStats.get(m.db);
      s.MATCHED++;
      const erpVal = erpNorm(erpRow[m.erp], m.transform);
      const dbVal  = dbNorm(dbRow[m.db], m.transform);
      if (erpVal != null) s.erp_nonempty_in_matched++;

      // ERP empty + nullOverwrite=false → SKIP
      if (erpVal == null && !m.nullOverwrite) {
        s.SKIP_ERP_EMPTY++;
        continue;
      }
      if (equalVals(erpVal, dbVal, m.transform)) {
        s.SAME++;
      } else {
        s.CHANGED++;
        if (s.examples.length < 5) {
          s.examples.push({ pcode, erp: erpVal, db: dbVal });
        }
      }
    }
  }

  // NEW_INSERT 는 모든 column 공통 (253 신규)
  for (const [,s] of perColStats) s.NEW_INSERT = newInsertCount;

  console.log(`matched=${matchedCount} newInsert=${newInsertCount}`);
  console.log("\ncol".padEnd(24) + "nullOW".padEnd(8) + "ERP≠∅".padStart(7) + "SAME".padStart(7) + "CHANGED".padStart(9) + "SKIP_∅".padStart(9));
  const out = [];
  for (const [,s] of perColStats) {
    console.log(
      s.db.padEnd(24) +
      String(s.nullOverwrite).padEnd(8) +
      String(s.erp_nonempty_in_matched).padStart(7) +
      String(s.SAME).padStart(7) +
      String(s.CHANGED).padStart(9) +
      String(s.SKIP_ERP_EMPTY).padStart(9)
    );
    out.push(s);
  }

  fs.writeFileSync(
    path.join(process.cwd(), "tools/_erp-dryrun.json"),
    JSON.stringify({
      summary: { erpTotal: erpRows.length, matched: matchedCount, newInsert: newInsertCount },
      perColumn: out,
    }, null, 2)
  );

  // ───────────────────────────────────────────────────────────────
  // Section 3 · 21건 identity review (barcode-format-mismatch)
  // ───────────────────────────────────────────────────────────────
  // 보고만 — 수정 X
  const reviewFile = "docs/barcode-format-mismatch-21-2026-10-04.md";
  console.log(`\n── Section 3 · identity review file ──`);
  console.log(`  check: ${reviewFile}`);
  const reviewExists = fs.existsSync(path.join(process.cwd(), reviewFile));
  console.log(`  exists? ${reviewExists}`);

  console.log("\n✓ READ-ONLY DRY-RUN 완료 (WRITE 0 · 아웃풋 → tools/_*.json)");
}

main().catch(e => { console.error(e); process.exit(1); });
