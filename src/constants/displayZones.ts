// src/constants/displayZones.ts
// Shared zone definitions — used by both DisplayPage and SchedulePage (logistics zone assignment)

export type ZoneSection = "aisle" | "bottom_wall" | "top_wall" | "left_wall" | "wing" | "event";

export interface ZoneDef {
  num: number;
  label: string;
  category: string;
  section: ZoneSection;
}

export const ZONE_DEFS: ZoneDef[] = [
  // Aisles 1-9
  { num: 1,  label: "진열대 1",    category: "종합감기·코감기·진해거담·한방감기",    section: "aisle" },
  { num: 2,  label: "진열대 2",    category: "어린이감기약·어린이영양제·알러지",     section: "aisle" },
  { num: 3,  label: "진열대 3",    category: "해열진통소염·관절근육통·안약",         section: "aisle" },
  { num: 4,  label: "진열대 4",    category: "소화제·지사제·위염·변비약·수면",       section: "aisle" },
  { num: 5,  label: "진열대 5",    category: "자양강장·남성용품·금연·모발",          section: "aisle" },
  { num: 6,  label: "진열대 6",    category: "피부질환용제·기타피부연고",            section: "aisle" },
  { num: 7,  label: "진열대 7",    category: "여성용품·미용·다이어트·살충제",        section: "aisle" },
  { num: 8,  label: "진열대 8",    category: "파스·보호대·칫솔·치약·구강용품",       section: "aisle" },
  { num: 9,  label: "진열대 9",    category: "붕대·마스크·밴드·반창고·거즈",        section: "aisle" },
  // Bottom wall 10-21
  { num: 10, label: "벽면 10",     category: "종합영양제",                         section: "bottom_wall" },
  { num: 11, label: "벽면 11",     category: "종합영양제",                         section: "bottom_wall" },
  { num: 12, label: "벽면 12",     category: "간기능개선제",                       section: "bottom_wall" },
  { num: 13, label: "벽면 13",     category: "아미노산·아르기닌",                   section: "bottom_wall" },
  { num: 14, label: "벽면 14",     category: "남성기능강화·탈모·전립선",             section: "bottom_wall" },
  { num: 15, label: "벽면 15",     category: "칼슘제·비타민D",                     section: "bottom_wall" },
  { num: 16, label: "벽면 16",     category: "관절영양제·콘드로이틴·MSM",           section: "bottom_wall" },
  { num: 17, label: "벽면 17",     category: "항산화제·면역증강",                   section: "bottom_wall" },
  { num: 18, label: "벽면 18",     category: "뇌기능개선·혈액순환·혈당개선",         section: "bottom_wall" },
  { num: 19, label: "벽면 19",     category: "눈영양제",                           section: "bottom_wall" },
  { num: 20, label: "벽면 20",     category: "염색약",                             section: "bottom_wall" },
  { num: 21, label: "벽면 21",     category: "동물의약품·동물용품",                  section: "bottom_wall" },
  // Left wall 22-23
  { num: 22, label: "벽면 22",     category: "동물의약품·동물용품",                  section: "left_wall" },
  { num: 23, label: "벽면 23",     category: "의료기기",                           section: "left_wall" },
  // Top wall 24-35
  { num: 24, label: "벽면 24",     category: "어린이종합·키즈용품",                  section: "top_wall" },
  { num: 25, label: "벽면 25",     category: "오메가3",                            section: "top_wall" },
  { num: 26, label: "벽면 26",     category: "마그네슘·수면",                       section: "top_wall" },
  { num: 27, label: "벽면 27",     category: "유산균",                             section: "top_wall" },
  { num: 28, label: "벽면 28",     category: "잇몸건강",                           section: "top_wall" },
  { num: 29, label: "벽면 29",     category: "철분제·비타민C",                      section: "top_wall" },
  { num: 30, label: "벽면 30",     category: "콜라겐·갱년기·임신부영양제",            section: "top_wall" },
  { num: 31, label: "벽면 31",     category: "건강보조식품",                        section: "top_wall" },
  { num: 32, label: "벽면 32",     category: "한방관련제품",                        section: "top_wall" },
  { num: 33, label: "벽면 33",     category: "PB상품·생활의약품",                   section: "top_wall" },
  { num: 34, label: "벽면 34",     category: "드링크제품",                          section: "top_wall" },
  { num: 35, label: "벽면 35",     category: "냉장의약품",                          section: "top_wall" },
  // Right wing 36-41
  { num: 36, label: "프로모션",     category: "프로모션·이벤트 상품",                 section: "wing" },
  { num: 37, label: "기능성화장품", category: "기능성화장품·미용",                    section: "wing" },
  { num: 38, label: "조제실",       category: "조제실 (약사 전용)",                  section: "wing" },
  { num: 39, label: "화장실",       category: "(시설)",                             section: "wing" },
  { num: 40, label: "계산대",       category: "계산대 (POS)",                      section: "wing" },
  { num: 41, label: "정수기",       category: "(시설)",                             section: "wing" },
  // Event zone (floor stand area)
  { num: 42, label: "이벤트존",     category: "이벤트·프로모션 상품",                  section: "event" },
];

export const ZONES_STORAGE_KEY = "megatown_display_zones_v2";

export const SECTION_LABEL: Record<ZoneSection, string> = {
  top_wall: "상단 벽면",
  aisle: "중앙 진열대",
  left_wall: "좌측 벽면",
  bottom_wall: "하단 벽면",
  wing: "우측 윙",
  event: "이벤트존",
};
