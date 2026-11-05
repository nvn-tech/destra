import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

/*
 * Renders carousel slides to 1080x1350 PNGs (Instagram 4:5) with the same
 * template the review screen previews. Text only, no generated imagery: what the
 * doctor approved is exactly what gets published.
 */

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;

export interface SlideInput {
  /** 1-based position. */
  n: number;
  role: string;
  title: string;
  body: string;
}

export interface RenderOptions {
  total: number;
  /** Mandatory identification line (name | CRM-UF | RQE), injected by code. */
  signature: string;
  handle?: string;
}

const require = createRequire(import.meta.url);
const fontFile = (pkg: string, file: string) =>
  readFileSync(require.resolve(`${pkg}/files/${file}`));

let fonts: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] | null = null;
function loadFonts() {
  // Latin covers Portuguese accents; latin-ext is a fallback for other glyphs.
  fonts ??= [
    {
      name: "Jakarta",
      data: fontFile("@fontsource/plus-jakarta-sans", "plus-jakarta-sans-latin-400-normal.woff"),
      weight: 400,
      style: "normal",
    },
    {
      name: "Jakarta",
      data: fontFile("@fontsource/plus-jakarta-sans", "plus-jakarta-sans-latin-700-normal.woff"),
      weight: 700,
      style: "normal",
    },
    {
      name: "Jakarta",
      data: fontFile(
        "@fontsource/plus-jakarta-sans",
        "plus-jakarta-sans-latin-ext-400-normal.woff",
      ),
      weight: 400,
      style: "normal",
    },
    {
      name: "Jakarta",
      data: fontFile(
        "@fontsource/plus-jakarta-sans",
        "plus-jakarta-sans-latin-ext-700-normal.woff",
      ),
      weight: 700,
      style: "normal",
    },
    {
      name: "Mono",
      data: fontFile("@fontsource/jetbrains-mono", "jetbrains-mono-latin-400-normal.woff"),
      weight: 400,
      style: "normal",
    },
  ];
  return fonts;
}

type Node = { type: string; props: { style?: Record<string, unknown>; children?: unknown } };
const el = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
  type,
  props: { style, children },
});

const PINE = "#0b3b3c";
const WHITE = "#ffffff";
const SOFT = "rgba(255,255,255,0.88)";
const QUIET = "rgba(255,255,255,0.72)";

function slideTree(slide: SlideInput, options: RenderOptions): Node {
  const hook = slide.role === "hook";
  return el(
    "div",
    {
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
      // Padding must stay inside the canvas, or the footer (with CRM/RQE) is cropped.
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      backgroundColor: PINE,
      padding: 96,
      fontFamily: "Jakarta",
      color: WHITE,
    },
    [
      el("div", { display: "flex", justifyContent: "space-between", fontSize: 28, color: QUIET }, [
        el("span", {}, options.handle ? `@${options.handle}` : ""),
        el("span", {}, `${slide.n}/${options.total}`),
      ]),
      el("div", { display: "flex", flexDirection: "column", gap: 40 }, [
        el(
          "div",
          { fontSize: hook ? 92 : 66, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 },
          slide.title,
        ),
        ...(slide.body
          ? [el("div", { fontSize: 42, lineHeight: 1.45, color: SOFT }, slide.body)]
          : []),
      ]),
      el(
        "div",
        {
          display: "flex",
          borderTop: "2px solid rgba(255,255,255,0.25)",
          paddingTop: 28,
          fontFamily: "Mono",
          fontSize: 26,
          color: QUIET,
        },
        options.signature,
      ),
    ],
  );
}

/** The slide as SVG (text converted to paths). Exposed so tests can check the layout. */
export function renderSlideSvg(slide: SlideInput, options: RenderOptions): Promise<string> {
  return satori(slideTree(slide, options) as never, {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    fonts: loadFonts(),
  });
}

export async function renderSlide(slide: SlideInput, options: RenderOptions): Promise<Buffer> {
  const svg = await renderSlideSvg(slide, options);
  return Buffer.from(
    new Resvg(svg, { fitTo: { mode: "width", value: SLIDE_WIDTH } }).render().asPng(),
  );
}

export async function renderSlides(
  slides: SlideInput[],
  options: Omit<RenderOptions, "total">,
): Promise<Buffer[]> {
  const ordered = [...slides].sort((a, b) => a.n - b.n);
  return Promise.all(
    ordered.map((s, i) => renderSlide({ ...s, n: i + 1 }, { ...options, total: ordered.length })),
  );
}
