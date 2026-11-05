import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle, withTenant } from "./client.js";
import { secrets } from "./schema/index.js";
import { APP_URL, OWNER_URL } from "./test/env.js";
import { createUser, createWorkspaceAs, expectDbError } from "./test/fixtures.js";
import { createVault, decryptSecret, encryptSecret, parseVaultKey } from "./vault.js";

const key = parseVaultKey(randomBytes(32).toString("base64"));
let owner: DbHandle;
let app: DbHandle;

beforeAll(() => {
  owner = createDb(OWNER_URL);
  app = createDb(APP_URL);
});
afterAll(async () => {
  await owner.close();
  await app.close();
});

describe("vault", () => {
  it("round-trips and detects tampering", () => {
    const sealed = encryptSecret("EAAG-page-token", key);
    expect(sealed.ciphertext).not.toContain("EAAG");
    expect(decryptSecret(sealed, [key])).toBe("EAAG-page-token");
    const tampered = { ...sealed, ciphertext: Buffer.from("x".repeat(15)).toString("base64") };
    expect(() => decryptSecret(tampered, [key])).toThrow();
  });

  it("stores only ciphertext and keeps secrets inside their workspace", async () => {
    const ana = await createUser(owner.db, "Ana");
    const bruno = await createUser(owner.db, "Bruno");
    const a = await createWorkspaceAs(app.db, ana, "A");
    const b = await createWorkspaceAs(app.db, bruno, "B");
    const vault = createVault([key]);

    const id = await withTenant(app.db, { userId: ana, workspaceId: a.workspaceId }, (tx) =>
      vault.put(tx, { workspaceId: a.workspaceId, kind: "meta_page_token", value: "EAAG-secret" }),
    );

    const raw = await owner.pool.query("select ciphertext from secrets where id = $1", [id]);
    expect(raw.rows[0].ciphertext).not.toContain("EAAG-secret");

    const asOwner = await withTenant(app.db, { userId: ana, workspaceId: a.workspaceId }, (tx) =>
      vault.get(tx, id),
    );
    const asOther = await withTenant(app.db, { userId: bruno, workspaceId: b.workspaceId }, (tx) =>
      vault.get(tx, id),
    );
    expect(asOwner).toBe("EAAG-secret");
    expect(asOther).toBeNull();

    await expectDbError(
      withTenant(app.db, { userId: bruno, workspaceId: b.workspaceId }, (tx) =>
        tx
          .insert(secrets)
          .values({ workspaceId: a.workspaceId, kind: "x", ...encryptSecret("y", key) }),
      ),
      /row-level security/,
    );
  });
});
