import {
  accountSnapshots,
  auditLog,
  connectedAccounts,
  type Database,
  sourceAccounts,
  type Transaction,
  withTenant,
  workspaceReferences,
} from "@destra/db";
import { GraphApiError, normalizeUsername } from "@destra/meta";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { JobQueue } from "../jobs.js";
import { type Guards, HttpError } from "../plugins/tenant.js";
import type { MetaDeps } from "./instagram.js";

/** Reference limit per workspace for now (design partner plan). */
export const MAX_REFERENCES = 10;

const INFLUENCE = { baixa: "0.50", media: "1.00", alta: "1.50" } as const;
type Influence = keyof typeof INFLUENCE;
const influenceOf = (weight: string): Influence =>
  Number(weight) < 0.75 ? "baixa" : Number(weight) > 1.25 ? "alta" : "media";

const workspaceParams = z.object({ workspaceId: z.uuid() });
const referenceParams = workspaceParams.extend({ sourceAccountId: z.uuid() });
const addBody = z.object({
  username: z.string().min(1).max(100),
  influence: z.enum(["baixa", "media", "alta"]).default("media"),
});
const patchBody = z.object({ influence: z.enum(["baixa", "media", "alta"]) });

/** Crawl tier follows how many workspaces reference an account (shared corpus). */
async function adjustReferenceCount(tx: Transaction, sourceAccountId: string, delta: number) {
  await tx
    .update(sourceAccounts)
    .set({
      referenceCount: sql`greatest(${sourceAccounts.referenceCount} + ${delta}, 0)`,
      crawlTier: sql`case when greatest(${sourceAccounts.referenceCount} + ${delta}, 0) >= 5 then 'hot'::crawl_tier
                          when greatest(${sourceAccounts.referenceCount} + ${delta}, 0) >= 2 then 'warm'::crawl_tier
                          else 'cold'::crawl_tier end`,
    })
    .where(eq(sourceAccounts.id, sourceAccountId));
}

