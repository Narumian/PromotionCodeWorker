export type CampaignId = string;
export type CodeId = string;
export type ClaimId = string;

export type ISODateTimeString = string;
export type IPHash = string;
export type PromotionCodeValue = string;

export type Platform = "ios" | "macos" | "universal" | "other";

export type CampaignStatus = "draft" | "active" | "paused" | "ended";

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta: Record<string, unknown>;
  error?: string;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
  IP_HASH_SECRET: string;
}

export interface Campaign {
  id: CampaignId;
  slug: string;
  name: string;
  description: string;
  platform: Platform;
  status: CampaignStatus;
  redeemUrl: string | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface PromotionCode {
  id: CodeId;
  campaignId: CampaignId;
  code: PromotionCodeValue;
  position: number;
  createdAt: ISODateTimeString;
}

export interface Claim {
  id: ClaimId;
  campaignId: CampaignId;
  codeId: CodeId;
  ipHash: IPHash;
  code: PromotionCodeValue;
  claimedAt: ISODateTimeString;
  expiresAt: ISODateTimeString;
}

export interface CampaignRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  platform: Platform;
  status: CampaignStatus;
  redeem_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromotionCodeRow {
  id: string;
  campaign_id: string;
  code: string;
  position: number;
  created_at: string;
}

export interface ClaimRow {
  id: string;
  campaign_id: string;
  code_id: string;
  ip_hash: string;
  code: string;
  claimed_at: string;
  expires_at: string;
}

export interface CampaignWithInventory extends Campaign {
  totalCodes: number;
  remainingCodes: number;
}

export interface NewCampaignInput {
  slug: string;
  name: string;
  description: string;
  platform: Platform;
  redeemUrl?: string | null;
  status?: CampaignStatus;
}

export interface AddCodesInput {
  campaignId: CampaignId;
  codes: PromotionCodeValue[];
}

export interface RedeemRequest {
  campaignId: CampaignId;
  ipAddress: string;
  userAgent: string | null;
}

export interface CachedClaim {
  campaignId: CampaignId;
  campaignName: string;
  code: PromotionCodeValue;
  redeemUrl: string | null;
  claimedAt: ISODateTimeString;
  expiresAt: ISODateTimeString;
}

export interface LandingPageState {
  campaign: CampaignWithInventory;
  cachedClaim: CachedClaim | null;
}

export type RedeemResult =
  | {
      kind: "assigned";
      campaign: Campaign;
      claim: Claim;
      redeemUrl: string | null;
    }
  | {
      kind: "already_claimed";
      campaign: Campaign;
      claim: Claim;
      redeemUrl: string | null;
    }
  | {
      kind: "sold_out";
      campaign: Campaign;
    }
  | {
      kind: "campaign_unavailable";
      reason: "not_found" | "not_active";
    };

export interface AdminSession {
  authenticated: boolean;
}

export interface PageMeta {
  title: string;
  canonicalUrl?: string;
}
