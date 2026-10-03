// 2026-10-03 저녁 · READ ONLY · Product_List 1회 조회 (concurrency=1)
//   · sync-agent iregenSoap.ts 의 envelope + decoder 를 그대로 재사용
//   · 결과 primary table 만 data/snapshots/ 에 저장 · 민감정보 저장 X
//   · ERP 서버 보호 · concurrency=1 고정 · pageSize=50
//   · retry · 30s → 60s → 120s → abort (사용자 지시 반영 · 기존 1s/2s/포기 아님)
//   · DB WRITE 금지 · ERP WRITE 금지
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { spawn } from "child_process";
import { join, resolve, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// ── .env 로드 (dotenv 없이 간단 파서) ───────────────────────────────────────────
function parseEnv(path) {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k) out[k] = v;
  }
  return out;
}
const envFile = parseEnv(join(projectRoot, ".env"));
function envVal(key) {
  return (process.env[key] && String(process.env[key]).trim()) || (envFile[key] && String(envFile[key]).trim()) || undefined;
}
function envCorpDbNm() { return envVal("IREGEN_CORP_DB_NM") ?? envVal("CorpDB_nm") ?? envVal("CORPDB_NM"); }
function envCorpCode() { return envVal("IREGEN_CORP_CODE") ?? envVal("Iregen  companycode") ?? envVal("Iregen companycode") ?? envVal("CorpCode"); }
function envUserId()   { return envVal("IREGEN_USER_ID") ?? envVal("Iregen id") ?? envVal("UserID"); }
function envUserName() { return envVal("IREGEN_USER_NAME") ?? envVal("Iregen name") ?? envVal("UserName"); }
function envStCode()   { return envVal("IREGEN_ST_CODE") ?? envVal("Iregen stcode") ?? envVal("StCode"); }

const corpDbNm = envCorpDbNm();
if (!corpDbNm) { console.error("[fetch] CorpDB_nm 없음 · .env 확인 · 중단"); process.exit(2); }
const ctx = {
  corpCode: envCorpCode() ?? "30009",
  userId: envUserId() ?? "111",
  userName: envUserName() ?? "강서은",
  stCode: envStCode() ?? "000",
  corpDbNm,
};

const PRODUCT_LIST_ENDPOINT = "http://soap.iregen.co.kr/App_Service/Irm/SvcProductBiz.asmx";
const PRODUCT_LIST_SOAP_ACTION = "http://tempuri.org/Product_List";

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

