// 2026-10-03 저녁 · READ ONLY · Buy_Status 2026-10-03 1일만 조회
//   · 사용자 ERP 화면 검증값 · PCode 10805/10812/12031/12035/12036 · 수량 각 10 · 총 50
//   · 금액 242,000 / 330,000 / 143,000 / 165,000 / 165,000 · 총 1,045,000
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { spawn } from "child_process";
import { resolve, dirname, join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function parseEnv(p) {
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("="); if (eq < 0) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}
const env = parseEnv(join(projectRoot, ".env"));
const g = (...keys) => keys.map(k => env[k]).find(Boolean);
const ctx = {
  corpCode: g("IREGEN_CORP_CODE", "Iregen  companycode", "Iregen companycode", "CorpCode") || "30009",
  userId: g("IREGEN_USER_ID", "Iregen id", "UserID") || "111",
  stCode: g("IREGEN_ST_CODE", "Iregen stcode", "StCode") || "000",
  corpDbNm: g("IREGEN_CORP_DB_NM", "CorpDB_nm", "CORPDB_NM"),
  devStartDate: "2026-10-03",
  devEndDate: "2026-10-03",
};
if (!ctx.corpDbNm) { console.error("CorpDB_nm missing"); process.exit(2); }

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

const envelope =
  `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
  `<s:Body>` +
  `<Buy_Status xmlns="http://tempuri.org/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">` +
  `<ent>` +
  `<IsReturnJson>false</IsReturnJson><IsEnc>false</IsEnc><IsCompress>false</IsCompress>` +
  `<IsStorageGubunOut>false</IsStorageGubunOut>` +
  `<CorpCode>${esc(ctx.corpCode)}</CorpCode>` +
  `<CtCode/><CardFee>0</CardFee>` +
  `<Lcate>0</Lcate><Mcate>0</Mcate><Scate>0</Scate><Dcate>0</Dcate>` +
  `<StCode>${esc(ctx.stCode)}</StCode>` +
  `<IsStatus>9</IsStatus>` +
  `<GuaranteePrice>0</GuaranteePrice><Subsidy>0</Subsidy><BuyDiscount>0</BuyDiscount>` +
  `<DevCommission>0</DevCommission><SaleCommission>0</SaleCommission>` +
  `<Deadline>0</Deadline><PaymentDate>0</PaymentDate>` +
  `<EtcIntField1>0</EtcIntField1><EtcIntField2>0</EtcIntField2><EtcIntField3>0</EtcIntField3>` +
  `<UserID>${esc(ctx.userId)}</UserID>` +
  `<CorpDB_nm>${esc(ctx.corpDbNm)}</CorpDB_nm>` +
  `<PageIdx>0</PageIdx><PageSize>0</PageSize>` +
  `<SearchType>TOTAL</SearchType>` +
  `<StartDate/><EndDate/>` +
  `<FolderCode>0</FolderCode>` +
  `<DevStartDate>${esc(ctx.devStartDate)}</DevStartDate>` +
  `<DevEndDate>${esc(ctx.devEndDate)}</DevEndDate>` +
  `<Cate>0</Cate><pCate>0</pCate><IsLevel>0</IsLevel>` +
  `<Sort>0</Sort><Idx>0</Idx><pIdx>0</pIdx>` +
  `<FileSize>0</FileSize><BeCode>0</BeCode>` +
  `<BuseoCode>-1</BuseoCode><OutBuseoCode>0</OutBuseoCode>` +
  `<CtContact>0</CtContact>` +
  `<InStCode>${esc(ctx.stCode)}</InStCode>` +
  `<InBuseoCode>0</InBuseoCode>` +
  `<TotalPrice>0</TotalPrice><TotalTax>0</TotalTax><TotalExemption>0</TotalExemption>` +
  `<TotalBuyTotal>0</TotalBuyTotal>` +
  `<BuyPrice>0</BuyPrice><TaxExemption>0</TaxExemption><BuyTax>0</BuyTax><BuyTotal>0</BuyTotal>` +
  `<UseBuyPrice>0</UseBuyPrice><UseTax>0</UseTax>` +
  `<UseTaxExemption>0</UseTaxExemption><UseTaxExemption2>0</UseTaxExemption2><UseBuyTotal>0</UseBuyTotal>` +
  `<UsedBuyPrice>0</UsedBuyPrice><UsedTax>0</UsedTax>` +
  `<UsedTaxExemption>0</UsedTaxExemption><UsedTaxExemption2>0</UsedTaxExemption2><UsedBuyTotal>0</UsedBuyTotal>` +
  `<DisCountPrice>0</DisCountPrice><DisCountTax>0</DisCountTax>` +
  `<DisCountTaxExemption>0</DisCountTaxExemption><DisCountTaxExemption2>0</DisCountTaxExemption2>` +
  `<DisCountTotal>0</DisCountTotal>` +
  `<TaxType1>0</TaxType1><TaxType2>0</TaxType2>` +
  `<BillType1>0</BillType1><BillType2>0</BillType2><BillType3>0</BillType3><BillType4>0</BillType4>` +
  `<SupportPrice>0</SupportPrice><Payment>0</Payment><SmallMoney>0</SmallMoney>` +
  `<IntDevDDay>0</IntDevDDay>` +
  `<UnitStock>0</UnitStock><ReqUnitStock>0</ReqUnitStock>` +
  `<UnitCost>0</UnitCost><UnitSale>0</UnitSale><StockCnt>0</StockCnt>` +
  `<SaleCommissionTotal>0</SaleCommissionTotal><CardFeeTotal>0</CardFeeTotal>` +
  `<PointFeeTotal>0</PointFeeTotal>` +
  `<SalePrice>0</SalePrice><SaleTax>0</SaleTax>` +
  `<SaleTaxExemption>0</SaleTaxExemption><SaleTotal>0</SaleTotal>` +
  `<TaxPercent>0</TaxPercent>` +
  `<ReqStockCnt>0</ReqStockCnt><InStockCnt>0</InStockCnt><TotalStock>0</TotalStock>` +
  `<NowStock>0</NowStock><ProductWeight>0</ProductWeight>` +
  `<EvCostUnit>0</EvCostUnit><EvSaleUnit>0</EvSaleUnit>` +
  `<distinctCnt>0</distinctCnt><Margin>0</Margin><MarginRate>0</MarginRate>` +
  `<TaxCode>0</TaxCode><OrderCnt>0</OrderCnt>` +
  `<table_UpLoad_BuyCustomer_Commission_RowCnt>0</table_UpLoad_BuyCustomer_Commission_RowCnt>` +
  `<table_UpLoad_BuyCustomer_Contact_RowCnt>0</table_UpLoad_BuyCustomer_Contact_RowCnt>` +
  `<table_UpLoad_BuyCustomer_Address_RowCnt>0</table_UpLoad_BuyCustomer_Address_RowCnt>` +
  `<table_UpLoad_BuyCustomer_Image_RowCnt>0</table_UpLoad_BuyCustomer_Image_RowCnt>` +
  `<table_UpLoad_BuyCustomer_JoinStorage_RowCnt>0</table_UpLoad_BuyCustomer_JoinStorage_RowCnt>` +
  `<table_UpLoad_Product_RowCnt>0</table_UpLoad_Product_RowCnt>` +
  `<table_UpLoad_BuyEvent_Product_RowCnt>0</table_UpLoad_BuyEvent_Product_RowCnt>` +
  `<table_UpLoad_Buy_Product_RowCnt>0</table_UpLoad_Buy_Product_RowCnt>` +
  `<table_UpLoad_Buy_MonthClosing_RowCnt>0</table_UpLoad_Buy_MonthClosing_RowCnt>` +
  `<table_UpLoad_Buy_MonthClosing_Tax_RowCnt>0</table_UpLoad_Buy_MonthClosing_Tax_RowCnt>` +
  `<table_UpLoad_BankList_RowCnt>0</table_UpLoad_BankList_RowCnt>` +
  `<table_UpLoad_Rental_Product_Confirm_Product_RowCnt>0</table_UpLoad_Rental_Product_Confirm_Product_RowCnt>` +
  `<pSmmIdx>0</pSmmIdx><SmmReqUnitStock>0</SmmReqUnitStock><SmmReqStockCnt>0</SmmReqStockCnt>` +
  `<table_UpLoad_Image_RowCnt>0</table_UpLoad_Image_RowCnt>` +
  `<IsFinishUpdate>0</IsFinishUpdate>` +
  `<_IsDevMode>false</_IsDevMode><_IsDBBGMod>false</_IsDBBGMod>` +
  `</ent></Buy_Status></s:Body></s:Envelope>`;

const ENDPOINT = "http://soap.iregen.co.kr/App_Service/Irm/SvcBuyBiz.asmx";
const ACTION = "http://tempuri.org/Buy_Status";
const DECODER = resolve(projectRoot, "tools/iregen-bridge/bin/Debug/net48/iregen-decoder.exe");

async function callSoap(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${ACTION}"` }, body, signal: controller.signal });
    const xml = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, xml };
  } catch (e) { return { ok: false, error: e.message }; } finally { clearTimeout(timer); }
}

