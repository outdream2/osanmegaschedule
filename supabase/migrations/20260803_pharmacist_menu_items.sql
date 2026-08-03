-- 2026-08-03 · 약사 전용 페이지 · 하위메뉴 CRUD
--   PharmacistPage · 교육자료·복약지도·동영상·문서 각 카테고리별 하위메뉴 항목
--   · 관리자(level>=8) 만 CRUD · 약사(level>=3) 는 조회+PDF 열람만
--   · 첨부 파일 · PDF 위주 (Word/이미지 등도 허용 · 뷰어는 PDF 만 렌더)
--   · Storage 실패 시 로컬 uploads/pharmacist-materials/ 폴백 (hrForms 패턴)
--
-- ※ 사용자 액션 필요 (Supabase Dashboard 에서 1회):
--   1) 아래 SQL 을 SQL Editor 에서 실행
--   2) Storage 에서 "pharmacist-materials" 버킷 생성 (Public 권장)

CREATE TABLE IF NOT EXISTS pharmacist_menu_items (
  id BIGSERIAL PRIMARY KEY,
  tab_key TEXT NOT NULL CHECK (tab_key IN ('education','reference','video','docs')),
  category_key TEXT NOT NULL,          -- 예: "1A", "22", "interact", "manual" 등
  title TEXT NOT NULL,
  file_url TEXT,                       -- PDF/파일 링크 (Supabase Storage or 로컬)
  file_name TEXT,
  file_size INT,
  mime_type TEXT,
  storage_path TEXT,                   -- Storage object path (삭제 시 원본 정리)
  storage TEXT,                        -- "supabase" | "local"
  sort_order INT DEFAULT 0,
  uploaded_by TEXT,
  uploaded_by_id INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pharm_menu_tab_cat ON pharmacist_menu_items(tab_key, category_key);
CREATE INDEX IF NOT EXISTS idx_pharm_menu_sort ON pharmacist_menu_items(sort_order);
CREATE INDEX IF NOT EXISTS idx_pharm_menu_created ON pharmacist_menu_items(created_at DESC);
