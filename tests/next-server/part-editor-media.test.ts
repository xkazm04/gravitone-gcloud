// THE MEDIA PART EDITORS (app/(studio)/projects/[id]/[part]/_edit: frames, motion, cut, score,
// render, voice), driven through the node lane's one hook dispatcher (tests/golden-path/_studio/
// hooks.ts). No DOM: an editor is called as the function it is, its keys are read off a stand-in
// `useKeys`, and its JSX is walked only for the props it hands the workspace.
//
// THE LEGEND IS THE KEYS. PartWorkspace draws the Keycaps legend for the mode and facts it is
// handed; the dispatcher answers the handlers and facts `useKeys` registered. Keycaps' own header
// promises the two cannot disagree - that holds only while an editor hands both the same story.
// A row the legend draws with no handler behind it is a dead control (video-assembly
// gap-and-refusal-honesty: "no dead controls, no phantom capability").

import { afterEach, describe, expect, it, vi } from "vitest";

type Registered = { mode: string; verbs: Set<string>; facts: readonly string[] };
const registered = vi.hoisted((): Registered[] => []);
vi.mock("@gt/ui/keymap/dispatch", async (orig) => ({
  ...(await orig<object>()),
  useKeys: (mode: string, handlers: Record<string, unknown>, opts: { facts?: readonly string[] } = {}) => {
    registered.push({ mode, verbs: new Set(Object.keys(handlers)), facts: opts.facts ?? [] });
  },
}));

import type { ReactElement } from "react";

import type { AdFinishData, AdsClips, AdsTakes, BedData } from "@gt/domain/partView";
import { BINDINGS } from "@gt/ui/keymap/bindings";
import { keyTable, type KeyRow } from "@gt/ui/keymap/keymap";

import { CutFinish } from "../../app/(studio)/projects/[id]/[part]/_edit/CutFinish.tsx";
import type { EditorProps, Frame } from "../../app/(studio)/projects/[id]/[part]/_edit/PartEditor.tsx";
import { ScoreBed } from "../../app/(studio)/projects/[id]/[part]/_edit/ScoreBed.tsx";
import { AdsClipsEditor, AdsTakesEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Takes.tsx";
import { harness } from "../golden-path/_studio/hooks.ts";
import { compile } from "@gt/ui/keymap/keymap";

afterEach(() => {
  registered.length = 0;
});

const frame: Frame = {
  trail: [],
  here: "part",
  verdict: { state: "empty", codes: [] },
  acts: null,
  undo: { last: null, busy: false, onUndo: () => {} },
  tabs: [],
  current: "part",
  href: (k) => k,
  upstream: [],
};
const props = <D,>(data: D): EditorProps<never> & { readonly data: D } => ({ view: undefined as never, frame, send: () => {}, busy: false, error: null, act: () => {}, data });

/** The workspace the editor hands back: its mode and facts, as the legend reads them. */
async function workspaceOf(run: () => ReactElement): Promise<{ mode: string; facts: readonly string[] }> {
  const h = harness(run, { settleWhen: "stable" });
  const el = (await h.settleUp()) as ReactElement<{ mode: string; facts?: readonly string[] }>;
  return { mode: el.props.mode, facts: el.props.facts ?? [] };
}

/** The rows the legend draws vs the rows a press would reach (the same table, only the verbs
 *  the editor answers, under the facts the dispatcher holds). */
function legend(ws: { mode: string; facts: readonly string[] }): { drawn: KeyRow[]; live: KeyRow[] } {
  const keys = registered.filter((r) => r.mode === ws.mode);
  const verbs = new Set(keys.flatMap((r) => [...r.verbs]));
  const facts = new Set(keys.flatMap((r) => [...r.facts]));
  const drawn = keyTable(compile(BINDINGS), ws.mode, { facts: new Set(ws.facts) });
  const live = keyTable(compile(BINDINGS.filter((b) => b.mode !== ws.mode || verbs.has(b.verb))), ws.mode, { facts });
  return { drawn, live };
}

const SCENARIO = { id: "s1", title: "Rain shell" };

describe("the legend draws only the keys the editor answers", () => {
  it("the ad's finish draws no transport it does not run", async () => {
    const d: AdFinishData = {
      face: "finish",
      scenario: SCENARIO,
      shots: [{ id: "a", durationS: 5, image: "img", clip: true, super: "" }],
      endCard: { cta: "Pack one", line: "", holdS: 2 },
      aspects: [{ aspect: "9:16", on: true, px: "1080×1920", export: null }],
      checks: [],
      runtimeS: 7,
      targetS: 15,
    };
    const l = legend(await workspaceOf(() => CutFinish(props(d)) as ReactElement));
    expect(l.drawn).toEqual(l.live);
  });

  it("the ad's bed draws no transport, cue walk or zoom it does not run", async () => {
    const d: BedData = { face: "bed", scenario: { ...SCENARIO, musicMood: "warm" }, stale: false, shots: [{ id: "a", durationS: 5, label: "a" }], endCardS: 2, runtimeS: 7, bpm: 96, takes: [], activeTakeId: null };
    const l = legend(await workspaceOf(() => ScoreBed(props(d)) as ReactElement));
    expect(l.drawn).toEqual(l.live);
  });

  it("a shot with no takes draws no adopt keys", async () => {
    const d: AdsTakes = { face: "takes", scenario: SCENARIO, scenarioMoved: false, aspect: "16:9", shots: [{ id: "a", durationS: 5, brief: "a coat in rain", super: null, takes: [], adopted: null }] };
    const ws = await workspaceOf(() => AdsTakesEditor(props(d)) as ReactElement);
    const keys = registered.find((r) => r.mode === ws.mode);
    expect(ws.facts).toEqual(keys?.facts);
    expect(legend(ws).drawn.map((r) => r.does)).not.toContain("adopt take");
  });

  it("a shot with no still and no clips draws no animate or adopt keys", async () => {
    const d: AdsClips = { face: "clips", scenario: SCENARIO, scenarioMoved: false, shots: [{ id: "a", durationS: 5, motion: "rain falls", still: null, clips: [], adopted: null }] };
    const l = legend(await workspaceOf(() => AdsClipsEditor(props(d)) as ReactElement));
    expect(l.drawn).toEqual(l.live);
  });
});
