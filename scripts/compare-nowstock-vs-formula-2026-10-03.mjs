// 2026-10-03 저녁 · READ ONLY · Product_List.NowStock vs Inventory_Status 계산식 비교
//   · 목표 · NowStock 가 현재고 field 라면 복잡한 Inventory 공식을 걷어낼 수 있는지 검증
//   · ERP 재호출 없음 · 기존 2 snapshot 재사용
import { readFileSync } from "fs";

const pl = JSON.parse(readFileSync("data/snapshots/product-list-2026-10-03.json", "utf8"));
const inv = JSON.parse(readFileSync("tools/iregen-bridge/output/inventory-full-full.json", "utf8"));
const plRows = pl.rows;
const invRows = inv.tables[0].rows;

const plByPCode = new Map(plRows.map((r) => [String(r.PCode ?? "").trim(), r]));
const invByPCode = new Map(invRows.map((r) => [String(r.PCode ?? "").trim(), r]));

// Inventory formula (추정 · 사용자 지시 공식)
//   PrvStock + BuyStock + StorageMoveIn + StorageMoveAutoIn + PlusStock + SubdivisionPlus
//   - BuyReturnStock - StorageMoveOut - StorageMoveAutoOut
//   - SaleStock + SaleReturnStock
//   - ProductUseStock + ProductReturnUseStock
//   - ProductBadStock + ProductReturnBadStock
//   - MinusStock - SubdivisionMinus
function invFormulaFull(r) {
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

// Simpler candidate: PrvStock + 모든 In - 모든 Out
function invFormulaSimple(r) {
  const n = (v) => Number(v) || 0;
  return (
    n(r.PrvStock) + n(r.BuyStock) - n(r.SaleStock) + n(r.PlusStock) - n(r.MinusStock)
  );
}

const stats = {
  comparable: 0,
  nowStockMatchFull: 0,
  nowStockMatchSimple: 0,
  nowStockOnly: 0, // Both snapshots have row but formula result != NowStock
};
const diffBuckets = { "0": 0, "1-10": 0, "11-100": 0, "101-1000": 0, ">1000": 0 };
const diffSamples = [];
const prvEqualsNow = { yes: 0, no: 0 }; // PrvStock == NowStock 일 가능성 체크
const allZeroExceptPrv = { yes: 0, no: 0 }; // 기간 이동 전부 0 (period 영향 없음)

for (const [p, plr] of plByPCode) {
  const ir = invByPCode.get(p);
  if (!ir) continue;
  stats.comparable++;

  const now = Number(plr.NowStock) || 0;
  const prv = Number(ir.PrvStock) || 0;
  const full = invFormulaFull(ir);
  const simple = invFormulaSimple(ir);

  if (Math.abs(now - full) < 0.001) stats.nowStockMatchFull++;
  if (Math.abs(now - simple) < 0.001) stats.nowStockMatchSimple++;

  if (prv === now) prvEqualsNow.yes++; else prvEqualsNow.no++;

  const movementSum = (Number(ir.BuyStock)||0) + (Number(ir.SaleStock)||0) + (Number(ir.StorageMoveIn)||0) + (Number(ir.StorageMoveOut)||0) +
    (Number(ir.PlusStock)||0) + (Number(ir.MinusStock)||0) + (Number(ir.ProductUseStock)||0) + (Number(ir.ProductBadStock)||0) +
    (Number(ir.SubdivisionPlus)||0) + (Number(ir.SubdivisionMinus)||0);
  if (movementSum === 0) allZeroExceptPrv.yes++; else allZeroExceptPrv.no++;

  const diff = Math.abs(now - full);
  if (diff === 0) diffBuckets["0"]++;
  else if (diff <= 10) diffBuckets["1-10"]++;
  else if (diff <= 100) diffBuckets["11-100"]++;
  else if (diff <= 1000) diffBuckets["101-1000"]++;
  else diffBuckets[">1000"]++;

  if (diff > 0 && diffSamples.length < 30) {
    diffSamples.push({
      pcode: p,
      name: (plr.ProductName || "").slice(0, 25),
      NowStock: now,
      PrvStock: prv,
      BuyStock: Number(ir.BuyStock) || 0,
      SaleStock: Number(ir.SaleStock) || 0,
      PlusStock: Number(ir.PlusStock) || 0,
      MinusStock: Number(ir.MinusStock) || 0,
      MoveIn: Number(ir.StorageMoveIn) || 0,
      MoveOut: Number(ir.StorageMoveOut) || 0,
      formulaFull: full,
      formulaSimple: simple,
      diff,
    });
  }
}

console.log("===== Product_List.NowStock vs Inventory_Status 공식 비교 =====");
console.log(`Comparable (PCode intersection): ${stats.comparable}`);
console.log(``);
console.log(`NowStock == Full Formula exact: ${stats.nowStockMatchFull} (${((stats.nowStockMatchFull/stats.comparable)*100).toFixed(2)}%)`);
console.log(`NowStock == Simple Formula exact: ${stats.nowStockMatchSimple} (${((stats.nowStockMatchSimple/stats.comparable)*100).toFixed(2)}%)`);
console.log(``);
console.log(`PrvStock == NowStock : yes=${prvEqualsNow.yes} / no=${prvEqualsNow.no}`);
console.log(`모든 기간 이동 == 0 (움직임 없음): yes=${allZeroExceptPrv.yes} / no=${allZeroExceptPrv.no}`);
console.log(``);
console.log(`|NowStock - FullFormula| 분포:`);
Object.entries(diffBuckets).forEach(([k, v]) => console.log(`  ${k.padEnd(10)} : ${v}`));

console.log(`\n===== Different samples (|diff| > 0) · 최대 30 =====`);
diffSamples.forEach((s) => {
  console.log(`  ${s.pcode} "${s.name}" NowStock=${s.NowStock} PrvStock=${s.PrvStock} Buy=${s.BuyStock} Sale=${s.SaleStock} +=${s.PlusStock} -=${s.MinusStock} MovIn=${s.MoveIn} MovOut=${s.MoveOut}`);
  console.log(`    → Full=${s.formulaFull} · Simple=${s.formulaSimple} · diff(full)=${s.diff}`);
});

// 추가 분석: Inventory 조회 StartDate/EndDate 범위 때문에 "PrvStock = 그 기간 시작전 재고" 가능성
// NowStock 는 "현재 ERP 시점" 재고
// 둘 사이 차이가 거의 없다면 Inventory 공식은 사실상 PrvStock + 기간 변동 = PrvStock (움직임 없음)
console.log(`\n===== NowStock 특성 분석 =====`);
const nsHist = { zero: 0, positive: 0, negative: 0 };
for (const r of plRows) {
  const n = Number(r.NowStock) || 0;
  if (n === 0) nsHist.zero++;
  else if (n > 0) nsHist.positive++;
  else nsHist.negative++;
}
console.log(`Product_List.NowStock: zero=${nsHist.zero} · positive=${nsHist.positive} · negative=${nsHist.negative}`);

const prvHist = { zero: 0, positive: 0, negative: 0 };
for (const r of invRows) {
  const n = Number(r.PrvStock) || 0;
  if (n === 0) prvHist.zero++;
  else if (n > 0) prvHist.positive++;
  else prvHist.negative++;
}
console.log(`Inventory.PrvStock: zero=${prvHist.zero} · positive=${prvHist.positive} · negative=${prvHist.negative}`);
