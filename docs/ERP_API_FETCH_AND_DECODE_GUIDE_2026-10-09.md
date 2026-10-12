# ERP API 호출 · 디코딩 가이드 (수신 PC 독립 환경 전용)

> 작성 **2026-10-09**
> 대상 **매입 / 판매** 데이터를 ERP (iregen) 에서 가져와서 사용하려는 **다른 PC 의 CLI/개발자**
>
> ### 전제 (매우 중요)
> - **수신 PC 는 메가타운 저장소 clone 불필요.** 이 가이드 문서 1개 + 아래 "수신 패키지" 3개 (fixture · decoder · .env 값) 만 있으면 **자체 환경** 에서 ERP 직접 호출 가능.
> - **수신자가 선택하는 언어·프레임워크·OS 자유.** 이 가이드는 "HTTP SOAP 호출 → Base64 추출 → decoder 바이너리로 JSON 변환 → 필드 사용" 의 **통신 규약** 만 명세.
> - **수신 PC → 송신 PC 통신 불필요.** 수신 PC → ERP 서버 (iregen) 직접 TCP.
> - 민감 세션 토큰 (`CorpDB_nm`) 은 송신자가 안전 채널로 1회 전달 · 로컬 `.env` 로 보관 · Git/공유 금지.

---

## 0. 수신자가 받을 "자료 패키지" (송신자가 안전 채널로 전달)

| # | 자료 | 형식 | 보관 | 비고 |
|---|---|---|---|---|
| 1 | **이 가이드 문서** | `.md` | 자유 | 지금 읽는 이 파일 |
| 2 | **SOAP fixture XML** · 매입용 1개 + 매출용 1개 | `.xml` 또는 `.txt` | 수신 PC 로컬 `fixtures/` | 각 ~7KB · envelope 템플릿 |
| 3 | **디코더 바이너리** · Windows `.exe` 또는 Linux ELF | 실행 파일 | 수신 PC 로컬 `bin/` | Win ~300KB · Linux ~70MB (self-contained .NET) |
| 4 | **`.env` 민감 값** · 아래 섹션 2 | 평문 (Slack 1:1 DM · 암호화 메시지 · 1Password 등 · **메일 X**) | 수신 PC `.env` (git ignore 필수) | `CorpDB_nm` 토큰 유효기간 있음 |

> 송신자는 위 4개를 **1회만** 전달. 수신 PC 는 이후 **자체 재부팅/재배포 가능** · 송신 PC 와 통신 불필요.

---

## 핵심 흐름 (딱 4단계)

```
① 수신 PC .env 로 ERP 인증 정보 로컬 보관
       ↓
② 수신 PC → ERP 서버 (soap.iregen.co.kr) 로 HTTP POST (SOAP envelope · 치환 완료 XML)
       ↓
③ ERP 응답 XML 안 <*_Result> 태그 안에 Base64 encoded binary (DataSet) 가 들어있음 · 수신 PC 가 Base64 문자열 추출
       ↓
④ 수신 PC 가 로컬 iregen-decoder 바이너리에 Base64 를 stdin 으로 넣음 → output/stdin-full.json 파일 생성 → JSON 안 primary table 의 columns·rows 를 그대로 사용
```

**원칙** · "가짜 fallback 값을 만들지 말고, 숫자는 숫자, 없으면 null".

---

## 1. ERP 서버 접속 정보

### 1.1 Base URL
```
http://soap.iregen.co.kr/App_Service/Irm/
```

### 1.2 Service 와 Action (매입 / 매출)

| 데이터 | Service (ASMX) | SOAPAction |
|---|---|---|
| 일별 매입 (상품단위) | `SvcBuyBiz.asmx` | `http://tempuri.org/Buy_Status` |
| 일별 매출 (상품단위) | `SvcSaleBiz.asmx` | `http://tempuri.org/Sale_Status` |
| 시간대별 매출 | `SvcSaleBiz.asmx` | `http://tempuri.org/Sale_Days_TimeReport` |
| 월별 매출 통계 | `SvcStatisticsBiz.asmx` | `http://tempuri.org/Statistics_Month_DashBoard` |

### 1.3 HTTP 요청 헤더 (공통)
```
Content-Type: text/xml; charset=utf-8
SOAPAction: "http://tempuri.org/<ActionName>"      ← 쌍따옴표 포함
Host: soap.iregen.co.kr
```

