import { createHash, randomBytes } from "node:crypto";
import {
  accountSnapshots,
  auditLog,
  connectedAccounts,
  type Database,
  dataDeletionRequests,
  metaOauthGrants,
  ownedPostInsights,
  posts,
  sourceAccounts,
  type Transaction,
  type Vault,
  withTenant,
} from "@destra/db";
import {
  authorizationUrl,
  createOAuthState,
  type FacebookPage,
  type GraphClient,
  INSTAGRAM_SCOPES,
  type MetaConfig,
  parseSignedRequest,
  verifyOAuthState,
} from "@destra/meta";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { JobQueue } from "../jobs.js";
import { type Guards, HttpError } from "../plugins/tenant.js";

export interface MetaDeps {
  config: MetaConfig;
  graph: GraphClient;
  vault: Vault;
  /** Signs the OAuth state. */
  stateSecret: string;
}

/** Instagram account offered after login. Never contains tokens. */
export interface Candidate {
  pageId: string;
  pageName: string;
  instagramId: string;
  username: string;
  name: string | null;
  followers: number | null;
  /** The user can create content on the page (needed to publish). */
  canPublish: boolean;
}

const REQUIRED_PERMISSIONS = ["instagram_basic", "pages_show_list", "pages_read_engagement"];
const GRANT_TTL_MS = 15 * 60 * 1000;

const workspaceParams = z.object({ workspaceId: z.uuid() });
const grantParams = workspaceParams.extend({ grantId: z.uuid() });
const connectionParams = workspaceParams.extend({ connectionId: z.uuid() });
const completeBody = z.object({ instagramAccountId: z.string().min(1) });
const callbackQuery = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

function toCandidate(page: FacebookPage): Candidate | null {
  const ig = page.instagram_business_account;
  if (!ig) return null;
  return {
    pageId: page.id,
    pageName: page.name,
    instagramId: ig.id,
    username: ig.username,
    name: ig.name ?? null,
    followers: ig.followers_count ?? null,
    canPublish: (page.tasks ?? []).some((t) => t === "MANAGE" || t === "CREATE_CONTENT"),
  };
}

/**
 * Creates or refreshes the workspace's Instagram connection and its corpus account.
 * Old secrets are removed when a connection is replaced.
 */
async function completeConnection(
  tx: Transaction,
  deps: MetaDeps,
  input: {
    workspaceId: string;
    userId: string;
    metaUserId: string;
    userTokenSecretId: string;
    scopes: string[];
    page: FacebookPage;
  },
): Promise<string> {
  const ig = input.page.instagram_business_account;
  if (!ig || !input.page.access_token)
    throw new HttpError(422, "Página sem conta do Instagram vinculada");

  const [source] = await tx
    .insert(sourceAccounts)
    .values({
      platform: "instagram",
      platformAccountId: ig.id,
      handle: ig.username,
      displayName: ig.name ?? null,
      accountType: "business",
      status: "active",
    })
    .onConflictDoUpdate({
      target: [sourceAccounts.platform, sourceAccounts.platformAccountId],
      set: { handle: ig.username, displayName: ig.name ?? null, status: "active" },
    })
    .returning({ id: sourceAccounts.id });
  if (!source) throw new Error("Could not upsert source account");

  if (typeof ig.followers_count === "number") {
    await tx
      .insert(accountSnapshots)
      .values({
        accountId: source.id,
        capturedAt: new Date(),
        followers: ig.followers_count,
        mediaCount: ig.media_count ?? null,
      })
      .onConflictDoNothing();
  }

  const pageTokenRef = await deps.vault.put(tx, {
    workspaceId: input.workspaceId,
    kind: "meta_page_token",
    value: input.page.access_token,
  });

  const [existing] = await tx
    .select()
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.platform, "instagram"),
        eq(connectedAccounts.platformAccountId, ig.id),
      ),
    );

  const values = {
    sourceAccountId: source.id,
    linkedPageId: input.page.id,
    externalUserId: input.metaUserId,
    tokenRef: pageTokenRef,
    userTokenRef: input.userTokenSecretId,
    scopes: input.scopes,
    status: "active" as const,
  };

  let connectionId: string;
  if (existing) {
    for (const ref of [existing.tokenRef, existing.userTokenRef]) {
      if (ref && ref !== input.userTokenSecretId && z.uuid().safeParse(ref).success)
        await deps.vault.remove(tx, ref);
    }
    await tx.update(connectedAccounts).set(values).where(eq(connectedAccounts.id, existing.id));
    connectionId = existing.id;
  } else {
    const [row] = await tx
      .insert(connectedAccounts)
      .values({
        workspaceId: input.workspaceId,
        platform: "instagram",
        platformAccountId: ig.id,
        ...values,
      })
      .returning({ id: connectedAccounts.id });
    if (!row) throw new Error("Could not create connection");
    connectionId = row.id;
  }

  await tx.insert(auditLog).values({
    workspaceId: input.workspaceId,
    actor: input.userId,
    action: existing ? "connection.refreshed" : "connection.created",
    entity: "connected_account",
    entityId: connectionId,
    payload: { platform: "instagram", username: ig.username, pageId: input.page.id },
  });
  return connectionId;
}