// ── Product_List envelope · apps/sync-agent/src/main/iregenSoap.ts line 634 완전 복제 ──
function buildEnvelope(pageIdx, pageSize) {
  return (
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
    `<Product_List xmlns="http://tempuri.org/">` +
    `<ent>` +
    `<IsReturnJson>false</IsReturnJson><IsEnc>false</IsEnc><IsCompress>false</IsCompress>` +
    `<IsStorageGubunOut>false</IsStorageGubunOut><StorageGubun>A</StorageGubun>` +
    `<CorpCode>${escapeXml(ctx.corpCode)}</CorpCode>` +
    `<OutBuseoCode>0</OutBuseoCode><IsProductType>0</IsProductType><IsWeight>0</IsWeight>` +
    `<IsStockEdit>false</IsStockEdit><IsStock>0</IsStock><IsTax>0</IsTax><TaxPercent>0</TaxPercent>` +
    `<CostPrice>0</CostPrice><UnitCost>0</UnitCost><SalePrice>0</SalePrice>` +
    `<Lcate>0</Lcate><Mcate>0</Mcate><Scate>0</Scate><Dcate>0</Dcate><Ecate>0</Ecate><Fcate>0</Fcate>` +
    `<MakerCode>0</MakerCode><BrandCode>0</BrandCode>` +
    `<oLcate>0</oLcate><oMcate>0</oMcate><oScate>0</oScate>` +
    `<CateGubunOne>0</CateGubunOne><CateGubunTwo>0</CateGubunTwo>` +
    `<IsStandingPoint>0</IsStandingPoint><ProductFee>0</ProductFee><IsKeepingRule>0</IsKeepingRule>` +
    `<BottlePrice>0</BottlePrice><SeCode>0</SeCode><BuseoCode>-1</BuseoCode>` +
    `<IsPoint>0</IsPoint><PointAdd>0</PointAdd>` +
    `<IsSalesStore>1</IsSalesStore><IsBuyStatus>0</IsBuyStatus><IsSaleStatus>1</IsSaleStatus>` +
    `<IsBauCheo>2</IsBauCheo><DevDDay>0</DevDDay>` +
    `<IsMakeDayEdit>false</IsMakeDayEdit><IsExpiryDayEdit>false</IsExpiryDayEdit>` +
    `<IsIdentificationEdit>false</IsIdentificationEdit><UniPassDay>0</UniPassDay>` +
    `<SearchWord/>` +
    `<BuyUnitStock>0</BuyUnitStock><SaleUnitStock>0</SaleUnitStock>` +
    `<TotalStockCnt>0</TotalStockCnt><NowStock>0</NowStock><EditStock>0</EditStock>` +
    `<PlusStock>0</PlusStock><MinusStock>0</MinusStock>` +
    `<EtcIntField1>0</EtcIntField1><EtcIntField2>0</EtcIntField2><EtcIntField3>0</EtcIntField3>` +
    `<UserID>${escapeXml(ctx.userId)}</UserID>` +
    `<UserName>${escapeXml(ctx.userName)}</UserName>` +
    `<CorpDB_nm>${escapeXml(ctx.corpDbNm)}</CorpDB_nm>` +
    `<PageIdx>${pageIdx}</PageIdx>` +
    `<PageSize>${pageSize}</PageSize>` +
    `<SearchType>0</SearchType>` +
    `<StartDate/><EndDate/>` +
    `<AIdx>0</AIdx><Sort>0</Sort><Idx>0</Idx>` +
    `<UnitStock>0</UnitStock><UnitPrice>0</UnitPrice><SaleTotal>0</SaleTotal>` +
    `<PagCode>0</PagCode>` +
    `<StCode>${escapeXml(ctx.stCode)}</StCode>` +
    `<BlockCode>0</BlockCode><BlockCnt>0</BlockCnt>` +
    `<Cate>0</Cate><pCate>0</pCate>` +
    `<StartPrice>0</StartPrice><EndPrice>0</EndPrice>` +
    `<CateCostMargin>0</CateCostMargin><CateSaleMargin>0</CateSaleMargin>` +
    `<IsLevel>0</IsLevel><IsStatus>1</IsStatus><IsSoldOutShop>0</IsSoldOutShop>` +
    `<FileSize>0</FileSize><TotalStock>0</TotalStock><StockDays>0</StockDays>` +
    `<MinStock>0</MinStock><MaxStock>0</MaxStock><SoldOutCnt>0</SoldOutCnt>` +
    `<SaleDDay>0</SaleDDay><RetentionDate>0</RetentionDate>` +
    `<OptIdx>0</OptIdx><OptionPrice>0</OptionPrice><OptionStock>0</OptionStock>` +
    `<PriceA>0</PriceA><PriceAPercent>0</PriceAPercent>` +
    `<PriceB>0</PriceB><PriceBPercent>0</PriceBPercent>` +
    `<PriceC>0</PriceC><PriceCPercent>0</PriceCPercent>` +
    `<PriceD>0</PriceD><PriceDPercent>0</PriceDPercent>` +
    `<Incentive>0</Incentive><MaxSaleCnt>0</MaxSaleCnt><MinSaleCnt>0</MinSaleCnt>` +
    `<EvCostUnit>0</EvCostUnit><InventoryEvCostUnit>0</InventoryEvCostUnit>` +
    `<EvSaleUnit>0</EvSaleUnit><pIdx>0</pIdx><SetLevel>0</SetLevel>` +
    `<StockCnt>0</StockCnt><AddPrice>0</AddPrice><SetSaleTotal>0</SetSaleTotal>` +
    `<Horizontal>0</Horizontal><Vertical>0</Vertical><Height>0</Height>` +
    `<Volume>0</Volume><Weight>0</Weight>` +
    `<StartEditDate/><EndEditDate/><CtCode/>` +
    `<IsUnitView>2</IsUnitView><IsPriceStatus>1</IsPriceStatus>` +
    `<PrintCnt>0</PrintCnt><TagCode>0</TagCode><FolderCode>0</FolderCode>` +
    `<PcnIdx>0</PcnIdx><CommissionRate>0</CommissionRate>` +
    `<table_UpLoad_Product_Image_RowCnt>0</table_UpLoad_Product_Image_RowCnt>` +
    `<table_UpLoad_Product_Unit_RowCnt>0</table_UpLoad_Product_Unit_RowCnt>` +
    `<table_UpLoad_Product_BarCode_RowCnt>0</table_UpLoad_Product_BarCode_RowCnt>` +
    `<table_UpLoad_Product_OfficialNotiGroup_RowCnt>0</table_UpLoad_Product_OfficialNotiGroup_RowCnt>` +
    `<table_UpLoad_Product_Add_nm_RowCnt>0</table_UpLoad_Product_Add_nm_RowCnt>` +
    `<table_UpLoad_Product_Add_Value_RowCnt>0</table_UpLoad_Product_Add_Value_RowCnt>` +
    `<table_UpLoad_Product_Option_nm_RowCnt>0</table_UpLoad_Product_Option_nm_RowCnt>` +
    `<table_UpLoad_Product_Option_Value_RowCnt>0</table_UpLoad_Product_Option_Value_RowCnt>` +
    `<table_UpLoad_Product_RowCnt>0</table_UpLoad_Product_RowCnt>` +
    `<table_UpLoad_Product_Set_RowCnt>0</table_UpLoad_Product_Set_RowCnt>` +
    `<table_UpLoad_Product_Set_Product_RowCnt>0</table_UpLoad_Product_Set_Product_RowCnt>` +
    `<table_Product_Notice_RowCnt>0</table_Product_Notice_RowCnt>` +
    `<table_Product_Price_Request_RowCnt>0</table_Product_Price_Request_RowCnt>` +
    `<IsBuseoEdit>false</IsBuseoEdit><IsBuyStatusEdit>false</IsBuyStatusEdit>` +
    `<IsSaleStatusEdit>false</IsSaleStatusEdit><IsProductOrderEdit>false</IsProductOrderEdit>` +
    `<IsPointEdit>false</IsPointEdit><IsCostPriceEdit>false</IsCostPriceEdit>` +
    `<IsPriceAEdit>false</IsPriceAEdit><IsPriceBEdit>false</IsPriceBEdit>` +
    `<IsPriceCEdit>false</IsPriceCEdit><IsPriceDEdit>false</IsPriceDEdit>` +
    `<IsBuyDefaultEdit>false</IsBuyDefaultEdit><IsSaleDefaultEdit>false</IsSaleDefaultEdit>` +
    `<IsStatusEdit>false</IsStatusEdit><IsSoldOutShopEdit>false</IsSoldOutShopEdit>` +
    `<IsSoldOutDomeEdit>false</IsSoldOutDomeEdit>` +
    `<IsStatus01Edit>false</IsStatus01Edit><IsStatus02Edit>false</IsStatus02Edit>` +
    `<IsStatus03Edit>false</IsStatus03Edit><IsStatus04Edit>false</IsStatus04Edit>` +
    `<TabStatus>000</TabStatus>` +
    `<OutDcate>0</OutDcate><OutStockCnt>0</OutStockCnt>` +
    `<InDcate>0</InDcate><InStockCnt>0</InStockCnt>` +
    `<MoveStock>0</MoveStock><ProductCnt>0</ProductCnt><DiscountPercent>0</DiscountPercent>` +
    `<EvMaxStock>0</EvMaxStock>` +
    `<table_UpLoad_Store_Price_Tag_Product_RowCnt>0</table_UpLoad_Store_Price_Tag_Product_RowCnt>` +
    `<table_UpLoad_StoreEvent_Product_RowCnt>0</table_UpLoad_StoreEvent_Product_RowCnt>` +
    `<minQuantityByOrder>0</minQuantityByOrder><maxQuantityByOrder>0</maxQuantityByOrder>` +
    `<FontSize>0</FontSize><BorderSize>0</BorderSize><InIdx>0</InIdx>` +
    `<CostV2Add>0</CostV2Add>` +
    `<PriceAAdd>0</PriceAAdd><PriceBAdd>0</PriceBAdd><PriceCAdd>0</PriceCAdd><PriceDAdd>0</PriceDAdd>` +
    `</ent>` +
    `</Product_List>` +
    `</s:Body>` +
    `</s:Envelope>`
  );
}

