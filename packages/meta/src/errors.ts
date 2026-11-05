export interface GraphErrorBody {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

/** An error returned by the Graph API, classified for retry and reconnect decisions. */
export class GraphApiError extends Error {
  readonly code: number | undefined;
  readonly subcode: number | undefined;

  constructor(
    readonly status: number,
    readonly body: GraphErrorBody,
  ) {
    super(body.message ?? `Graph API error ${status}`);
    this.code = body.code;
    this.subcode = body.error_subcode;
  }

  /** The token was revoked, expired or the password changed: the user must reconnect. */
  get isAuthError(): boolean {
    return this.code === 190 || this.code === 102;
  }

  /** Rate limits (app, user, business use case) and transient errors: retry later. */
  get isRetryable(): boolean {
    return [1, 2, 4, 17, 32, 341, 613, 80002].includes(this.code ?? -1) || this.status >= 500;
  }
}
