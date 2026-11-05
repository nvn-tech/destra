import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Transaction } from "./client.js";
import { secrets } from "./schema/index.js";

/**
 * Encrypts platform tokens with AES-256-GCM before they reach the database.
 * The key lives outside the database (env or KMS); `keyId` allows rotation.
 * All calls run inside a tenant transaction, so RLS scopes rows to the workspace.
 */
export interface VaultKey {
  id: string;
  /** 32 raw bytes. */
  key: Buffer;
}

export function parseVaultKey(base64: string, id = "k1"): VaultKey {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return { id, key };
}

export function encryptSecret(plaintext: string, vaultKey: VaultKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey.key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    keyId: vaultKey.id,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptSecret(
  row: { keyId: string; iv: string; authTag: string; ciphertext: string },
  keys: VaultKey[],
): string {
  const vaultKey = keys.find((k) => k.id === row.keyId);
  if (!vaultKey) throw new Error(`No vault key with id ${row.keyId}`);
  const decipher = createDecipheriv("aes-256-gcm", vaultKey.key, Buffer.from(row.iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function createVault(keys: VaultKey[]) {
  const current = keys[0];
  if (!current) throw new Error("At least one vault key is required");
  return {
    async put(
      tx: Transaction,
      input: { workspaceId: string; kind: string; value: string; expiresAt?: Date | null },
    ): Promise<string> {
      const [row] = await tx
        .insert(secrets)
        .values({
          workspaceId: input.workspaceId,
          kind: input.kind,
          expiresAt: input.expiresAt ?? null,
          ...encryptSecret(input.value, current),
        })
        .returning({ id: secrets.id });
      if (!row) throw new Error("Could not store secret");
      return row.id;
    },

    async get(tx: Transaction, id: string): Promise<string | null> {
      const [row] = await tx.select().from(secrets).where(eq(secrets.id, id));
      return row ? decryptSecret(row, keys) : null;
    },

    async remove(tx: Transaction, id: string): Promise<void> {
      await tx.delete(secrets).where(eq(secrets.id, id));
    },
  };
}

export type Vault = ReturnType<typeof createVault>;
