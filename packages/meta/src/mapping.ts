import { createHash } from "node:crypto";
import type { InstagramMedia } from "./types.js";

export type PostFormat = "image" | "carousel" | "reel" | "video" | "story";

/** Maps Instagram media to Destra's post format. Single videos are published as Reels. */
export function postFormat(media: InstagramMedia): PostFormat {
  if (media.media_product_type === "STORY") return "story";
  if (media.media_product_type === "REELS") return "reel";
  if (media.media_type === "CAROUSEL_ALBUM") return "carousel";
  if (media.media_type === "VIDEO") return "video";
  return "image";
}

const HASHTAG = /#[\p{L}\p{N}_]+/gu;
const MENTION = /@[A-Za-z0-9._]+/g;

export function hashtags(caption = ""): string[] {
  return [...new Set((caption.match(HASHTAG) ?? []).map((t) => t.toLowerCase()))];
}

export function mentions(caption = ""): string[] {
  return [...new Set((caption.match(MENTION) ?? []).map((m) => m.slice(1).toLowerCase()))];
}

export function contentHash(caption = ""): string {
  return createHash("sha256").update(caption.trim().toLowerCase()).digest("hex");
}

/** Instagram usernames: letters, digits, periods and underscores, up to 30 characters. */
export function normalizeUsername(input: string): string | null {
  const username = input
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(username) ? username : null;
}