/** Revokes one connection: deletes its tokens and marks it revoked. */
async function revokeConnection(
  tx: Transaction,
  deps: Pick<MetaDeps, "vault">,
  connectionId: string,
  actor: string,
  reason: string,
) {
  const [connection] = await tx
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.id, connectionId));
  if (!connection) return false;
  for (const ref of [connection.tokenRef, connection.userTokenRef]) {
    if (ref && z.uuid().safeParse(ref).success) await deps.vault.remove(tx, ref);
  }
  await tx
    .update(connectedAccounts)
    .set({ status: "revoked", tokenRef: "revoked", userTokenRef: null, tokenExpiresAt: null })
    .where(eq(connectedAccounts.id, connectionId));
  await tx.insert(auditLog).values({
    workspaceId: connection.workspaceId,
    actor,
    action: "connection.revoked",
    entity: "connected_account",
    entityId: connectionId,
    payload: { reason },
  });
  return true;
}

export async function instagramRoutes(
  app: FastifyInstance,
  db: Database,
  guards: Guards,
  jobs: JobQueue,
  options: { deps: MetaDeps | null; panelUrl: string; apiPublicUrl: string },
) {
  const { deps, panelUrl } = options;
  const requireMeta = (): MetaDeps => {
    if (!deps)
      throw new HttpError(503, "A integração com a Meta não está configurada neste ambiente.");
    return deps;
  };
  const toPanel = (
    reply: FastifyReply,
    workspaceId: string | null,
    query: Record<string, string>,
  ) => {
    const path = workspaceId ? `/w/${workspaceId}/conexoes` : "/workspaces";
    return reply.redirect(`${panelUrl}${path}?${new URLSearchParams(query)}`);
  };

  // Meta posts signed_request as application/x-www-form-urlencoded.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    },
  );

  /** Connections of the workspace (no secrets). */
  app.get("/v1/workspaces/:workspaceId/connections", async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const access = await guards.requireWorkspace(request, workspaceId);
    const rows = await withTenant(db, access, (tx) =>
      tx
        .select({
          id: connectedAccounts.id,
          platform: connectedAccounts.platform,
          status: connectedAccounts.status,
          platformAccountId: connectedAccounts.platformAccountId,
          linkedPageId: connectedAccounts.linkedPageId,
          scopes: connectedAccounts.scopes,
          createdAt: connectedAccounts.createdAt,
          username: sourceAccounts.handle,
          displayName: sourceAccounts.displayName,
          lastSyncedAt: sourceAccounts.lastCrawledAt,
          followers: sql<
            number | null
          >`(select s.followers::integer from account_snapshots s where s.account_id = ${sourceAccounts.id} order by s.captured_at desc limit 1)`,
          postsImported: sql<number>`(select count(*)::int from posts p where p.account_id = ${sourceAccounts.id})`,
        })
        .from(connectedAccounts)
        .leftJoin(sourceAccounts, eq(sourceAccounts.id, connectedAccounts.sourceAccountId))
        .where(inArray(connectedAccounts.status, ["active", "expired", "error"]))
        .orderBy(desc(connectedAccounts.createdAt)),
    );
    return { connections: rows, metaConfigured: Boolean(deps) };
  });

  /** Starts Facebook Login. The panel sends the browser to the returned URL. */
  app.post("/v1/workspaces/:workspaceId/connections/instagram/start", async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const meta = requireMeta();
    const access = await guards.requireWorkspace(request, workspaceId, "editor");
    const state = createOAuthState({ workspaceId, userId: access.userId }, meta.stateSecret);
    return { url: authorizationUrl(meta.config, state) };
  });

  /** Facebook redirects the browser here after login. Always ends with a redirect to the panel. */
  app.get("/v1/integrations/meta/callback", async (request, reply) => {
    const meta = requireMeta();
    const query = callbackQuery.parse(request.query);
    const state = query.state ? verifyOAuthState(query.state, meta.stateSecret) : null;
    if (!state) return toPanel(reply, null, { error: "invalid_state" });
    const { workspaceId } = state;
    if (query.error || !query.code) return toPanel(reply, workspaceId, { error: "cancelled" });

    // The browser coming back must be the same signed-in user who started the login.
    let userId: string;
    try {
      userId = await guards.requireUser(request);
    } catch {
      return toPanel(reply, workspaceId, { error: "session_mismatch" });
    }
    if (userId !== state.userId) return toPanel(reply, workspaceId, { error: "session_mismatch" });
    try {
      await guards.requireWorkspace(request, workspaceId, "editor");
    } catch {
      return toPanel(reply, null, { error: "forbidden" });
    }

    try {
      const short = await meta.graph.exchangeCode(query.code);
      const long = await meta.graph.exchangeLongLived(short.access_token);
      const granted = await meta.graph.grantedPermissions(long.access_token);
      if (REQUIRED_PERMISSIONS.some((p) => !granted.includes(p))) {
        return toPanel(reply, workspaceId, { error: "missing_permissions" });
      }
      const me = await meta.graph.me(long.access_token);
      const pages = await meta.graph.listPages(long.access_token);
      if (pages.length === 0) return toPanel(reply, workspaceId, { error: "no_pages" });
      const candidates = pages.map(toCandidate).filter((c): c is Candidate => c !== null);
      if (candidates.length === 0) return toPanel(reply, workspaceId, { error: "no_instagram" });

      const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null;
      const scopes = granted.filter((p) => (INSTAGRAM_SCOPES as readonly string[]).includes(p));

      const result = await withTenant(db, { userId, workspaceId }, async (tx) => {
        const userTokenSecretId = await meta.vault.put(tx, {
          workspaceId,
          kind: "meta_user_token",
          value: long.access_token,
          expiresAt,
        });
        if (candidates.length === 1) {
          const page = pages.find(
            (p) => p.instagram_business_account?.id === candidates[0]?.instagramId,
          );
          if (!page) throw new Error("candidate page missing");
          const connectionId = await completeConnection(tx, meta, {
            workspaceId,
            userId,
            metaUserId: me.id,
            userTokenSecretId,
            scopes,
            page,
          });
          return { connectionId };
        }
        const [grant] = await tx
          .insert(metaOauthGrants)
          .values({
            workspaceId,
            userId,
            metaUserId: me.id,
            userTokenSecretId,
            scopes,
            candidates,
            expiresAt: new Date(Date.now() + GRANT_TTL_MS),
          })
          .returning({ id: metaOauthGrants.id });
        return { grantId: grant?.id };
      });

      if ("connectionId" in result && result.connectionId) {
        await jobs.backfillOwnAccount({ workspaceId, connectedAccountId: result.connectionId });
        return toPanel(reply, workspaceId, { status: "connected" });
      }
      return toPanel(reply, workspaceId, { grant: String(result.grantId) });
    } catch (error) {
      request.log.error({ err: error }, "Meta login failed");
      return toPanel(reply, workspaceId, { error: "meta_error" });
    }
  });

  /** Candidates of a pending login, for the account picker. */
  app.get("/v1/workspaces/:workspaceId/connections/instagram/grants/:grantId", async (request) => {
    const { workspaceId, grantId } = grantParams.parse(request.params);
    const access = await guards.requireWorkspace(request, workspaceId, "editor");
    const [grant] = await withTenant(db, access, (tx) =>
      tx.select().from(metaOauthGrants).where(eq(metaOauthGrants.id, grantId)),
    );
    if (!grant || grant.userId !== access.userId) throw new HttpError(404, "Login não encontrado");
    if (grant.expiresAt < new Date())
      throw new HttpError(410, "Este login expirou. Conecte de novo.");
    return { candidates: grant.candidates as Candidate[] };
  });

  /** Finishes a pending login with the account the user picked. */
  app.post(
    "/v1/workspaces/:workspaceId/connections/instagram/grants/:grantId/complete",
    async (request) => {
      const { workspaceId, grantId } = grantParams.parse(request.params);
      const meta = requireMeta();
      const access = await guards.requireWorkspace(request, workspaceId, "editor");
      const { instagramAccountId } = completeBody.parse(request.body);

      const connectionId = await withTenant(db, access, async (tx) => {
        const [grant] = await tx
          .select()
          .from(metaOauthGrants)
          .where(eq(metaOauthGrants.id, grantId))
          .for("update");
        if (!grant || grant.userId !== access.userId)
          throw new HttpError(404, "Login não encontrado");
        if (grant.expiresAt < new Date())
          throw new HttpError(410, "Este login expirou. Conecte de novo.");
        if (!(grant.candidates as Candidate[]).some((c) => c.instagramId === instagramAccountId)) {
          throw new HttpError(422, "Conta não faz parte deste login");
        }
        const userToken = await meta.vault.get(tx, grant.userTokenSecretId);
        if (!userToken) throw new HttpError(410, "Este login expirou. Conecte de novo.");
        // Page tokens are fetched again here so they are never kept in the grant.
        const page = (await meta.graph.listPages(userToken)).find(
          (p) => p.instagram_business_account?.id === instagramAccountId,
        );
        if (!page) throw new HttpError(422, "Não encontramos essa conta na sua Página do Facebook");
        const id = await completeConnection(tx, meta, {
          workspaceId,
          userId: access.userId,
          metaUserId: grant.metaUserId,
          userTokenSecretId: grant.userTokenSecretId,
          scopes: grant.scopes,
          page,
        });
        // The connection now owns the user token; only the pending grant is removed.
        await tx.delete(metaOauthGrants).where(eq(metaOauthGrants.id, grantId));
        return id;
      });

      await jobs.backfillOwnAccount({ workspaceId, connectedAccountId: connectionId });
      return { connectionId };
    },
  );

  /** Disconnects: deletes the tokens; imported public posts stay in the corpus. */
  app.delete("/v1/workspaces/:workspaceId/connections/:connectionId", async (request) => {
    const { workspaceId, connectionId } = connectionParams.parse(request.params);
    const meta = requireMeta();
    const access = await guards.requireWorkspace(request, workspaceId, "editor");
    const removed = await withTenant(db, access, (tx) =>
      revokeConnection(tx, meta, connectionId, access.userId, "user_disconnect"),
    );
    if (!removed) throw new HttpError(404, "Conexão não encontrada");
    return { status: "revoked" };
  });

  // ---------- Callbacks Meta requires for App Review ----------

  async function connectionsFor(metaUserId: string) {
    const result = await db.execute<{ workspace_id: string; connected_account_id: string }>(
      sql`select * from app.meta_connections_for_user(${metaUserId})`,
    );
    return result.rows;
  }

  const signedRequestBody = z.object({ signed_request: z.string().min(1) });

  function verifySigned(request: FastifyRequest) {
    const meta = requireMeta();
    const { signed_request } = signedRequestBody.parse(request.body);
    const data = parseSignedRequest(signed_request, meta.config.appSecret);
    if (!data) throw new HttpError(400, "Invalid signed_request");
    return { meta, metaUserId: data.user_id };
  }

  /** Called by Meta when a user removes the app: tokens are deleted. */
  app.post("/v1/integrations/meta/deauthorize", async (request) => {
    const { meta, metaUserId } = verifySigned(request);
    for (const row of await connectionsFor(metaUserId)) {
      await withTenant(db, { userId: "system:meta", workspaceId: row.workspace_id }, (tx) =>
        revokeConnection(tx, meta, row.connected_account_id, "system:meta", "meta_deauthorize"),
      );
    }
    return { status: "ok" };
  });

  /**
   * Called by Meta when a user asks for their data to be deleted. Removes tokens,
   * private insights and the user's own imported posts, and returns a status URL.
   */
  app.post("/v1/integrations/meta/data-deletion", async (request) => {
    const { meta, metaUserId } = verifySigned(request);
    const confirmationCode = randomBytes(9).toString("base64url");
    const rows = await connectionsFor(metaUserId);

    for (const row of rows) {
      await withTenant(db, { userId: "system:meta", workspaceId: row.workspace_id }, async (tx) => {
        const [connection] = await tx
          .select()
          .from(connectedAccounts)
          .where(eq(connectedAccounts.id, row.connected_account_id));
        await revokeConnection(
          tx,
          meta,
          row.connected_account_id,
          "system:meta",
          "meta_data_deletion",
        );
        if (connection?.sourceAccountId) {
          const own = tx
            .select({ id: posts.id })
            .from(posts)
            .where(
              and(eq(posts.accountId, connection.sourceAccountId), eq(posts.isOwnedByTenant, true)),
            );
          await tx.delete(ownedPostInsights).where(inArray(ownedPostInsights.postId, own));
          await tx
            .delete(posts)
            .where(
              and(eq(posts.accountId, connection.sourceAccountId), eq(posts.isOwnedByTenant, true)),
            );
        }
      });
    }

    await db.insert(dataDeletionRequests).values({
      confirmationCode,
      platform: "meta",
      externalUserHash: createHash("sha256").update(metaUserId).digest("hex"),
      status: "completed",
      connectionsRemoved: rows.length,
      completedAt: new Date(),
    });
    return {
      url: `${options.apiPublicUrl}/v1/integrations/meta/data-deletion/${confirmationCode}`,
      confirmation_code: confirmationCode,
    };
  });

  /** Public status page for a data-deletion request (linked by Meta). */
  app.get("/v1/integrations/meta/data-deletion/:code", async (request) => {
    const { code } = z.object({ code: z.string().min(1).max(64) }).parse(request.params);
    const [row] = await db
      .select()
      .from(dataDeletionRequests)
      .where(eq(dataDeletionRequests.confirmationCode, code));
    if (!row) throw new HttpError(404, "Solicitação não encontrada");
    return {
      confirmationCode: row.confirmationCode,
      status: row.status === "completed" ? "Exclusão concluída" : "Em andamento",
      requestedAt: row.createdAt,
      completedAt: row.completedAt,
    };
  });
}
