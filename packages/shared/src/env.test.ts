import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("returns parsed values", () => {
    const env = loadEnv({ PORT: z.coerce.number() }, { PORT: "4000" });
    expect(env.PORT).toBe(4000);
  });

  it("lists every invalid variable", () => {
    expect(() => loadEnv({ A: z.string(), B: z.string().url() }, { B: "not-a-url" })).toThrowError(
      /A:[\s\S]*B:/,
    );
  });
});
