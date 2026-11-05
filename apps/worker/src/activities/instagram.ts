import {
  accountSnapshots,
  auditLog,
  connectedAccounts,
  type Database,
  ownedPostInsights,
  postMetricSnapshots,
  posts,
  sourceAccounts,
  sourceFetchLog,
  type Vault,
  withTenant,
} from "@destra/db";
import {
  contentHash,
  GraphApiError,
  type GraphClient,
  hashtags,
  type InstagramMedia,
  mentions,
  postFormat,
} from "@destra/meta";
import { ApplicationFailure } from "@temporalio/common";
import { eq, sql } from "drizzle-orm";

export interface MetaWorkerDeps {
  graph: GraphClient;
  vault: Vault;
}

const OWN_MEDIA_LIMIT = 100;
const OWN_INSIGHTS_LIMIT = 30;
const REFERENCE_MEDIA_LIMIT = 30;
/** Raw payloads are kept briefly for debugging, then deleted (LGPD retention). */
const RAW_RETENTION_DAYS = 30;

const SYSTEM = "system:worker";

/** Upserts media into the shared corpus and records a metric snapshot for each. */
async function upsertMedia(
  db: Database,
  accountId: string,
  media: InstagramMedia[],
  owned: boolean,
  now: Date,
) {
  const ids = new Map<string, string>();
  const rawExpiresAt = new Date(now.getTime() + RAW_RETENTION_DAYS * 86_400_000);
  for (const item of media) {
    const caption = item.caption ?? "";
    const publishedAt = item.timestamp ? new Date(item.timestamp) : null;
    const [row] = await db
      .insert(posts)
      .values({
        accountId,
        platform: "instagram",
        platformPostId: item.id,
        format: postFormat(item),
        caption,
        publishedAt,
        permalink: item.permalink ?? null,
        hashtags: hashtags(caption),
        mentions: mentions(caption),
        mediaCount: item.children?.data.length ?? 1,
        contentHash: contentHash(caption),
        ingestedVia: "official_api",
        isOwnedByTenant: owned,
        raw: item,
        rawExpiresAt,
      })
      .onConflictDoUpdate({
        target: [posts.platform, posts.platformPostId],
        set: {
          caption,
          permalink: item.permalink ?? null,
          hashtags: hashtags(caption),
          mentions: mentions(caption),
          contentHash: contentHash(caption),
          raw: item,
          rawExpiresAt,
          // A reference sync never un-marks a post its owner imported.
          isOwnedByTenant: sql`${posts.isOwnedByTenant} or excluded.is_owned_by_tenant`,
        },
      })
      .returning({ id: posts.id });
    if (!row) continue;
    ids.set(item.id, row.id);
    await db
      .insert(postMetricSnapshots)
      .values({
        postId: row.id,
        capturedAt: now,
        ageHours: publishedAt ? (now.getTime() - publishedAt.getTime()) / 3_600_000 : null,
        // Hidden counts stay null (unknown), never zero.
        likes: item.like_count ?? null,
        comments: item.comments_count ?? null,
      })
      .onConflictDoNothing();
  }
  return ids;
}

