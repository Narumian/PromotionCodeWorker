import type { Campaign, CampaignWithInventory, Claim, PageMeta, PromotionCode } from "./types";

const STORE_REDEEM_URL = "https://apps.apple.com/redeem";

export function renderCampaignList(campaigns: CampaignWithInventory[]): Response {
  const body =
    campaigns.length > 0
      ? `<main class="admin-shell">
          <h1>Campaigns</h1>
          <section class="campaign-list">
            ${campaigns
              .map(
                (campaign) =>
                  `<a class="campaign-row" href="/c/${escapeHtml(campaign.slug)}">
                    <span>
                      <strong>${escapeHtml(campaign.name)}</strong>
                      <small>${escapeHtml(campaign.description)}</small>
                    </span>
                    <span>${campaign.remainingCodes > 0 ? `${campaign.remainingCodes} codes` : "Sold out"}</span>
                  </a>`,
              )
              .join("")}
          </section>
        </main>`
      : `<main class="shell"><section class="hero"><h1>No active campaigns</h1><p class="lede">Create and activate a campaign from the admin screen.</p></section></main>`;

  return htmlResponse(layout({ title: "Promotion Campaigns" }, body));
}

export function renderLanding(campaign: CampaignWithInventory | null): Response {
  const body = campaign
      ? `<main class="shell">
        <section class="hero">
          <p class="eyebrow">${escapeHtml(platformLabel(campaign.platform))}</p>
          <h1>${escapeHtml(campaign.name)}</h1>
          <p class="lede">${escapeHtml(campaign.description)}</p>
          <div id="redeem-action">
            <div class="inventory">
              <span>${campaign.remainingCodes > 0 ? `${campaign.remainingCodes} codes available` : "No codes available"}</span>
            </div>
            <form method="post" action="/c/${escapeHtml(campaign.slug)}/redeem">
              <input type="hidden" name="campaignId" value="${escapeHtml(campaign.id)}">
              <button type="submit" ${campaign.remainingCodes <= 0 ? "disabled" : ""}>Redeem code</button>
            </form>
          </div>
          <div id="cached-claim" class="cached" hidden></div>
        </section>
      </main>
      <script>
        const campaignId = ${JSON.stringify(campaign.id)};
        const cached = readClaimCache(campaignId);
        const target = document.getElementById("cached-claim");
        if (cached && target) {
          target.hidden = false;
          document.getElementById("redeem-action")?.setAttribute("hidden", "");
          const note = document.createElement("p");
          note.className = "notice";
          note.textContent = "You already saved a code for this campaign.";
          const code = document.createElement("code");
          code.textContent = cached.code;
          target.append(note, code);
          if (cached.redeemUrl) {
            const link = document.createElement("a");
            link.className = "secondary";
            link.href = cached.redeemUrl;
            link.textContent = "Open redeem page";
            target.append(link);
          }
        }
        function readClaimCache(id) {
          try {
            const raw = localStorage.getItem("promotion-code-claim:" + id);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed.expiresAt || Date.parse(parsed.expiresAt) <= Date.now()) {
              localStorage.removeItem("promotion-code-claim:" + id);
              return null;
            }
            return parsed;
          } catch {
            return null;
          }
        }
      </script>`
    : `<main class="shell"><section class="hero"><h1>No active campaign</h1><p class="lede">Create and activate a campaign from the admin screen.</p></section></main>`;

  return htmlResponse(layout({ title: campaign?.name ?? "Promotion Code" }, body));
}

export function renderRedeem(kind: "assigned" | "already_claimed", campaign: Campaign, claim: Claim): Response {
  const message =
    kind === "assigned"
      ? "This code has been assigned to you."
      : "Your code is ready.";

  const cachePayload = {
    campaignId: claim.campaignId,
    campaignName: campaign.name,
    code: claim.code,
    redeemUrl: buildRedeemUrl(campaign.redeemUrl, claim.code),
    claimedAt: claim.claimedAt,
    expiresAt: claim.expiresAt,
  };
  const redeemHref = buildRedeemUrl(campaign.redeemUrl, claim.code);

  return htmlResponse(
    layout(
      { title: "Redeem Code" },
      `<main class="shell">
        <section class="redeem">
          <p class="notice">${escapeHtml(message)}</p>
          <h1>${escapeHtml(campaign.name)}</h1>
          <button class="code" type="button" data-copy="${escapeHtml(claim.code)}">${escapeHtml(claim.code)}</button>
          <div class="actions">
            <button type="button" id="copy-code">Copy</button>
            <a class="secondary" href="${escapeHtml(redeemHref)}">Open redeem page</a>
          </div>
          <p class="meta">Use this code soon. Promotion code availability may depend on the store.</p>
          <a class="text-link" href="/">Back</a>
        </section>
      </main>
      <script>
        localStorage.setItem("promotion-code-claim:${escapeJs(claim.campaignId)}", ${JSON.stringify(JSON.stringify(cachePayload))});
        const copyButton = document.getElementById("copy-code");
        const codeButton = document.querySelector("[data-copy]");
        copyButton?.addEventListener("click", async () => {
          const code = codeButton?.getAttribute("data-copy") || "";
          await navigator.clipboard?.writeText(code);
          copyButton.textContent = "Copied";
        });
      </script>`,
    ),
  );
}

