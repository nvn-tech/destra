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

export const CAPTION_MAX_CHARS = 2200;
export const MAX_HASHTAGS = 30;
export const CAROUSEL_MAX_ITEMS = 10;

/** Final caption: text, hashtags, then the mandatory identification line. */
export function composeCaption(input: {
  caption: string;
  hashtags?: string[];
  signature: string;
  aiDisclosure?: boolean;
}) {
  const tags = [...new Set((input.hashtags ?? []).map((t) => (t.startsWith("#") ? t : `#${t}`)))];
  const parts = [input.caption.trim()];
  if (tags.length) parts.push(tags.join(" "));
  parts.push(input.signature);
  if (input.aiDisclosure) parts.push("Conteúdo revisado por Dr(a).");
  const caption = parts.join("\n\n");
  const problems: string[] = [];
  if (caption.length > CAPTION_MAX_CHARS)
    problems.push(
      `A legenda tem ${caption.length} caracteres; o Instagram aceita até ${CAPTION_MAX_CHARS}.`,
    );
  if (hashtags(caption).length > MAX_HASHTAGS)
    problems.push(`O Instagram aceita até ${MAX_HASHTAGS} hashtags.`);
  return { caption, problems };
}

export type PublishPlan =
  | {
      ok: true;
      kind: "carousel" | "image";
      slides: { n: number; role: string; title: string; body: string }[];
    }
  | { ok: false; reason: string };

/** What can be published automatically today: images and carousels rendered from slides. */
export function instagramPublishPlan(input: {
  format: string;
  title?: string | null;
  previewLine?: string;
  slides?: { n: number; role: string; title: string; body: string }[];
}): PublishPlan {
  if (input.format === "reel" || input.format === "video" || input.format === "story") {
    return {
      ok: false,
      reason:
        "Reels e vídeos ainda não são publicados automaticamente. Use o roteiro para gravar e publicar pelo app.",
    };
  }
  const slides = input.slides?.length
    ? input.slides
    : [{ n: 1, role: "hook", title: input.title ?? "", body: input.previewLine ?? "" }];
  if (slides.length > CAROUSEL_MAX_ITEMS)
    return { ok: false, reason: `Carrosséis aceitam até ${CAROUSEL_MAX_ITEMS} slides.` };
  return { ok: true, kind: slides.length > 1 ? "carousel" : "image", slides };
}