export function createInstagramActivities(db: Database, meta: MetaWorkerDeps | null) {
  const requireMeta = () => {
    if (!meta)
      throw ApplicationFailure.nonRetryable(
        "Meta integration is not configured",
        "MetaNotConfigured",
      );
    return meta;
  };

  /** Converts Graph errors into Temporal failures; revoked tokens mark the connection expired. */
  async function fail(
    error: unknown,
    ctx: { workspaceId: string; connectionId: string },
  ): Promise<never> {
    if (error instanceof GraphApiError) {
      if (error.isAuthError) {
        await withTenant(db, { userId: SYSTEM, workspaceId: ctx.workspaceId }, async (tx) => {
          await tx
            .update(connectedAccounts)
            .set({ status: "expired" })
            .where(eq(connectedAccounts.id, ctx.connectionId));
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            actor: SYSTEM,
            action: "connection.expired",
            entity: "connected_account",
            entityId: ctx.connectionId,
            payload: { code: error.code ?? null },
          });
        });
        throw ApplicationFailure.nonRetryable(error.message, "MetaAuthError");
      }
      if (error.isRetryable) throw ApplicationFailure.retryable(error.message, "MetaRetryable");
      throw ApplicationFailure.nonRetryable(error.message, "MetaRequestError");
    }
    throw error;
  }

  async function loadConnection(workspaceId: string, connectionId?: string) {
    const { vault } = requireMeta();
    return withTenant(db, { userId: SYSTEM, workspaceId }, async (tx) => {
      const [connection] = await tx
        .select()
        .from(connectedAccounts)
        .where(
          connectionId
            ? eq(connectedAccounts.id, connectionId)
            : eq(connectedAccounts.platform, "instagram"),
        )
        .limit(1);
      if (connection?.status !== "active") return null;
      const token = await vault.get(tx, connection.tokenRef);
      return token ? { connection, token } : null;
    });
  }

  return {
    /** Imports the doctor's own recent posts, public metrics and private insights. */
    async ingestOwnAccount(input: { workspaceId: string; connectedAccountId: string }) {
      const { graph } = requireMeta();
      const loaded = await loadConnection(input.workspaceId, input.connectedAccountId);
      if (!loaded?.connection.sourceAccountId) return { skipped: true, posts: 0, insights: 0 };
      const { connection, token } = loaded;
      const accountId = connection.sourceAccountId as string;
      const ctx = { workspaceId: input.workspaceId, connectionId: connection.id };

      let stats: Awaited<ReturnType<GraphClient["accountStats"]>>;
      let media: InstagramMedia[];
      try {
        stats = await graph.accountStats(connection.platformAccountId, token);
        media = await graph.listMedia(connection.platformAccountId, token, OWN_MEDIA_LIMIT);
      } catch (error) {
        return fail(error, ctx);
      }

      const now = new Date();
      const ids = await upsertMedia(db, accountId, media, true, now);
      await db
        .insert(accountSnapshots)
        .values({
          accountId,
          capturedAt: now,
          followers: stats.followers_count ?? null,
          following: stats.follows_count ?? null,
          mediaCount: stats.media_count ?? null,
        })
        .onConflictDoNothing();

      // Insights for the most recent posts. Some media types have no insights: skip them.
      const insights: { postId: string; values: Record<string, number> }[] = [];
      for (const item of media.slice(0, OWN_INSIGHTS_LIMIT)) {
        const postId = ids.get(item.id);
        if (!postId) continue;
        try {
          insights.push({ postId, values: await graph.mediaInsights(item.id, token) });
        } catch (error) {
          if (error instanceof GraphApiError && (error.isAuthError || error.isRetryable))
            return fail(error, ctx);
        }
      }
      await withTenant(db, { userId: SYSTEM, workspaceId: input.workspaceId }, async (tx) => {
        for (const { postId, values } of insights) {
          await tx
            .insert(ownedPostInsights)
            .values({
              workspaceId: input.workspaceId,
              postId,
              capturedAt: now,
              views: values.views ?? null,
              reach: values.reach ?? null,
              saves: values.saved ?? null,
              shares: values.shares ?? null,
            })
            .onConflictDoNothing();
        }
      });

      await db
        .update(sourceAccounts)
        .set({ lastCrawledAt: now })
        .where(eq(sourceAccounts.id, accountId));
      await db.insert(sourceFetchLog).values({
        adapter: "meta_graph",
        sourceAccountId: accountId,
        itemsFetched: media.length,
        costUsd: "0",
      });
      return { skipped: false, posts: media.length, insights: insights.length };
    },

    /** Refreshes a reference account's public posts through Business Discovery. */
    async syncReferenceAccount(input: { workspaceId: string; sourceAccountId: string }) {
      const { graph } = requireMeta();
      const [account] = await db
        .select()
        .from(sourceAccounts)
        .where(eq(sourceAccounts.id, input.sourceAccountId));
      if (!account) return { skipped: true, posts: 0 };
      const loaded = await loadConnection(input.workspaceId);
      if (!loaded) return { skipped: true, posts: 0 };
      const ctx = { workspaceId: input.workspaceId, connectionId: loaded.connection.id };

      let profile: Awaited<ReturnType<GraphClient["businessDiscovery"]>>;
      try {
        profile = await graph.businessDiscovery(
          loaded.connection.platformAccountId,
          loaded.token,
          account.handle,
          REFERENCE_MEDIA_LIMIT,
        );
      } catch (error) {
        if (error instanceof GraphApiError && !error.isAuthError && !error.isRetryable) {
          // No longer a public professional account (renamed, private or personal).
          await db
            .update(sourceAccounts)
            .set({ status: "gone" })
            .where(eq(sourceAccounts.id, account.id));
        }
        return fail(error, ctx);
      }

      const now = new Date();
      const media = profile.media?.data ?? [];
      await upsertMedia(db, account.id, media, false, now);
      await db
        .insert(accountSnapshots)
        .values({
          accountId: account.id,
          capturedAt: now,
          followers: profile.followers_count ?? null,
          mediaCount: profile.media_count ?? null,
        })
        .onConflictDoNothing();
      await db
        .update(sourceAccounts)
        .set({
          lastCrawledAt: now,
          status: "active",
          displayName: profile.name ?? account.displayName,
        })
        .where(eq(sourceAccounts.id, account.id));
      await db.insert(sourceFetchLog).values({
        adapter: "meta_graph",
        sourceAccountId: account.id,
        itemsFetched: media.length,
        costUsd: "0",
      });
      return { skipped: false, posts: media.length };
    },
  };
}
