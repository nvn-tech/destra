import { Client, Connection } from "@temporalio/client";
import type { FastifyBaseLogger } from "fastify";
import type { ApiEnv } from "./env.js";

/** Background work the API hands off to the worker. */
export interface JobQueue {
  backfillOwnAccount(input: { workspaceId: string; connectedAccountId: string }): Promise<void>;
  syncReferenceAccount(input: { workspaceId: string; sourceAccountId: string }): Promise<void>;
  close(): Promise<void>;
}

/** Starts Temporal workflows by name, so the API doesn't import worker code. */
export class TemporalJobQueue implements JobQueue {
  private client: Promise<Client> | null = null;

  constructor(private readonly env: ApiEnv) {}

  private getClient(): Promise<Client> {
    this.client ??= Connection.connect({ address: this.env.TEMPORAL_ADDRESS }).then(
      (connection) => new Client({ connection, namespace: this.env.TEMPORAL_NAMESPACE }),
    );
    return this.client;
  }

  async backfillOwnAccount(input: { workspaceId: string; connectedAccountId: string }) {
    const client = await this.getClient();
    await client.workflow.start("backfillOwnAccountWorkflow", {
      taskQueue: this.env.TEMPORAL_TASK_QUEUE,
      workflowId: `backfill-own-${input.connectedAccountId}`,
      workflowIdConflictPolicy: "USE_EXISTING",
      args: [input],
    });
  }

  async syncReferenceAccount(input: { workspaceId: string; sourceAccountId: string }) {
    const client = await this.getClient();
    // One sync per shared corpus account at a time, whichever workspace asked for it.
    await client.workflow.start("syncReferenceAccountWorkflow", {
      taskQueue: this.env.TEMPORAL_TASK_QUEUE,
      workflowId: `sync-reference-${input.sourceAccountId}`,
      workflowIdConflictPolicy: "USE_EXISTING",
      args: [input],
    });
  }

  async close() {
    if (this.client) await (await this.client).connection.close();
  }
}

/** Used when Temporal isn't configured: records nothing, just logs. */
export class LoggingJobQueue implements JobQueue {
  constructor(private readonly log: FastifyBaseLogger) {}
  async backfillOwnAccount(input: { workspaceId: string; connectedAccountId: string }) {
    this.log.warn({ input }, "Temporal not configured: skipping own-account backfill");
  }
  async syncReferenceAccount(input: { workspaceId: string; sourceAccountId: string }) {
    this.log.warn({ input }, "Temporal not configured: skipping reference sync");
  }
  async close() {}
}
