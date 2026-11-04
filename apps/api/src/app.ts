import type { Database } from "@destra/db";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { type Auth, createAuth } from "./auth.js";
import type { ApiEnv } from "./env.js";
import { registerAuthRoutes } from "./plugins/auth-routes.js";
import { createGuards, HttpError } from "./plugins/tenant.js";
import { healthRoutes } from "./routes/health.js";
import { workspaceRoutes } from "./routes/workspaces.js";

export interface AppDeps {
  env: ApiEnv;
  db: Database;
  logger?: boolean;
}

export async function buildApp({ env, db, logger = true }: AppDeps): Promise<{
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
    request.log.error(error);
    return reply.status(500).send({ error: "Internal error" });
  });

  await registerAuthRoutes(app, auth);
  await healthRoutes(app, db);
  await workspaceRoutes(app, db, guards);

  return { app, auth };
}
