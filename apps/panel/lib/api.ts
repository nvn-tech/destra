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

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: "owner" | "editor" | "approver" | "viewer";
  autonomyLevel: "manual" | "assisted" | "autopilot";
}
