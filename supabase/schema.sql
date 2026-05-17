-- Run in Supabase SQL Editor (safe to re-run with IF NOT EXISTS)

-- Saved spots (favorites)
CREATE TABLE IF NOT EXISTS saved_spots (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spot_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, spot_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_spots_user ON saved_spots(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_spots_spot ON saved_spots(spot_id);

-- Comments per spot (separate from star reviews if you use both)
CREATE TABLE IF NOT EXISTS spot_comments (
  id BIGSERIAL PRIMARY KEY,
  spot_id BIGINT NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spot_comments_spot ON spot_comments(spot_id, created_at DESC);

-- Optional: ensure reviews table has created_at for sorting
-- ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
