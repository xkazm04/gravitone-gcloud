// The studio's one picture (desk/Plate.tsx) and its twin for a clip (desk/Clip.tsx): a picture whose
// bytes fail to load is a drawn state - the hatched ground named "not loaded" - not the browser's
// broken-image glyph; a picture already in hand at mount is loaded without an entrance; a picture
// that lands on screen enters; and a grid asks the blob door for the variant its box needs
// (desk/sources.ts), never for a URL that has no variants. The unit lane has no DOM, so the
// components are called as functions under a hook stub (useState), and the element's own handlers
// are pressed the way the browser would.
import { describe, expect, test, vi } from "vitest";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], i: 0 }));
vi.mock("react", async (importOriginal) => {
  const R = await importOriginal<typeof import("react")>();
  return {
    ...R,
    useState: <T>(init: T) => {
      const i = hooks.i++;
      if (!(i in hooks.slots)) hooks.slots[i] = init;
      return [hooks.slots[i] as T, (v: T) => void (hooks.slots[i] = v)];
    },
  };
});

import { Clip, type ClipProps } from "../../src/components/desk/Clip.tsx";
import { Plate, type PlateProps } from "../../src/components/desk/Plate.tsx";
import { pickThumbWidth, plateSources, posterSource } from "../../src/components/desk/sources.ts";

type El = { readonly type: unknown; readonly props: Readonly<Record<string, unknown>> };
const isEl = (x: unknown): x is El => typeof x === "object" && x !== null && "props" in x && "type" in x;
/** An element as the DOM would get it: a hook-free component it returns (PlateMissing) is called through. */
const resolve = (x: unknown): El => {
  if (!isEl(x)) throw new Error("drew no element");
  return typeof x.type === "function" ? resolve((x.type as (p: unknown) => unknown)(x.props)) : x;
};
const draw = (p: PlateProps): El => {
  hooks.i = 0;
  return resolve(Plate(p));
};
const drawClip = (p: ClipProps): El => {
  hooks.i = 0;
  return resolve(Clip(p));
};
const fresh = (): void => void (hooks.slots.length = 0);

const SHA = "a".repeat(64);
const BLOB = `/api/blob/${SHA}`;

/** A fake img the browser has finished with: loaded (`naturalWidth` > 0) or broken (0). */
const doneImg = (naturalWidth: number) => ({ complete: true, naturalWidth, getAttribute: () => BLOB });
/** A fake load event: the element the handler writes the entrance onto. */
const loadEvent = () => {
  const attrs: Record<string, string> = {};
  return { attrs, currentTarget: { setAttribute: (k: string, v: string) => void (attrs[k] = v) } };
};

describe("a desk picture that fails to load", () => {
  test("draws a named hatched ground where the browser would draw a broken-image glyph", () => {
    fresh();
    const img = draw({ src: "/api/blob/gone", alt: "left arm", className: "media" });
    expect(img.type).toBe("img");
    (img.props["onError"] as () => void)();
    const ground = draw({ src: "/api/blob/gone", alt: "left arm", className: "media" });
    expect(ground.type).toBe("span");
    expect(ground.props["role"]).toBe("img");
    expect(ground.props["aria-label"]).toBe("left arm: not loaded");
    expect(ground.props["data-state"]).toBe("failed");
    expect(String(ground.props["className"])).toContain("media");
  });

  test("an alt-less tile is still named", () => {
    fresh();
    (draw({ src: "/x", alt: "" }).props["onError"] as () => void)();
    expect(draw({ src: "/x", alt: "" }).props["aria-label"]).toBe("not loaded");
  });

  test("a new src gets its own try", () => {
    fresh();
    (draw({ src: "/a", alt: "a" }).props["onError"] as () => void)();
    expect(draw({ src: "/b", alt: "b" }).type).toBe("img");
  });

  test("a failure that landed before the handler (cached 404) is caught at mount", () => {
    fresh();
    (draw({ src: BLOB, alt: "a" }).props["ref"] as (el: unknown) => void)(doneImg(0));
    expect(draw({ src: BLOB, alt: "a" }).props["data-state"]).toBe("failed");
  });

  test("the caller's own face replaces the hatch, through the same error path", () => {
    fresh();
    (draw({ src: "/x", alt: "x", failed: "unreadable" }).props["onError"] as () => void)();
    hooks.i = 0;
    expect(Plate({ src: "/x", alt: "x", failed: "unreadable" })).toBe("unreadable");
  });
});

describe("a picture settles", () => {
  test("it waits on its ground until a byte arrives, and keeps loading lazy and decoding async", () => {
    fresh();
    const img = draw({ src: "/a", alt: "a", lazy: true });
    expect(img.props["data-state"]).toBe("waiting");
    expect(img.props["data-enter"]).toBeUndefined();
    expect(img.props["loading"]).toBe("lazy");
    expect(img.props["decoding"]).toBe("async");
  });

  test("a picture already complete at mount is loaded, with no entrance over pixels already seen", () => {
    fresh();
    (draw({ src: BLOB, alt: "a" }).props["ref"] as (el: unknown) => void)(doneImg(640));
    const img = draw({ src: BLOB, alt: "a" });
    expect(img.props["data-state"]).toBe("loaded");
    expect(img.props["data-enter"]).toBeUndefined();
  });

  test("a picture that lands on screen enters, written onto the element in the handler itself", () => {
    fresh();
    const e = loadEvent();
    (draw({ src: BLOB, alt: "a" }).props["onLoad"] as (ev: unknown) => void)(e);
    expect(e.attrs).toEqual({ "data-state": "loaded", "data-enter": "" });
    const img = draw({ src: BLOB, alt: "a" });
    expect(img.props["data-state"]).toBe("loaded");
    expect(img.props["data-enter"]).toBe("");
  });

  test("the box is reserved at the caller's aspect, waiting or failed", () => {
    fresh();
    expect(draw({ src: "/a", alt: "a", aspect: 16 / 9 }).props["style"]).toEqual({ aspectRatio: 16 / 9 });
    (draw({ src: "/a", alt: "a", aspect: 16 / 9 }).props["onError"] as () => void)();
    expect(draw({ src: "/a", alt: "a", aspect: 16 / 9 }).props["style"]).toEqual({ aspectRatio: 16 / 9 });
  });
});