export async function referenceRoutes(
  app: FastifyInstance,
  db: Database,
  guards: Guards,
  jobs: JobQueue,
  deps: MetaDeps | null,
) {
  app.get("/v1/workspaces/:workspaceId/references", async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const access = await guards.requireWorkspace(request, workspaceId);
    const rows = await withTenant(db, access, (tx) =>
      tx
        .select({
          sourceAccountId: sourceAccounts.id,
          username: sourceAccounts.handle,
          displayName: sourceAccounts.displayName,
          status: sourceAccounts.status,
          lastSyncedAt: sourceAccounts.lastCrawledAt,
          weight: workspaceReferences.weight,
          addedAt: workspaceReferences.createdAt,
          followers: sql<
            number | null
          >`(select s.followers::integer from account_snapshots s where s.account_id = ${sourceAccounts.id} order by s.captured_at desc limit 1)`,
          postsAnalyzed: sql<number>`(select count(*)::int from posts p where p.account_id = ${sourceAccounts.id})`,
        })
        .from(workspaceReferences)
        .innerJoin(sourceAccounts, eq(sourceAccounts.id, workspaceReferences.sourceAccountId))
        .orderBy(desc(workspaceReferences.createdAt)),
    );
    return {
      references: rows.map(({ weight, ...r }) => ({ ...r, influence: influenceOf(weight) })),
      limit: MAX_REFERENCES,
    };
  });

  /** Adds a reference profile, checked through Business Discovery right away. */
  app.post("/v1/workspaces/:workspaceId/references", async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    if (!deps)
      throw new HttpError(503, "A integração com a Meta não está configurada neste ambiente.");
    const access = await guards.requireWorkspace(request, workspaceId, "editor");
    const body = addBody.parse(request.body);
    const username = normalizeUsername(body.username);
    if (!username) throw new HttpError(400, "Digite um @ válido do Instagram.");

    const { connection, token, count } = await withTenant(db, access, async (tx) => {
      const [connection] = await tx
        .select()
        .from(connectedAccounts)
        .where(
          and(eq(connectedAccounts.platform, "instagram"), eq(connectedAccounts.status, "active")),
        )
        .limit(1);
      if (!connection) return { connection: null, token: null, count: 0 };
      const [{ count } = { count: 0 }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(workspaceReferences);
      return { connection, token: await deps.vault.get(tx, connection.tokenRef), count };
    });
    if (!connection || !token)
      throw new HttpError(409, "Conecte o seu Instagram antes de adicionar referências.");
    if (count >= MAX_REFERENCES)
      throw new HttpError(409, `Seu plano permite até ${MAX_REFERENCES} referências.`);

    let profile: Awaited<ReturnType<typeof deps.graph.businessDiscovery>>;
    try {
      profile = await deps.graph.businessDiscovery(
        connection.platformAccountId,
        token,
        username,
        1,
      );
    } catch (error) {
      if (error instanceof GraphApiError && error.isAuthError) {
        await withTenant(db, access, (tx) =>
          tx
            .update(connectedAccounts)
            .set({ status: "expired" })
            .where(eq(connectedAccounts.id, connection.id)),
        );
        throw new HttpError(409, "A conexão com o Instagram expirou. Reconecte para continuar.");
      }
      if (error instanceof GraphApiError && !error.isRetryable) {
        throw new HttpError(
          422,
          `Não encontramos uma conta profissional pública @${username}. Contas pessoais não podem ser analisadas.`,
        );
      }
      throw error;
    }
    if (profile.id === connection.platformAccountId) {
      throw new HttpError(
        422,
        "Essa é a sua própria conta. Ela já é usada para aprender o seu estilo.",
      );
    }

    const reference = await withTenant(db, access, async (tx) => {
      const [source] = await tx
        .insert(sourceAccounts)
        .values({
          platform: "instagram",
          platformAccountId: profile.id,
          handle: profile.username ?? username,
          displayName: profile.name ?? null,
          accountType: "business",
        })
        .onConflictDoUpdate({
          target: [sourceAccounts.platform, sourceAccounts.platformAccountId],
          set: {
            handle: profile.username ?? username,
            displayName: profile.name ?? null,
            status: "active",
          },
        })
        .returning({ id: sourceAccounts.id });
      if (!source) throw new Error("Could not upsert source account");

      const inserted = await tx
        .insert(workspaceReferences)
        .values({
          workspaceId,
          sourceAccountId: source.id,
          weight: INFLUENCE[body.influence],
          reason: "user",
          addedBy: access.userId,
        })
        .onConflictDoNothing()
        .returning({ sourceAccountId: workspaceReferences.sourceAccountId });
      if (inserted.length === 0)
        throw new HttpError(409, `@${username} já está nas suas referências.`);

      await adjustReferenceCount(tx, source.id, 1);
      if (typeof profile.followers_count === "number") {
        await tx
          .insert(accountSnapshots)
          .values({
            accountId: source.id,
            capturedAt: new Date(),
            followers: profile.followers_count,
            mediaCount: profile.media_count ?? null,
          })
          .onConflictDoNothing();
      }
      await tx.insert(auditLog).values({
        workspaceId,
        actor: access.userId,
        action: "reference.added",
        entity: "source_account",
        entityId: source.id,
        payload: { username: profile.username ?? username },
      });
      return {
        sourceAccountId: source.id,
        username: profile.username ?? username,
        influence: body.influence,
      };
    });

    await jobs.syncReferenceAccount({ workspaceId, sourceAccountId: reference.sourceAccountId });
    return reply.status(201).send(reference);
  });

  app.patch("/v1/workspaces/:workspaceId/references/:sourceAccountId", async (request) => {
    const { workspaceId, sourceAccountId } = referenceParams.parse(request.params);
    const access = await guards.requireWorkspace(request, workspaceId, "editor");
    const { influence } = patchBody.parse(request.body);
    const updated = await withTenant(db, access, (tx) =>
      tx
        .update(workspaceReferences)
        .set({ weight: INFLUENCE[influence] })
        .where(eq(workspaceReferences.sourceAccountId, sourceAccountId))
        .returning({ id: workspaceReferences.sourceAccountId }),
    );
    if (updated.length === 0) throw new HttpError(404, "Referência não encontrada");
    return { sourceAccountId, influence };
  });

  app.delete("/v1/workspaces/:workspaceId/references/:sourceAccountId", async (request) => {
    const { workspaceId, sourceAccountId } = referenceParams.parse(request.params);
    const access = await guards.requireWorkspace(request, workspaceId, "editor");
    await withTenant(db, access, async (tx) => {
      const removed = await tx
        .delete(workspaceReferences)
        .where(eq(workspaceReferences.sourceAccountId, sourceAccountId))
        .returning({ id: workspaceReferences.sourceAccountId });
      if (removed.length === 0) throw new HttpError(404, "Referência não encontrada");
      await adjustReferenceCount(tx, sourceAccountId, -1);
      await tx.insert(auditLog).values({
        workspaceId,
        actor: access.userId,
        action: "reference.removed",
        entity: "source_account",
        entityId: sourceAccountId,
      });
    });
    return { status: "removed" };
  });
}
