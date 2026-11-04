export interface Paging {
  cursors?: { before?: string; after?: string };
  next?: string;
}

export interface Page<T> {
  data: T[];
  paging?: Paging;
}

export interface InstagramBusinessAccount {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token?: string;
  /** Tasks the user can perform on the page, e.g. MANAGE, CREATE_CONTENT. */
  tasks?: string[];
  instagram_business_account?: InstagramBusinessAccount;
}

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type?: "FEED" | "REELS" | "STORY" | "AD";
  permalink?: string;
  timestamp?: string;
  /** Missing when the owner hides like counts; treat as unknown, not zero. */
  like_count?: number;
  comments_count?: number;
  children?: { data: { id: string; media_type: string }[] };
}

export interface InsightValue {
  name: string;
  period?: string;
  values?: { value: number }[];
  total_value?: { value: number };
}

export interface AccountStats {
  id: string;
  username?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

export interface BusinessDiscoveryResult extends AccountStats {
  name?: string;
  media?: Page<InstagramMedia>;
}

export interface TokenResponse {
  access_token: string;
  token_type?: string;
  /** Seconds. Long-lived user tokens last about 60 days. */
  expires_in?: number;
}
