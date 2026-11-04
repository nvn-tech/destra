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
