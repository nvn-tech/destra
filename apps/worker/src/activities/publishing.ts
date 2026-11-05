import { setTimeout as sleep } from "node:timers/promises";
import {
  auditLog,
  brandSettings,
  connectedAccounts,
  contentItems,
  contentVariants,
  type Database,
  posts,
  professionalProfiles,
  publications,
  sourceAccounts,
  type Vault,
  withTenant,
  workspaces,
} from "@destra/db";
import type { MediaStore } from "@destra/media";
import { renderSlides } from "@destra/media";
import {
  composeCaption,
  GraphApiError,
  type GraphClient,
  instagramPublishPlan,
} from "@destra/meta";
import { signatureLine } from "@destra/shared";
import { ApplicationFailure } from "@temporalio/common";
import { and, eq } from "drizzle-orm";

export interface PublishingDeps {
  graph: GraphClient;
  vault: Vault;
  store: MediaStore;
  /** Container processing checks (Meta fetches the images asynchronously). */
  pollIntervalMs?: number;
  maxPolls?: number;
}

export type PublishOutcome =
  | "published"
  | "paused"
  | "not_due"
  | "cancelled"
  | "failed"
  | "skipped";

const SYSTEM = "system:publisher";
const MEDIA_URL_TTL_SECONDS = 2 * 3600;
/** Treat a post as due slightly early: Temporal timers can wake a little late, never early. */
const DUE_TOLERANCE_MS = 60_000;

/** Ends the publication as failed with a message the doctor can act on. Not retried. */
async function markFailed(
  db: Database,
  ctx: { workspaceId: string; publicationId: string },
  message: string,
  details?: unknown,
) {
  await withTenant(db, { userId: SYSTEM, workspaceId: ctx.workspaceId }, async (tx) => {
    await tx
      .update(publications)
      .set({ status: "failed", error: { message, details: details ?? null } })
      .where(eq(publications.id, ctx.publicationId));
    await tx.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      actor: SYSTEM,
      action: "publication.failed",
      entity: "publication",
      entityId: ctx.publicationId,
      payload: { message },
    });
  });
}

/** Marks the publication published and links the new post into the corpus (closes the loop). */
async function recordPublished(
  db: Database,
  input: { workspaceId: string; publicationId: string },
  result: { mediaId: string; caption: string; permalink: string | null },
): Promise<{ outcome: "published"; mediaId: string }> {
  await withTenant(db, { userId: SYSTEM, workspaceId: input.workspaceId }, async (tx) => {
    const [publication] = await tx
      .select()
      .from(publications)
      .where(eq(publications.id, input.publicationId));
    if (!publication) return;
    const [connection] = await tx
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, publication.connectedAccountId));
    const [variant] = await tx
      .select()
      .from(contentVariants)
      .where(eq(contentVariants.id, publication.variantId));
    let postId: string | null = null;
    if (connection?.sourceAccountId && variant) {
      const [post] = await tx
        .insert(posts)
        .values({
          accountId: connection.sourceAccountId,
          platform: "instagram",
          platformPostId: result.mediaId,
          format: variant.format,
          caption: result.caption,
          publishedAt: new Date(),
          permalink: result.permalink,
          ingestedVia: "official_api",
          isOwnedByTenant: true,
        })
        .onConflictDoUpdate({
          target: [posts.platform, posts.platformPostId],
          set: { isOwnedByTenant: true },
        })
        .returning({ id: posts.id });
      postId = post?.id ?? null;
    }
    await tx
      .update(publications)
      .set({
        status: "published",
        publishedAt: new Date(),
        platformPostId: result.mediaId,
        permalink: result.permalink,
        postId,
        error: null,
      })
      .where(eq(publications.id, input.publicationId));
    if (variant) {
      await tx
        .update(contentItems)
        .set({ status: "published", updatedAt: new Date() })
        .where(and(eq(contentItems.id, variant.contentItemId)));
    }
    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actor: SYSTEM,
      action: "publication.published",
      entity: "publication",
      entityId: input.publicationId,
      payload: { mediaId: result.mediaId, permalink: result.permalink },
    });
  });
  return { outcome: "published", mediaId: result.mediaId };
}

