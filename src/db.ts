import type {
  AddCodesInput,
  Campaign,
  CampaignRow,
  CampaignStatus,
  CampaignWithInventory,
  Claim,
  ClaimRow,
  D1Database,
  IPHash,
  NewCampaignInput,
  Platform,
  PromotionCode,
  PromotionCodeRow,
} from "./types";

const CLAIM_TTL_DAYS = 90;

export function nowIso(): string {
  return new Date().toISOString();
}

export function addDaysIso(base: Date, days: number): string {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function hashIp(ipAddress: string, secret: string): Promise<IPHash> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(ipAddress));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function cleanupExpiredClaims(db: D1Database, at = nowIso()): Promise<void> {
  await db.prepare("DELETE FROM claims WHERE expires_at <= ?").bind(at).run();
}

export async function getActiveCampaign(db: D1Database): Promise<CampaignWithInventory | null> {
  const row = await db
    .prepare(
      `SELECT
        c.*,
        COUNT(pc.id) AS remaining_codes
      FROM campaigns c
      LEFT JOIN promotion_codes pc ON pc.campaign_id = c.id
      WHERE c.status = 'active'
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 1`,
    )
    .first<CampaignRow & { remaining_codes: number }>();

  if (!row) {
    return null;
  }

  return {
    ...mapCampaign(row),
    totalCodes: row.remaining_codes,
    remainingCodes: row.remaining_codes,
  };
}

export async function listActiveCampaigns(db: D1Database): Promise<CampaignWithInventory[]> {
  const result = await db
    .prepare(
      `SELECT
        c.*,
        COUNT(pc.id) AS remaining_codes
      FROM campaigns c
      LEFT JOIN promotion_codes pc ON pc.campaign_id = c.id
      WHERE c.status = 'active'
      GROUP BY c.id
      ORDER BY c.created_at DESC`,
    )
    .all<CampaignRow & { remaining_codes: number }>();

  return (result.results ?? []).map((row) => ({
    ...mapCampaign(row),
    totalCodes: row.remaining_codes,
    remainingCodes: row.remaining_codes,
  }));
}

export async function getCampaign(db: D1Database, campaignId: string): Promise<Campaign | null> {
  const row = await db.prepare("SELECT * FROM campaigns WHERE id = ? LIMIT 1").bind(campaignId).first<CampaignRow>();
  return row ? mapCampaign(row) : null;
}

export async function getCampaignBySlug(db: D1Database, slug: string): Promise<Campaign | null> {
  const row = await db.prepare("SELECT * FROM campaigns WHERE slug = ? LIMIT 1").bind(slug).first<CampaignRow>();
  return row ? mapCampaign(row) : null;
}

export async function getActiveCampaignBySlug(db: D1Database, slug: string): Promise<CampaignWithInventory | null> {
  const row = await db
    .prepare(
      `SELECT
        c.*,
        COUNT(pc.id) AS remaining_codes
      FROM campaigns c
      LEFT JOIN promotion_codes pc ON pc.campaign_id = c.id
      WHERE c.slug = ?
        AND c.status = 'active'
      GROUP BY c.id
      LIMIT 1`,
    )
    .bind(slug)
    .first<CampaignRow & { remaining_codes: number }>();

  if (!row) {
    return null;
  }

  return {
    ...mapCampaign(row),
    totalCodes: row.remaining_codes,
    remainingCodes: row.remaining_codes,
  };
}

export async function listCampaigns(db: D1Database): Promise<CampaignWithInventory[]> {
  const result = await db
    .prepare(
      `SELECT
        c.*,
        COUNT(pc.id) AS remaining_codes
      FROM campaigns c
      LEFT JOIN promotion_codes pc ON pc.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC`,
    )
    .all<CampaignRow & { remaining_codes: number }>();

  return (result.results ?? []).map((row) => ({
    ...mapCampaign(row),
    totalCodes: row.remaining_codes,
    remainingCodes: row.remaining_codes,
  }));
}

