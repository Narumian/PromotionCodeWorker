-- Add public URL slugs for per-campaign pages.

ALTER TABLE campaigns ADD COLUMN slug TEXT;

UPDATE campaigns
SET slug = id
WHERE slug IS NULL OR slug = '';

CREATE UNIQUE INDEX IF NOT EXISTS campaigns_slug_idx
  ON campaigns (slug);
