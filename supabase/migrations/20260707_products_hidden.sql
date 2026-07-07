-- 상품 숨김 컬럼: 정보확인 창에서 숨기기 처리한 상품은 검색/발주 등 UI에서 노출 X
-- ERP xlsx 임포트는 hidden 컬럼을 갖지 않으므로, upsert 시 기존 hidden 값이 유지됨
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

-- 검색 성능 (많은 행에서 hidden=false 필터링)
CREATE INDEX IF NOT EXISTS products_hidden_idx ON products (hidden) WHERE hidden = true;
