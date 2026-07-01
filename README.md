# Promotion Code Worker

Cloudflare Workers + D1 coupon distribution service.

## Behavior

- One claim per campaign per IP hash for 90 days.
- Codes are issued FIFO from `promotion_codes`.
- Issued codes are copied to `claims` and then removed from the queue.
- Repeat visits from the same IP read `claims` and show the previously issued code.
- Browser localStorage is used only to make the landing page friendlier; D1 remains authoritative.
- `/` lists active campaigns; each campaign page lives at `/c/:slug`.

## Development

```sh
npm install
npm run dev
```

Create a D1 database and replace `database_id` in `wrangler.toml`.

Set secrets:

```sh
wrangler secret put ADMIN_TOKEN
wrangler secret put IP_HASH_SECRET
```

Open `/admin` with Basic auth. The username can be anything; the password is
`ADMIN_TOKEN`. Command-line clients can also use `Authorization: Bearer`.

Apply migrations:

```sh
wrangler d1 migrations apply promotion-code-worker --local
wrangler d1 migrations apply promotion-code-worker --remote
```