async function decode(xml) {
  const cwd = join(tmpdir(), "iregen-buy-" + Date.now());
  mkdirSync(cwd, { recursive: true });
  // sourceName.Replace("buy-response","buy") → prefix "buy" → output "buy-full.json"
  const xmlPath = join(cwd, "buy-response.xml");
  writeFileSync(xmlPath, xml, "utf8");
  return new Promise((resolveP) => {
    const errChunks = [];
    const child = spawn(DECODER, ["-f", xmlPath], { cwd, windowsHide: true });
    child.stdout.on("data", () => {});
    child.stderr.on("data", b => errChunks.push(b.toString("utf8")));
    child.on("close", code => {
      if (code !== 0) {
        try { rmSync(cwd, { recursive: true, force: true }); } catch {}
        resolveP({ ok: false, error: `decoder exit ${code}\n` + errChunks.join("").split("\n").slice(-10).join("\n") });
        return;
      }
      const outPath = join(cwd, "output", "buy-full.json");
      if (!existsSync(outPath)) {
        try { rmSync(cwd, { recursive: true, force: true }); } catch {}
        resolveP({ ok: false, error: "output 미생성: " + outPath });
        return;
      }
      const parsed = JSON.parse(readFileSync(outPath, "utf8"));
      try { rmSync(cwd, { recursive: true, force: true }); } catch {}
      resolveP({ ok: true, parsed });
    });
  });
}