> **중요** · `SOAPAction` 헤더 값은 반드시 **큰따옴표(`"..."`)** 로 감싸야 ERP 가 인식.

---

## 2. 환경 변수 (.env · 로컬에만 저장 · Git 제외 필수)

수신자는 자기 작업 환경에 **`.env` 파일을 로컬 하나 만들어 두고**, Git · 공유 저장소 · 메신저 등에 **절대 커밋/업로드 금지**. `.gitignore` 에 `.env` 포함 확인.

```bash
# ─── 수신자 local .env 예시 (git ignore 필수) ─────────────
IREGEN_ENDPOINT_BUY="http://soap.iregen.co.kr/App_Service/Irm/SvcBuyBiz.asmx"
IREGEN_ENDPOINT_SALE="http://soap.iregen.co.kr/App_Service/Irm/SvcSaleBiz.asmx"
IREGEN_ENDPOINT_STATS="http://soap.iregen.co.kr/App_Service/Irm/SvcStatisticsBiz.asmx"

# 사업장 식별 (매장 코드) · 송신자에게 받기
IREGEN_CORP_CODE="30009"

# 암호화된 CorpDB 세션 토큰 · 매우 민감 · 송신자에게서 별도 안전 채널로 받기
# "iregen†..." 로 시작하는 긴 문자열
IREGEN_CORP_DB_NM="iregen†<토큰_여기_붙여넣기>"

# ERP 사용자 식별 (ERP 쪽 운영자 계정) · 송신자에게 받기
IREGEN_USER_ID="111"
IREGEN_ST_CODE="-1"            # 전체 매장 (-1) · 특정 매장만이면 그 코드

# 조회 범위 기본값 (SearchType)
IREGEN_SEARCH_TYPE="TOTAL"
```

**송신자에게 받아야 할 값:**
- `IREGEN_CORP_DB_NM` (암호화 세션 토큰 · 유효기간 있음)
- `IREGEN_CORP_CODE` (사업장 코드)
- `IREGEN_USER_ID` (ERP 운영자 ID)
- 매입 응답 필드 명세 (아래 5절 참조)

---

## 3. SOAP Envelope (XML 요청 본문)

### 3.1 구조
```xml
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <<ActionName> xmlns="http://tempuri.org/">
      <ent>
        <!-- 수많은 ERP 파라미터 (사업장·검색조건·날짜·DataColumns·RowArea 등) -->
      </ent>
    </<ActionName>>
  </s:Body>
</s:Envelope>
```

### 3.2 매출 (Sale) 샘플 envelope (일별 상품 조회)

> **송신자가 수신자에게 전달하는 fixture 파일 1개로 충분.**
> 수신자는 그 fixture 를 로컬에 저장해 두고 아래 **5개 태그만 런타임 교체**.

**교체 대상 태그 (XML 안):**

| 태그 | 교체 값 | 비고 |
|---|---|---|
| `<CorpCode>...</CorpCode>` | `IREGEN_CORP_CODE` | 사업장 |
| `<CorpDB_nm>...</CorpDB_nm>` | `IREGEN_CORP_DB_NM` | 암호화 세션 토큰 |
| `<UserID>...</UserID>` | `IREGEN_USER_ID` | 운영자 ID |
| `<StartDate>YYYY-MM-DD</StartDate>` | 조회 시작일 | 필수 |
| `<EndDate>YYYY-MM-DD</EndDate>` | 조회 종료일 | 필수 |

**치환 함수 (언어 무관 · 정규식):**
```
replace: /<CorpDB_nm>[^<]*<\/CorpDB_nm>/   → <CorpDB_nm>{VALUE}</CorpDB_nm>
```

> **중요 · XML Injection 방어** · 치환 값에 `<`, `>`, `&` 포함되면 각각 `&lt;`, `&gt;`, `&amp;` 로 escape.

### 3.3 매입 (Buy) envelope
> **송신자에게 매입용 fixture 파일을 요청**. 매출 fixture 와 거의 동일하지만 top-level element 가 `<Buy_Status>` 이며 `DataColumns` / `RowArea` 가 매입용 필드로 다름.

- 교체 태그 **동일** (`CorpCode`, `CorpDB_nm`, `UserID`, `StartDate`, `EndDate`)
- `<CRUD>DETAIL</CRUD>` 유지 (일별 raw 조회)
- `<IsStatus>` 는 매입용 코드 (송신자에게 확인)

---

## 4. HTTP 호출 (언어별 한 줄 요약)

