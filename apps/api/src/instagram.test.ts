import { createDb, type DbHandle, posts, sourceAccounts } from "@destra/db";
import { createSignedRequest } from "@destra/meta";
import { FakeGraph } from "@destra/meta/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OWNER_URL } from "./test/env.js";
import {
  type Harness,
  RecordingJobQueue,
  signUp,
  startHarness,
  TEST_META_APP_SECRET,
} from "./test/harness.js";

const graph = new FakeGraph();
const jobs = new RecordingJobQueue();
let h: Harness;
let owner: DbHandle;

const page = (id: string, igId: string, username: string, tasks = ["MANAGE"]) => ({
  id,
  name: `Página ${username}`,
  access_token: `page-token-${igId}`,
  tasks,
  instagram_business_account: { id: igId, username, name: username, followers_count: 1000 },
});

beforeAll(async () => {
  const graphUrl = await graph.start();
  graph.addUser({
    id: "fb-ana",
    name: "Ana",
    code: "code-ana",
    pages: [page("p-ana", "ig-ana", "dra.ana")],
  });
  graph.addUser({
    id: "fb-bruno",
    name: "Bruno",
    code: "code-bruno",
    pages: [page("p-b1", "ig-b1", "clinica.bruno"), page("p-b2", "ig-b2", "dr.bruno")],
  });
  graph.addUser({ id: "fb-carla", name: "Carla", code: "code-carla", pages: [] });
  graph.addUser({
    id: "fb-dani",
    name: "Dani",
    code: "code-dani",
    pages: [{ id: "p-dani", name: "Sem IG", access_token: "t-dani" }],
  });
  graph.addUser({
    id: "fb-edu",
    name: "Edu",
    code: "code-edu",
    pages: [page("p-edu", "ig-edu", "edu")],
    declined: ["instagram_basic"],
  });
  graph.addDiscoverable("dra.referencia", {
    id: "ig-ref-1",
    username: "dra.referencia",
    name: "Dra. Referência",
    followers_count: 184000,
    media_count: 412,
  });
  graph.addDiscoverable("dra.ana", { id: "ig-ana", username: "dra.ana", followers_count: 1000 });
  h = await startHarness({ graphUrl, jobs });
  owner = createDb(OWNER_URL);
});

afterAll(async () => {
  await h.close();
  await owner.close();
  await graph.stop();
});

async function workspaceFor(name: string) {
  const cookie = await signUp(h.app, name);
  const { id } = (
    await h.app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: { cookie },
      payload: { name },
    })
  ).json();
  return { cookie, workspaceId: id as string };
}

async function startLogin(cookie: string, workspaceId: string) {
  const response = await h.app.inject({
    method: "POST",
    url: `/v1/workspaces/${workspaceId}/connections/instagram/start`,
    headers: { cookie },
  });
  expect(response.statusCode).toBe(200);
  return new URL(response.json().url);
}

async function callback(cookie: string, query: Record<string, string>) {
  const response = await h.app.inject({
    method: "GET",
    url: `/v1/integrations/meta/callback?${new URLSearchParams(query)}`,
    headers: { cookie },
  });
  expect(response.statusCode).toBe(302);
  return new URL(String(response.headers.location));
}

async function connect(name: string, code: string) {
  const ws = await workspaceFor(name);
  const login = await startLogin(ws.cookie, ws.workspaceId);
  const redirect = await callback(ws.cookie, {
    code,
    state: login.searchParams.get("state") ?? "",
  });
  return { ...ws, redirect };
}

