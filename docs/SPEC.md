# Promotion Code Worker Spec

## Goal

Build a small Cloudflare Workers + D1 service that distributes promotion codes
within the free-tier-friendly shape: one Worker, one D1 database, small HTML
responses, and no long-lived server process.

## Claim Rule

- A visitor can claim one code per campaign per IP hash.
- The server hashes the client IP with `IP_HASH_SECRET`; raw IP addresses are
  not stored.
- The D1 `claims` table is authoritative. Browser localStorage is only a UI
  shortcut on the landing page.
- A claim expires after 90 days. When it expires and is deleted, the same IP can
  claim again if the campaign still has queued codes.

## Code Queue

- `promotion_codes` stores only unclaimed codes.
- Codes are issued FIFO by ascending `position`.
- On a successful claim, the chosen row is copied into `claims` and then deleted
  from `promotion_codes`.
- Old issued codes do not need permanent storage. They only remain in `claims`
  until the 90-day expiry so repeat visits can show the same code.

## Claim Storage

`claims` stores:

- `campaign_id`
- `code_id`
- `ip_hash`
- `code`
- `claimed_at`
- `expires_at`

The important constraints are:

- `UNIQUE(campaign_id, ip_hash)` to prevent repeat claims during the active
  claim window.
- `UNIQUE(code_id)` to prevent the same queue row being copied into multiple
  claims under concurrent requests.
- `UNIQUE(campaign_id, code)` on active claims to prevent an issued code from
  being re-added while it is still redisplayable.

## UI

- `/` shows active campaigns.
- `/c/:slug` shows one campaign, description, remaining queue count, and redeem
  button.
- The campaign landing page checks localStorage for a campaign-specific cached
  claim and shows it if present.
- `/c/:slug/redeem` shows the assigned code, a copy button, and an App Store
  redeem link.
- If the IP has already claimed, `/c/:slug/redeem` shows the existing claim code
  with a warning instead of issuing a new code.

## Admin

- `/admin` is protected by `ADMIN_TOKEN`.
- Admin auth uses `Authorization` (`Basic` in a browser, or `Bearer` for tools).
- Admin can create campaigns and bulk-add one code per line.
- Campaigns have URL slugs and are publicly reachable at `/c/:slug`.
- Earlier lines receive lower FIFO positions.

## Expiry

Expired claims are removed with:

```sql
DELETE FROM claims WHERE expires_at <= ?;
```

The current implementation runs cleanup opportunistically on public page and
redeem requests. A scheduled Worker can be added later if needed.
