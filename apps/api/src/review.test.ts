import { auditLog, createDb, type DbHandle, memberships } from "@destra/db";
import { seedDemoReviewQueue } from "@destra/db/seed";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OWNER_URL } from "./test/env.js";
import { type Harness, signUp, startHarness } from "./test/harness.js";

let h: Harness;
let owner: DbHandle;

beforeAll(async () => {
  h = await startHarness();
  owner = createDb(OWNER_URL);
});

afterAll(async () => {
  await h.close();
  await owner.close();
});

interface QueueVariant {
  id: string;
  complianceStatus: string;
  body: { label: string };
  compliance: {
    checks: { ruleCode: string; ruleTitle: string; sourceReference: string; result: string }[];
  };
}
interface QueueItem {
  id: string;
  title: string;
  variants: QueueVariant[];
}

async function createSeededWorkspace(
  app: FastifyInstance,
  options: { withProfile?: boolean } = {},
) {
  const cookie = await signUp(app);
  const { id } = (
    await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: { cookie },
      payload: { name: "Dra. Ana Souza" },
    })
  ).json();
  if (options.withProfile ?? true) {
    await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${id}/professional-profile`,
      headers: { cookie },
      payload: {
        fullName: "Dra. Ana Souza",
        councilNumber: "123456",
        councilUf: "SP",
        specialties: [{ name: "Endocrinologia e Metabologia", rqe: "7890" }],
      },
    });
  }
  await seedDemoReviewQueue(owner.db, id);
  return { cookie, workspaceId: id as string };
}

async function getQueue(cookie: string, workspaceId: string): Promise<QueueItem[]> {
  const response = await h.app.inject({
    method: "GET",
    url: `/v1/workspaces/${workspaceId}/review-queue`,
    headers: { cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json().items;
}

/** Signs up another user and adds them to the workspace with `role` (no invite flow yet). */
async function addMember(workspaceId: string, role: "viewer" | "editor" | "approver") {
  const cookie = await signUp(h.app, role);
  const me = await h.app.inject({
    method: "GET",
    url: "/api/auth/get-session",
    headers: { cookie },
  });
  const userId = me.json().user.id as string;
  await owner.db.insert(memberships).values({ workspaceId, userId, role });
  return cookie;
}

function find(items: QueueItem[], title: string, label: string) {
  const variant = items
    .find((i) => i.title === title)
    ?.variants.find((v) => v.body.label === label);
  if (!variant) throw new Error(`variant ${title}/${label} not found`);
  return variant;
}

describe("review queue", () => {
  it("lists items with their variants and the latest compliance checks", async () => {
    const { cookie, workspaceId } = await createSeededWorkspace(h.app);
    const items = await getQueue(cookie, workspaceId);

    expect(items.map((i) => i.title)).toEqual([
      "5 mitos sobre a tireoide",
      "Menopausa: o que é normal sentir?",
      "Cansaço constante pode ser a tireoide?",
    ]);
    expect(items[0]?.variants.map((v) => v.complianceStatus)).toEqual(["pass", "warn", "block"]);
    const blocked = find(items, "5 mitos sobre a tireoide", "História do consultório");
    expect(blocked.compliance.checks).toContainEqual(
      expect.objectContaining({
        ruleCode: "CFM-PROMESSA-RESULTADO",
        ruleTitle: "Promessa ou garantia de resultado",
        sourceReference: "CFM Res. 2.336/2023",
        result: "block",
      }),
    );
  });

  it("is invisible to other tenants", async () => {
    const { workspaceId } = await createSeededWorkspace(h.app);
    const stranger = await signUp(h.app, "Stranger");
    const response = await h.app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/review-queue`,
      headers: { cookie: stranger },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("approval", () => {
  it("requires the responsibility attestation", async () => {
    const { cookie, workspaceId } = await createSeededWorkspace(h.app);
    const variant = find(
      await getQueue(cookie, workspaceId),
      "5 mitos sobre a tireoide",
      "Mito vs. fato",
    );
    const response = await h.app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/variants/${variant.id}/approve`,
      headers: { cookie },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("refuses a blocked variant", async () => {
    const { cookie, workspaceId } = await createSeededWorkspace(h.app);
    const variant = find(
      await getQueue(cookie, workspaceId),
      "5 mitos sobre a tireoide",
      "História do consultório",
    );
    const response = await h.app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/variants/${variant.id}/approve`,
      headers: { cookie },
      payload: { attestation: true },
    });
    expect(response.statusCode).toBe(409);
  });

  it("approves one variant, removes the item from the queue and writes the audit log", async () => {
    const { cookie, workspaceId } = await createSeededWorkspace(h.app);
    const variant = find(
      await getQueue(cookie, workspaceId),
      "5 mitos sobre a tireoide",
      "Estatística",
    );

    const approve = () =>
      h.app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/variants/${variant.id}/approve`,
        headers: { cookie },
        payload: { attestation: true },
      });
    const first = await approve();
    expect(first.statusCode).toBe(200);

    const remaining = await getQueue(cookie, workspaceId);
    expect(remaining.map((i) => i.title)).not.toContain("5 mitos sobre a tireoide");

    const audit = await owner.db.select().from(auditLog).where(eq(auditLog.entityId, variant.id));
    expect(audit).toEqual([expect.objectContaining({ action: "variant.approved", workspaceId })]);

    expect((await approve()).statusCode).toBe(409);
  });

  it("requires the professional profile used in the post identification", async () => {
    const { cookie, workspaceId } = await createSeededWorkspace(h.app, { withProfile: false });
    const variant = find(
      await getQueue(cookie, workspaceId),
      "Menopausa: o que é normal sentir?",
      "Pergunta",
    );
    const response = await h.app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/variants/${variant.id}/approve`,
      headers: { cookie },
      payload: { attestation: true },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/perfil profissional/);
  });

  it("is not allowed for viewers", async () => {
    const { cookie, workspaceId } = await createSeededWorkspace(h.app);
    const viewer = await addMember(workspaceId, "viewer");
    const variant = find(
      await getQueue(cookie, workspaceId),
      "Menopausa: o que é normal sentir?",
      "Pergunta",
    );
    const response = await h.app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/variants/${variant.id}/approve`,
      headers: { cookie: viewer },
      payload: { attestation: true },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects an item", async () => {
    const { cookie, workspaceId } = await createSeededWorkspace(h.app);
    const [item] = await getQueue(cookie, workspaceId);
    const response = await h.app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/content-items/${item?.id}/reject`,
      headers: { cookie },
      payload: { comment: "Tema já publicado" },
    });
    expect(response.statusCode).toBe(200);
    expect((await getQueue(cookie, workspaceId)).map((i) => i.id)).not.toContain(item?.id);
  });
});

describe("publishing kill switch", () => {
  const setPaused = (cookie: string, workspaceId: string, paused: boolean) =>
    h.app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/publishing`,
      headers: { cookie },
      payload: { paused },
    });

  it("lets the owner pause and resume publishing", async () => {
    const { cookie, workspaceId } = await createSeededWorkspace(h.app);
    const paused = await setPaused(cookie, workspaceId, true);
    expect(paused.statusCode).toBe(200);
    expect(paused.json().publishingPausedAt).not.toBeNull();

    const workspace = await h.app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}`,
      headers: { cookie },
    });
    expect(workspace.json().publishingPausedAt).not.toBeNull();

    expect((await setPaused(cookie, workspaceId, false)).json().publishingPausedAt).toBeNull();
  });

  it("works for editors but not for viewers", async () => {
    const { workspaceId } = await createSeededWorkspace(h.app);
    const editor = await addMember(workspaceId, "editor");
    const viewer = await addMember(workspaceId, "viewer");
    expect((await setPaused(editor, workspaceId, true)).statusCode).toBe(200);
    expect((await setPaused(viewer, workspaceId, false)).statusCode).toBe(403);
  });
});
