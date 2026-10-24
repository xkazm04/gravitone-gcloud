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

type Handler = (hit: { cap: string; index: number }) => void | false;
type Registered = { mode: string; verbs: Set<string>; facts: readonly string[]; handlers: Record<string, Handler> };
const registered = vi.hoisted((): Registered[] => []);
vi.mock("@gt/ui/keymap/dispatch", async (orig) => ({
  ...(await orig<object>()),
  useKeys: (mode: string, handlers: Record<string, Handler>, opts: { facts?: readonly string[] } = {}) => {
    registered.push({ mode, verbs: new Set(Object.keys(handlers)), facts: opts.facts ?? [], handlers });
  },
}));

// The compositor is the sibling's (lib/sound/mv/compositor.ts): here it only records which frame
// the preview asked it to draw.
const drawn = vi.hoisted((): number[] => []);
vi.mock("@/lib/sound/mv/compositor", () => ({
  DEFAULT_EFFECT_PARAMS: {},
  computeEdgeMask: () => ({}),
  buildBloomTexture: () => ({}),
  limitFlashRate: (xs: number[]) => xs,
  renderFrame: (_ctx: unknown, input: { frameIndex: number }) => {
    drawn.push(input.frameIndex);
  },
}));

import { isValidElement, type ReactElement, type ReactNode } from "react";

import type { AdFinishData, AdsClips, AdsTakes, BedData, PartOp, PartView, RenderData, SpottingData, TakeView, VoiceData, VoiceLineView } from "@gt/domain/partView";
import { BINDINGS } from "@gt/ui/keymap/bindings";
import { keyTable, type KeyRow } from "@gt/ui/keymap/keymap";

import { CLOCK_ZOOMS, useTransport, zoomStep } from "../../app/(studio)/projects/[id]/[part]/_edit/CutClock.tsx";
import { CutFinish } from "../../app/(studio)/projects/[id]/[part]/_edit/CutFinish.tsx";
import type { EditorProps, Frame } from "../../app/(studio)/projects/[id]/[part]/_edit/PartEditor.tsx";
import { RenderEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Render.tsx";
import { ScoreEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Score.tsx";
import { ScoreBed } from "../../app/(studio)/projects/[id]/[part]/_edit/ScoreBed.tsx";
import { ScoreTakes } from "../../app/(studio)/projects/[id]/[part]/_edit/ScoreTakes.tsx";
import { AdsClipsEditor, AdsTakesEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Takes.tsx";
import { VoiceEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Voice.tsx";
import cut from "../../app/(studio)/projects/[id]/[part]/_edit/Cut.module.css";
import { harness } from "../golden-path/_studio/hooks.ts";
import { compile } from "@gt/ui/keymap/keymap";

afterEach(() => {
  registered.length = 0;
  drawn.length = 0;
  vi.unstubAllGlobals();
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

/* ── the poster preview's clock ─────────────────────────────────────────── */

// The compositor's contract (renderFrame's doc): the preview's frame loop draws "whichever
// frameIndex the loop computes as closest to now" - a frame is a function of time at the
// envelope's 30 fps, never of how many display refreshes have gone by.

/** The first element in a tree whose component is named `name`. */
function find(node: ReactNode, name: string): ReactElement | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = find(n, name);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (typeof node.type === "function" && node.type.name === name) return node;
  const p = node.props as Record<string, unknown>;
  for (const v of Object.values(p)) {
    const hit = find((v !== null && typeof v === "object" && "children" in v && !isValidElement(v) ? (v as { children: ReactNode }).children : v) as ReactNode, name);
    if (hit !== null) return hit;
  }
  return null;
}

/** Drive the preview for one second of a display refreshing at `hz`; the frames it drew. */
async function previewAt(hz: number): Promise<number[]> {
  const frames: ((now: number) => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ drawImage: () => {}, getImageData: () => ({}) }) }) });
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 1920;
      naturalHeight = 1080;
      onload: (() => void) | null = null;
      set src(_: string) {
        this.onload?.();
      }
    },
  );
  const data: RenderData = { face: "render", track: { title: "Salt lines", durationS: 180 }, still: { label: "still", blob: "abc" }, words: null, res: "1080p", exports: [], envelope: Array.from({ length: 5400 }, (_, i) => (i % 7) / 7) };
  const page = RenderEditor({ ...props(undefined), view: { data } as PartView<"render"> }) as ReactElement<{ primary: { children: ReactNode } }>;
  const preview = find(page.props.primary.children, "Preview");
  if (preview === null) throw new Error("no Preview in the render editor's primary");
  const Preview = preview.type as (p: unknown) => ReactElement<{ ref: { current: unknown } }>;
  const h = harness(() => {
    const el = Preview(preview.props);
    el.props.ref.current = { getContext: () => ({}) };
    return el;
  });
  await h.settleUp();
  const start = 1000;
  for (let k = 0; k <= hz; k++) frames.shift()?.(start + (k * 1000) / hz);
  h.unmount();
  return [...drawn];
}

