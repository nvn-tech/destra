import { createDb, type DbHandle, memberships } from "@destra/db";
import { seedDemoReviewQueue } from "@destra/db/seed";
import { FakeGraph } from "@destra/meta/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OWNER_URL } from "./test/env.js";
import { type Harness, RecordingJobQueue, signUp, startHarness } from "./test/harness.js";

const graph = new FakeGraph();
const jobs = new RecordingJobQueue();
let h: Harness;
let owner: DbHandle;
let codeCounter = 0;

beforeAll(async () => {
  h = await startHarness({ graphUrl: await graph.start(), jobs });
  owner = createDb(OWNER_URL);
});

afterAll(async () => {
  await h.close();
  await owner.close();
  await graph.stop();
});

interface Variant {
  id: string;
  body: { label: string };
}
interface Item {
  id: string;
  title: string;
  variants: Variant[];
}

/** A workspace with profile, demo queue and (optionally) a connected Instagram account. */
async function setup(options: { connect?: boolean } = {}) {
  const cookie = await signUp(h.app, "Ana");
  const { id: workspaceId } = (
    await h.app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: { cookie },
      payload: { name: "Ana" },
    })
  ).json();
  await h.app.inject({
    method: "PUT",
    url: `/v1/workspaces/${workspaceId}/professional-profile`,
    headers: { cookie },
    payload: {
      fullName: "Dra. Ana Souza",
      councilNumber: "123456",
      councilUf: "SP",
      specialties: [{ name: "Endocrinologia", rqe: "7890" }],
    },
  });
  await seedDemoReviewQueue(owner.db, workspaceId);
  if (options.connect ?? true) {
    codeCounter += 1;
    const code = `code-${codeCounter}`;
    graph.addUser({
      id: `fb-${codeCounter}`,
      name: "Ana",
      code,
      pages: [
        {
          id: `p-${codeCounter}`,
          name: "P",
          access_token: `pt-${codeCounter}`,
          tasks: ["MANAGE"],
          instagram_business_account: { id: `ig-${codeCounter}`, username: `dra${codeCounter}` },
        },
      ],
    });
    const start = (
      await h.app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/connections/instagram/start`,
        headers: { cookie },
      })
    ).json();
    const state = new URL(start.url).searchParams.get("state") ?? "";
    await h.app.inject({
      method: "GET",
      url: `/v1/integrations/meta/callback?code=${code}&state=${encodeURIComponent(state)}`,
      headers: { cookie },
    });
  }
  const items: Item[] = (
    await h.app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/review-queue`,
      headers: { cookie },
    })
  ).json().items;
  const variant = (title: string, label: string) => {
    const found = items
      .find((i) => i.title === title)
      ?.variants.find((v) => v.body.label === label);
    if (!found) throw new Error(`missing ${title}/${label}`);
    return found;
  };
  return { cookie, workspaceId, variant };
}

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function approve(cookie: string, workspaceId: string, variantId: string, scheduledAt?: string) {
  return h.app.inject({
    method: "POST",
    url: `/v1/workspaces/${workspaceId}/variants/${variantId}/approve`,
    headers: { cookie },
    payload: scheduledAt ? { attestation: true, scheduledAt } : { attestation: true },
  });
}

describe("approve and schedule", () => {
  it("schedules a carousel and starts its publish workflow", async () => {
    const { cookie, workspaceId, variant } = await setup();
    const v = variant("Menopausa: o que é normal sentir?", "Pergunta");
    const response = await approve(cookie, workspaceId, v.id, inDays(2));
    expect(response.statusCode).toBe(200);
    const { publicationId, status } = response.json();
    expect(status).toBe("scheduled");
    expect(jobs.publications).toContainEqual({ workspaceId, publicationId });

    const list = (
      await h.app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/publications`,
        headers: { cookie },
      })
    ).json();
    expect(list.publications).toEqual([
      expect.objectContaining({
        id: publicationId,
        status: "scheduled",
        title: "Menopausa: o que é normal sentir?",
        label: "Pergunta",
        format: "carousel",
      }),
    ]);
  });

  it("only accepts times between 5 minutes and 75 days ahead", async () => {
    const { cookie, workspaceId, variant } = await setup();
    const v = variant("Menopausa: o que é normal sentir?", "Pergunta");
    expect(
      (await approve(cookie, workspaceId, v.id, new Date(Date.now() + 60_000).toISOString()))
        .statusCode,
    ).toBe(422);
    expect((await approve(cookie, workspaceId, v.id, inDays(80))).statusCode).toBe(422);
  });

  it("needs a connected Instagram account to schedule, but can still approve", async () => {
    const { cookie, workspaceId, variant } = await setup({ connect: false });
    const v = variant("Menopausa: o que é normal sentir?", "Pergunta");
    expect((await approve(cookie, workspaceId, v.id, inDays(1))).statusCode).toBe(409);
    expect((await approve(cookie, workspaceId, v.id)).json().status).toBe("approved");
  });

  it("refuses to schedule reels, which need a recorded video", async () => {
    const { cookie, workspaceId, variant } = await setup();
    const v = variant("Cansaço constante pode ser a tireoide?", "Roteiro de reel");
    const response = await approve(cookie, workspaceId, v.id, inDays(1));
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatch(/Reels/);
  });
});

describe("managing publications", () => {
  it("reschedules and cancels; cancelling returns the post to approved", async () => {
    const { cookie, workspaceId, variant } = await setup();
    const { publicationId } = (
      await approve(
        cookie,
        workspaceId,
        variant("Menopausa: o que é normal sentir?", "Pergunta").id,
        inDays(2),
      )
    ).json();
    const base = `/v1/workspaces/${workspaceId}/publications/${publicationId}`;

    const reschedule = await h.app.inject({
      method: "PATCH",
      url: base,
      headers: { cookie },
      payload: { scheduledAt: inDays(3) },
    });
    expect(reschedule.statusCode).toBe(200);

    expect(
      (await h.app.inject({ method: "DELETE", url: base, headers: { cookie } })).statusCode,
    ).toBe(200);
    expect(
      (await h.app.inject({ method: "DELETE", url: base, headers: { cookie } })).statusCode,
    ).toBe(409);
    const list = (
      await h.app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/publications`,
        headers: { cookie },
      })
    ).json();
    expect(list.publications[0].status).toBe("cancelled");
  });

  it("does not let viewers change the schedule", async () => {
    const { cookie, workspaceId, variant } = await setup();
    const { publicationId } = (
      await approve(
        cookie,
        workspaceId,
        variant("Menopausa: o que é normal sentir?", "Pergunta").id,
        inDays(2),
      )
    ).json();
    const viewer = await signUp(h.app, "Viewer");
    const session = await h.app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { cookie: viewer },
    });
    await owner.db
      .insert(memberships)
      .values({ workspaceId, userId: session.json().user.id, role: "viewer" });
    const response = await h.app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/publications/${publicationId}`,
      headers: { cookie: viewer },
    });
    expect(response.statusCode).toBe(403);
  });
});
