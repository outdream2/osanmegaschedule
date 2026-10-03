// 2026-10-03 저녁 · READ ONLY · NowStock 검증용 5개 상품 선정
//   · ERP 재호출 없음 · 기존 3 snapshot 재사용
//   · 5 유형: 재고0 / 일반양수 / 10-03 매입 / diff-large / exact-match
//   · 선호 PCode: 12035 · 10805 · 10001 (검증목적 적합 시 포함)
import { readFileSync } from "fs";

const pl = JSON.parse(readFileSync("data/snapshots/product-list-2026-10-03.json", "utf8"));
const inv = JSON.parse(readFileSync("tools/iregen-bridge/output/inventory-full-full.json", "utf8"));
const buy = JSON.parse(readFileSync("data/snapshots/buy-status-2026-10-03.json", "utf8"));

const plByPC = new Map(pl.rows.map((r) => [String(r.PCode ?? "").trim(), r]));
const invByPC = new Map(inv.tables[0].rows.map((r) => [String(r.PCode ?? "").trim(), r]));
const buyPCodes = new Set(buy.rows.map((r) => String(r.PCode ?? "").trim()));

// Full Inventory formula
function invFormula(r) {
  const n = (v) => Number(v) || 0;
  return (
    n(r.PrvStock) + n(r.BuyStock) + n(r.StorageMoveIn) + n(r.StorageMoveAutoIn) + n(r.PlusStock) + n(r.SubdivisionPlus)
    - n(r.BuyReturnStock) - n(r.StorageMoveOut) - n(r.StorageMoveAutoOut)
    - n(r.SaleStock) + n(r.SaleReturnStock)
    - n(r.ProductUseStock) + n(r.ProductReturnUseStock)
    - n(r.ProductBadStock) + n(r.ProductReturnBadStock)
    - n(r.MinusStock) - n(r.SubdivisionMinus)
  );
}

// Build enriched join
const joined = [];
for (const [pc, plRow] of plByPC) {
  const invRow = invByPC.get(pc);
  if (!invRow) continue;
  const now = Number(plRow.NowStock) || 0;
  const formula = invFormula(invRow);
  joined.push({
    pcode: pc,
    barcode: String(plRow.BarCode ?? "").trim(),
    name: String(plRow.ProductName ?? ""),
    location: String(plRow.LocationName ?? ""),
    nowStock: now,
    prvStock: Number(invRow.PrvStock) || 0,
    buyStock: Number(invRow.BuyStock) || 0,
    saleStock: Number(invRow.SaleStock) || 0,
    plusStock: Number(invRow.PlusStock) || 0,
    minusStock: Number(invRow.MinusStock) || 0,
    moveIn: Number(invRow.StorageMoveIn) || 0,
    moveOut: Number(invRow.StorageMoveOut) || 0,
    productUse: Number(invRow.ProductUseStock) || 0,
    productBad: Number(invRow.ProductBadStock) || 0,
    formula,
    diff: now - formula,
    hasBuy1003: buyPCodes.has(pc),
    inv: invRow,
    pl: plRow,
  });
}

// 선호 PCode (지시된 상품)
const preferredPCodes = ["12035", "10805", "10001"];
const preferredRows = preferredPCodes.map((pc) => joined.find((j) => j.pcode === pc)).filter(Boolean);

// 유형별 후보 (완전히 서로 다른 상품 5개)
const selected = [];
const selectedPC = new Set();
const pick = (row, reason) => {
  if (!row || selectedPC.has(row.pcode)) return;
  row._reason = reason;
  selected.push(row);
  selectedPC.add(row.pcode);
};

// ── Type 1: 현재고 0 상품 (유의미한 흔적 있는 것 우선 · 선호 PCode > 10-03 매입 > BuyStock > SaleStock > 아무거나)
const type1 = (() => {
  for (const p of preferredRows) if (p.nowStock === 0) return { r: p, note: "preferred PCode (지시) · 현재고 0" };
  const zeroWithActivity = joined
    .filter((j) => j.nowStock === 0 && (j.buyStock > 0 || j.saleStock > 0 || j.plusStock > 0 || j.minusStock > 0))
    .sort((a, b) => (b.buyStock + b.saleStock) - (a.buyStock + a.saleStock));
  if (zeroWithActivity.length) return { r: zeroWithActivity[0], note: "재고 0 · 기간 내 매출/매입 흔적 있음 (실제 재고 바뀐 상품)" };
  const zero = joined.filter((j) => j.nowStock === 0);
  if (zero.length) return { r: zero[0], note: "재고 0 (기간 이동 없음 · 완전 재고 소진)" };
  return null;
})();
if (type1) pick(type1.r, `[재고 0] ${type1.note}`);

// ── Type 2: 2026-10-03 매입 발생 상품 (사용자 검증 PCode 10805/12035 가 여기 해당)
const type2 = (() => {
  // 선호 PCode 중 매입 발생한 것 우선
  for (const p of preferredRows) if (p.hasBuy1003 && !selectedPC.has(p.pcode)) return { r: p, note: "preferred PCode (지시) · 2026-10-03 매입 발생" };
  const buyRows = joined.filter((j) => j.hasBuy1003 && !selectedPC.has(j.pcode));
  if (buyRows.length) return { r: buyRows[0], note: "2026-10-03 BuyStock > 0 · 당일 매입" };
  return null;
})();
if (type2) pick(type2.r, `[10-03 매입] ${type2.note}`);

