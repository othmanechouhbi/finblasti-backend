-- Run in Supabase SQL Editor. Safe to re-run.
-- FinBlasti production uses the existing spots, users, auth_codes, and reviews tables.

CREATE TABLE IF NOT EXISTS favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  spot_id BIGINT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, spot_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_spot ON favorites(spot_id);

-- Comments are stored in the existing reviews table.
-- This app expects at least: id, spot_id, user_name, text, rating, created_at.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
