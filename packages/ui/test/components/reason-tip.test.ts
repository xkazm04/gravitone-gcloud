// A reject reason's meaning on hover and focus (operator, 2026-10-23): the reason chip under a
// variant and the reason's key cap in the cull foot each open a tip holding the meaning the packet
// view carries (@gt/domain/source REASON_MEANING via PacketView.reasons), never a native `title=`;
// the trigger is described by the tip, so a screen reader hears it; a reason with no meaning draws
// no tip. Opening and Escape need a pointer and the live layer stack: tests/live/kit.live.spec.ts.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { reasonsOf, reasonVocabulary } from "@gt/domain/source";

import { CullFoot, reasonTips } from "../../src/components/cull/CullFoot.tsx";
import { VerdictPick } from "../../src/components/cull/VerdictPick.tsx";
import { Tip } from "../../src/components/hint/Tip.tsx";

const noop = (): void => undefined;
const SCOUT = reasonVocabulary("scout");

/** The tooltip each described control points at: [the control's text, the tip's text]. */
function described(html: string): [string, string][] {
  return [...html.matchAll(/<(button|kbd)[^>]*aria-describedby="([^"]+)"[^>]*>([^<]*)<\/\1>/g)].map((m) => {
    const tip = new RegExp(`<span role="tooltip" id="${(m[2] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>(.*?)</span>`).exec(html);
    return [m[3] ?? "", (tip?.[1] ?? "").replace(/<[^>]+>/g, "")];
  });
}

/** The drawn words: each cap as [cap], tips dropped, a space between controls. */
const text = (html: string): string =>
  html
    .replace(/<span role="tooltip"[^>]*>(?:(?!<\/span>).)*?(?:<span[^>]*>[^<]*<\/span>[^<]*)*<\/span>/g, "")
    .replace(/<kbd[^>]*>([^<]*)<\/kbd>/g, "[$1]")
    .replace(/<\/(button|span)>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/ +/g, " ")
    .replace(/\] \[/g, "][");

describe("a reason's tip says what the reason means", () => {
  test("each reason chip in a verdict by click is described by its meaning", () => {
    const html = renderToStaticMarkup(h(VerdictPick, { label: "replica 1", verdict: { verdict: "reject", reasons: ["craft"] }, reasons: SCOUT, onChange: noop }));
    const tips = described(html);
    expect(tips).toHaveLength(SCOUT.list.length);
    expect(tips).toContainEqual(["style", "The look is wrong for the video we are making."]);
    expect(tips).toContainEqual(["use case", "Serves no video worth making; later nights steer away."]);
    expect(tips.map(([r]) => r)).toEqual([...SCOUT.list]);
    expect(html).not.toContain("title=");
  });

  test("a reason with no meaning draws the bare chip, with no tip", () => {
    const html = renderToStaticMarkup(h(VerdictPick, { label: "x", verdict: { verdict: "reject", reasons: [] }, reasons: { list: ["style", "vibes"], max: 1, meaning: { style: "The look is wrong." } }, onChange: noop }));
    expect(described(html)).toEqual([["style", "The look is wrong."]]);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>vibes<\/button>/);
    expect(html.match(/role="tooltip"/g)).toHaveLength(1);
  });

  test("each reject key in the cull foot takes focus and tips the reason of the run's group", () => {
    const foot = (group?: string) => renderToStaticMarkup(h(CullFoot, { tally: { kept: 0, rejected: 0, undecided: 1 }, reasons: SCOUT, ...(group === undefined ? {} : { group }), refusals: 0, busy: false, onCommit: noop }));
    const tips = described(foot());
    expect(tips.map(([k]) => k)).toEqual(["2", "3", "4"]);
    expect(tips[2]).toEqual(["4", "craft Poorly executed: anatomy, composition, artefacts or framing."]);
    expect(foot().match(/<kbd[^>]*tabindex="0"/g)).toHaveLength(3);
    // A 3D run's keys tip a mesh's defects; an idea's an idea's.
    expect(described(foot("3d")).map(([k, t]) => `${k} ${t.split(" ")[0] ?? ""}`)).toEqual(["2 topology", "3 texture", "4 rig"]);
    expect(described(foot("ideas"))[1]).toEqual(["3", "use case Serves no video worth making; later nights steer away."]);
    expect(reasonTips(reasonVocabulary("suno"))).toEqual({});
    expect(reasonTips({ list: ["style", "vibes"], meaning: { style: "The look is wrong." } })).toEqual({ "2": { term: "style", text: "The look is wrong." } });
  });

  test("the foot's legend reads 1 keep, 2-4 reason, 5 reject; a source with no reasons draws no reason row", () => {
    const foot = (reasons: typeof SCOUT) => text(renderToStaticMarkup(h(CullFoot, { tally: { kept: 0, rejected: 0, undecided: 1 }, reasons, refusals: 0, busy: false, onCommit: noop })));
    expect(foot(SCOUT)).toContain("[1] keep [2][3][4] reason [5] reject [U] undecide");
    expect(foot(SCOUT)).toContain("[⇧1][⇧2] item");
    expect(foot(reasonVocabulary("suno"))).toContain("[1] keep [5] reject [U] undecide");
  });

  test("a keyed pick draws 2-4 on its first three chips, from the keymap; an asked one is ringed", () => {
    const keyed = renderToStaticMarkup(h(VerdictPick, { label: "the whole run", verdict: { verdict: "reject", reasons: [] }, reasons: { ...SCOUT, list: reasonsOf(SCOUT, "3d") }, onChange: noop, keyed: true, ask: true }));
    expect(text(keyed)).toContain("[2]topology [3]texture [4]rig style");
    expect([...keyed.matchAll(/aria-keyshortcuts="(\d)"/g)].map((m) => m[1])).toEqual(["2", "3", "4"]);
    expect(keyed).toContain("data-asked");
    // Unkeyed (a variant's pick inside an opened run, where the keys judge the whole run): bare chips.
    const bare = renderToStaticMarkup(h(VerdictPick, { label: "replica 1", verdict: { verdict: "reject", reasons: [] }, reasons: SCOUT, onChange: noop }));
    expect(bare).not.toContain("<kbd");
    expect(bare).not.toContain("data-asked");
  });

  test("a tip is closed until opened, and a seeded one (a /kit specimen) is drawn open", () => {
    const closed = renderToStaticMarkup(h(Tip, { text: "The rig fails.", children: (id: string) => h("button", { "aria-describedby": id }, "rig") }));
    expect(closed).not.toContain("data-open");
    const open = renderToStaticMarkup(h(Tip, { text: "The rig fails.", seededOpen: true, children: (id: string) => h("button", { "aria-describedby": id }, "rig") }));
    expect(open).toMatch(/^<span[^>]*data-open=""/);
    expect(described(open)).toEqual([["rig", "The rig fails."]]);
  });
});