### 4.1 curl
```bash
curl -s -X POST "$IREGEN_ENDPOINT_SALE" \
  -H 'Content-Type: text/xml; charset=utf-8' \
  -H 'SOAPAction: "http://tempuri.org/Sale_Status"' \
  --data-binary @request-after-substitute.xml \
  -o response.xml
```

### 4.2 Node.js (fetch)
```ts
const r = await fetch(ENDPOINT, {
  method: "POST",
  headers: {
    "Content-Type": "text/xml; charset=utf-8",
    "SOAPAction": `"${ACTION}"`,
  },
  body: envelopeXml,
});
const xmlResp = await r.text();
```

### 4.3 Python (requests)
```python
r = requests.post(ENDPOINT, data=envelope.encode("utf-8"),
    headers={"Content-Type":"text/xml; charset=utf-8",
             "SOAPAction": f'"{ACTION}"'})
xml_resp = r.text
```

**타임아웃 권장** · 30~60s · ERP 가 큰 범위 조회 시 느릴 수 있음.

---

## 5. 응답에서 Base64 추출

응답 XML 내용 예:
```xml
<s:Envelope ...>
 <s:Body>
   <Sale_StatusResponse xmlns="http://tempuri.org/">
     <Sale_StatusResult>UEsDBBQAAAAIAAAAIQ... (매우 긴 Base64 문자열)</Sale_StatusResult>
   </Sale_StatusResponse>
 </s:Body>
</s:Envelope>
```

### 5.1 결과 태그 이름 규칙
`<ActionName>Result` 패턴.
| Action | Result 태그 |
|---|---|
| `Buy_Status` | `<Buy_StatusResult>` |
| `Sale_Status` | `<Sale_StatusResult>` |
| `Sale_Days_TimeReport` | `<Sale_Days_TimeReportResult>` |
| `Statistics_Month_DashBoard` | `<Statistics_Month_DashBoardResult>` |

### 5.2 추출 (정규식 · 언어 무관)
```
const open  = "<" + tag + ">";
const close = "</" + tag + ">";
const s = xml.indexOf(open);
const e = xml.indexOf(close);
const base64 = xml.slice(s + open.length, e).trim();
```

---

## 6. 디코더로 Base64 → JSON 변환

### 6.1 디코더 바이너리 입수
송신자가 수신자에게 바이너리 전달 (저장소/압축파일/링크):

| 플랫폼 | 바이너리 |
|---|---|
| Windows (.NET Framework 4.8) | `iregen-decoder.exe` (~300KB) |
| Linux x64 (self-contained .NET) | `iregen-decoder` (약 70MB · publish 결과물) |

### 6.2 사용법 (stdin → output 파일)
디코더는 **stdin 으로 Base64 문자열을 받고**, 작업 디렉터리의 `output/stdin-full.json` 파일을 생성한다.

```bash
# Windows (cmd)
echo UEsDBB...<Base64 전체> | iregen-decoder.exe
# → ./output/stdin-full.json 생성

# Linux
./iregen-decoder <<< "UEsDBB...<Base64 전체>"
# → ./output/stdin-full.json 생성
```

### 6.3 호출 패턴 (Node.js 예시)
```ts
import { spawn } from "node:child_process";
import { readFileSync, existsSync, unlinkSync } from "node:fs";

async function decode(base64: string): Promise<any> {
  const outPath = `${DECODER_CWD}/output/stdin-full.json`;
  if (existsSync(outPath)) unlinkSync(outPath);              // 이전 결과 제거 (race 방지)
  return new Promise((resolve, reject) => {
    const p = spawn(DECODER_EXE, [], { cwd: DECODER_CWD, stdio: ["pipe", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`decoder exit ${code}: ${err}`));
      if (!existsSync(outPath)) return reject(new Error("output 파일 없음"));
      resolve(JSON.parse(readFileSync(outPath, "utf8")));
    });
    p.stdin.write(base64);
    p.stdin.end();
  });
}
```

### 6.4 동시 호출 주의 (concurrency = 1)
- 디코더가 **같은 output 파일을 덮어씀** · 동시 호출 시 race 발생
- 반드시 큐·락으로 **직렬화** (한 번에 한 호출)
- ERP 서버 부하 방지 측면에서도 동일 (스케줄 조회는 concurrency 1 고정)

---

## 7. JSON 결과 구조 (decoder output)

