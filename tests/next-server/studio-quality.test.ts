// THE STUDIO'S QUALITY AND ITS REFUSED GENERATIONS (spark scout-muse WP2) - the muse wing draws at the
// studio's quality Low, and a generation the studio refused or failed after naming it is deleted like a
// delivered one. The URL is the selectors table's own; the provider runs on a scripted driver handed
// through its test seam. No browser, no network, no vendor: the driver records, and fetch throws.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ImagingError } from "../../lib/imaging/errors.ts";
import { leonardoStudioProvider, type StudioDriver } from "../../lib/imaging/providers/leonardoStudio.ts";
import { STUDIO } from "../../lib/imaging/studio/selectors.ts";
import { StudioError, type StudioRun } from "../../lib/imaging/studio/types.ts";

/** The medium URL as it was before the quality argument existed, byte for byte. */
const MEDIUM_16_9 = "https://app.leonardo.ai/generate?model=openai%2Fgpt-image-2.5-sunburst&aspectRatio=16%3A9&quantity=1&size=SMALL&quality=MEDIUM&promptEnhance=OFF";

type Scripted = StudioDriver & { readonly calls: { prompt: string; aspect: string; quality?: string }[]; readonly removed: string[] };

function scripted(fail?: () => Error, failRemove?: string): Scripted {
  const calls: Scripted["calls"] = [];
  const removed: string[] = [];
  return {
    calls,
    removed,
    async generate(prompt, aspect, quality): Promise<StudioRun> {
      calls.push({ prompt, aspect, ...(quality === undefined ? {} : { quality }) });
      if (fail !== undefined) throw fail();
      return { generationId: "gen-ok", image: { base64: "AA==", mime: "image/png" }, credits: 4, model: STUDIO.model.id };
    },
    async health() {
      return { ok: true };
    },
    async remove(id) {
      removed.push(id);
      if (failRemove !== undefined) throw new Error(failRemove);
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the studio URL", () => {
  it("names quality LOW when asked, and the medium URL is byte-identical to the one before the argument", () => {
    expect(STUDIO.page.imageUrl("16:9")).toBe(MEDIUM_16_9);
    expect(STUDIO.page.imageUrl("16:9", "medium")).toBe(MEDIUM_16_9);
    const low = STUDIO.page.imageUrl("9:16", "low");
    expect(low).toBe(MEDIUM_16_9.replace("16%3A9", "9%3A16").replace("quality=MEDIUM", "quality=LOW"));
    expect(STUDIO.limits.maxCreditsPerImage).toBe(25);
  });
});

describe("the provider", () => {
  it("hands the request's quality and aspect to the driver; absent, none", async () => {
    const d = scripted();
    const p = leonardoStudioProvider({ driver: d });
    await p.generate?.({ prompt: "a portrait, aged 31", aspect: "9:16", count: 1, quality: "low" });
    await p.generate?.({ prompt: "a harbour", aspect: "16:9", count: 1 });
    expect(d.calls).toEqual([
      { prompt: "a portrait, aged 31", aspect: "9:16", quality: "low" },
      { prompt: "a harbour", aspect: "16:9" },
    ]);
    expect(d.removed).toEqual(["gen-ok", "gen-ok"]);
  });

  it("deletes a generation the studio refused after naming it, then answers the refusal verbatim", async () => {
    const d = scripted(() => new StudioError("leonardo declined this prompt on safety grounds", "refused", true, "gen-refused"));
    const e = await leonardoStudioProvider({ driver: d })
      .generate?.({ prompt: "p", aspect: "9:16", count: 1 })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ImagingError);
    expect(e).toMatchObject({ message: "leonardo declined this prompt on safety grounds", kind: "refused", dispatched: true });
    expect(d.removed).toEqual(["gen-refused"]);
  });

  it("a delete that fails never hides the refusal; a failure before the id was named deletes nothing", async () => {
    const d = scripted(() => new StudioError("leonardo studio failed generation gen-f", "failed", true, "gen-f"), "vendor said 500");
    await expect(leonardoStudioProvider({ driver: d }).generate?.({ prompt: "p", aspect: "9:16", count: 1 })).rejects.toMatchObject({ message: "leonardo studio failed generation gen-f", kind: "failed" });
    expect(d.removed).toEqual(["gen-f"]);
    const early = scripted(() => new StudioError("leonardo studio did not answer the generate", "failed", true));
    await expect(leonardoStudioProvider({ driver: early }).generate?.({ prompt: "p", aspect: "9:16", count: 1 })).rejects.toMatchObject({ message: "leonardo studio did not answer the generate" });
    expect(early.removed).toEqual([]);
  });
});