export function createPublishingActivities(db: Database, deps: PublishingDeps | null) {
  const pollIntervalMs = deps?.pollIntervalMs ?? 5000;
  const maxPolls = deps?.maxPolls ?? 12;

  return {
    /** Current state, so the workflow can decide whether to wait, publish or stop. */
    async publicationState(input: { workspaceId: string; publicationId: string }) {
      return withTenant(db, { userId: SYSTEM, workspaceId: input.workspaceId }, async (tx) => {
        const [row] = await tx
          .select({
            status: publications.status,
            scheduledAt: publications.scheduledAt,
            pausedAt: workspaces.publishingPausedAt,
          })
          .from(publications)
          .innerJoin(workspaces, eq(workspaces.id, publications.workspaceId))
          .where(eq(publications.id, input.publicationId));
        if (!row) return { status: "cancelled" as const, scheduledAt: null, paused: false };
        return {
          status: row.status,
          scheduledAt: row.scheduledAt.toISOString(),
          paused: Boolean(row.pausedAt),
        };
      });
    },

    /** Publishes one scheduled post. Safe to retry: it never creates a second post. */
    async publishPublication(input: {
      workspaceId: string;
      publicationId: string;
    }): Promise<{ outcome: PublishOutcome; mediaId?: string }> {
      if (!deps)
        throw ApplicationFailure.nonRetryable(
          "Publishing is not configured",
          "PublishingNotConfigured",
        );
      const ctx = { userId: SYSTEM, workspaceId: input.workspaceId };

      // 1. Lock the publication and re-check everything at publishing time.
      const loaded = await withTenant(db, ctx, async (tx) => {
        const [publication] = await tx
          .select()
          .from(publications)
          .where(eq(publications.id, input.publicationId))
          .for("update");
        if (!publication) return { outcome: "cancelled" as const };
        if (publication.status === "published")
          return {
            outcome: "published" as const,
            mediaId: publication.platformPostId ?? undefined,
          };
        if (publication.status === "cancelled" || publication.status === "failed")
          return { outcome: publication.status };
        const [workspace] = await tx
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, input.workspaceId));
        if (workspace?.publishingPausedAt) return { outcome: "paused" as const };
        if (publication.scheduledAt.getTime() > Date.now() + DUE_TOLERANCE_MS)
          return { outcome: "not_due" as const };

        const [variant] = await tx
          .select()
          .from(contentVariants)
          .where(eq(contentVariants.id, publication.variantId));
        const [item] = variant
          ? await tx.select().from(contentItems).where(eq(contentItems.id, variant.contentItemId))
          : [];
        const [connection] = await tx
          .select()
          .from(connectedAccounts)
          .where(eq(connectedAccounts.id, publication.connectedAccountId));
        const [source] = connection?.sourceAccountId
          ? await tx
              .select({ handle: sourceAccounts.handle })
              .from(sourceAccounts)
              .where(eq(sourceAccounts.id, connection.sourceAccountId))
          : [];
        const [profile] = await tx
          .select()
          .from(professionalProfiles)
          .where(eq(professionalProfiles.workspaceId, input.workspaceId));
        const [brand] = await tx
          .select()
          .from(brandSettings)
          .where(eq(brandSettings.workspaceId, input.workspaceId));
        const token =
          connection?.status === "active" ? await deps.vault.get(tx, connection.tokenRef) : null;

        await tx
          .update(publications)
          .set({ status: "publishing", attempts: publication.attempts + 1 })
          .where(eq(publications.id, publication.id));
        return {
          outcome: "go" as const,
          publication,
          variant,
          item,
          connection,
          handle: source?.handle,
          profile,
          brand,
          token,
        };
      });
      if (loaded.outcome !== "go") return loaded;
      const { publication, variant, item, connection, handle, profile, brand, token } = loaded;
      const fail = async (message: string, details?: unknown) => {
        await markFailed(
          db,
          { workspaceId: input.workspaceId, publicationId: publication.id },
          message,
          details,
        );
        return { outcome: "failed" as const };
      };

      if (!variant || !item) return fail("O conteúdo aprovado não foi encontrado.");
      if (
        variant.complianceStatus === "block" ||
        variant.complianceStatus === "pending" ||
        !variant.isSelected
      ) {
        return fail("Este conteúdo não está mais aprovado para publicação.");
      }
      if (!profile) return fail("Complete o perfil profissional (CRM e RQE) para publicar.");
      if (!connection || !token)
        return fail("A conexão com o Instagram não está ativa. Reconecte para publicar.");

      const body = variant.body as {
        caption: string;
        hashtags?: string[];
        previewLine?: string;
        slides?: { n: number; role: string; title: string; body: string }[];
      };
      const plan = instagramPublishPlan({
        format: variant.format,
        title: item.title,
        previewLine: body.previewLine,
        slides: body.slides,
      });
      if (!plan.ok) return fail(plan.reason);
      const signature = signatureLine({
        ...profile,
        specialties: profile.specialties as { name: string; rqe: string | null }[],
      });
      const { caption, problems } = composeCaption({
        caption: body.caption,
        hashtags: body.hashtags,
        signature,
        aiDisclosure: brand?.aiDisclosure,
      });
      if (problems.length) return fail(problems.join(" "));

      const ig = connection.platformAccountId;
      const graphFailure = async (error: unknown): Promise<never> => {
        // Hand the row back to "scheduled" so the next attempt can lock it again.
        await withTenant(db, ctx, (tx) =>
          tx
            .update(publications)
            .set({ status: "scheduled" })
            .where(eq(publications.id, publication.id)),
        );
        if (error instanceof GraphApiError && error.isAuthError) {
          await withTenant(db, ctx, (tx) =>
            tx
              .update(connectedAccounts)
              .set({ status: "expired" })
              .where(eq(connectedAccounts.id, connection.id)),
          );
          await fail("A Meta encerrou o acesso ao Instagram. Reconecte e reagende.");
          throw ApplicationFailure.nonRetryable(error.message, "MetaAuthError");
        }
        if (error instanceof GraphApiError && !error.isRetryable) {
          // Meta rejected the request itself (invalid parameter, unsupported media): retrying won't help.
          await fail(`O Instagram recusou a publicação: ${error.message}`, error.body);
          throw ApplicationFailure.nonRetryable(error.message, "PublishRejected");
        }
        throw ApplicationFailure.retryable(
          error instanceof Error ? error.message : String(error),
          "PublishRetryable",
        );
      };

      try {
        // 2. Containers: reuse the one from an earlier attempt if it exists.
        let containerId = publication.containerId;
        if (containerId) {
          const status = await deps.graph.containerStatus(containerId, token);
          if (status.status_code === "PUBLISHED") {
            // An earlier attempt published but its answer was lost: find the post instead of publishing again.
            const recent = await deps.graph.listMedia(ig, token, 10);
            const match = recent.find(
              (m) => (m.caption ?? "").trim() === (publication.finalCaption ?? caption).trim(),
            );
            if (match)
              return recordPublished(db, input, {
                mediaId: match.id,
                caption,
                permalink: match.permalink ?? null,
              });
            return fail(
              "O Instagram indica que o post já foi publicado, mas não o encontramos. Confira o perfil antes de reagendar.",
            );
          }
          if (status.status_code === "EXPIRED") containerId = null; // containers expire after 24h; make a new one
          if (status.status_code === "ERROR")
            return fail("O Instagram recusou as imagens do post.", status);
        }

        if (!containerId) {
          const pngs = await renderSlides(plan.slides, { signature, handle });
          const urls: string[] = [];
          for (const [i, png] of pngs.entries()) {
            const key = `w/${input.workspaceId}/publications/${publication.id}/slide-${i + 1}.png`;
            await deps.store.put(key, png, "image/png");
            urls.push(await deps.store.signedUrl(key, MEDIA_URL_TTL_SECONDS));
          }
          const children: string[] = [];
          if (plan.kind === "carousel") {
            for (const url of urls)
              children.push(
                (
                  await deps.graph.createImageContainer(ig, token, {
                    imageUrl: url,
                    carouselItem: true,
                  })
                ).id,
              );
            containerId = (
              await deps.graph.createCarouselContainer(ig, token, { children, caption })
            ).id;
          } else {
            containerId = (
              await deps.graph.createImageContainer(ig, token, { imageUrl: urls[0] ?? "", caption })
            ).id;
          }
          await withTenant(db, ctx, (tx) =>
            tx
              .update(publications)
              .set({ containerId, childContainerIds: children, finalCaption: caption })
              .where(eq(publications.id, publication.id)),
          );
        }

        // 3. Wait until Meta has fetched and processed the images.
        let ready = false;
        for (let poll = 0; poll < maxPolls; poll++) {
          const status = await deps.graph.containerStatus(containerId, token);
          if (status.status_code === "FINISHED") {
            ready = true;
            break;
          }
          if (status.status_code === "ERROR")
            return fail("O Instagram recusou as imagens do post.", status);
          await sleep(pollIntervalMs);
        }
        if (!ready) return graphFailure(new Error("Container still processing"));

        // 4. Respect the 24-hour publishing limit.
        const limit = await deps.graph.publishingLimit(ig, token);
        if (limit.used >= limit.total)
          return graphFailure(new Error("Daily publishing limit reached"));

        // 5. Publish.
        const published = await deps.graph.publishContainer(ig, token, containerId);
        const permalink = await deps.graph.mediaPermalink(published.id, token).catch(() => null);
        return recordPublished(db, input, { mediaId: published.id, caption, permalink });
      } catch (error) {
        if (error instanceof ApplicationFailure) throw error;
        return graphFailure(error);
      }
    },
  };
}
