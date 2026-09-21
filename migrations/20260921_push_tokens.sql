-- 20260921_push_tokens.sql
-- #328 · iOS 앱 Expo 푸시 알림 · 토큰 저장 테이블
-- 2026-09-21 · 사용자 지시 · WebView 앱 v1.0.1 · 앱 개발자 가이드 수령
--
-- 목적:
--   · Expo Push Token (ExponentPushToken[xxxx]) · user_id 별 저장
--   · 다중 디바이스 지원 · UNIQUE token + user_id FK
--   · DeviceNotRegistered 응답 시 active=false 로 마킹 (soft-delete)
--
-- 안전:
--   · CREATE IF NOT EXISTS · 파괴적 X
--   · FK ON DELETE CASCADE · 직원 삭제 시 토큰 자동 정리
--   · token UNIQUE · 앱 재설치 시 재할당 upsert (다른 user 였으면 소유권 이전)
--
-- ⚠️  Supabase SQL Editor 에서 직접 실행 (대원칙 · 파괴적 SQL X · IF NOT EXISTS 안전)

CREATE TABLE IF NOT EXISTS push_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON push_tokens (user_id, active);

CREATE INDEX IF NOT EXISTS idx_push_tokens_token
  ON push_tokens (token);

-- 검증
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'push_tokens';