export function renderSoldOut(campaignName: string): Response {
  return htmlResponse(
    layout(
      { title: "Sold Out" },
      `<main class="shell"><section class="redeem"><h1>${escapeHtml(campaignName)}</h1><p class="notice">All codes have been claimed.</p><a class="text-link" href="/">Back</a></section></main>`,
    ),
  );
}

export function renderAdmin(campaigns: CampaignWithInventory[], message = ""): Response {
  const options = campaigns
    .map((campaign) => `<option value="${escapeHtml(campaign.id)}">${escapeHtml(campaign.name)}</option>`)
    .join("");
  const rows = campaigns
    .map(
      (campaign) =>
        `<tr><td><a href="/c/${escapeHtml(campaign.slug)}">${escapeHtml(campaign.name)}</a></td><td>${escapeHtml(campaign.slug)}</td><td>${escapeHtml(campaign.status)}</td><td>${campaign.remainingCodes}</td><td>${escapeHtml(campaign.platform)}</td><td><a href="/admin/campaigns/${escapeHtml(campaign.id)}/edit">Edit</a></td></tr>`,
    )
    .join("");

  return htmlResponse(
    layout(
      { title: "Admin" },
      `<main class="admin-shell">
        <h1>Promotion Admin</h1>
        ${message ? `<p class="notice">${escapeHtml(message)}</p>` : ""}
        <section class="panel">
          <h2>Create campaign</h2>
          <form method="post" action="/admin/campaigns">
            <label>Slug<input name="slug" required pattern="[A-Za-z0-9][A-Za-z0-9_-]*" placeholder="ios-launch"></label>
            <label>Name<input name="name" required></label>
            <label>Description<textarea name="description" required></textarea></label>
            <label>Platform<select name="platform"><option value="universal">Universal</option><option value="ios">iOS</option><option value="macos">macOS</option><option value="other">Other</option></select></label>
            <label>Status<select name="status"><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option></select></label>
            <label>Redeem URL<input name="redeemUrl" type="url" placeholder="${STORE_REDEEM_URL}"></label>
            <button>Create</button>
          </form>
        </section>
        <section class="panel">
          <h2>Add codes</h2>
          <form method="post" action="/admin/codes">
            <label>Campaign<select name="campaignId" required>${options}</select></label>
            <label>Codes<textarea name="codes" required placeholder="ONE-CODE-PER-LINE"></textarea></label>
            <button>Add codes</button>
          </form>
        </section>
        <section class="panel">
          <h2>Campaigns</h2>
          <table><thead><tr><th>Name</th><th>Slug</th><th>Status</th><th>Queue</th><th>Platform</th><th></th></tr></thead><tbody>${rows}</tbody></table>
        </section>
      </main>`,
    ),
  );
}

export function renderCampaignEdit(campaign: Campaign, queuedCodes: PromotionCode[], message = ""): Response {
  const codeRows = queuedCodes
    .map(
      (code) =>
        `<tr>
          <td><input type="checkbox" name="codeId" value="${escapeHtml(code.id)}" aria-label="Select ${escapeHtml(code.code)}"></td>
          <td>${code.position}</td>
          <td><code>${escapeHtml(code.code)}</code></td>
          <td>${escapeHtml(new Date(code.createdAt).toLocaleString("en-US"))}</td>
        </tr>`,
    )
    .join("");

  return htmlResponse(
    layout(
      { title: `Edit ${campaign.name}` },
      `<main class="admin-shell">
        <h1>Edit Campaign</h1>
        ${message ? `<p class="notice">${escapeHtml(message)}</p>` : ""}
        <section class="panel">
          <form method="post" action="/admin/campaigns/${escapeHtml(campaign.id)}">
            <label>Slug<input name="slug" required pattern="[A-Za-z0-9][A-Za-z0-9_-]*" value="${escapeHtml(campaign.slug)}"></label>
            <label>Name<input name="name" required value="${escapeHtml(campaign.name)}"></label>
            <label>Description<textarea name="description" required>${escapeHtml(campaign.description)}</textarea></label>
            <label>Platform${renderPlatformSelect(campaign.platform)}</label>
            <label>Status${renderStatusSelect(campaign.status)}</label>
            <label>Redeem URL<input name="redeemUrl" type="url" value="${escapeHtml(campaign.redeemUrl ?? "")}" placeholder="${STORE_REDEEM_URL}"></label>
            <button>Save</button>
          </form>
        </section>
        <section class="panel">
          <h2>Queued Codes</h2>
          <form method="post" action="/admin/campaigns/${escapeHtml(campaign.id)}/codes/delete">
            <div class="table-actions">
              <label class="inline"><input type="checkbox" id="select-all-codes"> Select all</label>
              <button type="submit" ${queuedCodes.length === 0 ? "disabled" : ""}>Delete selected</button>
            </div>
            <table>
              <thead><tr><th></th><th>Position</th><th>Code</th><th>Added</th></tr></thead>
              <tbody>${codeRows || `<tr><td colspan="4">No queued codes.</td></tr>`}</tbody>
            </table>
          </form>
        </section>
        <a class="text-link" href="/admin">Back to admin</a>
      </main>`,
    ),
  );
}

