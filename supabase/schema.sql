-- Run in Supabase SQL Editor. Safe to re-run.
-- FinBlasti production uses the existing spots, users, auth_codes, and reviews tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));

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
-- Current display name comes from users.name through reviews.user_id.
-- user_name / author_name stay as legacy fallbacks for old rows.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS author_name TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS text TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS rating INTEGER DEFAULT 5;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_spot_id ON reviews(spot_id);
