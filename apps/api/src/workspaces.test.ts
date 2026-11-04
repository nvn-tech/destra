import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, signUp, startHarness } from "./test/harness.js";

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});

afterAll(async () => {
  await h.close();
});

describe("health", () => {
  it("reports ok when the database is reachable", async () => {
    const response = await h.app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});

describe("workspaces", () => {
  it("requires a signed-in user", async () => {
    const response = await h.app.inject({ method: "GET", url: "/v1/workspaces" });
    expect(response.statusCode).toBe(401);
  });

  it("creates a workspace and lists it for its owner", async () => {
    const cookie = await signUp(h.app);
    const created = await h.app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: { cookie },
      payload: { name: "Dra. Ana Souza", taxId: "12345678000190" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: "Dra. Ana Souza", role: "owner" });

    const list = await h.app.inject({ method: "GET", url: "/v1/workspaces", headers: { cookie } });
    expect(list.json().workspaces).toEqual([
      expect.objectContaining({ name: "Dra. Ana Souza", role: "owner", autonomyLevel: "assisted" }),
    ]);
  });

  it("hides other users' workspaces behind a 404", async () => {
    const ana = await signUp(h.app, "Ana");
    const bruno = await signUp(h.app, "Bruno");
    const created = await h.app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: { cookie: ana },
      payload: { name: "Dra. Ana" },
    });
    const { id } = created.json();

    const asBruno = await h.app.inject({
      method: "GET",
      url: `/v1/workspaces/${id}`,
      headers: { cookie: bruno },
    });
    expect(asBruno.statusCode).toBe(404);

    const brunoList = await h.app.inject({
      method: "GET",
      url: "/v1/workspaces",
      headers: { cookie: bruno },
    });
    expect(brunoList.json().workspaces).toEqual([]);
  });

  it("rejects invalid input with a 400", async () => {
    const cookie = await signUp(h.app);
    const response = await h.app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: { cookie },
      payload: { name: "", taxId: "123" },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("professional profile", () => {
  it("stores the council registration used for post identification", async () => {
    const cookie = await signUp(h.app);
    const { id } = (
      await h.app.inject({
        method: "POST",
        url: "/v1/workspaces",
        headers: { cookie },
        payload: { name: "Dra. Ana" },
      })
    ).json();

    const put = await h.app.inject({
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
    expect(put.statusCode).toBe(200);

    const workspace = await h.app.inject({
      method: "GET",
      url: `/v1/workspaces/${id}`,
      headers: { cookie },
    });
    expect(workspace.json().professionalProfile).toMatchObject({
      fullName: "Dra. Ana Souza",
      council: "CRM",
      councilNumber: "123456",
      councilUf: "SP",
    });
  });

  it("rejects an unknown state (UF)", async () => {
    const cookie = await signUp(h.app);
    const { id } = (
      await h.app.inject({
        method: "POST",
        url: "/v1/workspaces",
        headers: { cookie },
        payload: { name: "Dra. Ana" },
      })
    ).json();
    const put = await h.app.inject({
      method: "PUT",
      url: `/v1/workspaces/${id}/professional-profile`,
      headers: { cookie },
      payload: { fullName: "Dra. Ana", councilNumber: "1", councilUf: "XX" },
    });
    expect(put.statusCode).toBe(400);
  });
});
