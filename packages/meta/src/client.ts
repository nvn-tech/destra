import { createHmac } from "node:crypto";
import type { MetaConfig } from "./config.js";
import { GraphApiError, type GraphErrorBody } from "./errors.js";
import type {
  AccountStats,
  BusinessDiscoveryResult,
  FacebookPage,
  InsightValue,
  InstagramMedia,
  Page,
  TokenResponse,
} from "./types.js";

const MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,children{id,media_type}";

export interface UsageReport {
  /** Parsed X-Business-Use-Case-Usage / X-App-Usage headers, for throttling decisions. */
  headers: Record<string, unknown>;
}

/** Minimal typed client for the parts of the Graph API Destra uses. */
export class GraphClient {
  constructor(
    private readonly config: MetaConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly onUsage?: (usage: UsageReport) => void,
  ) {}

  private base(): string {
    return `${this.config.graphUrl}/${this.config.graphVersion}`;
  }

  /** appsecret_proof proves server-side calls come from our app (Meta "Require App Secret"). */
  private proof(token: string): string {
    return createHmac("sha256", this.config.appSecret).update(token).digest("hex");
  }

  private async request<T>(
    path: string,
    params: Record<string, string>,
    token?: string,
  ): Promise<T> {
    const url = new URL(path.startsWith("http") ? path : `${this.base()}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (token) {
      url.searchParams.set("access_token", token);
      url.searchParams.set("appsecret_proof", this.proof(token));
    }
    const response = await this.fetchImpl(url);
    const usage: Record<string, unknown> = {};
    for (const header of ["x-business-use-case-usage", "x-app-usage"]) {
      const value = response.headers.get(header);
      if (value) {
        try {
          usage[header] = JSON.parse(value);
        } catch {
          usage[header] = value;
        }
      }
    }
    if (Object.keys(usage).length) this.onUsage?.({ headers: usage });

    const body = (await response.json().catch(() => ({}))) as { error?: GraphErrorBody } & T;
    if (!response.ok || body.error) throw new GraphApiError(response.status, body.error ?? {});
    return body;
  }

  // ---------- OAuth ----------

  exchangeCode(code: string): Promise<TokenResponse> {
    return this.request("/oauth/access_token", {
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: this.config.redirectUri,
      code,
    });
  }

  /** Swaps a short-lived user token for a long-lived one (about 60 days). */
  exchangeLongLived(shortLivedToken: string): Promise<TokenResponse> {
    return this.request("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      fb_exchange_token: shortLivedToken,
    });
  }

  me(userToken: string): Promise<{ id: string; name?: string }> {
    return this.request("/me", { fields: "id,name" }, userToken);
  }

  /** Permissions the user actually granted (they can untick some in the dialog). */
  async grantedPermissions(userToken: string): Promise<string[]> {
    const result = await this.request<{ data: { permission: string; status: string }[] }>(
      "/me/permissions",
      {},
      userToken,
    );
    return result.data.filter((p) => p.status === "granted").map((p) => p.permission);
  }

  /** Pages the user manages, with their linked Instagram professional account and page token. */
  async listPages(userToken: string): Promise<FacebookPage[]> {
    const page = await this.request<Page<FacebookPage>>(
      "/me/accounts",
      {
        fields:
          "id,name,access_token,tasks,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}",
        limit: "100",
      },
      userToken,
    );
    return page.data;
  }

  // ---------- Instagram ----------

  accountStats(igUserId: string, token: string): Promise<AccountStats> {
    return this.request(
      `/${igUserId}`,
      { fields: "id,username,followers_count,follows_count,media_count" },
      token,
    );
  }

  /** The account's own media, newest first, following pagination up to `max` items. */
  async listMedia(igUserId: string, token: string, max = 100): Promise<InstagramMedia[]> {
    const items: InstagramMedia[] = [];
    let page = await this.request<Page<InstagramMedia>>(
      `/${igUserId}/media`,
      { fields: MEDIA_FIELDS, limit: String(Math.min(max, 50)) },
      token,
    );
    items.push(...page.data);
    while (items.length < max && page.paging?.cursors?.after && page.paging.next) {
      page = await this.request<Page<InstagramMedia>>(
        `/${igUserId}/media`,
        {
          fields: MEDIA_FIELDS,
          limit: String(Math.min(max - items.length, 50)),
          after: page.paging.cursors.after,
        },
        token,
      );
      items.push(...page.data);
    }
    return items.slice(0, max);
  }

  /**
   * Private insights for one of the account's own media. "views" replaced
   * impressions/plays in 2025. Metrics unavailable for a media type are skipped by Meta.
   */
  async mediaInsights(mediaId: string, token: string): Promise<Record<string, number>> {
    const result = await this.request<{ data: InsightValue[] }>(
      `/${mediaId}/insights`,
      { metric: "views,reach,saved,shares,total_interactions" },
      token,
    );
    const out: Record<string, number> = {};
    for (const metric of result.data) {
      const value = metric.total_value?.value ?? metric.values?.[0]?.value;
      if (typeof value === "number") out[metric.name] = value;
    }
    return out;
  }

  /**
   * Public data of another Instagram professional account, read through our user's account.
   * Fails for personal accounts and unknown usernames.
   */
  async businessDiscovery(
    viaIgUserId: string,
    token: string,
    username: string,
    mediaLimit = 30,
  ): Promise<BusinessDiscoveryResult> {
    const fields = `business_discovery.username(${username}){id,username,name,followers_count,media_count,media.limit(${mediaLimit}){${MEDIA_FIELDS}}}`;
    const result = await this.request<{ business_discovery: BusinessDiscoveryResult }>(
      `/${viaIgUserId}`,
      { fields },
      token,
    );
    return result.business_discovery;
  }
}