export async function createCampaign(db: D1Database, input: NewCampaignInput): Promise<Campaign> {
  const id = createId("camp");
  const at = nowIso();
  const status = input.status ?? "draft";

  await db
    .prepare(
      `INSERT INTO campaigns (id, slug, name, description, platform, status, redeem_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.slug, input.name, input.description, input.platform, status, input.redeemUrl ?? null, at, at)
    .run();

  return {
    id,
    slug: input.slug,
    name: input.name,
    description: input.description,
    platform: input.platform,
    status,
    redeemUrl: input.redeemUrl ?? null,
    createdAt: at,
    updatedAt: at,
  };
}

export async function updateCampaign(db: D1Database, campaignId: string, input: NewCampaignInput): Promise<void> {
  await db
    .prepare(
      `UPDATE campaigns
       SET slug = ?,
           name = ?,
           description = ?,
           platform = ?,
           status = ?,
           redeem_url = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      input.slug,
      input.name,
      input.description,
      input.platform,
      input.status ?? "draft",
      input.redeemUrl ?? null,
      nowIso(),
      campaignId,
    )
    .run();
}

export async function listQueuedCodes(db: D1Database, campaignId: string): Promise<PromotionCode[]> {
  const result = await db
    .prepare(
      `SELECT *
       FROM promotion_codes
       WHERE campaign_id = ?
       ORDER BY position ASC`,
    )
    .bind(campaignId)
    .all<PromotionCodeRow>();

  return (result.results ?? []).map(mapPromotionCode);
}

export async function deleteQueuedCodes(db: D1Database, campaignId: string, codeIds: string[]): Promise<number> {
  const ids = [...new Set(codeIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return 0;
  }

  const results = await db.batch(
    ids.map((id) =>
      db.prepare("DELETE FROM promotion_codes WHERE campaign_id = ? AND id = ?").bind(campaignId, id),
    ),
  );

  return results.reduce((count, result) => count + Number(result.meta["changes"] ?? 0), 0);
}

export async function addCodes(db: D1Database, input: AddCodesInput): Promise<number> {
  const normalized = uniqueCodes(input.codes);
  if (normalized.length === 0) {
    return 0;
  }

  let inserted = 0;

  for (const code of normalized) {
    if (await insertCodeAtQueueTail(db, input.campaignId, code)) {
      inserted += 1;
    }
  }

  return inserted;
}

export async function findClaim(db: D1Database, campaignId: string, ipHash: IPHash): Promise<Claim | null> {
  const row = await db
    .prepare(
      `SELECT *
       FROM claims
       WHERE campaign_id = ?
         AND ip_hash = ?
         AND expires_at > ?
       LIMIT 1`,
    )
    .bind(campaignId, ipHash, nowIso())
    .first<ClaimRow>();

  return row ? mapClaim(row) : null;
}

export async function claimNextCode(db: D1Database, campaignId: string, ipHash: IPHash): Promise<Claim | null> {
  const existing = await findClaim(db, campaignId, ipHash);
  if (existing) {
    return existing;
  }

  await deleteClaimedQueueRows(db, campaignId);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const issuedAt = new Date();
    const claimId = createId("claim");
    const claimedAt = issuedAt.toISOString();
    const expiresAt = addDaysIso(issuedAt, CLAIM_TTL_DAYS);

    const inserted = await db
      .prepare(
        `INSERT OR IGNORE INTO claims (id, campaign_id, code_id, ip_hash, code, claimed_at, expires_at)
         SELECT ?, campaign_id, id, ?, code, ?, ?
         FROM promotion_codes
         WHERE campaign_id = ?
         ORDER BY position ASC
         LIMIT 1
         RETURNING *`,
      )
      .bind(claimId, ipHash, claimedAt, expiresAt, campaignId)
      .first<ClaimRow>();

    if (inserted) {
      await db.prepare("DELETE FROM promotion_codes WHERE id = ?").bind(inserted.code_id).run();
      return mapClaim(inserted);
    }

    await deleteClaimedQueueRows(db, campaignId);

    const racedClaim = await findClaim(db, campaignId, ipHash);
    if (racedClaim) {
      return racedClaim;
    }
  }

  return null;
}

