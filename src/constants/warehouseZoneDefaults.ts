// src/constants/warehouseZoneDefaults.ts
// 2026-08-27 · 사용자 지시 · 창고1/2 편집 UI · KV 저장 · 전역 연동
//   · 하드코딩 default 값 · 신규 설치 시 seed 로 사용
//   · 실제 데이터는 app_settings.warehouse_zones (KV) · useKvSetting("warehouse_zones") 로 로드
//   · storage description 이미지 기반 (src/sample/storage*_description*.png)

export interface WarehouseZoneItem {
  code: string;    // zone code (예: "24", "7B", "8A")
  label: string;   // 카테고리 라벨 (예: "파스")
  hint?: string;   // 공급사·추가 힌트
  tag?: string;    // "창고1" | "창고2" | "위탁" | "창고1/2" (선택 · 왼쪽측면 표시용)
}

export interface WarehouseZonesConfig {
  warehouse1:            WarehouseZoneItem[];
  warehouse2_inner:      WarehouseZoneItem[];
  warehouse2_center:     WarehouseZoneItem[];
  warehouse2_right:      WarehouseZoneItem[];
  warehouse2_cosmetics:  WarehouseZoneItem[];
}

export const DEFAULT_WAREHOUSE_ZONES: WarehouseZonesConfig = {
  // 창고1 · 파스·한방·경옥고류 (6구역)
  warehouse1: [
    { code: "24", label: "파스",              hint: "제일·녹십자·한독" },
    { code: "25", label: "파스",              hint: "신신·지오영" },
    { code: "26", label: "뿌리는/바르는 파스", hint: "지오영" },
    { code: "27", label: "파스",              hint: "일동·조아" },
    { code: "7B", label: "한방제제모음",       hint: "경방·한풍·원광·한국신약·한솔" },
    { code: "8A", label: "경옥고/공진단/태반/우황청심원/안정액/수면유도제", hint: "광동·유수·인풍·원광·동화·한국신약·일양·경남·녹십자" },
  ],
  // 창고2 왼쪽측면 · 창고2 + 위탁 혼합
  warehouse2_inner: [
    { code: "28",  tag: "창고2", label: "의료기기/혈당/혈압/체온계" },
    { code: "28*", tag: "위탁",  label: "보호대/스포츠테이핑 (관절/모기물림)" },
    { code: "29",  tag: "창고2", label: "반창고/거즈/붕대" },
    { code: "29*", tag: "창고2", label: "응급/구급/소독약/살충제" },
    { code: "30",  tag: "창고2", label: "화상/습윤밴드" },
    { code: "30*", tag: "창고2", label: "화상/습윤밴드" },
    { code: "31",  tag: "창고2", label: "염색약/제모기/립케어/생지시트" },
    { code: "34",  tag: "위탁",  label: "반려동물 용품/의약품/영양제/간식/사료" },
    { code: "35",  tag: "위탁",  label: "반려동물 용품/의약품/영양제/간식/사료" },
    { code: "35*", tag: "위탁",  label: "반려동물 용품/의약품/영양제/간식/사료" },
    { code: "36",  tag: "위탁",  label: "동물의약품" },
    { code: "36*", tag: "창고2", label: "기타건강식품" },
    { code: "37",  tag: "창고2", label: "기타건강식품" },
    { code: "37*", tag: "창고2", label: "기타건강식품" },
    { code: "38",  tag: "창고2", label: "기타건강식품" },
    { code: "38*", tag: "창고2", label: "기타건강식품" },
    { code: "39",  tag: "창고2", label: "브랜드관 (뉴케어)" },
    { code: "39*", tag: "창고2", label: "해외식품관" },
    { code: "40",  tag: "창고2", label: "이벤트존" },
    { code: "40*", tag: "창고1/2", label: "드림크냉장고" },
  ],
  // 창고2 중앙 · 감기약/소화제/연고/피부 진열대
  warehouse2_center: [
    { code: "1A", label: "1·2차 감기약 · 코감기 · 인후염" },
    { code: "1B", label: "1·2차 감기약 · 코감기 · 스레알레약 · 씨감기약" },
    { code: "2A", label: "한방 감기약 · 종합감기약 · 시럽" },
    { code: "2B", label: "혼합 감기약 · 시럽" },
    { code: "3A", label: "소화제 · 상비약 · 위장약" },
    { code: "3B", label: "소화제/위장약 · 항산제" },
    { code: "4A", label: "지사·정장약 · 속쓰림약" },
    { code: "4B", label: "해열진통 · 소염제" },
    { code: "5A", label: "칫솔/치약/구강용품 · 눈 관련" },
    { code: "5B", label: "연고 (외피/피부)" },
    { code: "6A", label: "연고 (설퍼/피부·양평)" },
    { code: "6B", label: "피부관련 (여름/두피/누기·양기)" },
    { code: "7A", label: "정형/양장 · PMS/생리통 · 근육통" },
  ],
  // 창고2 오른쪽측면 · 건강기능식품
  warehouse2_right: [
    { code: "10",  label: "피로회복" },
    { code: "10*", label: "피로회복" },
    { code: "11",  label: "피로회복" },
    { code: "11*", label: "피로회복" },
    { code: "12",  label: "어린이 영양" },
    { code: "12*", label: "피로회복" },
    { code: "13",  label: "철분/엽산" },
    { code: "13*", label: "임산영양" },
    { code: "14",  label: "유산균" },
    { code: "14*", label: "냉장 유산균 (180센티)" },
    { code: "15",  label: "혈행건강" },
    { code: "15*", label: "위건강" },
    { code: "16",  label: "오메가3·6·7" },
    { code: "16*", label: "뇌기능 개선" },
    { code: "17",  label: "잇몸건강" },
    { code: "17*", label: "눈건강" },
    { code: "18",  label: "항산화" },
    { code: "18*", label: "면역조절제" },
    { code: "19",  label: "비타민C" },
    { code: "19*", label: "항산화" },
    { code: "20",  label: "여성라이프케어 (생리기간)" },
    { code: "20*", label: "콜라겐" },
    { code: "21",  label: "운동전후/체중관리/수제보충" },
    { code: "21*", label: "남성 라이프케어 (활력/근력)" },
    { code: "22",  label: "피로회복" },
    { code: "22*", label: "마그네슘/수면" },
    { code: "23",  label: "혈관건강" },
    { code: "23*", label: "관절건강" },
  ],
  // 창고2 화장품 (32·33)
  warehouse2_cosmetics: [
    { code: "32",  label: "기미/미백/잡티 · 여드름/트러블 케어" },
    { code: "33",  label: "기초케어 · 클린징케어" },
    { code: "33*", label: "마스크팩/집중팩 · 여행용 화장품 · 약통/커터/복약" },
    { code: "32*", label: "진정/민감케어 · 탄력/주름 · 모공피부 케어" },
  ],
};

export const WAREHOUSE_ZONES_KEY = "warehouse_zones";
export const WAREHOUSE_ZONES_UPDATED_EVENT = "warehouse-zones-updated";
