-- 2026-08-27 · 사용자 지시 · 엑셀 데이터 그대로 DB 반영
--   · current_stock 이 텍스트 ("묶음상품" · "최고할증" · "1박스(200포)" 등) 이면
--   · normalizeNumber → null 처리 · 데이터 손실 방지 위해 stock_note 컬럼 추가
--   · 실행 환경 · Supabase Dashboard > SQL Editor
--
-- 사용:
--   재임포트 시 · numeric 값은 current_stock 에 · 텍스트 값은 stock_note 에 자동 저장

alter table products add column if not exists stock_note text;

-- 확인 · 이관 대상 수
-- select count(*) from products where stock_note is not null;