describe("the variant a picture asks for", () => {
  test("the smallest width that covers CSS width times device ratio", () => {
    expect(pickThumbWidth(230, 1)).toBe(320);
    expect(pickThumbWidth(320, 1)).toBe(320);
    expect(pickThumbWidth(321, 1)).toBe(640);
    expect(pickThumbWidth(230, 2)).toBe(640);
    expect(pickThumbWidth(600, 2)).toBe(1280);
    expect(pickThumbWidth(86, 3)).toBe(320);
  });

  test("past the widest variant, or for no real width, no variant: the original", () => {
    expect(pickThumbWidth(700, 2)).toBeUndefined();
    expect(pickThumbWidth(0, 1)).toBeUndefined();
    expect(pickThumbWidth(Number.NaN, 1)).toBeUndefined();
    expect(pickThumbWidth(Number.POSITIVE_INFINITY, 1)).toBeUndefined();
    expect(pickThumbWidth(300, 0)).toBe(320);
  });

  test("a blob drawn in a grid offers all three variants, and a lazy one lets the browser measure its box", () => {
    const at = plateSources(`${BLOB}?type=image/png`, 230, true);
    expect(at.src).toBe(`${BLOB}?type=image/png&w=320`);
    expect(at.srcSet).toBe(`${BLOB}?type=image/png&w=320 320w, ${BLOB}?type=image/png&w=640 640w, ${BLOB}?type=image/png&w=1280 1280w`);
    expect(at.sizes).toBe("auto, 230px");
    expect(plateSources(BLOB, 230, false).sizes).toBe("230px");
  });

  test("a URL with no variants is drawn as it is, with no srcset", () => {
    for (const src of ["/clips/presets/blueprint.jpg", "data:image/png;base64,AAAA", "/api/local-draws/file?run=r&path=a.png", "/api/blob/gone"]) {
      expect(plateSources(src, 230, true)).toEqual({ src });
    }
  });

  test("a detail passes no width and gets the original; a width past the widest does too", () => {
    expect(plateSources(BLOB, undefined, false)).toEqual({ src: BLOB });
    expect(plateSources(BLOB, 1400, true)).toEqual({ src: BLOB });
  });

  test("Plate draws a fixture still with no srcset, and a blob with one", () => {
    fresh();
    const still = draw({ src: "/clips/presets/blueprint.jpg", alt: "a", lazy: true, width: 86 });
    expect(still.props["srcSet"]).toBeUndefined();
    expect(still.props["src"]).toBe("/clips/presets/blueprint.jpg");
    fresh();
    const blob = draw({ src: BLOB, alt: "a", lazy: true, width: 86 });
    expect(String(blob.props["srcSet"])).toContain("w=1280 1280w");
    expect(blob.props["src"]).toBe(`${BLOB}?w=320`);
  });

  test("a poster takes one URL, at the variant a dense screen needs; any other poster is unchanged", () => {
    expect(posterSource(BLOB, 230)).toBe(`${BLOB}?w=640`);
    expect(posterSource(BLOB, undefined)).toBe(BLOB);
    expect(posterSource("/clips/presets/blueprint.jpg", 230)).toBe("/clips/presets/blueprint.jpg");
  });
});

describe("a clip, Plate's twin", () => {
  test("a clip that will not play is the named hatched ground, not a black rectangle", () => {
    fresh();
    const v = drawClip({ src: "/gone.webm", label: "take 3" });
    expect(v.type).toBe("video");
    expect(v.props["preload"]).toBe("metadata");
    (v.props["onError"] as () => void)();
    const ground = drawClip({ src: "/gone.webm", label: "take 3" });
    expect(ground.type).toBe("span");
    expect(ground.props["aria-label"]).toBe("take 3: not loaded");
  });

  test("a clip whose metadata is in hand at mount is loaded; one whose metadata lands enters", () => {
    fresh();
    (drawClip({ src: "/a.webm", label: "" }).props["ref"] as (el: unknown) => void)({ error: null, readyState: 1 });
    expect(drawClip({ src: "/a.webm", label: "" }).props["data-state"]).toBe("loaded");
    fresh();
    const e = loadEvent();
    (drawClip({ src: "/a.webm", label: "" }).props["onLoadedMetadata"] as (ev: unknown) => void)(e);
    expect(e.attrs["data-enter"]).toBe("");
    expect(drawClip({ src: "/a.webm", label: "" }).props["data-enter"]).toBe("");
  });

  test("a clip with a poster does not fade in over it, and its blob poster is a variant", () => {
    fresh();
    const v = drawClip({ src: "/a.webm", label: "a", poster: BLOB, width: 230 });
    expect(v.props["poster"]).toBe(`${BLOB}?w=640`);
    const e = loadEvent();
    (v.props["onLoadedMetadata"] as (ev: unknown) => void)(e);
    expect(e.attrs["data-enter"]).toBeUndefined();
    expect(drawClip({ src: "/a.webm", label: "a", poster: BLOB, width: 230 }).props["data-state"]).toBe("loaded");
  });
});
