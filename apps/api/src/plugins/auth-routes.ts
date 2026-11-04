import type { FastifyInstance } from "fastify";
import type { Auth } from "../auth.js";

/** Mounts Better Auth's handler under /api/auth/* by translating Fastify requests to Fetch. */
export async function registerAuthRoutes(app: FastifyInstance, auth: Auth): Promise<void> {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const url = new URL(request.url, auth.options.baseURL);
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value !== undefined)
          headers.append(key, Array.isArray(value) ? value.join(", ") : value);
      }
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers,
          body:
            request.method === "GET" || request.body === undefined
              ? undefined
              : JSON.stringify(request.body),
        }),
      );

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "set-cookie") reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
}