async function insertCodeAtQueueTail(db: D1Database, campaignId: string, code: string): Promise<boolean> {
  if (await codeExists(db, campaignId, code)) {
    return false;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const maxPosition = await db
      .prepare("SELECT COALESCE(MAX(position), 0) AS position FROM promotion_codes WHERE campaign_id = ?")
      .bind(campaignId)
      .first<number>("position");
    const position = Number(maxPosition ?? 0) + 1;

    const result = await db
      .prepare(
        `INSERT OR IGNORE INTO promotion_codes (id, campaign_id, code, position, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(createId("code"), campaignId, code, position, nowIso())
      .run();

    if (Number(result.meta["changes"] ?? 0) > 0) {
      return true;
    }

    if (await codeExists(db, campaignId, code)) {
      return false;
    }
  }

  return false;
}

async function codeExists(db: D1Database, campaignId: string, code: string): Promise<boolean> {
  const duplicate = await db
    .prepare(
      `SELECT id FROM promotion_codes WHERE campaign_id = ? AND code = ?
       UNION ALL
       SELECT id FROM claims WHERE campaign_id = ? AND code = ?
       LIMIT 1`,
    )
    .bind(campaignId, code, campaignId, code)
    .first<string>("id");
  return Boolean(duplicate);
}

async function deleteClaimedQueueRows(db: D1Database, campaignId: string): Promise<void> {
  await db
    .prepare(
      `DELETE FROM promotion_codes
       WHERE campaign_id = ?
         AND id IN (SELECT code_id FROM claims WHERE campaign_id = ?)`,
    )
    .bind(campaignId, campaignId)
    .run();
}

export function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    platform: row.platform,
    status: row.status,
    redeemUrl: row.redeem_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapClaim(row: ClaimRow): Claim {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    codeId: row.code_id,
    ipHash: row.ip_hash,
    code: row.code,
    claimedAt: row.claimed_at,
    expiresAt: row.expires_at,
  };
}

export function mapPromotionCode(row: PromotionCodeRow): PromotionCode {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    code: row.code,
    position: row.position,
    createdAt: row.created_at,
  };
}

export function parseCampaignInput(form: FormData): NewCampaignInput {
  const status = readEnum<CampaignStatus>(form.get("status"), ["draft", "active", "paused", "ended"], "draft");
  const platform = readEnum<Platform>(form.get("platform"), ["ios", "macos", "universal", "other"], "universal");
  const redeemUrl = readText(form.get("redeemUrl"));

  return {
    slug: normalizeSlug(requireText(form.get("slug"), "Slug is required")),
    name: requireText(form.get("name"), "Campaign name is required"),
    description: requireText(form.get("description"), "Description is required"),
    platform,
    status,
    redeemUrl: redeemUrl || null,
  };
}

export function normalizeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error("Slug must contain letters or numbers");
  }

  return slug;
}


export function parseCodesInput(form: FormData): AddCodesInput {
  return {
    campaignId: requireText(form.get("campaignId"), "Campaign is required"),
    codes: readText(form.get("codes")).split(/\r?\n/),
  };
}

function uniqueCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawCode of codes) {
    const code = rawCode.trim();
    if (!code || seen.has(code)) {
      continue;
    }
    seen.add(code);
    result.push(code);
  }

  return result;
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireText(value: unknown, message: string): string {
  const text = readText(value);
  if (!text) {
    throw new Error(message);
  }
  return text;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== "string") {
    return fallback;
  }
  return allowed.includes(value as T) ? (value as T) : fallback;
}