async function callSoap(body, timeoutMs = 90_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(PRODUCT_LIST_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${PRODUCT_LIST_SOAP_ACTION}"` },
      body,
      signal: controller.signal,
    });
  } catch (e) {
    return { ok: false, stage: "network", error: e.name === "AbortError" ? `timeout ${timeoutMs}ms` : e.message };
  } finally { clearTimeout(timer); }
  const xml = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, stage: "http", error: `HTTP ${res.status}` };
  return { ok: true, xml };
}

const DECODER_EXE = resolve(projectRoot, "tools/iregen-bridge/bin/Debug/net48/iregen-decoder.exe");

async function decode(xmlPath, cwd) {
  return new Promise((resolveP) => {
    const errChunks = [];
    const child = spawn(DECODER_EXE, ["-f", xmlPath], { cwd, windowsHide: true });
    child.stdout.on("data", () => {});
    child.stderr.on("data", (b) => errChunks.push(b.toString("utf8")));
    child.on("error", (err) => resolveP({ ok: false, error: err.message }));
    child.on("close", (code) => {
      if (code === 0) resolveP({ ok: true });
      else resolveP({ ok: false, error: `exit ${code}\n${errChunks.join("").split("\n").slice(-8).join("\n")}` });
    });
  });
}

async function decodeResponse(xml) {
  const cwd = join(tmpdir(), "iregen-cli-" + Date.now());
  mkdirSync(cwd, { recursive: true });
  // Program.cs:87 · prefix = sourceName.Replace("inventory-response","inventory")
  //   · 입력 파일명 "inventory-response.xml" 사용 → output "inventory-full.json"
  const xmlPath = join(cwd, "inventory-response.xml");
  writeFileSync(xmlPath, xml, "utf8");
  const dec = await decode(xmlPath, cwd);
  if (!dec.ok) { try { rmSync(cwd, { recursive: true, force: true }); } catch {} return { ok: false, stage: "decoder", error: dec.error }; }
  const outPath = join(cwd, "output", "inventory-full.json");
  if (!existsSync(outPath)) { try { rmSync(cwd, { recursive: true, force: true }); } catch {} return { ok: false, stage: "fs", error: "output 미생성 · " + outPath }; }
  const parsed = JSON.parse(readFileSync(outPath, "utf8"));
  try { rmSync(cwd, { recursive: true, force: true }); } catch {}
  return { ok: true, parsed };
}

