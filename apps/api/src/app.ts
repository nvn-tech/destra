import { createHmac } from "node:crypto";
import { createVault, type Database, parseVaultKey } from "@destra/db";
import { LocalMediaStore } from "@destra/media/store";
import { GraphClient, type MetaConfig } from "@destra/meta";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { type Auth, createAuth } from "./auth.js";
import type { ApiEnv } from "./env.js";
import { type JobQueue, LoggingJobQueue, TemporalJobQueue } from "./jobs.js";
import { registerAuthRoutes } from "./plugins/auth-routes.js";
import { createGuards, HttpError } from "./plugins/tenant.js";
import { healthRoutes } from "./routes/health.js";
import { instagramRoutes, type MetaDeps } from "./routes/instagram.js";
import { publicationRoutes } from "./routes/publications.js";
import { referenceRoutes } from "./routes/references.js";
import { reviewRoutes } from "./routes/review.js";
import { workspaceRoutes } from "./routes/workspaces.js";

export interface AppDeps {
  env: ApiEnv;
  db: Database;
  logger?: boolean;
  /** Overrides for tests: a job queue that records calls, a fetch that targets a fake Graph API. */
  jobs?: JobQueue;
  graphFetch?: typeof fetch;
}

/** Meta integration is enabled only when the app credentials and the token key are configured. */
function createMetaDeps(env: ApiEnv, graphFetch?: typeof fetch): MetaDeps | null {
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.TOKEN_ENCRYPTION_KEY) return null;
  const config: MetaConfig = {
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    graphVersion: env.META_GRAPH_VERSION,
    graphUrl: env.META_GRAPH_URL,
    dialogUrl: env.META_DIALOG_URL,
    redirectUri: `${env.API_PUBLIC_URL}/v1/integrations/meta/callback`,
  };
  return {
    config,
    graph: new GraphClient(config, graphFetch),
    vault: createVault([parseVaultKey(env.TOKEN_ENCRYPTION_KEY)]),
    stateSecret: createHmac("sha256", env.BETTER_AUTH_SECRET)
      .update("meta-oauth-state")
      .digest("hex"),
  };
}

export async function buildApp({ env, db, logger = true, jobs, graphFetch }: AppDeps): Promise<{
  app: FastifyInstance;
  auth: Auth;
}> {
  const app = Fastify({ logger, trustProxy: true });
  const auth = createAuth(db, env);
  const guards = createGuards(auth, db);

  await app.register(cors, {
    origin: [env.PANEL_URL],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: "Invalid request", issues: error.issues });
    }
    // Fastify's own client errors (bad content type, malformed JSON, body too large).
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: (error as Error).message });
    }
    request.log.error(error);
    return reply.status(500).send({ error: "Internal error" });
  });

  await registerAuthRoutes(app, auth);
  await healthRoutes(app, db);
  await workspaceRoutes(app, db, guards);
  const jobQueue =
    jobs ?? (env.TEMPORAL_ADDRESS ? new TemporalJobQueue(env) : new LoggingJobQueue(app.log));
  app.addHook("onClose", () => jobQueue.close());
  await reviewRoutes(app, db, guards, jobQueue);
  const localMedia =
    env.MEDIA_LOCAL_DIR && env.MEDIA_SIGNING_SECRET
      ? new LocalMediaStore(env.MEDIA_LOCAL_DIR, env.API_PUBLIC_URL, env.MEDIA_SIGNING_SECRET)
      : null;
  await publicationRoutes(app, db, guards, jobQueue, localMedia);
  const meta = createMetaDeps(env, graphFetch);
  await instagramRoutes(app, db, guards, jobQueue, {
    deps: meta,
    panelUrl: env.PANEL_URL,
    apiPublicUrl: env.API_PUBLIC_URL,
  });
  await referenceRoutes(app, db, guards, jobQueue, meta);

  return { app, auth };
}
