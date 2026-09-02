// 2026-09-03 · 전 페이지 CRUD 실제 endpoint 테스트 (GET only · read side)
import * as dotenv from "dotenv";
dotenv.config();

const BASE = "http://localhost:3000";

async function loginAdmin() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: "01041522777", password: "1234" }),
  });
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : (res.headers.raw?.()['set-cookie'] ?? []);
  return cookies.map(c => c.split(";")[0]).join("; ");
}

const READ_ENDPOINTS = [
  ["/api/auth/me", "인증"],
  ["/api/employees", "직원"],
  ["/api/schedules?year=2026&month=8", "스케쥴"],
  ["/api/schedules/lock/2026/9", "스케쥴 잠금"],
  ["/api/vendors", "공급사"],
  ["/api/vendors?withBalances=1", "공급사 잔고"],
  ["/api/products-map", "상품 map"],
  ["/api/order-requests", "발주요청"],
  ["/api/order-history?days=90", "발주이력"],
  ["/api/display-requests", "진열요청"],
  ["/api/requests/pending-counts", "대기 카운트"],
  ["/api/purchase-details?limit=10", "매입이력"],
  ["/api/purchase-details/pending-orders-count", "미결제 매입"],
  ["/api/supplier-payments?days=90", "공급사 결제"],
  ["/api/supplier-balances", "공급사 잔고"],
  ["/api/supplier-payments/pending-count", "결제 대기"],
  ["/api/credit-cards", "카드"],
  ["/api/credit-cards/summary", "카드 summary"],
  ["/api/inventory-checks?days=30", "실재고"],
  ["/api/inventory-latest?limit=10", "실재고 최근"],
  ["/api/zone-defs", "매장구역"],
  ["/api/zone-labels", "구역라벨"],
  ["/api/zone-mismatches", "구역불일치"],
  ["/api/zone-day/2026-09-01", "일별구역"],
  ["/api/leave-requests?scope=all", "연차"],
  ["/api/lunch-requests?date=2026-09-03", "점심"],
  ["/api/return-requests", "반품"],
  ["/api/resignations", "사직"],
  ["/api/employee-contracts", "직원계약서"],
  ["/api/contract-clauses", "계약조항"],
  ["/api/hr-forms", "HR양식"],
  ["/api/notifications?limit=5", "알림"],
  ["/api/board/posts?limit=5", "게시글"],
  ["/api/ocr-confirmed-items?limit=5", "OCR 확정"],
  ["/api/ocr-synonyms", "OCR 동의어"],
  ["/api/ocr-supplier-aliases", "OCR 공급사별칭"],
  ["/api/ocr-templates", "OCR 템플릿"],
  ["/api/borrowings?days=90", "차용"],
  ["/api/borrowings/parties", "차용 당사자"],
  ["/api/stock-manage/top-sales?months=3&limit=10", "판매 top"],
  ["/api/stock-manage/critical?limit=10", "품절임박"],
  ["/api/stock-manage/sales-trend?months=3", "판매추이"],
  ["/api/settings/company_info", "회사정보"],
  ["/api/permissions", "권한"],
  ["/api/reservations?days=30", "예약"],
  ["/api/stock-arrivals?days=30", "입고알림"],
  ["/api/product-arrivals?days=30", "상품입고"],
];

async function main() {
  console.log("로그인...");
  const cookie = await loginAdmin();
  console.log("총", READ_ENDPOINTS.length, "endpoint 테스트\n");
  const ok = [], fail = [], notFound = [];
  for (const [path, label] of READ_ENDPOINTS) {
    try {
      const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
      if (res.status === 200) {
        ok.push({ path, label });
        console.log(`✅ ${path}`);
      } else if (res.status === 404) {
        notFound.push({ path, label });
        console.log(`⚠️ 404 ${path} · ${label}`);
      } else {
        const bodyText = await res.text();
        fail.push({ path, label, status: res.status, error: bodyText.slice(0, 150) });
        console.log(`❌ ${res.status} ${path} · ${bodyText.slice(0, 100)}`);
      }
    } catch (e) {
      fail.push({ path, label, error: e.message });
      console.log(`💥 ${path} · ${e.message}`);
    }
  }
  console.log(`\n=== 결과 ===\n✅ 정상: ${ok.length}\n⚠️ 404: ${notFound.length}\n❌ 실패: ${fail.length}`);
  if (fail.length > 0) {
    console.log("\n=== 실패 상세 ===");
    fail.forEach(r => console.log(` [${r.status}] ${r.path}\n    ${r.error}`));
  }
  if (notFound.length > 0) {
    console.log("\n=== 404 (경로 오류) ===");
    notFound.forEach(r => console.log(` ${r.path} · ${r.label}`));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
