import type { Database } from "@destra/db";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance, db: Database): Promise<void> {
  app.get("/health", async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: "ok" };
    } catch {
      return reply.status(503).send({ status: "unavailable" });
    }
  });
}
