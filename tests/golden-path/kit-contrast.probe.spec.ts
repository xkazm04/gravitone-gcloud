// LANE - /kit contrast is alpha-aware and world-parametric: translucent tokens are composited
// before they are measured, and the Obsidian-kit remap resolves for every text role.
import { test, expect } from "@playwright/test";

import { contrast, contrastOver, paintOver, resolve } from "@/app/kit/contrast";
import { TOKEN_ROLES } from "@/app/kit/catalog";
import { CSS_TOKENS, WORLD_OBSIDIAN_KIT } from "@/components/ui/tokens";

const OBSIDIAN = { ...CSS_TOKENS, ...WORLD_OBSIDIAN_KIT };

test("resolve keeps the alpha of a colour-mix over transparent", () => {
  expect(resolve("color-mix(in srgb, var(--gt-ink-bright) 72%, transparent)", OBSIDIAN)).toEqual({ rgb: "#f3f6fb", alpha: 0.72 });
  expect(resolve("transparent", {})).toEqual({ rgb: "#000000", alpha: 0 });
  expect(resolve("color-mix(in srgb, white 7%, transparent)", {})).toEqual({ rgb: "#ffffff", alpha: 0.07 });
  expect(resolve("#ABCDEF", {})).toEqual({ rgb: "#abcdef", alpha: 1 });
  expect(resolve("linear-gradient(red, blue)", {})).toBeNull();
});

test("contrastOver composites before measuring", () => {
  expect(contrastOver({ rgb: "#ffffff", alpha: 0.12 }, "#080a10")!).toBeLessThan(3);
  const quarter = contrastOver({ rgb: "#ffffff", alpha: 0.25 }, "#080a10")!;
  expect(quarter).toBeGreaterThan(contrastOver({ rgb: "#ffffff", alpha: 0.12 }, "#080a10")!);
  expect(contrastOver({ rgb: "#ffffff", alpha: 1 }, "#080a10")).toBe(contrast("#ffffff", "#080a10"));
});

test("every text role in the Obsidian kit world resolves and measures", () => {
  const night = resolve(OBSIDIAN["--al-night"], OBSIDIAN)!.rgb;
  const ground = ["--al-night", "--al-deep", "--al-field"].map((g) => paintOver(resolve(OBSIDIAN[g], OBSIDIAN)!, night));
  const text = Object.keys(TOKEN_ROLES).filter((k) => TOKEN_ROLES[k].text);
  expect(text.length).toBeGreaterThan(0);
  for (const k of text) {
    expect(k in WORLD_OBSIDIAN_KIT, `${k} has an Obsidian-kit value`).toBe(true);
    const c = resolve(OBSIDIAN[k], OBSIDIAN);
    expect(c, `${k} resolves`).not.toBeNull();
    for (const g of ground) expect(contrastOver(c!, g), `${k} on ${g}`).not.toBeNull();
  }
});