```json
{
  "datasetName": "...",
  "tableCount": N,
  "tables": [
    {
      "name": "Table1",
      "rowCount": 100,
      "columns": [
        { "name": "PCode",       "type": "string" },
        { "name": "ProductName", "type": "string" },
        { "name": "BuyDate",     "type": "datetime" },
        { "name": "StockCnt",    "type": "int" },
        ...
      ],
      "rows": [
        { "PCode": "11609", "ProductName": "...", "BuyDate": "2026-10-05T00:00:00", "StockCnt": 10, ... },
        ...
      ]
    },
    ...
  ]
}
```

### 7.1 Primary table 찾기
tables[] 에 **여러 Table** 이 섞여 있을 수 있음 (metadata · subtotal · aggregate 등).
Primary table 은 **PCode + ProductName column 을 모두 포함** 하는 것 선택:

```ts
const primary = decoded.tables.find((t) =>
  t.columns.some((c) => c.name === "PCode") &&
  t.columns.some((c) => c.name === "ProductName")
);
if (!primary) throw new Error("primary table 없음");
```

### 7.2 Subtotal row 제외
primary table 안에서도 **PCode 가 비어있는 row** 는 서브토탈 (집계) · 상품 row 가 아님:

```ts
const rows = primary.rows.filter((r) =>
  (r.PCode && String(r.PCode).trim()) ||
  (r.ProductName && String(r.ProductName).trim())
);
```

---

## 8. 주요 필드 명세

### 8.1 매출 (`Sale_Status` 응답 primary table)

| ERP 컬럼 | 의미 | 타입 |
|---|---|---|
| `PCode` | 상품분류코드 (ERP primary identity) | string |
| `ProductName` | 상품명 | string |
| `BuyerCorpNameView` | 매입처 (공급사) | string |
| `UnitCost` | 매입 단가 | number |
| `UnitSale` | 판매 단가 | number |
| `SaleMonth` / `SaleDate` | 월 / 일 | string (YYYYMM / YYYY-MM-DD) |
| `PosNo` | POS 번호 | string |
| `SaleTotal` | 매출 총액 | number |
| `Margin` | 매출 이익 | number |
| `TotalStock` | 판매 수량 | number |

### 8.2 매입 (`Buy_Status` 응답 primary table) · 예상 (송신자에게 최종 확인 필수)

| ERP 컬럼 | 의미 | 타입 |
|---|---|---|
| `PCode` | 상품분류코드 (ERP primary identity) | string |
| `ProductName` | 상품명 | string |
| `Specification` | 상품 규격 | string |
| `UnitCode` | 단위 | string |
| `CorpNameView` | 공급사명 | string |
| `CtCode` | 공급사 코드 | string |
| `BuyDate` | 매입일 | string (YYYY-MM-DD) |
| `StockCnt` | 매입 수량 | number |
| `UnitCost` | 매입 단가 | number |
| `BuyPrice` | VAT 제외 공급가 | number |
| `BuyTax` | VAT | number |
| `BuyTotal` | VAT 포함 총액 | number |
| `BmCode` | 매입 문서 ID (unique key 1/2) | string |
| `ROWNUM` | 라인 번호 (unique key 2/2) | number |

> **매입 unique key = (`BmCode`, `ROWNUM`)** · 같은 BmCode 안 여러 ROWNUM 이 각 품목 라인.

### 8.3 상품 primary identity · PCode
- `PCode` 는 ERP 가 쓰는 **상품의 primary identity**.
- 다른 테이블 (products / purchase_details / sales) 과 join 할 때 `PCode` 만 사용.
- BarCode 는 보조 식별자 · 중복 가능성 있음 · 신규 INSERT 시 **2차 충돌 검사용**.

---

## 9. 값 처리 원칙 (매우 중요)

### 9.1 숫자 (ERP 가 콤마 포함 문자열 반환 가능)
```ts
function parseErpNum(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
```
- `"1,234"` → `1234`
- `""` → `null` (0 이 아님)
- `null` → `null`
- `"abc"` → `null`

### 9.2 날짜
- ERP 가 `"2026-10-05T00:00:00"` 형태로 올 수 있음 → **`.slice(0, 10)` 로 YYYY-MM-DD 만 사용**
- 또는 그대로 저장 후 사용 시 포맷

### 9.3 문자열
- `null` · `""` 모두 **null 로 통일**
- **절대 `?? "(알 수 없음)"` 류 가짜 fallback 넣지 말 것**
- 없으면 없는 그대로 null · UI 가 "-" 표시 처리

