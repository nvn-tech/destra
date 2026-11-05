import { continueAsNew, proxyActivities, sleep } from "@temporalio/workflow";
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

const publicationState = proxyActivities<Activities>({
  startToCloseTimeout: "30 seconds",
}).publicationState;
const { publishPublication } = proxyActivities<Activities>({
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 8,
    initialInterval: "1 minute",
    backoffCoefficient: 2,
    maximumInterval: "30 minutes",
    nonRetryableErrorTypes: ["MetaAuthError", "PublishRejected", "PublishingNotConfigured"],
  },
});

const MAX_WAIT_MS = 6 * 3600_000;
const PAUSED_RECHECK = "10 minutes";

/**
 * Waits until a publication is due, then publishes it. Re-reads the row on every
 * wake-up, so rescheduling, cancelling and the kill switch take effect without signals.
 */
export async function publishWorkflow(
  input: { workspaceId: string; publicationId: string },
  iteration = 0,
): Promise<string> {
  for (let i = iteration; i < iteration + 50; i++) {
    const state = await publicationState(input);
    if (
      state.status === "published" ||
      state.status === "cancelled" ||
      state.status === "failed" ||
      !state.scheduledAt
    ) {
      return state.status;
    }
    if (state.paused) {
      await sleep(PAUSED_RECHECK);
      continue;
    }
    const wait = Date.parse(state.scheduledAt) - Date.now();
    if (wait > 60_000) {
      await sleep(Math.min(wait, MAX_WAIT_MS));
      continue;
    }
    const result = await publishPublication(input);
    if (result.outcome === "paused") {
      await sleep(PAUSED_RECHECK);
      continue;
    }
    if (result.outcome === "not_due") continue;
    return result.outcome;
  }
  // Keep the event history small for posts scheduled far ahead.
  return continueAsNew<typeof publishWorkflow>(input, iteration + 50);
}
