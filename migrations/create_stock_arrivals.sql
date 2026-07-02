-- 입고 알림 이벤트
create table if not exists stock_arrivals (
  id          bigserial primary key,
  title       text not null,
  body        text,
  created_by_id bigint references employees(id) on delete set null,
  created_at  timestamptz default now()
);

-- 비로그인 사용자 웹 푸시 구독
create table if not exists anon_push_subscriptions (
  id           bigserial primary key,
  endpoint     text not null unique,
  subscription jsonb not null,
  created_at   timestamptz default now()
);
