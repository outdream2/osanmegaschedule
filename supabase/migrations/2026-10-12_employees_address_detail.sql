-- 2026-10-12 · 사용자 지시 "주소. 상세주소창으로 만들어서" · 주소 분리 완전 지원
--
-- 배경:
--   현재 employees.address 1 column 에 UI 2 input (주소 + 상세주소) 을 concat 저장 중.
--   재조회 시 split 어렵고 edit 시 상세주소 유실 가능성.
--   address_detail 신규 column 추가 → UI 2 field ↔ DB 2 column 1:1 매핑.
--
-- 비파괴 변경 (ADD COLUMN · nullable · default null):
--   · 기존 row 영향 X · address_detail = NULL 로 생성
--   · 서버 PATCH 가 address_detail 받아 저장 가능 (추후 UI 수정)
--
-- 선후 작업:
--   1. (지금) 이 migration 실행 · address_detail column 추가
--   2. (다음) EmployeeInfoPanel save payload 분리 · address_detail 저장
--   3. (다음) EmployeeUpdatePayload type · employee API 에 address_detail 추가
--   4. (다음) 과거 address 에 섞인 상세주소 수동 split (optional)

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS address_detail TEXT;

-- 확인
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'employees' AND column_name LIKE 'address%';
