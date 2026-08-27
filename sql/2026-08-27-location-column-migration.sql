-- 2026-08-27 · 사용자 지시 (옵션 A) · products 물리 컬럼 통합
--   · spec + display_location → location 단일 컬럼
--   · 실행 환경 · Supabase Dashboard > SQL Editor
--   · 롤백 · 원본 스냅샷 컬럼 (spec_backup · display_location_backup) 유지 · 필요 시 복원 가능
--
-- 사전 확인 · 재고관리 페이지·실재고테이블 정상 동작 후 실행
-- 사후 확인 · products.location 컬럼 값 존재 · UI 반영 · 로컬 커밋

-- ═══════════════════════════════════════════════════════════════════
-- 1) location 컬럼 추가 (없으면)
-- ═══════════════════════════════════════════════════════════════════
alter table products add column if not exists location text;

-- ═══════════════════════════════════════════════════════════════════
-- 2) 데이터 이관 · location = coalesce(display_location, spec)
--    · 빈 문자열·공백만 있으면 null
-- ═══════════════════════════════════════════════════════════════════
update products
   set location = nullif(trim(coalesce(display_location, spec)), '')
 where location is null;

-- ═══════════════════════════════════════════════════════════════════
-- 3) 이관 결과 확인 (실행 후 · 예상 · 2900+ 건 · null 아닌 값)
-- ═══════════════════════════════════════════════════════════════════
-- select
--   count(*)                                as total,
--   count(location)                         as with_location,
--   count(*) filter (where location is null) as null_location
-- from products;

-- ═══════════════════════════════════════════════════════════════════
-- 4) 스냅샷 컬럼 (롤백 안전용) · 기존 값 백업 후 원본 제거는 별도 마이그레이션
--    · 지금 단계에서는 삭제 X · 30일 안정성 확인 후 별도 파일에서 drop
-- ═══════════════════════════════════════════════════════════════════
-- alter table products rename column spec to spec_backup;              -- (지연)
-- alter table products rename column display_location to display_location_backup; -- (지연)

-- ═══════════════════════════════════════════════════════════════════
-- 5) 인덱스 (선택) · 진열위치 검색·정렬 자주 사용 시
-- ═══════════════════════════════════════════════════════════════════
-- create index if not exists idx_products_location on products (location);
