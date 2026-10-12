// 2026-10-09 · READ ONLY · PO-20261009-4624 발주 실제 발송 여부 확인
//   · order_requests · order_dispatches 테이블 조회
//   · 사용자 긴급 요청 · 실제 이메일/카톡 발송 됐는지 확인
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ORDER_NO = "PO-20261009-4624";

console.log(`\n═══════════════════════════════════════════════════════`);
console.log(`  📋 ${ORDER_NO} · 발송 상태 조사`);
console.log(`═══════════════════════════════════════════════════════\n`);

// 1. order_requests
console.log("【1】 order_requests 테이블 (해당 발주번호 매칭)");
const { data: reqs, error: reqErr } = await supabase
  .from("order_requests")
  .select("id, product_code, product_name, supplier, status, sent_at, order_number, order_qty, requested_at")
  .eq("order_number", ORDER_NO);
if (reqErr) { console.error("ERR:", reqErr.message); }
else if (!reqs || reqs.length === 0) { console.log("  (해당 order_number 매칭 없음)"); }
else {
  console.log(`  총 ${reqs.length}건:`);
  for (const r of reqs) {
    console.log(`    · [${r.status}] ${r.supplier ?? "(공급사 미지정)"} · ${r.product_name} (${r.product_code}) · qty=${r.order_qty} · sent_at=${r.sent_at}`);
  }
}

// 2. order_dispatches
console.log(`\n【2】 order_dispatches 테이블 (실제 발송 기록)`);
try {
  const { data: disp, error: dispErr } = await supabase
    .from("order_dispatches")
    .select("*")
    .eq("order_number", ORDER_NO);
  if (dispErr) { console.error("  ERR:", dispErr.message); }
  else if (!disp || disp.length === 0) { console.log("  ❌ dispatch 기록 없음 · 발송 안됐을 가능성 높음"); }
  else {
    console.log(`  총 ${disp.length}건:`);
    for (const d of disp) {
      console.log(`\n    공급사: ${d.supplier}`);
      console.log(`    📧 email_status  : ${d.email_status ?? "null"}`);
      console.log(`    📱 sms_status    : ${d.sms_status ?? "null"}`);
      console.log(`    💬 kakao_status  : ${d.kakao_status ?? "null"}`);
      console.log(`    channels   : ${d.channels ?? "null"}`);
      console.log(`    outcomes   : ${JSON.stringify(d.outcomes)}`);
      console.log(`    target_email: ${d.target_email ?? "(없음)"}`);
      console.log(`    target_phone: ${d.target_phone ?? "(없음)"}`);
      console.log(`    created_at : ${d.created_at}`);
    }
  }
} catch (e) { console.error("  Exception:", e.message); }

// 3. SMTP·SOLAPI 환경변수 체크 (설정 안 됐으면 실제 발송 불가)
console.log(`\n【3】 발송 환경 (서버 환경변수 체크)`);
console.log(`  SMTP_HOST    : ${process.env.SMTP_HOST ? "✅ 설정됨" : "❌ 없음"}`);
console.log(`  SMTP_USER    : ${process.env.SMTP_USER ? "✅ 설정됨" : "❌ 없음"}`);
console.log(`  SMTP_PASS    : ${process.env.SMTP_PASS ? "✅ 설정됨" : "❌ 없음"}`);
console.log(`  SOLAPI_API_KEY       : ${process.env.SOLAPI_API_KEY ? "✅ 설정됨" : "❌ 없음"}`);
console.log(`  SOLAPI_API_SECRET    : ${process.env.SOLAPI_API_SECRET ? "✅ 설정됨" : "❌ 없음"}`);
console.log(`  SOLAPI_KAKAO_TEMPLATE_ORDER: ${process.env.SOLAPI_KAKAO_TEMPLATE_ORDER ? "✅ 설정됨" : "❌ 없음"}`);
console.log(`  SOLAPI_KAKAO_SENDER_KEY    : ${process.env.SOLAPI_KAKAO_SENDER_KEY ? "✅ 설정됨" : "❌ 없음"}`);

// 4. vendors 조회 · PO 관련 공급사 담당자/이메일 등록 여부
if (reqs && reqs.length > 0) {
  const suppliers = [...new Set(reqs.map(r => r.supplier).filter(Boolean))];
  console.log(`\n【4】 공급사 vendor 등록 상태 (담당자·이메일·전화)`);
  for (const sup of suppliers) {
    const { data: v } = await supabase.from("vendors")
      .select("company_name, contact_name, phone, email")
      .eq("company_name", sup).maybeSingle();
    if (!v) console.log(`  ❌ ${sup}: vendors 등록 X · 담당자/이메일/전화 모두 없음`);
    else {
      const bits = [v.contact_name, v.phone, v.email].filter(Boolean);
      if (bits.length === 0) console.log(`  ⚠ ${sup}: vendors 등록 있지만 담당자/전화/이메일 모두 비어있음`);
      else console.log(`  ✅ ${sup}: 담당자=${v.contact_name ?? "-"} · phone=${v.phone ?? "-"} · email=${v.email ?? "-"}`);
    }
  }
}

console.log(`\n═══════════════════════════════════════════════════════\n`);
