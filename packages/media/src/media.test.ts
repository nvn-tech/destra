import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderSlideSvg, renderSlides, SLIDE_HEIGHT, SLIDE_WIDTH } from "./render.js";
import { LocalMediaStore } from "./store.js";

const pngSize = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

describe("renderSlides", () => {
  it("renders each slide as a 1080x1350 PNG, with Portuguese accents", async () => {
    const pngs = await renderSlides(
      [
        { n: 1, role: "hook", title: "5 mitos sobre a tireoide", body: "" },
        {
          n: 2,
          role: "point",
          title: "Mito 1: todo cansaço é tireoide",
          body: "O cansaço tem muitas causas. Exames e consulta ajudam.",
        },
      ],
      { signature: "Dra. Ana Souza | CRM-SP 123456 | RQE 7890", handle: "dra.anasouza" },
    );
    expect(pngs).toHaveLength(2);
    for (const png of pngs) {
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(pngSize(png)).toEqual({ width: SLIDE_WIDTH, height: SLIDE_HEIGHT });
    }
  });
});

describe("renderSlideSvg", () => {
  it("keeps every text element, including the CRM/RQE signature, inside the canvas", async () => {
    const svg = await renderSlideSvg(
      {
        n: 2,
        role: "point",
        title: "Mito 1: todo cansaço é tireoide",
        body: "O cansaço tem muitas causas. Exames e consulta ajudam a separar uma coisa da outra.",
      },
      { total: 7, signature: "Dra. Ana Souza | CRM-SP 123456 | RQE 7890", handle: "dra.anasouza" },
    );
    const starts = [...svg.matchAll(/<path[^>]*d="M([-\d.]+) ([-\d.]+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    // handle, counter, title, body, signature
    expect(starts).toHaveLength(5);
    for (const [x, y] of starts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(SLIDE_WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(SLIDE_HEIGHT);
    }
  });
});

describe("LocalMediaStore", () => {
  it("serves files only through a valid, unexpired signature", async () => {
    const store = new LocalMediaStore(
      await mkdtemp(join(tmpdir(), "media-")),
      "http://localhost:4000",
      "secret",
    );
    await store.put("w/1/p/slide-1.png", Buffer.from("png-bytes"));
    const url = new URL(await store.signedUrl("w/1/p/slide-1.png", 60));
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig") ?? "";
    expect((await store.read("w/1/p/slide-1.png", exp, sig))?.toString()).toBe("png-bytes");
    expect(await store.read("w/1/p/slide-1.png", exp, `${sig}x`)).toBeNull();
    expect(
      await store.read("w/1/p/slide-1.png", Math.floor(Date.now() / 1000) - 1, sig),
    ).toBeNull();
    await expect(store.put("../escape.png", Buffer.from("x"), "image/png")).rejects.toThrow(
      /Invalid media key/,
    );
  });
});