### 9.4 빈 응답
- rows 0 건은 **에러가 아님** · 정상 응답으로 처리
- 에러는 (SOAP HTTP 실패 / decoder spawn 실패 / primary table 없음) 만

---

## 10. 전체 흐름 요약 코드 (Node.js · 100 lines)

```ts
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";

const ENDPOINT = process.env.IREGEN_ENDPOINT_BUY!;
const ACTION   = "http://tempuri.org/Buy_Status";
const DECODER_EXE = process.env.IREGEN_DECODER_EXE!;        // 예: ./iregen-decoder
const DECODER_CWD = process.env.IREGEN_DECODER_CWD!;        // 예: .
const FIXTURE     = readFileSync("./fixtures/buy-request.xml", "utf8");

function esc(v: string): string {
  return v.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}
function sub(xml: string, tag: string, val: string): string {
  return xml.replace(new RegExp(`<${tag}>[^<]*</${tag}>`), `<${tag}>${esc(val)}</${tag}>`);
}

async function callSoap(xml: string): Promise<string> {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": `"${ACTION}"`,
    },
    body: xml,
  });
  if (!r.ok) throw new Error(`SOAP HTTP ${r.status}`);
  return await r.text();
}

function extractResult(xml: string, tag: string): string {
  const o = `<${tag}>`, c = `</${tag}>`;
  const s = xml.indexOf(o), e = xml.indexOf(c);
  if (s < 0 || e < 0) throw new Error(`${tag} 없음`);
  return xml.slice(s + o.length, e).trim();
}

async function decode(base64: string): Promise<any> {
  const out = `${DECODER_CWD}/output/stdin-full.json`;
  if (existsSync(out)) unlinkSync(out);
  return new Promise((resolve, reject) => {
    const p = spawn(DECODER_EXE, [], { cwd: DECODER_CWD, stdio: ["pipe", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`decoder exit ${code}: ${err}`));
      if (!existsSync(out)) return reject(new Error("output 없음"));
      resolve(JSON.parse(readFileSync(out, "utf8")));
    });
    p.stdin.write(base64); p.stdin.end();
  });
}

function parseNum(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function fetchBuyDaily(from: string, to: string) {
  let xml = FIXTURE;
  xml = sub(xml, "CorpCode",   process.env.IREGEN_CORP_CODE!);
  xml = sub(xml, "CorpDB_nm",  process.env.IREGEN_CORP_DB_NM!);
  xml = sub(xml, "UserID",     process.env.IREGEN_USER_ID!);
  xml = sub(xml, "StartDate",  from);
  xml = sub(xml, "EndDate",    to);

  const resp   = await callSoap(xml);
  const base64 = extractResult(resp, "Buy_StatusResult");
  const decoded = await decode(base64);

  const primary = (decoded.tables ?? []).find((t: any) =>
    t.columns.some((c: any) => c.name === "PCode") &&
    t.columns.some((c: any) => c.name === "ProductName")
  );
  if (!primary) return { ok: false, error: "primary table 없음" };

  const rows = primary.rows
    .filter((r: any) => (r.PCode && String(r.PCode).trim()) || (r.ProductName && String(r.ProductName).trim()))
    .map((r: any) => ({
      pcode:        r.PCode == null ? null : String(r.PCode).trim() || null,
      productName:  r.ProductName == null ? null : String(r.ProductName).trim() || null,
      supplier:     r.CorpNameView == null ? null : String(r.CorpNameView).trim() || null,
      buyDate:      r.BuyDate == null ? null : String(r.BuyDate).slice(0, 10) || null,
      quantity:     parseNum(r.StockCnt),
      unitCost:     parseNum(r.UnitCost),
      amount:       parseNum(r.BuyPrice),
      vat:          parseNum(r.BuyTax),
      total:        parseNum(r.BuyTotal),
      bmCode:       r.BmCode == null ? null : String(r.BmCode).trim() || null,
      rowNum:       parseNum(r.ROWNUM),
    }));

  return { ok: true, rows };
}
```

---

## 11. 테스트 체크리스트

