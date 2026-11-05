import { randomUUID } from "node:crypto";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  authUsers,
  billingAccounts,
  connectedAccounts,
  contentItems,
  contentVariants,
  createDb,
  createVault,
  type DbHandle,
  memberships,
  parseVaultKey,
  posts,
  professionalProfiles,
  publications,
  sourceAccounts,
  withTenant,
  workspaces,
} from "@destra/db";
import { testDatabaseUrls } from "@destra/db/testing";
import { LocalMediaStore } from "@destra/media";
import { GraphClient } from "@destra/meta";
import { FakeGraph } from "@destra/meta/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPublishingActivities } from "./activities/publishing.js";
import { DB_NAME } from "./test/global-setup.js";

const { owner: OWNER_URL, app: APP_URL } = testDatabaseUrls(DB_NAME);
const graph = new FakeGraph();
const vault = createVault([parseVaultKey(Buffer.alloc(32, 5).toString("base64"))]);
let app: DbHandle;
let owner: DbHandle;
let mediaDir: string;
let activities: ReturnType<typeof createPublishingActivities>;

const SLIDES = [
  { n: 1, role: "hook", title: "5 mitos sobre a tireoide", body: "" },
  { n: 2, role: "point", title: "Mito 1", body: "O cansaço tem muitas causas." },
  { n: 3, role: "cta", title: "Resumo", body: "Salve para consultar depois." },
];

beforeAll(async () => {
  const url = await graph.start();
  graph.addUser({
    id: "fb-pub",
    name: "Ana",
    code: "c",
    pages: [
      {
        id: "p",
        name: "P",
        access_token: "page-token-pub",
        instagram_business_account: { id: "ig-pub", username: "dra.ana" },
      },
    ],
  });
  graph.addUser({
    id: "fb-revoked",
    name: "R",
    code: "r",
    pages: [
      {
        id: "p2",
        name: "P2",
        access_token: "page-token-gone",
        instagram_business_account: { id: "ig-pub", username: "dra.ana" },
      },
    ],
  });
  graph.addAccount("ig-pub", { media: [] });
  app = createDb(APP_URL);
  owner = createDb(OWNER_URL);
  mediaDir = await mkdtemp(join(tmpdir(), "destra-media-"));
  activities = createPublishingActivities(app.db, {
    graph: new GraphClient({
      appId: "a",
      appSecret: "s",
      graphVersion: "v26.0",
      graphUrl: url,
      dialogUrl: "",
      redirectUri: "",
    }),
    vault,
    store: new LocalMediaStore(mediaDir, "http://localhost:4000", "media-secret"),
    pollIntervalMs: 1,
    maxPolls: 5,
  });
});

beforeEach(() => {
  graph.processingPolls = 0;
  graph.dropNextPublishResponse = false;
  graph.rejectNextContainer = null;
});

afterAll(async () => {
  await app.close();
  await owner.close();
  await graph.stop();
});

/** Workspace with profile, Instagram connection, an approved variant and a due publication. */
async function scheduled(
  options: {
    format?: "carousel" | "reel";
    compliance?: "pass" | "block";
    token?: string;
    dueInMs?: number;
    paused?: boolean;
  } = {},
) {
  const userId = `user_${randomUUID()}`;
  const workspaceId = randomUUID();
  const billingAccountId = randomUUID();
  await owner.db
    .insert(authUsers)
    .values({ id: userId, name: "Ana", email: `${userId}@example.com` });
  await owner.db
    .insert(billingAccounts)
    .values({ id: billingAccountId, legalName: "Ana", ownerUserId: userId });
  await owner.db.insert(workspaces).values({
    id: workspaceId,
    billingAccountId,
    name: "Ana",
    publishingPausedAt: options.paused ? new Date() : null,
  });
  await owner.db.insert(memberships).values({ workspaceId, userId, role: "owner" });
  await owner.db.insert(professionalProfiles).values({
    workspaceId,
    fullName: "Dra. Ana Souza",
    council: "CRM",
    councilNumber: "123456",
    councilUf: "SP",
    specialties: [{ name: "Endocrinologia", rqe: "7890" }],
  });
  const [source] = await owner.db
    .insert(sourceAccounts)
    .values({ platform: "instagram", platformAccountId: "ig-pub", handle: "dra.ana" })
    .onConflictDoUpdate({
      target: [sourceAccounts.platform, sourceAccounts.platformAccountId],
      set: { handle: "dra.ana" },
    })
    .returning();
  const caption = `Você já ouviu que todo cansaço é tireoide? ${randomUUID()}`;
  const ids = await withTenant(app.db, { userId, workspaceId }, async (tx) => {
    const tokenRef = await vault.put(tx, {
      workspaceId,
      kind: "meta_page_token",
      value: options.token ?? "page-token-pub",
    });
    const [connection] = await tx
      .insert(connectedAccounts)
      .values({
        workspaceId,
        platform: "instagram",
        platformAccountId: "ig-pub",
        sourceAccountId: source?.id,
        tokenRef,
      })
      .returning();
    const [item] = await tx
      .insert(contentItems)
      .values({ workspaceId, title: "5 mitos", status: "scheduled", createdBy: `user:${userId}` })
      .returning();
    const [variant] = await tx
      .insert(contentVariants)
      .values({
        workspaceId,
        contentItemId: item?.id ?? "",
        platform: "instagram",
        format: options.format ?? "carousel",
        body: { label: "A", caption, hashtags: ["#tireoide", "#endocrinologia"], slides: SLIDES },
        complianceStatus: options.compliance ?? "pass",
        isSelected: true,
      })
      .returning();
    const [publication] = await tx
      .insert(publications)
      .values({
        workspaceId,
        variantId: variant?.id ?? "",
        connectedAccountId: connection?.id ?? "",
        scheduledAt: new Date(Date.now() + (options.dueInMs ?? -1000)),
        idempotencyKey: randomUUID(),
      })
      .returning();
    return {
      publicationId: publication?.id ?? "",
      connectionId: connection?.id ?? "",
      itemId: item?.id ?? "",
    };
  });
  return { workspaceId, caption, ...ids };
}

