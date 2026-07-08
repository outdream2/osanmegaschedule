-- 이슈공유 게시판 · 질의사항/이슈/메모 + 댓글 + 이미지 첨부(Cloudinary URL) + 반응
-- 2026-07-08

-- 1) 게시글
CREATE TABLE IF NOT EXISTS board_posts (
  id             BIGSERIAL PRIMARY KEY,
  author_id      INT NOT NULL,
  author_name    TEXT NOT NULL,
  author_rank    TEXT,
  post_type      TEXT NOT NULL DEFAULT 'question',   -- 'question' | 'issue' | 'memo'
  title          TEXT NOT NULL,
  body           TEXT DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'open',       -- 'open' | 'in_progress' | 'resolved'
  category       TEXT,                                -- '결제' | '상품' | '손님' | '기타'
  pinned         BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at    TIMESTAMPTZ,
  resolved_by    INT,
  mentions       INT[] DEFAULT '{}',                  -- 멘션된 담당자 id 리스트
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_posts_pinned_created ON board_posts (pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_posts_status ON board_posts (status);
CREATE INDEX IF NOT EXISTS idx_board_posts_type ON board_posts (post_type);

-- 2) 이미지 첨부 (Cloudinary URL 저장)
CREATE TABLE IF NOT EXISTS board_post_images (
  id             BIGSERIAL PRIMARY KEY,
  post_id        BIGINT REFERENCES board_posts(id) ON DELETE CASCADE,
  comment_id     BIGINT,
  image_url      TEXT NOT NULL,
  public_id      TEXT,                                 -- Cloudinary public_id (삭제용)
  width          INT,
  height         INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_post_images_post ON board_post_images (post_id);
CREATE INDEX IF NOT EXISTS idx_board_post_images_comment ON board_post_images (comment_id);

-- 3) 댓글
CREATE TABLE IF NOT EXISTS board_post_comments (
  id             BIGSERIAL PRIMARY KEY,
  post_id        BIGINT REFERENCES board_posts(id) ON DELETE CASCADE,
  author_id      INT NOT NULL,
  author_name    TEXT NOT NULL,
  author_rank    TEXT,
  parent_id      BIGINT,
  body           TEXT NOT NULL,
  is_answer      BOOLEAN NOT NULL DEFAULT FALSE,     -- 원글 작성자가 채택한 답변
  mentions       INT[] DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_post_comments_post ON board_post_comments (post_id, created_at ASC);

-- 4) 반응 (👍 도움됨, 👀 확인함)
CREATE TABLE IF NOT EXISTS board_post_reactions (
  post_id        BIGINT REFERENCES board_posts(id) ON DELETE CASCADE,
  employee_id    INT NOT NULL,
  reaction       TEXT NOT NULL,                       -- 'helpful' | 'seen'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, employee_id, reaction)
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION board_posts_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_board_posts_touch ON board_posts;
CREATE TRIGGER trg_board_posts_touch
BEFORE UPDATE ON board_posts
FOR EACH ROW EXECUTE FUNCTION board_posts_touch_updated_at();
