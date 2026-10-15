// The signal law, held by type: no component accepts a paragraph slot, and a disclosure or an
// empty-state label over twelve words is a compile error (typecheck:next runs this file; the
// runtime assertions keep Vitest honest about the word counter itself).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, test } from "vitest";
import type { ButtonProps } from "../../src/components/button/Button.tsx";
import type { CapsHeadingProps } from "../../src/components/heading/CapsHeading.tsx";
import type { ChipProps } from "../../src/components/chip/Chip.tsx";
import { Empty, type EmptyProps } from "../../src/components/empty/Empty.tsx";
import type { FacetRowProps } from "../../src/components/facet/FacetRow.tsx";
import type { FieldProps } from "../../src/components/field/Field.tsx";
import type { FoldProps } from "../../src/components/fold/Fold.tsx";
import { Hint, type HintProps } from "../../src/components/hint/Hint.tsx";
import { HINT_WORDS, hintWords, type OverTwelve } from "../../src/components/hint/words.ts";
import type { KeycapsProps } from "../../src/components/keycaps/Keycaps.tsx";
import type { PanelProps } from "../../src/components/panel/Panel.tsx";
import type { PipRowProps } from "../../src/components/piprow/PipRow.tsx";
import type { ProvenanceFields } from "../../src/components/provenance/Provenance.tsx";
import type { SegProps } from "../../src/components/seg/Seg.tsx";
import type { StackBarProps } from "../../src/components/stackbar/StackBar.tsx";
import type { TabRailProps, Tab } from "../../src/components/tabrail/TabRail.tsx";
import type { TallyProps } from "../../src/components/tally/Tally.tsx";
import type { UpstreamBreakProps } from "../../src/components/upstream/UpstreamBreak.tsx";
import type { WaveProps } from "../../src/components/wave/Wave.tsx";

/** The names a paragraph arrives under (v1 README: Deck's `sub`, four tab bars' `blurb`). */
type ParagraphSlot = "sub" | "subtitle" | "blurb" | "description" | "caption" | "help" | "helpText" | "note" | "body" | "prose";

type Slots<P> = Extract<keyof P, ParagraphSlot>;

describe("no component accepts a paragraph slot", () => {
  test("type level, over every component's props", () => {
    expectTypeOf<Slots<ButtonProps>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<CapsHeadingProps>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<ChipProps>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<EmptyProps<"x">>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<FacetRowProps>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<FieldProps>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<FoldProps>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<HintProps<"x">>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<KeycapsProps>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<PanelProps>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<PipRowProps>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<ProvenanceFields>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<SegProps<"a">>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<StackBarProps>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<TabRailProps<"a">>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<Tab<"a">>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<TallyProps>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<UpstreamBreakProps>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<WaveProps>>().toEqualTypeOf<never>();
  });

  test("the slot list itself is not empty (a vacuous never would pass everything)", () => {
    expectTypeOf<Slots<{ sub: string; blurb: string }>>().toEqualTypeOf<"sub" | "blurb">();
  });
});

describe("the twelve-word rule", () => {
  const twelve = "one two three four five six seven eight nine ten eleven twelve";
  const thirteen = `${twelve} thirteen`;

  test("type level: twelve words compile, thirteen do not", () => {
    expectTypeOf<OverTwelve<typeof twelve>>().toEqualTypeOf<false>();
    expectTypeOf<OverTwelve<typeof thirteen>>().toEqualTypeOf<true>();
    expectTypeOf<OverTwelve<string>>().toEqualTypeOf<false>();
    const ok = createElement(Hint<typeof twelve>, { text: twelve, name: "spend" });
    // @ts-expect-error - a thirteen-word hint is a paragraph behind a glyph
    const long = createElement(Hint<typeof thirteen>, { text: thirteen, name: "spend" });
    // @ts-expect-error - an empty state of thirteen words is narration
    const empty = createElement(Empty<typeof thirteen>, { label: thirteen });
    expect([ok, long, empty]).toHaveLength(3);
  });

  test("the runtime counter agrees with the type at the boundary", () => {
    expect(hintWords(twelve)).toBe(HINT_WORDS);
    expect(hintWords(thirteen)).toBe(HINT_WORDS + 1);
    expect(hintWords("  local GPU runs $0  ")).toBe(4);
  });

  test("a hint names its glyph and describes it by the tip, which stays mounted", () => {
    const html = renderToStaticMarkup(createElement(Hint<"local GPU runs $0">, { text: "local GPU runs $0", name: "spend" }));
    const id = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeDefined();
    expect(html).toContain(`aria-label="spend"`);
    expect(html).toContain(`role="tooltip" id="${id ?? ""}"`);
    expect(html).toContain(">local GPU runs $0<");
  });
});