const row = async (publicationId: string) =>
  (await owner.db.select().from(publications).where(eq(publications.id, publicationId)))[0];

describe("publishPublication", () => {
  it("publishes a carousel with hashtags and the identification line, and links it to the corpus", async () => {
    const s = await scheduled();
    const result = await activities.publishPublication(s);
    expect(result.outcome).toBe("published");

    const publication = await row(s.publicationId);
    expect(publication).toMatchObject({ status: "published", platformPostId: result.mediaId });
    expect(publication?.permalink).toContain("instagram.com/p/");
    expect(publication?.childContainerIds).toHaveLength(3);
    expect(publication?.finalCaption).toContain("#tireoide #endocrinologia");
    expect(publication?.finalCaption).toMatch(/Dra\. Ana Souza \| CRM-SP 123456 \| RQE 7890$/);

    const container = graph.containers.get(publication?.containerId ?? "");
    expect(container?.children).toHaveLength(3);
    const files = await readdir(
      join(mediaDir, "w", s.workspaceId, "publications", s.publicationId),
    );
    expect(files.sort()).toEqual(["slide-1.png", "slide-2.png", "slide-3.png"]);

    const [post] = await owner.db
      .select()
      .from(posts)
      .where(eq(posts.id, publication?.postId ?? ""));
    expect(post).toMatchObject({ platformPostId: result.mediaId, isOwnedByTenant: true });
    const [item] = await owner.db.select().from(contentItems).where(eq(contentItems.id, s.itemId));
    expect(item?.status).toBe("published");
  });

  it("waits while publishing is paused and before the scheduled time", async () => {
    const paused = await scheduled({ paused: true });
    expect((await activities.publishPublication(paused)).outcome).toBe("paused");
    expect((await row(paused.publicationId))?.status).toBe("scheduled");

    const later = await scheduled({ dueInMs: 3600_000 });
    expect((await activities.publishPublication(later)).outcome).toBe("not_due");
    expect((await row(later.publicationId))?.containerId).toBeNull();
  });

  it("never posts twice when Meta's publish response is lost", async () => {
    const s = await scheduled();
    graph.dropNextPublishResponse = true;
    await expect(activities.publishPublication(s)).rejects.toMatchObject({
      type: "PublishRetryable",
    });
    const afterFirst = await row(s.publicationId);
    expect(afterFirst).toMatchObject({ status: "scheduled", attempts: 1 });
    expect(afterFirst?.containerId).toBeTruthy();

    const retry = await activities.publishPublication(s);
    expect(retry.outcome).toBe("published");
    const publishedWithCaption = [...graph.containers.values()].filter(
      (c) => c.caption.startsWith(s.caption) && c.status === "PUBLISHED",
    );
    expect(publishedWithCaption).toHaveLength(1);
    expect((await row(s.publicationId))?.containerId).toBe(afterFirst?.containerId);
  });

  it("waits for Meta to finish processing the images", async () => {
    graph.processingPolls = 2;
    const s = await scheduled();
    expect((await activities.publishPublication(s)).outcome).toBe("published");
  });

  it("refuses blocked content and reels with a clear reason", async () => {
    const blocked = await scheduled({ compliance: "block" });
    expect((await activities.publishPublication(blocked)).outcome).toBe("failed");
    expect((await row(blocked.publicationId))?.error).toMatchObject({
      message: expect.stringMatching(/não está mais aprovado/),
    });

    const reel = await scheduled({ format: "reel" });
    expect((await activities.publishPublication(reel)).outcome).toBe("failed");
    expect((await row(reel.publicationId))?.error).toMatchObject({
      message: expect.stringMatching(/Reels/),
    });
  });

  it("fails at once, with Meta's reason, when Instagram rejects the request", async () => {
    graph.rejectNextContainer = 36003;
    const s = await scheduled();
    await expect(activities.publishPublication(s)).rejects.toMatchObject({
      type: "PublishRejected",
      nonRetryable: true,
    });
    const publication = await row(s.publicationId);
    expect(publication?.status).toBe("failed");
    expect(publication?.error).toMatchObject({
      message: expect.stringMatching(/recusou a publicação: The aspect ratio/),
    });
  });

  it("stops retrying and asks to reconnect when the token is revoked", async () => {
    graph.revoke("page-token-gone");
    const s = await scheduled({ token: "page-token-gone" });
    await expect(activities.publishPublication(s)).rejects.toMatchObject({
      type: "MetaAuthError",
      nonRetryable: true,
    });
    expect((await row(s.publicationId))?.status).toBe("failed");
    const [connection] = await owner.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, s.connectionId));
    expect(connection?.status).toBe("expired");
  });
});
