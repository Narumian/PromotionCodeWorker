import {
  addCodes,
  claimNextCode,
  cleanupExpiredClaims,
  createCampaign,
  findClaim,
  getCampaignBySlug,
  getCampaign,
  hashIp,
  deleteQueuedCodes,
  listActiveCampaigns,
  listCampaigns,
  listQueuedCodes,
  parseCampaignInput,
  parseCodesInput,
  updateCampaign,
} from "./db";
import {
  redirect,
  renderAdmin,
  renderCampaignEdit,
  renderCampaignList,
  renderLanding,
  renderRedeem,
  renderSoldOut,
  textResponse,
} from "./render";
import type { CampaignWithInventory, Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      return textResponse(message, 500);
    }
  },
};

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    await cleanupExpiredClaims(env.DB);
    return renderCampaignList(await listActiveCampaigns(env.DB));
  }

  const campaignRoute = matchCampaignRoute(url.pathname);
  if (request.method === "GET" && campaignRoute?.action === "landing") {
    await cleanupExpiredClaims(env.DB);
    const campaign = await getCampaignPage(env, campaignRoute.slug);
    return renderLanding(campaign);
  }

  if (request.method === "POST" && campaignRoute?.action === "redeem") {
    return redeem(request, env, campaignRoute.slug);
  }

  if (request.method === "GET" && campaignRoute?.action === "redeem") {
    return showExistingRedeem(request, env, campaignRoute.slug);
  }

  if (url.pathname === "/admin") {
    if (!isAdmin(request, env)) {
      return unauthorized();
    }
    return renderAdmin(await listCampaigns(env.DB), url.searchParams.get("message") ?? "");
  }

  const adminCampaignRoute = matchAdminCampaignRoute(url.pathname);
  if (request.method === "GET" && adminCampaignRoute?.action === "edit") {
    if (!isAdmin(request, env)) {
      return unauthorized();
    }
    const campaign = await getCampaign(env.DB, adminCampaignRoute.id);
    return campaign
      ? renderCampaignEdit(campaign, await listQueuedCodes(env.DB, campaign.id))
      : textResponse("Campaign not found", 404);
  }

  if (request.method === "POST" && url.pathname === "/admin/campaigns") {
    if (!isAdmin(request, env)) {
      return unauthorized();
    }
    const form = await request.formData();
    await createCampaign(env.DB, parseCampaignInput(form));
    return redirect("/admin?message=Campaign%20created");
  }

  if (request.method === "POST" && adminCampaignRoute?.action === "update") {
    if (!isAdmin(request, env)) {
      return unauthorized();
    }
    const campaign = await getCampaign(env.DB, adminCampaignRoute.id);
    if (!campaign) {
      return textResponse("Campaign not found", 404);
    }
    const form = await request.formData();
    await updateCampaign(env.DB, adminCampaignRoute.id, parseCampaignInput(form));
    return redirect("/admin?message=Campaign%20updated");
  }

  if (request.method === "POST" && adminCampaignRoute?.action === "deleteCodes") {
    if (!isAdmin(request, env)) {
      return unauthorized();
    }
    const campaign = await getCampaign(env.DB, adminCampaignRoute.id);
    if (!campaign) {
      return textResponse("Campaign not found", 404);
    }
    const form = await request.formData();
    const ids = form.getAll("codeId").filter((value): value is string => typeof value === "string");
    const deleted = await deleteQueuedCodes(env.DB, campaign.id, ids);
    return renderCampaignEdit(campaign, await listQueuedCodes(env.DB, campaign.id), `${deleted} queued codes deleted`);
  }

  if (request.method === "POST" && url.pathname === "/admin/codes") {
    if (!isAdmin(request, env)) {
      return unauthorized();
    }
    const form = await request.formData();
    await cleanupExpiredClaims(env.DB);
    const count = await addCodes(env.DB, parseCodesInput(form));
    return redirect(`/admin?message=${encodeURIComponent(`${count} codes added`)}`);
  }

  return textResponse("Not found", 404);
}

async function getCampaignPage(env: Env, slug: string): Promise<CampaignWithInventory | null> {
  const campaigns = await listActiveCampaigns(env.DB);
  return campaigns.find((campaign) => campaign.slug === slug) ?? null;
}

async function redeem(request: Request, env: Env, slug: string): Promise<Response> {
  const campaign = await getCampaignBySlug(env.DB, slug);
  if (!campaign) {
    return redirect("/");
  }
  return redeemCampaign(request, env, campaign.id);
}

async function showExistingRedeem(request: Request, env: Env, slug: string): Promise<Response> {
  const campaign = await getCampaignBySlug(env.DB, slug);
  if (!campaign) {
    return redirect("/");
  }
  return redeemCampaign(request, env, campaign.id, false);
}

async function redeemCampaign(request: Request, env: Env, campaignId: string, canAssign = true): Promise<Response> {
  await cleanupExpiredClaims(env.DB);

  const campaign = await getCampaign(env.DB, campaignId);
  if (!campaign || campaign.status !== "active") {
    return textResponse("Campaign is not available", 404);
  }

  if (!env.IP_HASH_SECRET || env.IP_HASH_SECRET.length < 32) {
    return textResponse("IP_HASH_SECRET is not configured", 500);
  }

  const ipHash = await hashIp(getClientIp(request), env.IP_HASH_SECRET);
  const existing = await findClaim(env.DB, campaignId, ipHash);
  if (existing) {
    return renderRedeem("already_claimed", campaign, existing);
  }

  if (!canAssign) {
    return redirect("/");
  }

  const claim = await claimNextCode(env.DB, campaignId, ipHash);
  if (!claim) {
    return renderSoldOut(campaign.name);
  }

  return renderRedeem("assigned", campaign, claim);
}

function isAdmin(request: Request, env: Env): boolean {
  const expected = env.ADMIN_TOKEN;
  if (!expected) {
    return false;
  }

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length) === expected;
  }
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice("Basic ".length));
      const separator = decoded.indexOf(":");
      const password = separator >= 0 ? decoded.slice(separator + 1) : "";
      return password === expected;
    } catch {
      return false;
    }
  }

  return false;
}

function unauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "www-authenticate": 'Basic realm="Promotion Admin", Bearer',
    },
  });
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "0.0.0.0"
  );
}

function readFormText(form: FormData, name: string): string {
  const value = form.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function matchCampaignRoute(pathname: string): { slug: string; action: "landing" | "redeem" } | null {
  const match = pathname.match(/^\/c\/([^/]+)(?:\/(redeem))?$/);
  if (!match) {
    return null;
  }
  return {
    slug: decodeURIComponent(match[1]),
    action: match[2] === "redeem" ? "redeem" : "landing",
  };
}

function matchAdminCampaignRoute(pathname: string): { id: string; action: "edit" | "update" | "deleteCodes" } | null {
  const editMatch = pathname.match(/^\/admin\/campaigns\/([^/]+)\/edit$/);
  if (editMatch) {
    return { id: decodeURIComponent(editMatch[1]), action: "edit" };
  }

  const deleteCodesMatch = pathname.match(/^\/admin\/campaigns\/([^/]+)\/codes\/delete$/);
  if (deleteCodesMatch) {
    return { id: decodeURIComponent(deleteCodesMatch[1]), action: "deleteCodes" };
  }

  const updateMatch = pathname.match(/^\/admin\/campaigns\/([^/]+)$/);
  if (updateMatch) {
    return { id: decodeURIComponent(updateMatch[1]), action: "update" };
  }

  return null;
}
