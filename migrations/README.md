# D1 Schema Notes

`promotion_codes` is only the unclaimed FIFO queue. Claiming a code should copy
the selected `code` into `claims`, then delete the `promotion_codes` row in the
same logical operation.

FIFO selection:

```sql
SELECT id, code
FROM promotion_codes
WHERE campaign_id = ?
ORDER BY position ASC
LIMIT 1;
```

Existing claim lookup:

```sql
SELECT code, claimed_at, expires_at
FROM claims
WHERE campaign_id = ?
  AND ip_hash = ?
LIMIT 1;
```

Claiming should copy `promotion_codes.id` into `claims.code_id`, copy
`promotion_codes.code` into `claims.code`, and then delete the queue row by
`code_id`.

Expired claims can be removed by a scheduled Worker:

```sql
DELETE FROM claims
WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
```

Claims expire after 90 days. The application should set `expires_at` when
inserting a claim, for example by adding 90 days to the claim time.
