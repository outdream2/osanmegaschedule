// upload-stock 엔드포인트가 start_date 를 로그에 저장하는지 확인
// 실제 xlsx 아니어도 되므로 아주 작은 valid xlsx buffer 를 만들어 전송
import "dotenv/config";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const BASE = "http://localhost:3000";

(async () => {
  // (a) 관리자 employee ID 조회
  const { data: mgr } = await s.from("employees").select("id").gte("level", 9).limit(1);
  if (!mgr?.[0]) { console.error("level 9+ 매니저 없음"); process.exit(1); }
  const managerId = mgr[0].id;

  // (b) 최소 xlsx 생성 (헤더 + 데이터 1행)
  const rows = [
    ["세부구분","세부구분","세부구분","세부구분","세부구분","세부구분","세부구분","재고 정보","재고 정보","재고 정보","재고 정보","재고 정보","재고 정보","재고 정보","재고금액","재고금액","재고금액","재고금액","재고금액"],
    ["공급사코드", "공급사명", "코드", "명", "규격", "i", "상품유형", "시작일 재고", "입고계", "판매출고계", "폐기", "사내소비", "재고조정 반영수량", "종료일 재고", "과세", "공급가액", "부가세", "면세", "합계"],
    ["9999", "테스트공급사", "TEST0001", "테스트상품A", "A", "과직", "수량", 10, 5, 3, 0, 0, 0, 12, 100, 90, 10, 0, 100],
    ["9999", "테스트공급사", "TEST0002", "테스트상품B", "B", "과직", "수량", 20, 0, 4, 0, 0, 0, 16, 200, 180, 20, 0, 200],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "재고");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  // (c) upload
  const params = new URLSearchParams({
    managerId: String(managerId),
    snapshot_date: "2026-08-10",
    start_date: "2026-08-01",
    period_type: "early",
  });
  const res = await fetch(`${BASE}/api/upload-stock?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: buf,
  });
  console.log("응답:", res.status, await res.text());

  // (d) 로그 확인
  const { data } = await s.from("app_settings").select("value").eq("key", "stock_import_log").maybeSingle();
  const arr = Array.isArray(data?.value) ? data.value : [];
  const latest = arr[0];
  console.log("\n최신 로그 엔트리:");
  console.log(JSON.stringify(latest, null, 2));
  if (latest?.start_date) {
    console.log("\n✅ start_date 저장 확인:", latest.start_date);
  } else {
    console.log("\n❌ start_date 미저장");
  }

  // (e) 정리: 테스트 데이터 삭제
  await s.from("stock_history").delete().eq("snapshot_date", "2026-08-10");
  console.log("(테스트 데이터 정리 완료)");
})();
