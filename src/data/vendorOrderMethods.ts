// 2026-09-02 · 사용자 지시 · 공급사 주문방식 목록 · xlsx 마스터 추출 (src/sample/메가타운약국공급사관리정보.xlsx)
//   · 거래처 · 공급사 상세 · 주문방식 dropdown + 바로가기 버튼용
//   · 사용자 자유 입력도 허용 · datalist 방식 (아래 목록 = suggestion + URL 매핑)

export interface VendorOrderMethod {
  name: string;
  url: string;
}

export const VENDOR_ORDER_METHODS: readonly VendorOrderMethod[] = [
  { name: "고려은단 폐쇄몰",       url: "https://www.newpharm.co.kr:17443/shoppingmall/" },
  { name: "광동제약 약국몰",       url: "https://kdshop.co.kr/main/index.do" },
  { name: "녹십자 프리미온",       url: "https://premion.gccorp.com/login" },
  { name: "theSHOP",              url: "https://www.shop.co.kr/front/intro/login" },
  { name: "온다몰, 일부직거래",    url: "https://www.ondamall.co.kr/" },
  { name: "DAPmall - 메인",       url: "https://www.dapmall.com/main/index" },
  { name: "동화eMall, 일부직거래", url: "https://www.dw1897.co.kr/emall/" },
  { name: "팜스트리트",           url: "https://www.pharm-street.com/" },
  { name: "바로팜 | 홈",          url: "https://www.baropharm.com/" },
  { name: "셀로몰",               url: "https://www.cellonixmall.com/login/login_form.page" },
  { name: "소조몰",               url: "https://www.sozomall.co.kr/main/intro.asp" },
  { name: "뉴트라몰",             url: "http://www.mianutra.com/" },
  { name: "HMP몰",                url: "https://www.hmpmall.co.kr/home.do" },
  { name: "유한팜",               url: "https://pharm.yuhan.co.kr/auth/login" },
  { name: "새로팜",               url: "https://www.saeropharm.com/w/main.do" },
  { name: "플랫팜",               url: "https://www.platpharm.co.kr/pharmacy/orders" },
  { name: "JW중외제약 온라인몰",  url: "https://www.jwpmall.co.kr/main/index.do" },
  { name: "현대약품몰, 직거래",   url: "https://hdpmall.co.kr/" },
];

/** 주문방식 이름 → URL 매핑 · 없으면 undefined · 정확 매칭 우선 · 공백 관대 fuzzy 매칭 */
export function findOrderMethodUrl(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const target = String(name).trim().replace(/\s+/g, "").toLowerCase();
  if (!target) return undefined;
  const hit = VENDOR_ORDER_METHODS.find(m =>
    m.name.replace(/\s+/g, "").toLowerCase() === target,
  );
  if (hit) return hit.url;
  const partial = VENDOR_ORDER_METHODS.find(m => {
    const k = m.name.replace(/\s+/g, "").toLowerCase();
    return k.includes(target) || target.includes(k);
  });
  return partial?.url;
}