// ── Type 3: Inventory 공식 == NowStock 정확 일치 (일반 양수 재고 중)
const type3 = (() => {
  // 선호 PCode 중 exact match 있는지
  for (const p of preferredRows) if (!selectedPC.has(p.pcode) && p.diff === 0 && p.nowStock > 0) return { r: p, note: "preferred PCode (지시) · 공식 exact match" };
  const exactPositive = joined
    .filter((j) => !selectedPC.has(j.pcode) && j.diff === 0 && j.nowStock > 0)
    // 기간 이동 있는 상품 우선 (움직임이 있어야 공식이 진짜 맞는지 검증 의미)
    .sort((a, b) => (b.buyStock + b.saleStock + b.plusStock + b.minusStock) - (a.buyStock + a.saleStock + a.plusStock + a.minusStock));
  if (exactPositive.length) return { r: exactPositive[0], note: "공식 exact match · 양수 재고 · 기간 이동 가장 많음 (가장 유의미한 검증 포인트)" };
  return null;
})();
if (type3) pick(type3.r, `[공식 exact match] ${type3.note}`);

// ── Type 4: 공식과 NowStock 차이가 큰 상품 (NowStock 가 실시간이란 가설 검증 핵심)
const type4 = (() => {
  const bigDiff = joined
    .filter((j) => !selectedPC.has(j.pcode) && Math.abs(j.diff) >= 10 && j.nowStock > 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  if (bigDiff.length) return { r: bigDiff[0], note: `공식과 NowStock 차이 가장 큼 (|diff|=${Math.abs(bigDiff[0].diff)}) · 실시간 가설 검증 핵심` };
  return null;
})();
if (type4) pick(type4.r, `[공식 vs NowStock 큰 차이] ${type4.note}`);

// ── Type 5: 일반 양수 재고 상품 (아무 특이사항 없는 평범한 상품 · 기본 case 검증)
const type5 = (() => {
  // 선호 PCode 중 미사용된 거 우선
  for (const p of preferredRows) if (!selectedPC.has(p.pcode) && p.nowStock > 0) return { r: p, note: "preferred PCode (지시) · 일반 양수 재고" };
  // 기간 이동 없이 안정적인 재고 (중간 범위 재고 · 양수)
  const stable = joined
    .filter((j) => !selectedPC.has(j.pcode) && j.nowStock >= 10 && j.nowStock <= 100 && !j.hasBuy1003
                   && j.buyStock === 0 && j.saleStock === 0 && j.plusStock === 0 && j.minusStock === 0)
    .sort((a, b) => a.nowStock - b.nowStock);
  if (stable.length) return { r: stable[Math.floor(stable.length / 2)], note: "일반 안정 재고 (기간 이동 없음 · 중간 재고량) · baseline" };
  const anyPositive = joined.filter((j) => !selectedPC.has(j.pcode) && j.nowStock > 0);
  if (anyPositive.length) return { r: anyPositive[0], note: "일반 양수 재고 · fallback" };
  return null;
})();
if (type5) pick(type5.r, `[일반 양수 재고] ${type5.note}`);

// ── 출력 ────────────────────────────────────────────────────────────────────
console.log("");
console.log("===== NOWSTOCK ERP UI VALIDATION =====");
console.log("");

selected.forEach((r, i) => {
  console.log(`${i + 1}.`);
  console.log("");
  console.log(`PCode:                     ${r.pcode}`);
  console.log(`Barcode:                   ${r.barcode}`);
  console.log(`Product:                   ${r.name}`);
  console.log(`NowStock:                  ${r.nowStock}`);
  console.log(`PrvStock:                  ${r.prvStock}`);
  console.log(`BuyStock:                  ${r.buyStock}`);
  console.log(`SaleStock:                 ${r.saleStock}`);
  console.log(`PlusStock:                 ${r.plusStock}`);
  console.log(`MinusStock:                ${r.minusStock}`);
  console.log(`MoveIn/MoveOut:            ${r.moveIn} / ${r.moveOut}`);
  console.log(`ProductUse/ProductBad:     ${r.productUse} / ${r.productBad}`);
  console.log(`Inventory Formula Result:  ${r.formula}`);
  console.log(`Difference (NowStock-Formula): ${r.diff}`);
  console.log(`LocationName:              ${r.location || "(empty)"}`);
  console.log(`Buy_Status 2026-10-03:     ${r.hasBuy1003 ? "YES (당일 매입 발생)" : "NO"}`);
  console.log(`Reason Selected:           ${r._reason}`);
  console.log("");
});

console.log("");
console.log("===== USER CHECK =====");
console.log("");
console.log("사용자는 ERP \"상품 재고 현황\" 화면에서 아래 5개 상품의 현재고만 확인하면 된다.");
console.log("");
console.log("| 순 | PCode   | 상품명                                           | SOAP NowStock | ERP 화면 현재고 | 일치 여부 |");
console.log("|----|---------|--------------------------------------------------|---------------|-----------------|-----------|");
selected.forEach((r, i) => {
  const num = String(i + 1).padStart(2, " ");
  const pc = r.pcode.padEnd(7, " ");
  const nm = r.name.length > 46 ? r.name.slice(0, 44) + "…" : r.name.padEnd(48, " ");
  const ns = String(r.nowStock).padStart(13, " ");
  console.log(`| ${num} | ${pc} | ${nm} | ${ns} |                 |           |`);
});
console.log("");
console.log("* ERP 화면 현재고 · 일치 여부 칸은 사용자가 입력");
console.log("* 전체 일치 시: Product_List.NowStock = 실시간 현재고 확정 · Inventory 42-col 공식 걷어내기 가능");
