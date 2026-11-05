/** Meta app settings. The URLs are overridable so tests can point at a fake Graph API. */
export interface MetaConfig {
  appId: string;
  appSecret: string;
  /** e.g. "v26.0". Meta deprecates versions about two years after release. */
  graphVersion: string;
  graphUrl: string;
  dialogUrl: string;
  redirectUri: string;
}

export const DEFAULT_GRAPH_VERSION = "v26.0";

/**
 * Permissions for the Instagram API with Facebook Login. Business Discovery and
 * hashtag search only exist on this login path. Each needs Advanced Access via App Review.
 */
export const INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_manage_insights",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
] as const;
