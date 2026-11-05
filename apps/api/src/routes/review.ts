import { randomUUID } from "node:crypto";
import {
  approvals,
  auditLog,
  complianceChecks,
  complianceRules,
  complianceRuns,
  connectedAccounts,
  contentItems,
  contentVariants,
  type Database,
  professionalProfiles,
  publications,
  withTenant,
} from "@destra/db";
import { instagramPublishPlan } from "@destra/meta";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { JobQueue } from "../jobs.js";
import { type Guards, HttpError } from "../plugins/tenant.js";
import { assertSchedulable } from "./publications.js";

const workspaceParams = z.object({ workspaceId: z.uuid() });
const variantParams = workspaceParams.extend({ variantId: z.uuid() });
const itemParams = workspaceParams.extend({ itemId: z.uuid() });

/** The doctor must confirm responsibility for every approval (CFM: the physician remains responsible). */
const approveBody = z.object({
  attestation: z.literal(true),
  /** Optional: approve and schedule in one step. */
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
});
const rejectBody = z.object({ comment: z.string().trim().max(1000).optional() });
const publishingBody = z.object({ paused: z.boolean() });

export async function reviewRoutes(
  app: FastifyInstance,
  db: Database,
  guards: Guards,
  jobs: JobQueue,
) {
  /** Items waiting for review, each with its variants and the latest compliance checks. */
  app.get("/v1/workspaces/:workspaceId/review-queue", async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const access = await guards.requireWorkspace(request, workspaceId);

    return withTenant(db, access, async (tx) => {
      const items = await tx
        .select()
        .from(contentItems)
        .where(eq(contentItems.status, "in_review"))
        .orderBy(asc(contentItems.suggestedSlot), asc(contentItems.createdAt));
      if (items.length === 0) return { items: [] };

      const variants = await tx
        .select()
        .from(contentVariants)
        .where(
          inArray(
            contentVariants.contentItemId,
            items.map((i) => i.id),
          ),
        )
        .orderBy(asc(contentVariants.createdAt));

      const runs = variants.length
        ? await tx
            .select()
            .from(complianceRuns)
            .where(
              inArray(
                complianceRuns.variantId,
                variants.map((v) => v.id),
              ),
            )
            .orderBy(desc(complianceRuns.createdAt))
        : [];
      const latestRun = new Map<string, (typeof runs)[number]>();
      for (const run of runs) if (!latestRun.has(run.variantId)) latestRun.set(run.variantId, run);

      const runIds = [...latestRun.values()].map((r) => r.id);
      const checks = runIds.length
        ? await tx
            .select({
              id: complianceChecks.id,
              runId: complianceChecks.runId,
              result: complianceChecks.result,
              confidence: complianceChecks.confidence,
              evidence: complianceChecks.evidence,
              ruleCode: complianceRules.code,
              severity: complianceRules.severity,
              sourceReference: complianceRules.sourceReference,
              definition: complianceRules.definition,
            })
            .from(complianceChecks)
            .innerJoin(complianceRules, eq(complianceRules.id, complianceChecks.ruleId))
            .where(inArray(complianceChecks.runId, runIds))
        : [];

      return {
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          status: item.status,
          suggestedSlot: item.suggestedSlot,
          strategyTags: item.strategyTags,
          variants: variants
            .filter((v) => v.contentItemId === item.id)
            .map((v) => {
              const run = latestRun.get(v.id);
              return {
                id: v.id,
                format: v.format,
                platform: v.platform,
                body: v.body,
                complianceStatus: v.complianceStatus,
                isSelected: v.isSelected,
                compliance: run
                  ? {
                      decision: run.decision,
                      rulesetVersion: run.rulesetVersion,
                      checkedAt: run.createdAt,
                      checks: checks
                        .filter((c) => c.runId === run.id)
                        .map(({ runId: _runId, definition, ...c }) => ({
                          ...c,
                          ruleTitle: (definition as { title?: string } | null)?.title ?? c.ruleCode,
                        })),
                    }
                  : null,
              };
            }),
        })),
      };
    });
  });

  /** Approves one variant. There is deliberately no batch endpoint: each post is reviewed on its own. */
  app.post("/v1/workspaces/:workspaceId/variants/:variantId/approve", async (request) => {
    const { workspaceId, variantId } = variantParams.parse(request.params);
    const access = await guards.requireWorkspace(request, workspaceId, "approver");
    const body = approveBody.parse(request.body);
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (scheduledAt) assertSchedulable(scheduledAt);

    const result = await withTenant(db, access, async (tx) => {
      const [variant] = await tx
        .select()
        .from(contentVariants)
        .where(eq(contentVariants.id, variantId));
      if (!variant) throw new HttpError(404, "Variante não encontrada");
      const [item] = await tx
        .select()
        .from(contentItems)
        .where(eq(contentItems.id, variant.contentItemId))
        .for("update");
      if (item?.status !== "in_review") {
        throw new HttpError(409, "Este conteúdo não está aguardando revisão");
      }
      if (variant.complianceStatus === "block" || variant.complianceStatus === "pending") {
        throw new HttpError(
          409,
          "Esta variante tem um bloqueio. Edite o texto e verifique de novo antes de aprovar.",
        );
      }

      // Every post carries the doctor's identification (CFM Res. 2.336/2023), injected from the profile.
      const [profile] = await tx
        .select({ workspaceId: professionalProfiles.workspaceId })
        .from(professionalProfiles)
        .where(eq(professionalProfiles.workspaceId, workspaceId));
      if (!profile) {
        throw new HttpError(409, "Complete o perfil profissional (CRM e RQE) antes de aprovar.");
      }

      await tx.insert(approvals).values({
        workspaceId,
        variantId,
        userId: access.userId,
        decision: "approved",
      });
      await tx
        .update(contentVariants)
        .set({ isSelected: false })
        .where(eq(contentVariants.contentItemId, item.id));
      await tx
        .update(contentVariants)
        .set({ isSelected: true })
        .where(eq(contentVariants.id, variantId));
      await tx
        .update(contentItems)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(contentItems.id, item.id));
      await tx.insert(auditLog).values({
        workspaceId,
        actor: access.userId,
        action: "variant.approved",
        entity: "content_variant",
        entityId: variantId,
        payload: {
          contentItemId: item.id,
          complianceStatus: variant.complianceStatus,
          attestation: "Revisei este conteúdo e sou responsável pela publicação.",
        },
      });
      if (!scheduledAt)
        return {
          contentItemId: item.id,
          variantId,
          status: "approved" as const,
          publicationId: null,
        };

      // Approve and schedule: needs an active Instagram connection and a format we can publish.
      const [connection] = await tx
        .select()
        .from(connectedAccounts)
        .where(
          and(eq(connectedAccounts.platform, "instagram"), eq(connectedAccounts.status, "active")),
        )
        .limit(1);
      if (!connection)
        throw new HttpError(
          409,
          "Conecte o Instagram para agendar. Você pode aprovar sem agendar.",
        );
      const plan = instagramPublishPlan({
        format: variant.format,
        title: item.title,
        previewLine: (variant.body as { previewLine?: string }).previewLine,
        slides: (
          variant.body as { slides?: { n: number; role: string; title: string; body: string }[] }
        ).slides,
      });
      if (!plan.ok) throw new HttpError(422, plan.reason);
      const [publication] = await tx
        .insert(publications)
        .values({
          workspaceId,
          variantId,
          connectedAccountId: connection.id,
          scheduledAt,
          idempotencyKey: randomUUID(),
        })
        .returning({ id: publications.id });
      await tx
        .update(contentItems)
        .set({ status: "scheduled", updatedAt: new Date() })
        .where(eq(contentItems.id, item.id));
      await tx.insert(auditLog).values({
        workspaceId,
        actor: access.userId,
        action: "publication.scheduled",
        entity: "publication",
        entityId: publication?.id,
        payload: { variantId, scheduledAt: scheduledAt.toISOString() },
      });
      return {
        contentItemId: item.id,
        variantId,
        status: "scheduled" as const,
        publicationId: publication?.id ?? null,
      };
    });

    if (result.publicationId)
      await jobs.schedulePublication({ workspaceId, publicationId: result.publicationId });
    return result;
  });

  app.post("/v1/workspaces/:workspaceId/content-items/:itemId/reject", async (request) => {
    const { workspaceId, itemId } = itemParams.parse(request.params);
    const access = await guards.requireWorkspace(request, workspaceId, "approver");
    const body = rejectBody.parse(request.body ?? {});

    return withTenant(db, access, async (tx) => {
      const [item] = await tx
        .update(contentItems)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(and(eq(contentItems.id, itemId), eq(contentItems.status, "in_review")))
        .returning({ id: contentItems.id });
      if (!item) throw new HttpError(404, "Conteúdo não encontrado na fila");
      await tx.insert(auditLog).values({
        workspaceId,
        actor: access.userId,
        action: "content_item.rejected",
        entity: "content_item",
        entityId: itemId,
        payload: body.comment ? { comment: body.comment } : {},
      });
      return { contentItemId: itemId, status: "rejected" as const };
    });
  });

  /** Kill switch: pauses or resumes every publication of the workspace. */
  app.put("/v1/workspaces/:workspaceId/publishing", async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const access = await guards.requireWorkspace(request, workspaceId, "editor");
    const { paused } = publishingBody.parse(request.body);

    return withTenant(db, access, async (tx) => {
      const result = await tx.execute<{ paused_at: string | null }>(
        sql`select app.set_publishing_paused(${workspaceId}::uuid, ${paused}) as paused_at`,
      );
      await tx.insert(auditLog).values({
        workspaceId,
        actor: access.userId,
        action: paused ? "publishing.paused" : "publishing.resumed",
        entity: "workspace",
        entityId: workspaceId,
      });
      return { publishingPausedAt: result.rows[0]?.paused_at ?? null };
    });
  });
}
