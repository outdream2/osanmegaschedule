// 2026-08-27 · 사용자 지시 · 카테고리 → 창고 구역 매핑 DB 저장
//   · src/sample/storage1_description.png · storage2_description1-4.png 에서 추출
//   · app_settings.key = "storage_zone_map" · value = {[category]: {warehouse, zone, source}}
//   · warehouse = "창고1" | "창고2" | "위탁" | "창고1(냉장)"
//   · 실행 · node scripts/seed-storage-zone-map.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

// ─── 카테고리 → 창고 구역 매핑 (storage description 이미지에서 추출) ───
const STORAGE_ZONE_MAP = {
  // ─ 창고1 (파스·한방제제·경옥고류) ─
  "파스":                       { warehouse: "창고1", zone: "24-27", source: "storage1" },
  "뿌리는파스":                 { warehouse: "창고1", zone: "26",    source: "storage1" },
  "바르는파스":                 { warehouse: "창고1", zone: "26",    source: "storage1" },
  "한방제제":                   { warehouse: "창고1", zone: "7B",    source: "storage1" },
  "경옥고":                     { warehouse: "창고1", zone: "8A",    source: "storage1" },
  "공진단":                     { warehouse: "창고1", zone: "8A",    source: "storage1" },
  "태반":                       { warehouse: "창고1", zone: "8A",    source: "storage1" },
  "우황청심원":                 { warehouse: "창고1", zone: "8A",    source: "storage1" },
  "안정액":                     { warehouse: "창고1", zone: "8A",    source: "storage1" },
  "수면유도제":                 { warehouse: "창고1", zone: "8A",    source: "storage1" },
  "드링크냉장":                 { warehouse: "창고1(냉장)", zone: "40", source: "storage2" },

  // ─ 창고2 왼쪽측면 (의료기기·응급·화장품일부·건강식품·브랜드관·이벤트) ─
  "의료기기":                   { warehouse: "창고2", zone: "28",    source: "storage2" },
  "혈당체크":                   { warehouse: "창고2", zone: "28",    source: "storage2" },
  "혈압계":                     { warehouse: "창고2", zone: "28",    source: "storage2" },
  "체온계":                     { warehouse: "창고2", zone: "28",    source: "storage2" },
  "보호대":                     { warehouse: "위탁",  zone: "28",    source: "storage2" },
  "스포츠테이핑":               { warehouse: "위탁",  zone: "28",    source: "storage2" },
  "반창고":                     { warehouse: "창고2", zone: "29",    source: "storage2" },
  "거즈":                       { warehouse: "창고2", zone: "29",    source: "storage2" },
  "붕대":                       { warehouse: "창고2", zone: "29",    source: "storage2" },
  "응급":                       { warehouse: "창고2", zone: "29",    source: "storage2" },
  "구급":                       { warehouse: "창고2", zone: "29",    source: "storage2" },
  "소독약":                     { warehouse: "창고2", zone: "29",    source: "storage2" },
  "살충제":                     { warehouse: "창고2", zone: "29",    source: "storage2" },
  "화상":                       { warehouse: "창고2", zone: "30",    source: "storage2" },
  "습윤밴드":                   { warehouse: "창고2", zone: "30",    source: "storage2" },
  "염색약":                     { warehouse: "창고2", zone: "31",    source: "storage2" },
  "제모기":                     { warehouse: "창고2", zone: "31",    source: "storage2" },
  "립케어":                     { warehouse: "창고2", zone: "31",    source: "storage2" },
  "생지시트":                   { warehouse: "창고2", zone: "31",    source: "storage2" },
  "반려동물용품":               { warehouse: "위탁",  zone: "34-35", source: "storage2" },
  "반려동물의약품":             { warehouse: "위탁",  zone: "34-35", source: "storage2" },
  "반려동물영양제":             { warehouse: "위탁",  zone: "34-35", source: "storage2" },
  "반려동물간식":               { warehouse: "위탁",  zone: "34-35", source: "storage2" },
  "반려동물사료":               { warehouse: "위탁",  zone: "34-35", source: "storage2" },
  "동물의약품":                 { warehouse: "위탁",  zone: "36",    source: "storage2" },
  "기타건강식품":               { warehouse: "창고2", zone: "36-38", source: "storage2" },
  "브랜드관":                   { warehouse: "창고2", zone: "39",    source: "storage2" },
  "뉴케어":                     { warehouse: "창고2", zone: "39",    source: "storage2" },
  "해외식품":                   { warehouse: "창고2", zone: "39",    source: "storage2" },
  "이벤트존":                   { warehouse: "창고2", zone: "40",    source: "storage2" },

  // ─ 창고2 화장품 (32-33) ─
  "기미케어":                   { warehouse: "창고2", zone: "32",    source: "storage2" },
  "미백케어":                   { warehouse: "창고2", zone: "32",    source: "storage2" },
  "잡티케어":                   { warehouse: "창고2", zone: "32",    source: "storage2" },
  "여드름케어":                 { warehouse: "창고2", zone: "32",    source: "storage2" },
  "트러블케어":                 { warehouse: "창고2", zone: "32",    source: "storage2" },
  "진정케어":                   { warehouse: "창고2", zone: "32",    source: "storage2" },
  "민감케어":                   { warehouse: "창고2", zone: "32",    source: "storage2" },
  "탄력케어":                   { warehouse: "창고2", zone: "32",    source: "storage2" },
  "주름케어":                   { warehouse: "창고2", zone: "32",    source: "storage2" },
  "모공피부":                   { warehouse: "창고2", zone: "32",    source: "storage2" },
  "기초케어":                   { warehouse: "창고2", zone: "33",    source: "storage2" },
  "클린징케어":                 { warehouse: "창고2", zone: "33",    source: "storage2" },
  "마스크팩":                   { warehouse: "창고2", zone: "33",    source: "storage2" },
  "여행용화장품":               { warehouse: "창고2", zone: "33",    source: "storage2" },

  // ─ 창고2 오른쪽측면 · 벽면 진열대 (9-23) · warehouse=매장진열 (참고용) ─
  //   실재고 창고 매핑 아님 · 매장 진열 카테고리 · 데이터 완성도 위해 포함
  "피로회복":                   { warehouse: "창고2", zone: "10-12", source: "storage2" },
  "어린이영양":                 { warehouse: "창고2", zone: "12",    source: "storage2" },
  "철분":                       { warehouse: "창고2", zone: "13",    source: "storage2" },
  "엽산":                       { warehouse: "창고2", zone: "13",    source: "storage2" },
  "임신영양":                   { warehouse: "창고2", zone: "13",    source: "storage2" },
  "유산균":                     { warehouse: "창고2", zone: "14",    source: "storage2" },
  "냉장유산균":                 { warehouse: "창고2", zone: "14",    source: "storage2" },
  "혈행건강":                   { warehouse: "창고2", zone: "15",    source: "storage2" },
  "위건강":                     { warehouse: "창고2", zone: "15",    source: "storage2" },
  "오메가3":                    { warehouse: "창고2", zone: "16",    source: "storage2" },
  "뇌기능개선":                 { warehouse: "창고2", zone: "16",    source: "storage2" },
  "잇몸건강":                   { warehouse: "창고2", zone: "17",    source: "storage2" },
  "눈건강":                     { warehouse: "창고2", zone: "17",    source: "storage2" },
  "항산화":                     { warehouse: "창고2", zone: "18-19", source: "storage2" },
  "면역조절제":                 { warehouse: "창고2", zone: "18",    source: "storage2" },
  "비타민C":                    { warehouse: "창고2", zone: "19",    source: "storage2" },
  "여성라이프케어":             { warehouse: "창고2", zone: "20",    source: "storage2" },
  "콜라겐":                     { warehouse: "창고2", zone: "20",    source: "storage2" },
  "운동전후":                   { warehouse: "창고2", zone: "21",    source: "storage2" },
  "체중관리":                   { warehouse: "창고2", zone: "21",    source: "storage2" },
  "수액보충제":                 { warehouse: "창고2", zone: "21",    source: "storage2" },
  "남성라이프케어":             { warehouse: "창고2", zone: "21",    source: "storage2" },
  "탈모":                       { warehouse: "창고2", zone: "21",    source: "storage2" },
  "전립선":                     { warehouse: "창고2", zone: "21",    source: "storage2" },
  "마그네슘":                   { warehouse: "창고2", zone: "22",    source: "storage2" },
  "수면":                       { warehouse: "창고2", zone: "22",    source: "storage2" },
  "복건강":                     { warehouse: "창고2", zone: "23",    source: "storage2" },
  "관절건강":                   { warehouse: "창고2", zone: "23",    source: "storage2" },
};

console.log(`매핑 ${Object.keys(STORAGE_ZONE_MAP).length}개 카테고리 · DB 저장 중...`);
const { error } = await sb.from("app_settings").upsert({
  key:   "storage_zone_map",
  value: STORAGE_ZONE_MAP,
}, { onConflict: "key" });
if (error) { console.error("❌", error.message); process.exit(1); }
console.log("✅ storage_zone_map 저장 완료");
console.log("샘플 · 파스:", STORAGE_ZONE_MAP["파스"]);
console.log("샘플 · 유산균:", STORAGE_ZONE_MAP["유산균"]);
