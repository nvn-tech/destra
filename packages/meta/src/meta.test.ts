import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GraphClient } from "./client.js";
import type { MetaConfig } from "./config.js";
import { GraphApiError } from "./errors.js";
import { hashtags, normalizeUsername, postFormat } from "./mapping.js";
import {
  authorizationUrl,
  createOAuthState,
  createSignedRequest,
  parseSignedRequest,
  verifyOAuthState,
} from "./oauth.js";
import { FakeGraph } from "./testing/fake-graph.js";

const graph = new FakeGraph();
let config: MetaConfig;

beforeAll(async () => {
  const url = await graph.start();
  config = {
    appId: "123",
    appSecret: "app-secret",
    graphVersion: "v26.0",
    graphUrl: url,
    dialogUrl: "https://www.facebook.com",
    redirectUri: "http://localhost:4000/cb",
  };
  graph.addUser({
    id: "fb-ana",
    name: "Ana",
    code: "code-ana",
    pages: [
      {
        id: "page-1",
        name: "Dra. Ana",
        access_token: "page-token-1",
        tasks: ["MANAGE"],
        instagram_business_account: { id: "ig-1", username: "dra.ana" },
      },
    ],
  });
  graph.addAccount("ig-1", {
    followers: 12400,
    media: Array.from({ length: 70 }, (_, i) => ({
      id: `m${i}`,
      media_type: "IMAGE" as const,
      caption: `post ${i} #Tireoide`,
    })),
    insights: { m0: { views: 900, reach: 700, saved: 40 } },
  });
});
afterAll(() => graph.stop());

describe("GraphClient", () => {
  it("runs the login exchange and lists pages with their Instagram account", async () => {
    const client = new GraphClient(config);
    const short = await client.exchangeCode("code-ana");
    const long = await client.exchangeLongLived(short.access_token);
    expect(long.expires_in).toBeGreaterThan(50 * 24 * 3600);
    const pages = await client.listPages(long.access_token);
    expect(pages[0]?.instagram_business_account?.username).toBe("dra.ana");
  });

  it("follows pagination and signs every call with appsecret_proof", async () => {
    const client = new GraphClient(config);
    const media = await client.listMedia("ig-1", "page-token-1", 60);
    expect(media).toHaveLength(60);
    const mediaCalls = graph.requests.filter((r) => r.path === "/ig-1/media");
    expect(mediaCalls.length).toBeGreaterThan(1);
    expect(mediaCalls.every((r) => /^[0-9a-f]{64}$/.test(r.params.appsecret_proof ?? ""))).toBe(
      true,
    );
  });

  it("reads media insights", async () => {
    const insights = await new GraphClient(config).mediaInsights("m0", "page-token-1");
    expect(insights).toEqual({ views: 900, reach: 700, saved: 40 });
  });

  it("classifies a revoked token as an auth error", async () => {
    graph.revoke("page-token-revoked");
    const error = await new GraphClient(config)
      .accountStats("ig-1", "page-token-revoked")
      .catch((e) => e);
    expect(error).toBeInstanceOf(GraphApiError);
    expect((error as GraphApiError).isAuthError).toBe(true);
  });
});

describe("OAuth helpers", () => {
  it("signs and verifies the state, rejecting tampering", () => {
    const state = createOAuthState({ workspaceId: "w1", userId: "u1" }, "secret");
    expect(verifyOAuthState(state, "secret")).toMatchObject({ workspaceId: "w1", userId: "u1" });
    expect(verifyOAuthState(state, "other-secret")).toBeNull();
    expect(verifyOAuthState(`${state}x`, "secret")).toBeNull();
  });

  it("builds the Facebook Login URL with the Instagram scopes", () => {
    const url = new URL(authorizationUrl(config, "st"));
    expect(url.pathname).toBe("/v26.0/dialog/oauth");
    expect(url.searchParams.get("scope")).toContain("instagram_content_publish");
    expect(url.searchParams.get("state")).toBe("st");
  });

  it("verifies Meta signed requests", () => {
    const signed = createSignedRequest({ user_id: "fb-ana" }, "app-secret");
    expect(parseSignedRequest(signed, "app-secret")?.user_id).toBe("fb-ana");
    expect(parseSignedRequest(signed, "wrong")).toBeNull();
  });
});

describe("mapping", () => {
  it("maps formats, hashtags and usernames", () => {
    expect(postFormat({ id: "1", media_type: "VIDEO", media_product_type: "REELS" })).toBe("reel");
    expect(postFormat({ id: "1", media_type: "CAROUSEL_ALBUM" })).toBe("carousel");
    expect(hashtags("Oi #Tireoide #saúde #tireoide")).toEqual(["#tireoide", "#saúde"]);
    expect(normalizeUsername("@Dra.Ana_Souza")).toBe("dra.ana_souza");
    expect(normalizeUsername("https://www.instagram.com/dra.ana/")).toBe("dra.ana");
    expect(normalizeUsername("not a user!")).toBeNull();
  });
});
