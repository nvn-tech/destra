import { proxyActivities } from "@temporalio/workflow";
import type { Activities } from "../activities/index.js";

const { checkDatabase, recordSystemEvent } = proxyActivities<Activities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 5, initialInterval: "2 seconds", backoffCoefficient: 2 },
});

/**
 * Smoke-test workflow: proves the worker, Temporal and the database are wired together.
 * Product workflows (onboarding, ingestion, generation, publishing) follow the same pattern.
 */
export async function systemCheckWorkflow(
  requestedBy: string,
): Promise<{ ok: boolean; at: string }> {
  const result = await checkDatabase();
  await recordSystemEvent({ action: "system.check", payload: { requestedBy, at: result.at } });
  return result;
}

const instagram = proxyActivities<Activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 6,
    initialInterval: "30 seconds",
    backoffCoefficient: 2,
    maximumInterval: "30 minutes",
    // Revoked tokens and bad requests won't fix themselves; the user must act.
    nonRetryableErrorTypes: ["MetaAuthError", "MetaRequestError", "MetaNotConfigured"],
  },
});

/** Imports a newly connected account's own posts and insights. */
export async function backfillOwnAccountWorkflow(input: {
  workspaceId: string;
  connectedAccountId: string;
}) {
  return instagram.ingestOwnAccount(input);
}

/** Refreshes a reference account in the shared corpus (one run per account at a time). */
export async function syncReferenceAccountWorkflow(input: {
  workspaceId: string;
  sourceAccountId: string;
}) {
  return instagram.syncReferenceAccount(input);
}
