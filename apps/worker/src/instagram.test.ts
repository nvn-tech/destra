import { randomUUID } from "node:crypto";
import {
  authUsers,
  billingAccounts,
  connectedAccounts,
  createDb,
  createVault,
  type DbHandle,
  memberships,
  ownedPostInsights,
  parseVaultKey,
  postMetricSnapshots,
  posts,
  sourceAccounts,
  withTenant,
  workspaces,
} from "@destra/db";
import { testDatabaseUrls } from "@destra/db/testing";
import { GraphClient } from "@destra/meta";
import { FakeGraph } from "@destra/meta/testing";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInstagramActivities } from "./activities/instagram.js";
import { DB_NAME } from "./test/global-setup.js";

const { owner: OWNER_URL, app: APP_URL } = testDatabaseUrls(DB_NAME);
const graph = new FakeGraph();
const vault = createVault([parseVaultKey(Buffer.alloc(32, 3).toString("base64"))]);
let app: DbHandle;
let owner: DbHandle;
let activities: ReturnType<typeof createInstagramActivities>;

beforeAll(async () => {
  const url = await graph.start();
  graph.addUser({
    id: "fb-ana",
    name: "Ana",
    code: "c",
    pages: [
      {
        id: "p",
        name: "P",
        access_token: "page-token-ana",
        instagram_business_account: { id: "ig-ana", username: "dra.ana" },
      },
    ],
  });
  graph.addAccount("ig-ana", {
    followers: 12400,
    follows: 300,
    media: Array.from({ length: 40 }, (_, i) => ({
      id: `ana-${i}`,
      media_type: i % 3 === 0 ? ("CAROUSEL_ALBUM" as const) : ("IMAGE" as const),
      caption: `Post ${i} sobre #Tireoide com @dra.colega`,
      timestamp: new Date(Date.now() - i * 86_400_000).toISOString(),
      like_count: i === 1 ? undefined : 100 + i,
      comments_count: 5,
    })),
    insights: { "ana-0": { views: 1500, reach: 1200, saved: 80, shares: 12 } },
  });
  graph.addDiscoverable("dra.referencia", {
    id: "ig-ref",
    username: "dra.referencia",
    name: "Dra. Referência",
    followers_count: 184000,
    media_count: 412,
    media: {
      data: [
        {
          id: "ref-0",
          media_type: "VIDEO",
          media_product_type: "REELS",
          caption: "Mito vs. fato #endocrinologia",
          like_count: 9000,
        },
        { id: "ana-0", media_type: "IMAGE", caption: "shared" },
      ],
    },
  });
  app = createDb(APP_URL);
  owner = createDb(OWNER_URL);
  activities = createInstagramActivities(app.db, {
    graph: new GraphClient({
      appId: "a",
      appSecret: "s",
      graphVersion: "v26.0",
      graphUrl: url,
      dialogUrl: "",
      redirectUri: "",
    }),
    vault,
  });
});

afterAll(async () => {
  await app.close();
  await owner.close();
  await graph.stop();
});

/** A workspace with an active Instagram connection whose page token is in the vault. */
async function connectedWorkspace(token = "page-token-ana") {
  const userId = `user_${randomUUID()}`;
  await owner.db
    .insert(authUsers)
    .values({ id: userId, name: "Ana", email: `${userId}@example.com` });
  const workspaceId = randomUUID();
  const billingAccountId = randomUUID();
  await owner.db
    .insert(billingAccounts)
    .values({ id: billingAccountId, legalName: "Ana", ownerUserId: userId });
  await owner.db.insert(workspaces).values({ id: workspaceId, billingAccountId, name: "Ana" });
  await owner.db.insert(memberships).values({ workspaceId, userId, role: "owner" });
  const [source] = await owner.db
    .insert(sourceAccounts)
    .values({ platform: "instagram", platformAccountId: "ig-ana", handle: "dra.ana" })
    .onConflictDoUpdate({
      target: [sourceAccounts.platform, sourceAccounts.platformAccountId],
      set: { handle: "dra.ana" },
    })
    .returning();
  const connectedAccountId = await withTenant(app.db, { userId, workspaceId }, async (tx) => {
    const tokenRef = await vault.put(tx, { workspaceId, kind: "meta_page_token", value: token });
    const [row] = await tx
      .insert(connectedAccounts)
      .values({
        workspaceId,
        platform: "instagram",
        platformAccountId: "ig-ana",
        sourceAccountId: source?.id,
        tokenRef,
      })
      .returning({ id: connectedAccounts.id });
    return row?.id ?? "";
  });
  return { workspaceId, connectedAccountId, sourceAccountId: source?.id ?? "" };
}

