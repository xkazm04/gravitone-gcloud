// LANE — DECK CARD MODEL & SKINS PURITY (dynamic).
//
// THE SEAM THIS GUARDS. The Obsidian and Almanac worlds previously duplicated
// card decisions independently in DeckCard.tsx and DeckCardAlmanac.tsx:
// spring configurations were copied, emblem/manifest key resolution was duplicated,
// the initial glyph fallback was retired in one world while drawn in the other,
// and Almanac bypassed the familyOf gate and image ground fallback.
//
// cardModel.ts extracts the pure card model: faceOf, pickTarget, and dealTransition.
// Both DeckCard and DeckCardAlmanac become pure skins that draw the model without
// deciding the face or duplicating springs and pick logic.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { stripComments } from "./_helpers";
import { faceOf, pickTarget, dealTransition, DEAL_SPRING } from "@/components/ui/deck/cardModel";

const DECK_DIR = join(process.cwd(), "components", "ui", "deck");

test("Case 1: faceOf returns emblem with ground for known manifest key", () => {
  const face = faceOf({ kind: "gradient", tone: "t", manifestKey: "discipline-trailer" });
  expect(face).toEqual({
    face: "emblem",
    key: "discipline-trailer",
    ground: { tone: "t" },
  });
});

test("Case 2: faceOf returns gradient for key with no motif, and Almanac has no initial-glyph fallback", () => {
  const face = faceOf({ kind: "gradient", tone: "t", manifestKey: "discipline-nope" });
  expect(face.face).toBe("gradient");
  expect(face.ground).toEqual({ tone: "t" });

  const almanacSrc = readFileSync(join(DECK_DIR, "DeckCardAlmanac.tsx"), "utf8");
  const stripped = stripComments(almanacSrc);
  expect(stripped).not.toContain("title.slice(0, 1)");
});

test("Case 3: faceOf returns image with fallback ground", () => {
  const face = faceOf({ kind: "image", src: "s", fallback: { tone: "f" } });
  expect(face).toEqual({
    face: "image",
    src: "s",
    ground: { tone: "f" },
  });
});

test("Case 4: pickTarget computes next id, pressed state, and aria label", () => {
  const t1 = pickTarget({ id: "a", title: "T" }, { picked: true, noUnpick: false });
  expect(t1).toEqual({ next: null, pressed: true, label: "Unpick: T" });

  const t2 = pickTarget({ id: "a", title: "T" }, { picked: true, noUnpick: true });
  expect(t2).toEqual({ next: "a", pressed: true, label: "Pick: T" });

  const t3 = pickTarget({ id: "a", title: "T", pickable: false }, { picked: false });
  expect(t3).toBeNull();
});

test("Case 5: dealTransition handles reduced and normal motion, and Almanac has no local stiffness", () => {
  const normal = dealTransition({ reduced: false, delay: 0.2 });
  expect(normal).toEqual({
    ...DEAL_SPRING,
    delay: 0.2,
    opacity: { duration: 0.35, delay: 0.2 },
  });

  const reduced = dealTransition({ reduced: true });
  expect(reduced).toEqual({ duration: 0.2 });

  const almanacSrc = readFileSync(join(DECK_DIR, "DeckCardAlmanac.tsx"), "utf8");
  const stripped = stripComments(almanacSrc);
  expect(stripped).not.toContain("stiffness");
});

test("Case 6: ratchet — skins obtain face only from faceOf and do not call hasEmblem or familyOf directly", () => {
  const almanacSrc = stripComments(readFileSync(join(DECK_DIR, "DeckCardAlmanac.tsx"), "utf8"));
  expect(almanacSrc).not.toContain("hasEmblem(");
  expect(almanacSrc).not.toContain("familyOf(");

  const artVariantsSrc = stripComments(readFileSync(join(DECK_DIR, "artVariants.tsx"), "utf8"));
  // In artVariants.tsx, DeckArtView should not call hasEmblem( or familyOf( directly
  const deckArtViewIdx = artVariantsSrc.indexOf("function DeckArtView");
  expect(deckArtViewIdx).toBeGreaterThan(0);
  const deckArtViewBody = artVariantsSrc.slice(deckArtViewIdx);
  expect(deckArtViewBody).not.toContain("hasEmblem(");
  expect(deckArtViewBody).not.toContain("familyOf(");
});

test("Case 7: ratchet — no duplicate key helpers in deck directory and DeckCardAlmanac imports cardModel", () => {
  const almanacSrc = stripComments(readFileSync(join(DECK_DIR, "DeckCardAlmanac.tsx"), "utf8"));
  expect(almanacSrc).toContain("./cardModel");

  const files = readdirSync(DECK_DIR).filter((f) => statSync(join(DECK_DIR, f)).isFile() && (f.endsWith(".ts") || f.endsWith(".tsx")));
  for (const f of files) {
    if (f === "cardModel.ts") continue;
    const content = stripComments(readFileSync(join(DECK_DIR, f), "utf8"));
    expect(content).not.toContain("function manifestKeyOf");
    expect(content).not.toContain("function emblemKeyOf");
  }
});
