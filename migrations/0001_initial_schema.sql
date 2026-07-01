-- Initial D1 schema for the promotion code distribution service.
--
-- promotion_codes is an unclaimed FIFO queue. When a code is issued, the
-- application copies the code into claims and deletes the queue row.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'universal' CHECK (platform IN ('ios', 'macos', 'universal', 'other')),
  redeem_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS campaigns_status_created_at_idx
  ON campaigns (status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS campaigns_slug_idx
  ON campaigns (slug);

CREATE TABLE IF NOT EXISTS promotion_codes (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  code TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS promotion_codes_campaign_code_idx
  ON promotion_codes (campaign_id, code);

CREATE UNIQUE INDEX IF NOT EXISTS promotion_codes_campaign_position_idx
  ON promotion_codes (campaign_id, position);

CREATE INDEX IF NOT EXISTS promotion_codes_fifo_idx
  ON promotion_codes (campaign_id, position);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  code_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  code TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS claims_campaign_ip_hash_idx
  ON claims (campaign_id, ip_hash);

CREATE UNIQUE INDEX IF NOT EXISTS claims_code_id_idx
  ON claims (code_id);

CREATE UNIQUE INDEX IF NOT EXISTS claims_campaign_code_idx
  ON claims (campaign_id, code);

CREATE INDEX IF NOT EXISTS claims_expires_at_idx
  ON claims (expires_at);

CREATE INDEX IF NOT EXISTS claims_campaign_claimed_at_idx
  ON claims (campaign_id, claimed_at);
