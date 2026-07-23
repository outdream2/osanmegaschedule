// src/lib/ocrRowFilter.ts
// 1차보정테이블 행 필터 (클라이언트) — 상품이 아닌 것들을 매칭 요청에서 제외

// 배송·행정 정보 (invoice-vocab.ts 와 동기화 유지)
const DELIVERY_INFO_LABELS = [
  "차량번호", "차람번호", "배송차량", "운송차량",
  "기사명", "기사", "운전자", "배송기사",
  "배송일자", "배송일", "배송처", "배송지",
  "인수자", "인수확인", "인수인",
  "담당자", "담당자명", "담당", "영업담당",
  "상호인란", "상호란", "성명란", "성명",
  "TEL", "FAX", "전화번호", "팩스",
  "주소", "사업장주소", "소재지",
  "업태", "종목", "업종",
  "거래처코드", "거래처번호",
  "페이지", "쪽",
  "거래명세표", "거래명세서", "세금계산서", "납품서",
  "합계", "소계", "총계", "공급가액", "부가세",
];

// 상품과 무관한 텍스트 판정 (매칭 스킵 대상)
export function isNonProductText(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t) return true;
  if (t.length < 3) return true;  // 2자 이하 → 상품명 아님 (예: "A2")

  // 배송·행정 라벨 포함
  const flat = t.replace(/\s+/g, "");
  if (DELIVERY_INFO_LABELS.some(kw => flat.includes(kw.replace(/\s+/g, "")))) return true;

  // 주소 패턴: 도·시·구·동·로 등이 다수 포함
  const addrTokens = (t.match(/도|시|구|동|로|길|번지|아파트/g) ?? []).length;
  if (addrTokens >= 3) return true;

  // 사업자등록번호 패턴 (10자리 숫자, 하이픈 포함 가능)
  if (/^\d{3}-?\d{2}-?\d{5}$/.test(t)) return true;

  // 전화번호 패턴
  if (/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(t)) return true;

  // 순수 숫자 5자리 이상 (사업자번호·전화·바코드 잔여)
  if (/^\d{5,}$/.test(t.replace(/[- ]/g, ""))) return true;

  // 사람 이름 패턴 (한글 2-4자 · 공백 없음 · 스페셜 문자 없음)
  //   예: "김충환", "한태호" — 상품명이면 최소 규격/단위 있을 것
  // 2026-07-23 · 약품 접미어(정·캡·액·포·환·산·겔·엘·정캡) 있으면 상품명으로 판정 · 사용자 사례 "이바내정 알지텍정 왜 취소돼?"
  const pharmaSuffix = /(정|캡|액|포|환|산|겔|엘|시럽|크림|주|편|바|팜)$/;
  if (/^[가-힣]{2,4}$/.test(t) && !pharmaSuffix.test(t)) return true;

  // "A20 1302" 같은 배치번호 · 로트번호 패턴 (알파벳+숫자+공백+숫자)
  if (/^[A-Z]{1,3}\d{1,4}\s+\d{3,}/.test(t)) return true;
  if (/^[A-Z]{1,3}\d{4,}$/.test(t)) return true;

  // 업태·종목 단일 단어
  if (/^(제조업|소매|도매|의약품|의약외품|식품|화장품)$/.test(t)) return true;

  return false;
}

// 2026-07-23 · 상품명 유효성 검사 · 한글 미포함 = 상품명 아님 (금액·헤더 잡문자 방어)
//   사용자 요청: "금액이 품명으로 막 들어오네 · 한글만 품명에 들어가야지"
//   룰: (1) 한글 1자 이상 · (2) isNonProductText 통과
export function isValidProductName(text: string | null | undefined): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  if (!/[가-힣]/.test(t)) return false;  // 한글 미포함 → 잡문자
  if (isNonProductText(t)) return false;
  return true;
}

// 2026-07-23 · 행의 "상품행 확률" 스코어 (0~1)
//   사용자 요청: "한 행에 수량·단가 있는지 · 한글 있는지 · 가장 긴 행인지 · 공급사 한글 매칭 확률"
//   룰 (가점제 · 총합 1.0):
//     · 수량 유효 숫자 (1~99999)       +0.30
//     · 단가 유효 숫자 (50~9999999)   +0.30
//     · 품명 한글 3자+                  +0.25
//     · 품명이 페이지 최장 후보급         +0.10
//     · 공급사 한글 접두 겹침            +0.05
export interface ProductRowInput {
  quantity: number | null | undefined;
  price: number | null | undefined;
  productName: string | null | undefined;
  supplier?: string | null | undefined;
  maxNameLen?: number;  // 페이지 내 품명 최대 길이 (있으면 최장가점 판정)
}
export function scoreProductRow(inp: ProductRowInput): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const q = Number(inp.quantity ?? 0);
  if (q >= 1 && q <= 99999) { score += 0.30; reasons.push("수량OK"); }
  const p = Number(inp.price ?? 0);
  if (p >= 50 && p <= 9999999) { score += 0.30; reasons.push("단가OK"); }
  const name = String(inp.productName ?? "").trim();
  const korLen = (name.match(/[가-힣]/g) ?? []).length;
  if (korLen >= 3) { score += 0.25; reasons.push(`한글${korLen}자`); }
  if (inp.maxNameLen && name.length >= inp.maxNameLen * 0.7) { score += 0.10; reasons.push("장문"); }
  if (inp.supplier) {
    const supKor = (String(inp.supplier).match(/[가-힣]/g) ?? []).join("");
    if (supKor.length >= 2 && name.includes(supKor.slice(0, 2))) { score += 0.05; reasons.push("공급사겹침"); }
  }
  return { score: Math.min(1, +score.toFixed(3)), reasons };
}

// 공급사 힌트 유효성 검사 (상품명이나 잡문자로 판정되면 페이지 fallback)
export function isValidSupplierHint(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  if (t.length < 2 || t.length > 25) return false;

  // 상품명 힌트 (규격 포함)
  if (/\d+\s*(mg|ml|정|캡슐|포|EA|T|C|V|BOX|박스)/i.test(t)) return false;

  // 배송·행정 정보
  if (isNonProductText(t)) return false;

  return true;
}