describe("connecting Instagram", () => {
  it("sends the user to the Facebook Login dialog with a signed state", async () => {
    const { cookie, workspaceId } = await workspaceFor("Ana");
    const url = await startLogin(cookie, workspaceId);
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4000/v1/integrations/meta/callback",
    );
    expect(url.searchParams.get("state")).toMatch(/\./);
  });

  it("connects a single Instagram account, stores tokens encrypted and starts the import", async () => {
    const { cookie, workspaceId, redirect } = await connect("Ana", "code-ana");
    expect(redirect.pathname).toBe(`/w/${workspaceId}/conexoes`);
    expect(redirect.searchParams.get("status")).toBe("connected");

    const list = (
      await h.app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/connections`,
        headers: { cookie },
      })
    ).json();
    expect(list.connections).toEqual([
      expect.objectContaining({ username: "dra.ana", status: "active", linkedPageId: "p-ana" }),
    ]);
    expect(JSON.stringify(list)).not.toContain("page-token");

    const stored = await owner.pool.query(
      "select kind, ciphertext from secrets where workspace_id = $1 order by kind",
      [workspaceId],
    );
    expect(stored.rows.map((r) => r.kind)).toEqual(["meta_page_token", "meta_user_token"]);
    expect(stored.rows.every((r) => !r.ciphertext.includes("token"))).toBe(true);

    expect(jobs.backfills).toContainEqual({
      workspaceId,
      connectedAccountId: list.connections[0].id,
    });
  });

  it("lets the user pick when the login returns several Instagram accounts", async () => {
    const { cookie, workspaceId, redirect } = await connect("Bruno", "code-bruno");
    const grantId = redirect.searchParams.get("grant");
    expect(grantId).toBeTruthy();

    const grant = await h.app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/connections/instagram/grants/${grantId}`,
      headers: { cookie },
    });
    expect(grant.json().candidates.map((c: { username: string }) => c.username)).toEqual([
      "clinica.bruno",
      "dr.bruno",
    ]);
    expect(grant.body).not.toContain("page-token");

    const complete = await h.app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/connections/instagram/grants/${grantId}/complete`,
      headers: { cookie },
      payload: { instagramAccountId: "ig-b2" },
    });
    expect(complete.statusCode).toBe(200);
    const list = (
      await h.app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/connections`,
        headers: { cookie },
      })
    ).json();
    expect(list.connections.map((c: { username: string }) => c.username)).toEqual(["dr.bruno"]);
  });

  it.each([
    ["code-carla", "no_pages"],
    ["code-dani", "no_instagram"],
    ["code-edu", "missing_permissions"],
  ])("explains why %s could not connect (%s)", async (code, error) => {
    const { redirect } = await connect("X", code);
    expect(redirect.searchParams.get("error")).toBe(error);
  });

  it("handles a cancelled login", async () => {
    const { cookie, workspaceId } = await workspaceFor("Ana");
    const login = await startLogin(cookie, workspaceId);
    const redirect = await callback(cookie, {
      error: "access_denied",
      state: login.searchParams.get("state") ?? "",
    });
    expect(redirect.searchParams.get("error")).toBe("cancelled");
  });

  it("rejects a tampered state and a different user's browser", async () => {
    const { cookie, workspaceId } = await workspaceFor("Ana");
    const login = await startLogin(cookie, workspaceId);
    const state = login.searchParams.get("state") ?? "";
    expect(
      (await callback(cookie, { code: "code-ana", state: `${state}x` })).searchParams.get("error"),
    ).toBe("invalid_state");
    const intruder = await signUp(h.app, "Intruder");
    expect((await callback(intruder, { code: "code-ana", state })).searchParams.get("error")).toBe(
      "session_mismatch",
    );
  });

  it("disconnects and deletes the tokens", async () => {
    const { cookie, workspaceId } = await connect("Ana", "code-ana");
    const [connection] = (
      await h.app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/connections`,
        headers: { cookie },
      })
    ).json().connections;
    const response = await h.app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/connections/${connection.id}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const stored = await owner.pool.query(
      "select count(*)::int as n from secrets where workspace_id = $1",
      [workspaceId],
    );
    expect(stored.rows[0].n).toBe(0);
  });
});

describe("reference profiles", () => {
  it("needs a connected Instagram account", async () => {
    const { cookie, workspaceId } = await workspaceFor("Sem conexão");
    const response = await h.app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/references`,
      headers: { cookie },
      payload: { username: "@dra.referencia" },
    });
    expect(response.statusCode).toBe(409);
  });

  it("adds, updates and removes a reference found through Business Discovery", async () => {
    const { cookie, workspaceId } = await connect("Ana", "code-ana");
    const add = await h.app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/references`,
      headers: { cookie },
      payload: { username: "@Dra.Referencia", influence: "alta" },
    });
    expect(add.statusCode).toBe(201);
    const { sourceAccountId } = add.json();
    expect(jobs.syncs).toContainEqual({ workspaceId, sourceAccountId });

    const list = (
      await h.app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/references`,
        headers: { cookie },
      })
    ).json();
    expect(list.references).toEqual([
      expect.objectContaining({ username: "dra.referencia", influence: "alta", followers: 184000 }),
    ]);

    const [account] = await owner.db
      .select()
      .from(sourceAccounts)
      .where(eq(sourceAccounts.id, sourceAccountId));
    expect(account?.referenceCount).toBeGreaterThanOrEqual(1);

    const duplicate = await h.app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/references`,
      headers: { cookie },
      payload: { username: "dra.referencia" },
    });
    expect(duplicate.statusCode).toBe(409);

    const patch = await h.app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/references/${sourceAccountId}`,
      headers: { cookie },
      payload: { influence: "baixa" },
    });
    expect(patch.json().influence).toBe("baixa");

    const remove = await h.app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/references/${sourceAccountId}`,
      headers: { cookie },
    });
    expect(remove.statusCode).toBe(200);
  });

  it("explains when an account can't be analysed", async () => {
    const { cookie, workspaceId } = await connect("Ana", "code-ana");
    const unknown = await h.app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/references`,
      headers: { cookie },
      payload: { username: "conta.pessoal" },
    });
    expect(unknown.statusCode).toBe(422);
    expect(unknown.json().error).toMatch(/Contas pessoais/);

    const self = await h.app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/references`,
      headers: { cookie },
      payload: { username: "dra.ana" },
    });
    expect(self.statusCode).toBe(422);
  });
});

describe("Meta callbacks", () => {
  const form = (signed: string) => ({
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: `signed_request=${encodeURIComponent(signed)}`,
  });

  it("rejects an invalid signature", async () => {
    const response = await h.app.inject({
      method: "POST",
      url: "/v1/integrations/meta/deauthorize",
      ...form(createSignedRequest({ user_id: "fb-ana" }, "wrong-secret")),
    });
    expect(response.statusCode).toBe(400);
  });

  it("revokes connections when the user removes the app", async () => {
    const { cookie, workspaceId } = await connect("Ana", "code-ana");
    const response = await h.app.inject({
      method: "POST",
      url: "/v1/integrations/meta/deauthorize",
      ...form(createSignedRequest({ user_id: "fb-ana" }, TEST_META_APP_SECRET)),
    });
    expect(response.statusCode).toBe(200);
    const list = (
      await h.app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/connections`,
        headers: { cookie },
      })
    ).json();
    expect(list.connections).toEqual([]);
  });

  it("deletes the user's data and returns a status URL", async () => {
    const ana = await connect("Ana", "code-ana");
    const [connection] = (
      await h.app.inject({
        method: "GET",
        url: `/v1/workspaces/${ana.workspaceId}/connections`,
        headers: { cookie: ana.cookie },
      })
    ).json().connections;
    const [account] = await owner.db
      .select()
      .from(sourceAccounts)
      .where(eq(sourceAccounts.platformAccountId, "ig-ana"));
    await owner.db.insert(posts).values({
      accountId: account?.id ?? "",
      platform: "instagram",
      platformPostId: `own-${Date.now()}`,
      format: "image",
      ingestedVia: "official_api",
      isOwnedByTenant: true,
    });

    const response = await h.app.inject({
      method: "POST",
      url: "/v1/integrations/meta/data-deletion",
      ...form(createSignedRequest({ user_id: "fb-ana" }, TEST_META_APP_SECRET)),
    });
    expect(response.statusCode).toBe(200);
    const { url, confirmation_code } = response.json();
    expect(url).toContain(confirmation_code);

    const status = await h.app.inject({ method: "GET", url: new URL(url).pathname });
    expect(status.json().status).toBe("Exclusão concluída");
    const ownPosts = await owner.db
      .select()
      .from(posts)
      .where(eq(posts.accountId, account?.id ?? ""));
    expect(ownPosts.filter((p) => p.isOwnedByTenant)).toEqual([]);
    expect(connection.id).toBeTruthy();
  });
});
