// The desks' one picture (desk/Plate.tsx): a picture whose bytes fail to load is a drawn state - the
// hatched ground named "not loaded" - not the browser's broken-image glyph. The unit lane has no DOM,
// so Plate is called as a function under a hook stub (useState), and the img's own error handler is
// pressed the way the browser would.
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

import { Plate, type PlateProps } from "../../src/components/desk/Plate.tsx";

type El = { readonly type: unknown; readonly props: Readonly<Record<string, unknown>> };
const draw = (p: PlateProps): El => {
  hooks.i = 0;
  return Plate(p) as unknown as El;
};
const fresh = (): void => void (hooks.slots.length = 0);

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

  test("a picture that loads stays an img", () => {
    fresh();
    expect(draw({ src: "/a", alt: "a", lazy: true }).props["loading"]).toBe("lazy");
  });
});
