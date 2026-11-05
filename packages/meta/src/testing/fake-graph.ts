import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { BusinessDiscoveryResult, FacebookPage, InstagramMedia } from "../types.js";

/*
 * A small in-process stand-in for the Graph API endpoints Destra uses, for tests
 * and local development. It mirrors Meta's documented shapes, but it is not Meta:
 * behaviour must still be confirmed against a real app in development mode.
 */

interface FakeUser {
  id: string;
  name: string;
  code: string;
  pages: FacebookPage[];
  /** Permissions the user unticked in the login dialog. */
  declined?: string[];
}

interface FakeAccount {
  followers: number;
  follows: number;
  media: InstagramMedia[];
  insights: Record<string, Record<string, number>>;
}

export interface RecordedRequest {
  path: string;
  params: Record<string, string>;
}

export class FakeGraph {
  readonly requests: RecordedRequest[] = [];
  private server: Server | null = null;
  private users = new Map<string, FakeUser>();
  private accounts = new Map<string, FakeAccount>();
  private discovery = new Map<string, BusinessDiscoveryResult>();
  private revoked = new Set<string>();
  /** Code the fake login dialog returns (local end-to-end runs). */
  dialogCode = "";
  url = "";

  /** Registers a Facebook user who will log in with `code`. Returns the tokens they will get. */
  addUser(user: FakeUser) {
    this.users.set(user.id, user);
    return { shortToken: `short-${user.id}`, longToken: `long-${user.id}` };
  }

  addAccount(igUserId: string, account: Partial<FakeAccount>) {
    this.accounts.set(igUserId, { followers: 0, follows: 0, media: [], insights: {}, ...account });
  }

  addDiscoverable(username: string, result: BusinessDiscoveryResult) {
    this.discovery.set(username.toLowerCase(), result);
  }

  revoke(token: string) {
    this.revoked.add(token);
  }

  async start(): Promise<string> {
    this.server = createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this.url;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
  }

  private send(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, {
      "content-type": "application/json",
      "x-app-usage": JSON.stringify({ call_count: 1 }),
    });
    res.end(JSON.stringify(body));
  }

  private error(res: ServerResponse, status: number, code: number, message: string) {
    this.send(res, status, {
      error: { message, type: "OAuthException", code, fbtrace_id: "fake" },
    });
  }

  /** Resolves a token to the user or page it belongs to. */
  private tokenOwner(token: string | undefined): { user?: FakeUser; page?: FacebookPage } | null {
    if (!token || this.revoked.has(token)) return null;
    for (const user of this.users.values()) {
      if (token === `long-${user.id}` || token === `short-${user.id}`) return { user };
      const page = user.pages.find((p) => p.access_token === token);
      if (page) return { user, page };
    }
    return null;
  }

  private handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://fake");
    const params = Object.fromEntries(url.searchParams);
    const path = url.pathname.replace(/^\/v\d+\.\d+/, "");
    this.requests.push({ path, params });

    // Fake Facebook Login dialog: sends the browser straight back with `dialogCode`.
    if (path === "/dialog/oauth") {
      const target = new URL(params.redirect_uri ?? "");
      target.searchParams.set("code", this.dialogCode);
      target.searchParams.set("state", params.state ?? "");
      res.writeHead(302, { location: target.toString() });
      res.end();
      return;
    }

    if (path === "/oauth/access_token") {
      if (params.code) {
        const user = [...this.users.values()].find((u) => u.code === params.code);
        if (!user) return this.error(res, 400, 100, "Invalid verification code format.");
        return this.send(res, 200, {
          access_token: `short-${user.id}`,
          token_type: "bearer",
          expires_in: 3600,
        });
      }
      if (params.grant_type === "fb_exchange_token") {
        const owner = this.tokenOwner(params.fb_exchange_token);
        if (!owner?.user) return this.error(res, 400, 190, "Invalid OAuth access token.");
        return this.send(res, 200, {
          access_token: `long-${owner.user.id}`,
          token_type: "bearer",
          expires_in: 60 * 24 * 3600,
        });
      }
      return this.error(res, 400, 100, "Missing parameters");
    }

    const owner = this.tokenOwner(params.access_token);
    if (!owner)
      return this.error(
        res,
        400,
        190,
        "Error validating access token: The session has been invalidated.",
      );
    if (!params.appsecret_proof) return this.error(res, 400, 100, "appsecret_proof required");

    if (path === "/me") return this.send(res, 200, { id: owner.user?.id, name: owner.user?.name });
    if (path === "/me/accounts") return this.send(res, 200, { data: owner.user?.pages ?? [] });
    if (path === "/me/permissions") {
      const declined = owner.user?.declined ?? [];
      const all = [
        "instagram_basic",
        "instagram_manage_insights",
        "instagram_content_publish",
        "pages_show_list",
        "pages_read_engagement",
        "business_management",
      ];
      return this.send(res, 200, {
        data: all.map((permission) => ({
          permission,
          status: declined.includes(permission) ? "declined" : "granted",
        })),
      });
    }

    const media = path.match(/^\/([^/]+)\/media$/);
    if (media?.[1]) {
      const account = this.accounts.get(media[1]);
      if (!account) return this.error(res, 400, 100, "Unsupported get request.");
      const start = Number(params.after ?? 0);
      const limit = Number(params.limit ?? 25);
      const data = account.media.slice(start, start + limit);
      const next = start + limit < account.media.length ? String(start + limit) : undefined;
      return this.send(res, 200, {
        data,
        paging: next ? { cursors: { after: next }, next: `${this.url}/next` } : {},
      });
    }

    const insights = path.match(/^\/([^/]+)\/insights$/);
    if (insights?.[1]) {
      for (const account of this.accounts.values()) {
        const values = account.insights[insights[1]];
        if (values) {
          return this.send(res, 200, {
            data: Object.entries(values).map(([name, value]) => ({
              name,
              period: "lifetime",
              values: [{ value }],
            })),
          });
        }
      }
      return this.error(res, 400, 100, "Media insights not available");
    }

    const node = path.match(/^\/([^/]+)$/);
    if (node?.[1]) {
      const discovery = params.fields?.match(/business_discovery\.username\(([^)]+)\)/);
      if (discovery?.[1]) {
        const found = this.discovery.get(discovery[1].toLowerCase());
        if (!found) return this.error(res, 400, 110, "Invalid user id");
        return this.send(res, 200, { id: node[1], business_discovery: found });
      }
      const account = this.accounts.get(node[1]);
      if (!account) return this.error(res, 400, 100, "Unsupported get request.");
      return this.send(res, 200, {
        id: node[1],
        followers_count: account.followers,
        follows_count: account.follows,
        media_count: account.media.length,
      });
    }

    return this.error(res, 404, 100, "Unknown path");
  }
}