console.log("[buy] POST · 기간:", ctx.devStartDate, "~", ctx.devEndDate);
console.log("[buy] body bytes:", envelope.length);
const t0 = Date.now();
const r = await callSoap(envelope);
console.log("[buy] SOAP", Date.now() - t0, "ms · ok:", r.ok);
if (!r.ok) { console.error(r.error); process.exit(3); }
console.log("[buy] response bytes:", r.xml.length);

const d = await decode(r.xml);
if (!d.ok) { console.error("[buy] decode fail:", d.error); process.exit(4); }

const parsed = d.parsed;
console.log(`\n[buy] DataSet "${parsed.datasetName}" · ${parsed.tableCount} tables`);
parsed.tables.forEach((t, i) => console.log(`  [${i}] "${t.name}" · ${t.rowCount} rows · ${t.columns.length} cols`));

// primary = largest rowCount
let primaryIdx = 0;
for (let i = 1; i < parsed.tables.length; i++) if (parsed.tables[i].rowCount > parsed.tables[primaryIdx].rowCount) primaryIdx = i;
const primary = parsed.tables[primaryIdx];
console.log(`\n[buy] primary = Table[${primaryIdx}] "${primary.name}" · ${primary.rowCount} rows · ${primary.columns.length} cols`);
console.log(`\n[buy] 전체 columns (${primary.columns.length}):`);
primary.columns.forEach((c, i) => console.log(`  [${String(i).padStart(3, " ")}] ${c.name} · ${c.type}`));

// save snapshot
const snapshotPath = resolve(projectRoot, "data/snapshots/buy-status-2026-10-03.json");
writeFileSync(snapshotPath, JSON.stringify({
  _meta: {
    source: "sync-agent Buy_Status",
    fetchedAt: new Date().toISOString(),
    devStartDate: ctx.devStartDate,
    devEndDate: ctx.devEndDate,
    tables: parsed.tables.map((t, i) => ({ index: i, name: t.name, rowCount: t.rowCount, columnCount: t.columns.length })),
    primaryTable: primary.name,
  },
  columns: primary.columns,
  rows: primary.rows,
  allTables: parsed.tables,
}, null, 2), "utf8");
console.log(`\n[buy] snapshot 저장 · ${snapshotPath}`);

// 사용자 검증 (10805/10812/12031/12035/12036)
const targets = ["10805", "10812", "12031", "12035", "12036"];
console.log(`\n===== 사용자 ERP 화면 검증 · 2026-10-03 PCode 매입 =====`);
const totalQty = {}, totalAmt = {};
for (const r of primary.rows) {
  const p = String(r.PCode ?? "").trim();
  if (!targets.includes(p)) continue;
  const qty = Number(r.ReqStockCnt ?? r.StockCnt ?? r.UnitStock ?? 0);
  const amt = Number(r.BuyTotal ?? r.TotalBuyTotal ?? r.BuyPrice ?? 0);
  console.log(`  PCode=${p} · "${r.ProductName}" · Qty=${qty} · Amt=${amt}`);
  totalQty[p] = (totalQty[p] || 0) + qty;
  totalAmt[p] = (totalAmt[p] || 0) + amt;
}
console.log(`\nTotal by PCode:`);
for (const p of targets) console.log(`  ${p} · qty=${totalQty[p] ?? 0} · amt=${totalAmt[p] ?? 0}`);
const grandQty = Object.values(totalQty).reduce((a, b) => a + b, 0);
const grandAmt = Object.values(totalAmt).reduce((a, b) => a + b, 0);
console.log(`\n5 PCode 합계 · qty=${grandQty} · amt=${grandAmt.toLocaleString()}`);
console.log(`ERP 화면값 · qty=50 · amt=1,045,000`);