- [ ] `.env` 가 `.gitignore` 에 포함 · Git 커밋 안 됨 확인
- [ ] curl 로 1일치 조회 성공 (`ok: true` + rows[])
- [ ] 디코더 output JSON 안에 `tables[].columns[]` + `rows[]` 존재
- [ ] primary table (PCode+ProductName) 식별 가능
- [ ] subtotal row (PCode 없음) 걸러짐
- [ ] 숫자 필드 null 처리 (`""` → null · 가짜 0 금지)
- [ ] 날짜 YYYY-MM-DD 포맷으로 slice
- [ ] 동시 호출 시 output 파일 race 없음 (concurrency=1 적용)
- [ ] SOAP HTTP 실패 시 명확한 에러 메시지
- [ ] `CorpDB_nm` 유효하지 않을 때 응답에 Base64 아닌 fault string 반환되는 경우 처리

---

## 12. 흔한 오류

| 증상 | 원인 | 해결 |
|---|---|---|
| 응답 XML 안 `<faultcode>` + unauthorized | `CorpDB_nm` 만료/오타 | 송신자에게 최신 토큰 요청 |
| 응답 rows 0건 | `CorpCode` 다른 사업장 · 날짜 범위 거래 없음 | `IREGEN_CORP_CODE` 재확인 · 유효 날짜로 테스트 |
| decoder exit code != 0 | 입력 Base64 깨짐 · decoder 바이너리 손상 | 입력 Base64 를 파일로 저장 후 수동 디코더 호출 재현 |
| output 파일 없음 | decoder 가 다른 작업 디렉터리에 생성 | `cwd` 명시 (`DECODER_CWD`) |
| 숫자 필드 전부 0 | `""` → `Number("")` = 0 처리 | `parseErpNum` 사용 (빈 문자열은 null) |
| 공급사명이 "(이름없음)" 로 들어감 | fallback 삽입 | 제거 · null 그대로 반환 |
| 동시 2개 호출 중 한쪽 응답이 다른 요청 데이터 | output 파일 race | 호출 직렬화 (큐 or Mutex) |

---

## 13. 보안 & 운영 원칙

- `.env` 는 **로컬에만** · Git · Slack · 메일 **금지**
- `CorpDB_nm` 토큰 로그에 출력 **금지**
- SOAP 응답 raw (base64 포함) 를 디스크에 상시 저장 **금지** (디버깅 시만 임시 저장)
- ERP 호출 빈도 **concurrency 1** · 자동 폴링 시 간격 보수적으로 (예: 매장 운영시간 중 5분 이상)
- 조회 범위가 길면 pagination 또는 날짜 chunk 로 나눠 호출

---

## 14. 송신자에게 요청해야 할 것 (수신자 체크리스트)

**송신 PC 작업자에게 요청 (딱 1회 · 그 후 수신 PC 독립 운영):**
- [ ] 매입용 fixture 템플릿 1개 (XML)
- [ ] 매출용 fixture 템플릿 1개 (예시 · 일별 상품 조회용 · 참조용)
- [ ] 디코더 바이너리 (수신 OS 에 맞는 것 · Windows `.exe` 또는 Linux ELF)
- [ ] `.env` 민감값 3개:
  - `IREGEN_CORP_CODE` (사업장 코드)
  - `IREGEN_CORP_DB_NM` (암호화 세션 토큰 · 가장 민감)
  - `IREGEN_USER_ID` (ERP 운영자 ID)
- [ ] 매입 primary table 응답 columns 확정 명세
- [ ] 테스트에 사용할 날짜 범위 (실제 거래 있는 기간)

**수신자가 송신자에게 되묻기 좋은 순간:**
- 첫 호출에서 `<faultcode>` 오면 → 토큰 만료 가능성 (재발급 요청)
- Primary table 안 column 명 다르면 → 명세 재확인
- 응답 rows 0건 지속되면 → 사업장 코드/날짜 확인

**통신 완료 후:**
- 수신 PC 는 `.env` + fixture + decoder 보관하면 **송신 PC 와 통신 없이 ERP 호출 영구 가능** (토큰 만료 전까지)
- 토큰 만료 시 `IREGEN_CORP_DB_NM` 재발급만 송신자에게 요청

---

## 15. 이 가이드로 수신자가 만들 수 있는 것

수신자는 자기 환경에서 자유롭게:
- **CLI 스크립트** (curl + jq 로 1회성 조회)
- **독립 Node/Python 서비스** (하루 1회 매입 수집)
- **다른 서버의 microservice** (REST 로 재노출)
- **Excel 다운로드 툴** (조회 후 파일 저장)

구현 언어·프레임워크·배포 환경 **자유**. 이 문서는 **ERP 와의 통신 규칙** 만 명세.

---

**끝.** 질의 사항은 송신자에게 먼저 확인. 토큰/민감 정보는 안전 채널로만.