describe("ingestOwnAccount", () => {
  it("imports own posts, public metrics and private insights", async () => {
    const ws = await connectedWorkspace();
    const result = await activities.ingestOwnAccount(ws);
    expect(result).toMatchObject({ skipped: false, posts: 40 });
    expect(result.insights).toBeGreaterThanOrEqual(1);

    const imported = await owner.db
      .select()
      .from(posts)
      .where(eq(posts.accountId, ws.sourceAccountId));
    expect(imported).toHaveLength(40);
    const first = imported.find((p) => p.platformPostId === "ana-0");
    expect(first).toMatchObject({
      format: "carousel",
      isOwnedByTenant: true,
      ingestedVia: "official_api",
      hashtags: ["#tireoide"],
      mentions: ["dra.colega"],
    });

    const snapshots = await owner.db
      .select()
      .from(postMetricSnapshots)
      .where(
        inArray(
          postMetricSnapshots.postId,
          imported.map((p) => p.id),
        ),
      );
    const hidden = snapshots.find(
      (s) => s.postId === imported.find((p) => p.platformPostId === "ana-1")?.id,
    );
    expect(hidden?.likes).toBeNull(); // hidden like count stays unknown, not zero

    const insights = await owner.db
      .select()
      .from(ownedPostInsights)
      .where(eq(ownedPostInsights.workspaceId, ws.workspaceId));
    expect(insights).toContainEqual(
      expect.objectContaining({ postId: first?.id, views: 1500, saves: 80 }),
    );

    const [account] = await owner.db
      .select()
      .from(sourceAccounts)
      .where(eq(sourceAccounts.id, ws.sourceAccountId));
    expect(account?.lastCrawledAt).not.toBeNull();
  });

  it("marks the connection expired and stops retrying when the token is revoked", async () => {
    graph.revoke("page-token-revoked");
    const ws = await connectedWorkspace("page-token-revoked");
    await expect(activities.ingestOwnAccount(ws)).rejects.toMatchObject({
      type: "MetaAuthError",
      nonRetryable: true,
    });
    const [connection] = await owner.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, ws.connectedAccountId));
    expect(connection?.status).toBe("expired");
  });
});

describe("syncReferenceAccount", () => {
  it("imports public posts without un-marking posts their owner imported", async () => {
    const ws = await connectedWorkspace();
    await activities.ingestOwnAccount(ws);
    const [reference] = await owner.db
      .insert(sourceAccounts)
      .values({ platform: "instagram", platformAccountId: "ig-ref", handle: "dra.referencia" })
      .onConflictDoUpdate({
        target: [sourceAccounts.platform, sourceAccounts.platformAccountId],
        set: { handle: "dra.referencia" },
      })
      .returning();

    const result = await activities.syncReferenceAccount({
      workspaceId: ws.workspaceId,
      sourceAccountId: reference?.id ?? "",
    });
    expect(result).toMatchObject({ skipped: false, posts: 2 });

    const [reel] = await owner.db.select().from(posts).where(eq(posts.platformPostId, "ref-0"));
    expect(reel).toMatchObject({ format: "reel", isOwnedByTenant: false });
    const [shared] = await owner.db.select().from(posts).where(eq(posts.platformPostId, "ana-0"));
    expect(shared?.isOwnedByTenant).toBe(true);
  });

  it("marks an account gone when Business Discovery no longer finds it", async () => {
    const ws = await connectedWorkspace();
    const [gone] = await owner.db
      .insert(sourceAccounts)
      .values({
        platform: "instagram",
        platformAccountId: `ig-gone-${randomUUID()}`,
        handle: "virou.pessoal",
      })
      .returning();
    await expect(
      activities.syncReferenceAccount({
        workspaceId: ws.workspaceId,
        sourceAccountId: gone?.id ?? "",
      }),
    ).rejects.toMatchObject({
      type: "MetaRequestError",
    });
    const [after] = await owner.db
      .select()
      .from(sourceAccounts)
      .where(eq(sourceAccounts.id, gone?.id ?? ""));
    expect(after?.status).toBe("gone");
  });
});
