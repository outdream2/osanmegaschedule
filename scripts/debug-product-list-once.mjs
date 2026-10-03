// 1 page 호출 · XML 저장 · decoder stderr 전체 보기
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { spawn } from "child_process";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function parseEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}

const env = parseEnv(join(projectRoot, ".env"));
const g = (...keys) => keys.map((k) => env[k]).find(Boolean);
const ctx = {
  corpCode: g("IREGEN_CORP_CODE", "Iregen  companycode", "Iregen companycode", "CorpCode") || "30009",
  userId: g("IREGEN_USER_ID", "Iregen id", "UserID") || "111",
  userName: g("IREGEN_USER_NAME", "Iregen name", "UserName") || "강서은",
  stCode: g("IREGEN_ST_CODE", "Iregen stcode", "StCode") || "000",
  corpDbNm: g("IREGEN_CORP_DB_NM", "CorpDB_nm", "CORPDB_NM"),
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

const body =
  `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
  `<s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
  `<Product_List xmlns="http://tempuri.org/"><ent>` +
  `<IsReturnJson>false</IsReturnJson><IsEnc>false</IsEnc><IsCompress>false</IsCompress>` +
  `<IsStorageGubunOut>false</IsStorageGubunOut><StorageGubun>A</StorageGubun>` +
  `<CorpCode>${esc(ctx.corpCode)}</CorpCode>` +
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
  `<UserID>${esc(ctx.userId)}</UserID>` +
  `<UserName>${esc(ctx.userName)}</UserName>` +
  `<CorpDB_nm>${esc(ctx.corpDbNm)}</CorpDB_nm>` +
  `<PageIdx>1</PageIdx><PageSize>50</PageSize>` +
  `<SearchType>0</SearchType>` +
  `<StartDate/><EndDate/>` +
  `<AIdx>0</AIdx><Sort>0</Sort><Idx>0</Idx>` +
  `<UnitStock>0</UnitStock><UnitPrice>0</UnitPrice><SaleTotal>0</SaleTotal>` +
  `<PagCode>0</PagCode>` +
  `<StCode>${esc(ctx.stCode)}</StCode>` +
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
  `</ent></Product_List></s:Body></s:Envelope>`;

const DECODER = resolve(projectRoot, "tools/iregen-bridge/bin/Debug/net48/iregen-decoder.exe");
const ENDPOINT = "http://soap.iregen.co.kr/App_Service/Irm/SvcProductBiz.asmx";
const ACTION = "http://tempuri.org/Product_List";

console.log("[debug] POST →", ENDPOINT);
console.log("[debug] body bytes:", body.length);
const t0 = Date.now();
let res;
try {
  res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${ACTION}"` },
    body,
  });
} catch (e) {
  console.error("fetch failed:", e.message);
  process.exit(1);
}
console.log("[debug] HTTP", res.status, "·", Date.now() - t0, "ms");
const xml = await res.text();
console.log("[debug] response bytes:", xml.length);

const dbgDir = resolve(projectRoot, "data/snapshots/debug");
mkdirSync(dbgDir, { recursive: true });
writeFileSync(join(dbgDir, "product-list-page1-raw.xml"), xml, "utf8");
console.log("[debug] raw XML saved:", join(dbgDir, "product-list-page1-raw.xml"));

const cwd = resolve(projectRoot, "data/snapshots/debug/decode-run");
mkdirSync(cwd, { recursive: true });
const xmlPath = join(cwd, "resp.xml");
writeFileSync(xmlPath, xml, "utf8");

await new Promise((resolveP) => {
  const errChunks = [];
  const outChunks = [];
  const child = spawn(DECODER, ["-f", xmlPath], { cwd, windowsHide: true });
  child.stdout.on("data", (b) => outChunks.push(b.toString("utf8")));
  child.stderr.on("data", (b) => errChunks.push(b.toString("utf8")));
  child.on("close", (code) => {
    console.log("\n[decoder] exit code:", code);
    console.log("[decoder] stdout bytes:", outChunks.join("").length);
    console.log("[decoder] stderr (tail 40 lines):");
    console.log(errChunks.join("").split("\n").slice(-40).join("\n"));
    try {
      const files = readdirSync(join(cwd, "output"));
      console.log("[decoder] output/ files:", files);
    } catch (e) {
      console.log("[decoder] no output/ dir:", e.message);
    }
    resolveP();
  });
});
