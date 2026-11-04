import { type Database, memberships, withTenant } from "@destra/db";
import type { MembershipRole } from "@destra/shared";
import { fromNodeHeaders } from "better-auth/node";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { Auth } from "../auth.js";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export interface WorkspaceAccess {
  userId: string;
  workspaceId: string;
  role: MembershipRole;
}

const ROLE_RANK: Record<MembershipRole, number> = { viewer: 0, approver: 1, editor: 2, owner: 3 };

export function createGuards(auth: Auth, db: Database) {
  /** Returns the signed-in user's id or throws 401. */
  async function requireUser(request: FastifyRequest): Promise<string> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new HttpError(401, "Not signed in");
    return session.user.id;
  }

  /**
   * Confirms the user belongs to the workspace (with at least `minRole`) before any
   * workspace-scoped query runs. RLS then enforces the same boundary in the database.
   */
  async function requireWorkspace(
    request: FastifyRequest,
    workspaceId: string,
    minRole: MembershipRole = "viewer",
  ): Promise<WorkspaceAccess> {
    const userId = await requireUser(request);
    const [membership] = await withTenant(db, { userId }, (tx) =>
      tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId))),
    );
    // Same answer for "doesn't exist" and "not yours", so ids can't be probed.
    if (!membership) throw new HttpError(404, "Workspace not found");
    if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
      throw new HttpError(403, `Requires the ${minRole} role`);
    }
    return { userId, workspaceId, role: membership.role };
  }

  return { requireUser, requireWorkspace };
}

export type Guards = ReturnType<typeof createGuards>;