export function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export function textResponse(message: string, status = 200): Response {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function layout(meta: PageMeta, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(meta.title)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7f9; color: #17202a; }
    body { margin: 0; min-height: 100vh; }
    button, input, textarea, select { font: inherit; }
    .shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
    .hero, .redeem { width: min(100%, 680px); }
    .eyebrow { color: #52616f; font-weight: 700; text-transform: uppercase; font-size: 13px; letter-spacing: 0; }
    h1 { font-size: clamp(38px, 7vw, 74px); line-height: 0.96; margin: 0 0 18px; letter-spacing: 0; }
    .lede { font-size: 20px; line-height: 1.55; color: #35424f; margin: 0 0 28px; }
    .inventory, .notice, .meta { color: #52616f; margin: 16px 0; }
    form { display: grid; gap: 14px; }
    label { display: grid; gap: 7px; color: #35424f; font-weight: 700; }
    input, textarea, select { width: 100%; box-sizing: border-box; border: 1px solid #c8d0d8; border-radius: 8px; padding: 11px 12px; background: white; color: #17202a; }
    textarea { min-height: 120px; resize: vertical; }
    button, .secondary { min-height: 44px; border: 0; border-radius: 8px; padding: 0 18px; background: #0b6bcb; color: white; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
    button:disabled { background: #9aa7b2; cursor: not-allowed; }
    .secondary { background: #17202a; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
    .code { width: 100%; min-height: 72px; background: white; color: #17202a; border: 1px solid #c8d0d8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(22px, 6vw, 42px); overflow-wrap: anywhere; }
    .cached { margin-top: 24px; padding-top: 20px; border-top: 1px solid #d8dde3; display: grid; gap: 12px; }
    .cached code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 22px; overflow-wrap: anywhere; }
    .text-link { color: #0b6bcb; font-weight: 800; display: inline-block; margin-top: 24px; }
    .admin-shell { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0; display: grid; gap: 20px; }
    .admin-shell h1 { font-size: 40px; line-height: 1.05; }
    .panel { background: white; border: 1px solid #d8dde3; border-radius: 8px; padding: 18px; }
    .panel h2 { margin-top: 0; }
    .campaign-list { display: grid; gap: 10px; }
    .campaign-row { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 16px; border: 1px solid #d8dde3; border-radius: 8px; background: white; color: #17202a; text-decoration: none; }
    .campaign-row span:first-child { display: grid; gap: 4px; }
    .campaign-row small { color: #52616f; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; border-bottom: 1px solid #e3e7eb; padding: 10px 8px; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .table-actions { display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .inline { display: inline-flex; grid-template-columns: none; align-items: center; gap: 8px; }
    .inline input { width: auto; }
    @media (max-width: 640px) { .actions { display: grid; } .admin-shell { width: min(100% - 24px, 1120px); } }
  </style>
</head>
<body>${body}
<script>
  document.getElementById("select-all-codes")?.addEventListener("change", (event) => {
    document.querySelectorAll('input[name="codeId"]').forEach((input) => {
      input.checked = event.target.checked;
    });
  });
</script>
</body>
</html>`;
}

function platformLabel(platform: string): string {
  return platform === "ios" ? "iOS" : platform === "macos" ? "macOS" : platform === "universal" ? "Universal" : "Promotion";
}

function renderPlatformSelect(value: string): string {
  return `<select name="platform">
    ${renderOption("universal", "Universal", value)}
    ${renderOption("ios", "iOS", value)}
    ${renderOption("macos", "macOS", value)}
    ${renderOption("other", "Other", value)}
  </select>`;
}

function renderStatusSelect(value: string): string {
  return `<select name="status">
    ${renderOption("draft", "Draft", value)}
    ${renderOption("active", "Active", value)}
    ${renderOption("paused", "Paused", value)}
    ${renderOption("ended", "Ended", value)}
  </select>`;
}

function renderOption(value: string, label: string, selectedValue: string): string {
  return `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function buildRedeemUrl(redeemUrl: string | null, code: string): string {
  const url = new URL(redeemUrl || STORE_REDEEM_URL);
  url.searchParams.set("code", code);
  return url.toString();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function escapeJs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}