describe("the poster preview plays the envelope at its own 30 fps", () => {
  it("one second on a 60 Hz display draws 30 envelope frames, not 60", async () => {
    const f = await previewAt(60);
    expect(Math.max(...f)).toBe(30);
  });

  it("one second on a 120 Hz display draws the same 30", async () => {
    const f = await previewAt(120);
    expect(Math.max(...f)).toBe(30);
  });
});

/* ── the transport (CutClock.tsx useTransport: the cut's and the score's one clock) ── */

describe("the transport at the end of the film", () => {
  async function atTheEnd(press: (t: ReturnType<typeof useTransport>) => void): Promise<{ t: number; playing: boolean }> {
    const frames: ((now: number) => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("performance", { now: () => 0 });
    const h = harness(() => useTransport(10));
    (await h.settleUp()).seek(10);
    press(await h.settleUp());
    await h.settleUp();
    frames.shift()?.(100);
    const tr = await h.settleUp();
    h.unmount();
    return { t: tr.t, playing: tr.playing };
  }

  it("play from the end starts again from the top", async () => {
    const r = await atTheEnd((tr) => tr.toggle());
    expect(r).toEqual({ t: 0.1, playing: true });
  });

  it("a shuttle from the end starts again from the top, like play", async () => {
    const r = await atTheEnd((tr) => tr.shuttle(2));
    expect(r).toEqual({ t: 0.2, playing: true });
  });
});

/* ── a key and its button say the same thing ───────────────────────────── */

describe("the score's N is the add cue button", () => {
  const spotting = (scenes: SpottingData["scenes"]): SpottingData => ({ face: "spotting", totalS: 0, targetS: null, scenes, cues: [], proposal: { pending: false, unplaced: [] }, gaps: [], coveredS: 0, turn: null, lab: [] });
  async function pressN(d: SpottingData, busy: boolean): Promise<{ answer: void | false; sent: PartOp[] }> {
    const sent: PartOp[] = [];
    const p = { ...props(undefined), busy, send: (op: PartOp) => void sent.push(op), view: { data: d } as PartView<"score"> };
    const face = ScoreEditor(p) as ReactElement; // the Spotting face, called as the function it is
    await harness(() => (face.type as (q: unknown) => ReactElement)(face.props), { settleWhen: "stable" }).settleUp();
    const n = registered.find((r) => r.mode === "part.score")?.handlers["add-cue"];
    if (n === undefined) throw new Error("the score registered no add-cue");
    return { answer: n({ cap: "N", index: 0 }), sent };
  }

  it("with no picture on the clock N is declined, where the button is disabled", async () => {
    // The fixture side answered such a press "every scene has a cue" - of a film with no scenes.
    expect(await pressN(spotting([]), false)).toEqual({ answer: false, sent: [] });
  });

  it("while a write is in flight N is declined, where the button is disabled", async () => {
    const scenes = [{ id: "u1", index: 1, label: "open", mood: "", startS: 0, durS: 4 }];
    expect(await pressN(spotting(scenes), true)).toEqual({ answer: false, sent: [] });
  });

  it("with picture and nothing in flight N adds a cue", async () => {
    const scenes = [{ id: "u1", index: 1, label: "open", mood: "", startS: 0, durS: 4 }];
    expect((await pressN(spotting(scenes), false)).sent).toEqual([{ op: "cue-add" }]);
  });
});

/* ── a take's section note (ScoreTakes.tsx) ────────────────────────────── */

/** Every element in a tree whose props match `pick`. */
function all(node: ReactNode, pick: (p: Record<string, unknown>) => boolean, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const n of node) all(n, pick, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  const p = node.props as Record<string, unknown>;
  if (pick(p)) out.push(node);
  all(p.children as ReactNode, pick, out);
  return out;
}

describe("a take's section note goes where the section is picked", () => {
  const take = (revision?: TakeView["revision"]): TakeView => ({
    id: "t1",
    label: "take 1",
    at: null,
    mark: null,
    active: true,
    held: true,
    seconds: 30,
    sections: [
      { index: 0, name: "intro", startS: 0, endS: 8 },
      { index: 1, name: "verse", startS: 8, endS: 20 },
      { index: 2, name: "chorus", startS: 20, endS: 30 },
    ],
    ...(revision === undefined ? {} : { revision }),
  });
  async function pick(t: TakeView, name: string): Promise<[string, number, string][]> {
    const notes: [string, number, string][] = [];
    const list = ScoreTakes({ takes: [t], busy: false, acts: { use: () => {}, mark: () => {}, note: (id, section, note) => void notes.push([id, section, note]) } }) as ReactElement<{ children: ReactElement[] }>;
    const row = list.props.children[0];
    if (row === undefined) throw new Error("no take row");
    const h = harness(() => (row.type as (p: unknown) => ReactElement)(row.props));
    const chip = all(await h.settleUp(), (p) => p.label === name && typeof p.onPress === "function")[0];
    if (chip === undefined) throw new Error(`no ${name} chip`);
    (chip.props as { onPress: () => void }).onPress();
    await h.settleUp();
    return notes;
  }

  it("a note standing on the intro moves to the chorus when the chorus is picked", async () => {
    expect(await pick(take({ section: 0, note: "darker" }), "chorus")).toEqual([["t1", 2, "darker"]]);
  });

  it("picking a section with no note writes nothing", async () => {
    expect(await pick(take(), "chorus")).toEqual([]);
  });

  it("the sections are a group of toggle chips, not a radiogroup with no radios in it", async () => {
    const list = ScoreTakes({ takes: [take()], busy: false, acts: { use: () => {}, mark: () => {}, note: () => {} } }) as ReactElement<{ children: ReactElement[] }>;
    const row = list.props.children[0];
    if (row === undefined) throw new Error("no take row");
    const tree = await harness(() => (row.type as (p: unknown) => ReactElement)(row.props)).settleUp();
    const box = all(tree, (p) => p["aria-label"] === "sections of take 1")[0];
    expect((box?.props as { role?: string } | undefined)?.role).toBe("group");
  });

  it("picking the section the note already stands on writes nothing", async () => {
    expect(await pick(take({ section: 2, note: "darker" }), "chorus")).toEqual([]);
  });
});

/* ── the voice rail and its tally say the same thing (Voice.tsx) ───────── */

describe("a voice line whose take is gone is not drawn recorded", () => {
  const line = (id: string, held: boolean): VoiceLineView => ({
    id,
    text: `line ${id}`,
    card: null,
    activeTakeId: "t1",
    takes: [{ id: "t1", label: "take 1", at: null, mark: null, active: true, held, seconds: 4, sections: [] }],
  });
  async function rail(d: VoiceData): Promise<{ tally: unknown; marks: string[] }> {
    const p = { ...props(undefined), view: { data: d } as PartView<"voice"> };
    const ws = (await harness(() => VoiceEditor(p), { settleWhen: "stable" }).settleUp()) as ReactElement<{ rail: { children: ReactNode } }>;
    const tally = all(ws.props.rail.children, (q) => q.label === "lines recorded")[0];
    const list = all(ws.props.rail.children, (q) => typeof q.row === "function")[0];
    if (tally === undefined || list === undefined) throw new Error("no rail tally or list");
    const row = (list.props as { row: (l: VoiceLineView) => ReactNode }).row;
    const marks = d.lines.map((l) => {
      const mark = all(row(l), (q) => q.className === cut.ok || q.className === cut.rose)[0];
      return mark === undefined ? "none" : (mark.props as { className: string }).className === cut.ok ? "recorded" : "not recorded";
    });
    return { tally: (tally.props as { value: number }).value, marks };
  }

  it("the rail marks the line the tally does not count", async () => {
    const r = await rail({ face: "voice", voice: "narrator", lines: [line("a", true), line("b", false)] });
    expect(r).toEqual({ tally: 1, marks: ["recorded", "not recorded"] });
  });
});

describe("the clock's zoom, one table for the cut and the score", () => {
  it("Z steps in and ⇧Z out, held at fit and at 4×", () => {
    expect(CLOCK_ZOOMS.map((z) => zoomStep(z, 0))).toEqual(["1", "2", "4", "4"]);
    expect(CLOCK_ZOOMS.map((z) => zoomStep(z, 1))).toEqual(["0", "0", "1", "2"]);
  });
});
