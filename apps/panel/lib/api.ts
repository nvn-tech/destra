import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls the Destra API with the session cookie. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, body.error ?? response.statusText);
  }
  return (await response.json()) as T;
}

export type Role = "owner" | "editor" | "approver" | "viewer";

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: Role;
  autonomyLevel: "manual" | "assisted" | "autopilot";
}

export interface Specialty {
  name: string;
  rqe: string | null;
}

export interface ProfessionalProfile {
  fullName: string;
  council: string;
  councilNumber: string;
  councilUf: string;
  specialties: Specialty[];
}

export interface WorkspaceDetail {
  id: string;
  name: string;
  role: Role;
  autonomyLevel: WorkspaceSummary["autonomyLevel"];
  timezone: string;
  publishingPausedAt: string | null;
  professionalProfile: ProfessionalProfile | null;
}

export type CheckResult = "pass" | "warn" | "block";
export type VariantStatus = "pending" | "pass" | "warn" | "block";

export interface CheckEvidence {
  quote?: string;
  slide?: number;
  explanation?: string;
  suggestion?: string;
  autoFix?: { from: string; to: string };
}

export interface ComplianceCheck {
  id: string;
  ruleCode: string;
  ruleTitle: string;
  severity: "warn" | "block" | "hard_block" | "require_field";
  sourceReference: string | null;
  result: CheckResult;
  confidence: number | null;
  evidence: CheckEvidence | null;
}

export interface Slide {
  n: number;
  role: string;
  title: string;
  body: string;
}

export interface ScriptBeat {
  t: string;
  say: string;
  onScreen?: string;
}

export interface VariantBody {
  label: string;
  strategyTags?: string[];
  previewLine?: string;
  caption: string;
  hashtags?: string[];
  slides?: Slide[];
  script?: ScriptBeat[];
  claims?: { text: string; citation?: { label: string; url?: string } }[];
}

export interface QueueVariant {
  id: string;
  format: "carousel" | "reel" | "image" | string;
  platform: string;
  body: VariantBody;
  complianceStatus: VariantStatus;
  isSelected: boolean;
  compliance: {
    decision: "pass" | "review" | "block";
    rulesetVersion: string;
    checkedAt: string;
    checks: ComplianceCheck[];
  } | null;
}

export interface QueueItem {
  id: string;
  title: string | null;
  status: string;
  suggestedSlot: string | null;
  strategyTags: string[];
  variants: QueueVariant[];
}
