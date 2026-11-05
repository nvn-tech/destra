import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { INSTAGRAM_SCOPES, type MetaConfig } from "./config.js";

export interface OAuthState {
  workspaceId: string;
  userId: string;
  /** Unix seconds. */
  exp: number;
  nonce: string;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** A signed, expiring `state` that ties the Facebook redirect back to the user who started it. */
export function createOAuthState(
  input: { workspaceId: string; userId: string },
  secret: string,
  ttlSeconds = 600,
): string {
  const state: OAuthState = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    nonce: randomBytes(12).toString("base64url"),
  };
  const payload = b64url(JSON.stringify(state));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyOAuthState(token: string, secret: string): OAuthState | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    return state.exp > Date.now() / 1000 ? state : null;
  } catch {
    return null;
  }
}

/** URL of the Facebook Login dialog for connecting an Instagram professional account. */
export function authorizationUrl(config: MetaConfig, state: string): string {
  const url = new URL(`${config.dialogUrl}/${config.graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  return url.toString();
}

/**
 * Verifies a `signed_request` sent by Meta to the deauthorization and data-deletion
 * callbacks: "<base64url HMAC-SHA256 signature>.<base64url JSON payload>".
 */
export function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): { user_id: string; [k: string]: unknown } | null {
  const [encodedSig, payload] = signedRequest.split(".");
  if (!encodedSig || !payload) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const actual = Buffer.from(encodedSig, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.algorithm && String(data.algorithm).toUpperCase() !== "HMAC-SHA256") return null;
    return typeof data.user_id === "string" ? data : null;
  } catch {
    return null;
  }
}

/** Builds a signed_request the way Meta does (used by tests and local tooling). */
export function createSignedRequest(data: Record<string, unknown>, appSecret: string): string {
  const payload = b64url(
    JSON.stringify({ algorithm: "HMAC-SHA256", issued_at: Math.floor(Date.now() / 1000), ...data }),
  );
  const signature = createHmac("sha256", appSecret).update(payload).digest("base64url");
  return `${signature}.${payload}`;
}
