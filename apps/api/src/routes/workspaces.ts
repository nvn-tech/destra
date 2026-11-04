import { randomUUID } from "node:crypto";
import {
  auditLog,
  billingAccounts,
  type Database,
  memberships,
  professionalProfiles,
  withTenant,
  workspaces,
} from "@destra/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Guards } from "../plugins/tenant.js";

const BRAZIL_UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const createWorkspaceBody = z.object({
  name: z.string().trim().min(1).max(120),
  legalName: z.string().trim().min(1).max(200).optional(),
  taxId: z
    .string()
    .regex(/^\d{11}$|^\d{14}$/, "CPF (11 digits) or CNPJ (14 digits), digits only")
    .optional(),
});

const professionalProfileBody = z.object({
  fullName: z.string().trim().min(1).max(200),
  council: z.string().trim().min(2).max(10).default("CRM"),
  councilNumber: z.string().regex(/^\d{1,10}$/, "digits only"),
  councilUf: z.enum(BRAZIL_UFS),
  specialties: z
    .array(z.object({ name: z.string().trim().min(1), rqe: z.string().regex(/^\d+$/).nullable() }))
    .max(5)
    .default([]),
});

const workspaceParams = z.object({ workspaceId: z.uuid() });

export async function workspaceRoutes(
  app: FastifyInstance,
  db: Database,
  guards: Guards,
): Promise<void> {
  /** Creates a billing account, the workspace and the caller's owner membership. */
  app.post("/v1/workspaces", async (request, reply) => {
    const userId = await guards.requireUser(request);
    const body = createWorkspaceBody.parse(request.body);
    const billingAccountId = randomUUID();
    const workspaceId = randomUUID();

    await withTenant(db, { userId }, async (tx) => {
      await tx.insert(billingAccounts).values({
        id: billingAccountId,
        legalName: body.legalName ?? body.name,
        taxId: body.taxId,
        ownerUserId: userId,
      });
      await tx.insert(workspaces).values({ id: workspaceId, billingAccountId, name: body.name });
      await tx.insert(memberships).values({ workspaceId, userId, role: "owner" });
    });
    // Second transaction: the workspace context can only be set once the membership exists.
    await withTenant(db, { userId, workspaceId }, (tx) =>
      tx.insert(auditLog).values({
        workspaceId,
        actor: userId,
        action: "workspace.created",
        entity: "workspace",
        entityId: workspaceId,
      }),
    );

    return reply.status(201).send({ id: workspaceId, name: body.name, role: "owner" });
  });

  /** Lists the workspaces the caller belongs to. */
  app.get("/v1/workspaces", async (request) => {
    const userId = await guards.requireUser(request);
    const rows = await withTenant(db, { userId }, (tx) =>
      tx
        .select({
          id: workspaces.id,
          name: workspaces.name,
          autonomyLevel: workspaces.autonomyLevel,
          role: memberships.role,
        })
        .from(workspaces)
        .innerJoin(memberships, eq(memberships.workspaceId, workspaces.id))
        .where(eq(memberships.userId, userId))
        .orderBy(workspaces.createdAt),
    );
    return { workspaces: rows };
  });

  app.get("/v1/workspaces/:workspaceId", async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const access = await guards.requireWorkspace(request, workspaceId);
    const result = await withTenant(db, access, async (tx) => {
      const [workspace] = await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId));
      const [profile] = await tx
        .select()
        .from(professionalProfiles)
        .where(eq(professionalProfiles.workspaceId, workspaceId));
      return { workspace, profile };
    });
    return {
      id: result.workspace?.id,
      name: result.workspace?.name,
      autonomyLevel: result.workspace?.autonomyLevel,
      timezone: result.workspace?.timezone,
      publishingPausedAt: result.workspace?.publishingPausedAt ?? null,
      role: access.role,
      professionalProfile: result.profile ?? null,
    };
  });

  /** Sets the council registration used in every post's identification (CFM Res. 2.336/2023). */
  app.put("/v1/workspaces/:workspaceId/professional-profile", async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const access = await guards.requireWorkspace(request, workspaceId, "owner");
    const body = professionalProfileBody.parse(request.body);

    const profile = await withTenant(db, access, async (tx) => {
      const [row] = await tx
        .insert(professionalProfiles)
        .values({ workspaceId, ...body })
        .onConflictDoUpdate({ target: professionalProfiles.workspaceId, set: body })
        .returning();
      await tx.insert(auditLog).values({
        workspaceId,
        actor: access.userId,
        action: "professional_profile.updated",
        entity: "professional_profile",
        entityId: workspaceId,
        payload: { council: body.council, councilUf: body.councilUf },
      });
      return row;
    });
    return { professionalProfile: profile };
  });
}
