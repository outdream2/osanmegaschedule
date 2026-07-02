-- Supabase에서 실행: OCR 공급사 별칭 테이블
-- OCR이 잘못 인식한 공급사명 → 올바른 공급사명 매핑
create table if not exists ocr_supplier_aliases (
  id          bigserial primary key,
  alias       text not null,
  supplier_name text not null,
  created_at  timestamptz default now()
);

-- 중복 alias 방지 (선택사항)
create unique index if not exists ocr_supplier_aliases_alias_idx on ocr_supplier_aliases (alias);
