import {
  auditLog,
  contentItems,
  contentVariants,
  type Database,
  publications,
  withTenant,
} from "@destra/db";
import type { LocalMediaStore } from "@destra/media/store";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { JobQueue } from "../jobs.js";
import { type Guards, HttpError } from "../plugins/tenant.js";

export const MIN_LEAD_MS = 5 * 60_000;
export const MAX_LEAD_MS = 75 * 86_400_000;

/** Scheduling window: at least 5 minutes ahead (time to render and process), at most 75 days. */
export function assertSchedulable(when: Date) {
  const lead = when.getTime() - Date.now();
  if (lead < MIN_LEAD_MS)
    throw new HttpError(422, "Escolha um horário a partir de 5 minutos daqui.");
  if (lead > MAX_LEAD_MS) throw new HttpError(422, "Agende com no máximo 75 dias de antecedência.");
}

const workspaceParams = z.object({ workspaceId: z.uuid() });
const publicationParams = workspaceParams.extend({ publicationId: z.uuid() });
const rescheduleBody = z.object({ scheduledAt: z.iso.datetime({ offset: true }) });

export async function publicationRoutes(
  app: FastifyInstance,
  db: Database,
  guards: Guards,
  jobs: JobQueue,
  localMedia: LocalMediaStore | null,
) {
  /** Scheduled and recent publications of the workspace. */
  app.get("/v1/workspaces/:workspaceId/publications", async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const access = await guards.requireWorkspace(request, workspaceId);
    const rows = await withTenant(db, access, (tx) =>
      tx
        .select({
          id: publications.id,
          status: publications.status,
          scheduledAt: publications.scheduledAt,
          publishedAt: publications.publishedAt,
          permalink: publications.permalink,
          error: publications.error,
          attempts: publications.attempts,
          contentItemId: contentItems.id,
          title: contentItems.title,
          format: contentVariants.format,
          body: contentVariants.body,
        })
        .from(publications)
        .innerJoin(contentVariants, eq(contentVariants.id, publications.variantId))
        .innerJoin(contentItems, eq(contentItems.id, contentVariants.contentItemId))
        .orderBy(desc(publications.scheduledAt))
        .limit(200),
    );
    return {
      publications: rows.map(({ body, error, ...r }) => ({
        ...r,
        label: (body as { label?: string }).label ?? null,
        errorMessage: (error as { message?: string } | null)?.message ?? null,
      })),
    };
  });

  app.patch("/v1/workspaces/:workspaceId/publications/:publicationId", async (request) => {
    const { workspaceId, publicationId } = publicationParams.parse(request.params);
    const access = await guards.requireWorkspace(request, workspaceId, "approver");
    const scheduledAt = new Date(rescheduleBody.parse(request.body).scheduledAt);
    assertSchedulable(scheduledAt);
    await withTenant(db, access, async (tx) => {
      const [updated] = await tx
        .update(publications)
        .set({ scheduledAt })
        .where(eq(publications.id, publicationId))
        .returning({ status: publications.status });
      if (!updated) throw new HttpError(404, "Publicação não encontrada");
      if (updated.status !== "scheduled")
        throw new HttpError(409, "Só é possível reagendar publicações ainda não enviadas.");
      await tx.insert(auditLog).values({
        workspaceId,
        actor: access.userId,
        action: "publication.rescheduled",
        entity: "publication",
        entityId: publicationId,
        payload: { scheduledAt: scheduledAt.toISOString() },
      });
    });
    await jobs.schedulePublication({ workspaceId, publicationId });
    return { publicationId, scheduledAt };
  });

  /** Cancels a scheduled publication; the post goes back to "approved". */
  app.delete("/v1/workspaces/:workspaceId/publications/:publicationId", async (request) => {
    const { workspaceId, publicationId } = publicationParams.parse(request.params);
    const access = await guards.requireWorkspace(request, workspaceId, "approver");
    await withTenant(db, access, async (tx) => {
      const [publication] = await tx
        .select()
        .from(publications)
        .where(eq(publications.id, publicationId))
        .for("update");
      if (!publication) throw new HttpError(404, "Publicação não encontrada");
      if (publication.status !== "scheduled")
        throw new HttpError(409, "Esta publicação já foi enviada ou encerrada.");
      await tx
        .update(publications)
        .set({ status: "cancelled" })
        .where(eq(publications.id, publicationId));
      const [variant] = await tx
        .select()
        .from(contentVariants)
        .where(eq(contentVariants.id, publication.variantId));
      if (variant) {
        await tx
          .update(contentItems)
          .set({ status: "approved", updatedAt: new Date() })
          .where(eq(contentItems.id, variant.contentItemId));
      }
      await tx.insert(auditLog).values({
        workspaceId,
        actor: access.userId,
        action: "publication.cancelled",
        entity: "publication",
        entityId: publicationId,
      });
    });
    return { publicationId, status: "cancelled" };
  });

  /** Development only: serves rendered slides with a signed, expiring URL (production uses S3). */
  if (localMedia) {
    app.get("/v1/media/*", async (request, reply) => {
      const key = (request.params as { "*": string })["*"];
      const query = z.object({ exp: z.coerce.number(), sig: z.string() }).parse(request.query);
      const data = await localMedia.read(key, query.exp, query.sig);
      if (!data) throw new HttpError(404, "Not found");
      return reply
        .header("content-type", "image/png")
        .header("cache-control", "private, max-age=300")
        .send(data);
    });
  }
}