// ── retry · 사용자 지시 30s → 60s → 120s → abort ───────────────────────────────
const RETRY_DELAYS_SEC = [30, 60, 120];
async function fetchPage(pageIdx, pageSize) {
  const envelope = buildEnvelope(pageIdx, pageSize);
  for (let attempt = 0; attempt <= RETRY_DELAYS_SEC.length; attempt++) {
    const t0 = Date.now();
    const soapRes = await callSoap(envelope);
    const soapMs = Date.now() - t0;
    if (!soapRes.ok) {
      const retriable = soapRes.stage === "network" || /HTTP (429|5\d\d)/.test(soapRes.error);
      if (!retriable || attempt === RETRY_DELAYS_SEC.length) {
        return { ok: false, pageIdx, stage: soapRes.stage, error: soapRes.error, attempts: attempt + 1 };
      }
      const delay = RETRY_DELAYS_SEC[attempt] * 1000;
      console.warn(`[fetch] page ${pageIdx} attempt ${attempt + 1} 실패 (${soapRes.stage}) · ${delay / 1000}s 후 재시도`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    const dT0 = Date.now();
    const d = await decodeResponse(soapRes.xml);
    const decMs = Date.now() - dT0;
    if (!d.ok) {
      if (attempt === RETRY_DELAYS_SEC.length) {
        return { ok: false, pageIdx, stage: d.stage, error: d.error, attempts: attempt + 1 };
      }
      const delay = RETRY_DELAYS_SEC[attempt] * 1000;
      console.warn(`[fetch] page ${pageIdx} attempt ${attempt + 1} decode 실패 · ${delay / 1000}s 후 재시도`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    return { ok: true, pageIdx, parsed: d.parsed, soapMs, decMs, attempts: attempt + 1 };
  }
  return { ok: false, pageIdx, stage: "unknown", error: "max retry exceeded", attempts: RETRY_DELAYS_SEC.length + 1 };
}

// ── main · concurrency=1 순차 pagination ───────────────────────────────────────
const PAGE_SIZE = 50;
const MAX_PAGES = 400;
const t0 = Date.now();
console.log(`[fetch] Product_List · concurrency=1 · pageSize=${PAGE_SIZE} · retry 30s/60s/120s/abort`);
console.log(`[fetch] endpoint=${PRODUCT_LIST_ENDPOINT} · corpCode=${ctx.corpCode} · userId=${ctx.userId} · stCode=${ctx.stCode}`);

const pages = [];
let totalRowsExpected = null;
let primaryName = null;
let allTablesInfo = null;
let columns = null;

for (let p = 1; p <= MAX_PAGES; p++) {
  const r = await fetchPage(p, PAGE_SIZE);
  if (!r.ok) {
    console.error(`[fetch] page ${p} FAILED · stage=${r.stage} · ${r.error}`);
    process.exit(3);
  }
  // primary table detection (rowCount 가장 큰 테이블)
  const tbls = r.parsed.tables;
  let primaryIdx = 0;
  for (let i = 1; i < tbls.length; i++) if (tbls[i].rowCount > tbls[primaryIdx].rowCount) primaryIdx = i;
  const primary = tbls[primaryIdx];
  if (p === 1) {
    primaryName = primary.name;
    allTablesInfo = tbls.map((t, i) => ({ index: i, name: t.name, rowCount: t.rowCount, columnCount: t.columns.length, firstColumns: t.columns.slice(0, 8).map(c => c.name) }));
    columns = primary.columns;
    console.log(`[fetch] DataSet "${r.parsed.datasetName}" · ${tbls.length} tables`);
    allTablesInfo.forEach(ti => console.log(`  [${ti.index}] ${ti.name} · ${ti.rowCount} rows · ${ti.columnCount} cols · ${ti.firstColumns.join(", ")}`));
    console.log(`[fetch] primary = Table[${primaryIdx}] "${primaryName}" · ${primary.rowCount} rows · ${primary.columns.length} cols`);
    console.log(`[fetch] 전체 columns (${primary.columns.length}):`);
    primary.columns.forEach((c, i) => console.log(`  [${String(i).padStart(3, " ")}] ${c.name} · ${c.type}`));
    // metadata column1 추출 시도
    for (let i = 0; i < tbls.length; i++) {
      if (i === primaryIdx) continue;
      if (tbls[i].rowCount > 0 && tbls[i].rowCount <= 2) {
        const row = tbls[i].rows[0];
        const col1 = row?.Column1 ?? Object.values(row ?? {})[0];
        console.log(`[fetch] metadata Table[${i}] "${tbls[i].name}" · Column1=${JSON.stringify(col1)}`);
        if (typeof col1 === "number" || (typeof col1 === "string" && /^\d+$/.test(col1))) {
          const n = Number(col1);
          if (n > 0 && n < 1_000_000) totalRowsExpected = n;
        }
      }
    }
    if (totalRowsExpected) console.log(`[fetch] totalRows expected = ${totalRowsExpected}`);
  }
  pages.push({ pageIdx: p, rowCount: primary.rowCount, rows: primary.rows, soapMs: r.soapMs, decMs: r.decMs });
  const totalSoFar = pages.reduce((s, pp) => s + pp.rowCount, 0);
  console.log(`[fetch] page ${p} · ${primary.rowCount} rows · 누적 ${totalSoFar} · soap ${r.soapMs}ms · dec ${r.decMs}ms · retry ${r.attempts - 1}`);
  if (primary.rowCount < PAGE_SIZE) {
    console.log(`[fetch] 마지막 페이지 ${p} 감지 (rows ${primary.rowCount} < ${PAGE_SIZE})`);
    break;
  }
  if (totalRowsExpected && totalSoFar >= totalRowsExpected) {
    console.log(`[fetch] totalRows 도달 (${totalSoFar} >= ${totalRowsExpected})`);
    break;
  }
}

const allRows = pages.flatMap(p => p.rows);
const totalMs = Date.now() - t0;

// ── snapshot 저장 (민감정보 제외) ────────────────────────────────────────────
const snapshotPath = resolve(projectRoot, "data/snapshots/product-list-2026-10-03.json");
const snapshot = {
  _meta: {
    source: "sync-agent Product_List · concurrency=1",
    fetchedAt: new Date().toISOString(),
    pageSize: PAGE_SIZE,
    pagesLoaded: pages.length,
    totalRows: allRows.length,
    totalMs,
    totalRowsExpected,
    primaryTable: primaryName,
    allTables: allTablesInfo,
    columnCount: columns?.length ?? null,
    pageTiming: pages.map(p => ({ page: p.pageIdx, rows: p.rowCount, soapMs: p.soapMs, decMs: p.decMs })),
  },
  columns,
  rows: allRows,
};
writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
console.log(`\n[fetch] snapshot 저장 · ${snapshotPath}`);
console.log(`[fetch] 완료 · rows=${allRows.length} · pages=${pages.length} · cols=${columns?.length} · ${(totalMs / 1000).toFixed(1)}s`);

// 자동 검증
const seen = new Set();
let dupPCode = 0, emptyPCode = 0;
for (const r of allRows) {
  const p = String(r.PCode ?? "").trim();
  if (!p) emptyPCode++;
  else if (seen.has(p)) dupPCode++;
  else seen.add(p);
}
console.log(`[verify] PCode unique=${seen.size} · duplicate=${dupPCode} · empty=${emptyPCode}`);
