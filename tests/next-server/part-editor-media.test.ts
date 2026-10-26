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

import type { AdFinishData, AdsClips, AdsTakes, BedData, FramesBoard, MotionBoard, PartOp, PartView, RenderData, SpottingData, TakeView, VoiceData, VoiceLineView } from "@gt/domain/partView";
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
import { FramesEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Frames.tsx";
import { MotionEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Motion.tsx";
import { TrailerEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Trailer.tsx";
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

/** Every string a JSX subtree draws, in order (no component is expanded: the check rows are plain elements). */
function textsOf(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(textsOf);
  return textsOf((node as ReactElement<{ children?: ReactNode }>).props?.children);
}


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

  it("the ad's finish checks each draw their value against their target", async () => {
    const check = (id: string, label: string, value: string, target: string) => ({ id, label, value, target, verdict: "pass" as const, blocking: false });
    const d: AdFinishData = {
      face: "finish",
      scenario: SCENARIO,
      shots: [],
      endCard: { cta: "Pack one", line: "", holdS: 2 },
      aspects: [],
      checks: [check("runtime", "runtime", "11s", "6-20s"), check("loudness", "loudness", "-13.2 LUFS", "-14 LUFS")],
      runtimeS: 11,
      targetS: 15,
    };
    const h = harness(() => CutFinish(props(d)) as ReactElement, { settleWhen: "stable" });
    const el = (await h.settleUp()) as ReactElement<{ inspector: { children: ReactNode } }>;
    const rows = textsOf(el.props.inspector.children);
    console.log(`[finish checks] ${rows.join(" | ")}`);
    expect(rows).toContain("-13.2 LUFS / -14 LUFS");
    expect(rows).toContain("11s / 6-20s");
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

  it("a shot with takes draws the keys the take grid answers, and no inspector view", async () => {
    const take = { id: "t1", label: "take 1", blob: "b", costUsd: 0 };
    const d = { face: "takes", scenario: SCENARIO, scenarioMoved: false, aspect: "16:9", shots: [{ id: "a", durationS: 5, brief: "a coat in rain", super: null, takes: [take], adopted: null }] } as unknown as AdsTakes;
    const l = legend(await workspaceOf(() => AdsTakesEditor(props(d)) as ReactElement));
    expect(l.drawn).toEqual(l.live);
    expect(l.drawn.map((r) => r.does)).toEqual(["unit", "next missing", "render", "adopt take"]);
  });

  it("the trailer cut draws no adopt or inspector view it does not run", async () => {
    const beat = { id: "b1", movement: "m1", at: "0:00", kind: "open", connector: null, label: "Cold open", text: "rain", raises: [], spends: [], edited: false };
    const d = {
      face: "trailer",
      targetS: 90,
      runtimeS: 90,
      lane: "wide-release",
      movements: [],
      beats: [beat],
      energy: [],
      structure: { malformed: false, violations: 0, passes: 0, unmeasured: 0, notEngaged: 0, enforced: 100, findings: [] },
      spineMoved: false,
      origin: "fixture",
    };
    const l = legend(await workspaceOf(() => TrailerEditor(props(d) as never) as ReactElement));
    expect(l.drawn).toEqual(l.live);
    expect(l.drawn.map((r) => r.does)).toEqual(["item", "deselect"]);
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

/** Drive the preview for one second of a display refreshing at `hz`; the frames it drew, and
 *  what it drew last. `loads: false` is a still whose bytes do not decode. */
async function preview(hz: number, loads = true): Promise<{ frames: number[]; tree: ReactNode }> {
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
      onerror: (() => void) | null = null;
      set src(_: string) {
        if (loads) this.onload?.();
        else this.onerror?.();
      }
    },
  );
  const data: RenderData = { face: "render", track: { title: "Salt lines", durationS: 180 }, still: { label: "still", blob: "abc" }, words: null, res: "1080p", exports: [], envelope: Array.from({ length: 5400 }, (_, i) => (i % 7) / 7) };
  const page = RenderEditor({ ...props(undefined), view: { data } as PartView<"render"> }) as ReactElement<{ primary: { children: ReactNode } }>;
  const el = find(page.props.primary.children, "Preview");
  if (el === null) throw new Error("no Preview in the render editor's primary");
  const Preview = el.type as (p: unknown) => ReactElement<{ ref?: { current: unknown } }>;
  const h = harness(() => {
    const out = Preview(el.props);
    if (out.props.ref !== undefined) out.props.ref.current = { getContext: () => ({}) };
    return out;
  });
  const tree = await h.settleUp();
  const start = 1000;
  for (let k = 0; k <= hz; k++) frames.shift()?.(start + (k * 1000) / hz);
  h.unmount();
  return { frames: [...drawn], tree };
}
const previewAt = async (hz: number): Promise<number[]> => (await preview(hz)).frames;

describe("the poster preview plays the envelope at its own 30 fps", () => {
  it("one second on a 60 Hz display draws 30 envelope frames, not 60", async () => {
    const f = await previewAt(60);
    expect(Math.max(...f)).toBe(30);
  });

  it("one second on a 120 Hz display draws the same 30", async () => {
    const f = await previewAt(120);
    expect(Math.max(...f)).toBe(30);
  });

  it("a still whose bytes do not load says so, where the canvas stayed blank", async () => {
    const r = await preview(60, false);
    expect(r.frames).toEqual([]);
    expect(all(r.tree, (p) => typeof p.message === "string").map((e) => (e.props as { message: string }).message)).toEqual(["kept still abc did not load"]);
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
    return { t: tr.at(), playing: tr.playing };
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

describe("the transport while the film plays", () => {
  it("ten display frames of playback do not re-render the editor that owns the transport", async () => {
    const frames: ((now: number) => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("performance", { now: () => 0 });
    const FRAMES = 10; // one settle pass per frame is the harness's cost, not the transport's
    const h = harness(() => useTransport(30));
    (await h.settleUp()).toggle();
    await h.settleUp();
    const before = h.renderRequests();
    for (let i = 1; i <= FRAMES; i++) {
      frames.shift()?.((i * 1000) / 60);
      await h.settleUp();
    }
    // Counted at the setter, not by passes: the harness re-renders on every settleUp, a renderer
    // only when state asks it to.
    const during = h.renderRequests() - before;
    console.log(`[transport] ${during} state-driven editor renders over ${FRAMES} frames`);
    expect((await h.settleUp()).at()).toBeCloseTo(FRAMES / 60, 2);
    expect(during, "the editor re-rendered on display frames").toBeLessThanOrEqual(1);
    h.unmount();
  }, 60_000);
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

/* ── a write button and its key say the same thing while a write is in flight ── */

// PartEditor's write() declines a second op while one is in flight, so a press on a Button that
// still draws enabled does nothing and says nothing. The walk presses every Button an editor draws
// (its own sub-components rendered, the kit's not) with a recording `send`/`act`: a Button that
// reaches `send` is a write button, and it must draw disabled while busy.
const LOCAL = new Set(["FramesBoardEditor", "MotionBoardEditor", "FramesInspector", "UnitFields", "Inspector", "BeatBlock"]);
async function writeButtons(run: () => ReactElement): Promise<{ label: string; disabled: boolean }[]> {
  const out: ReactElement[] = [];
  const walk = (node: ReactNode): void => {
    const hits: ReactElement[] = [];
    const seek = (n: ReactNode): void => {
      if (Array.isArray(n)) return n.forEach(seek);
      if (!isValidElement(n)) return;
      hits.push(n);
      for (const v of Object.values(n.props as Record<string, unknown>)) {
        if (isValidElement(v) || Array.isArray(v)) seek(v as ReactNode);
        else if (v !== null && typeof v === "object" && "children" in v) seek((v as { children: ReactNode }).children);
      }
    };
    seek(node);
    for (const el of hits) {
      if (typeof el.type !== "function") continue;
      if (el.type.name === "Button") out.push(el);
      else if (LOCAL.has(el.type.name)) walk((el.type as (q: unknown) => ReactNode)(el.props));
    }
  };
  await harness(
    () => {
      out.length = 0;
      walk(run());
      return null;
    },
    { settleWhen: "stable" },
  ).settleUp();
  return out
    .filter((b) => {
      let sent = 0;
      const onPress = (b.props as { onPress?: () => void }).onPress;
      // the walk's send is wired through the editor's props: see `pressed`
      pressed.length = 0;
      onPress?.();
      sent = pressed.length;
      return sent > 0;
    })
    .map((b) => ({ label: (b.props as { label: string }).label, disabled: (b.props as { disabled?: boolean }).disabled === true }));
}
const pressed: unknown[] = [];
const spy = { send: (op: unknown) => void pressed.push(op) };

const layerOf = (id: string, layer: "element" | "text"): never =>
  ({ id, layer, role: layer === "text" ? "caption" : "arrow", label: id, x: 0.1, y: 0.1, hidden: false, by: "human", unsourced: false }) as never;
const plate = { state: "ready", url: null, subject: "s", stale: false, dry: false } as const;
const framesBoard = {
  face: "assembly",
  source: { id: "c1", title: "chain" },
  sourceMoved: true,
  units: [
    {
      id: "u1",
      at: "0:00",
      startS: 0,
      holdS: 3,
      grain: "beat",
      beatKind: "open",
      title: "Open",
      line: "",
      plate,
      clip: { status: "none", motion: "", url: null },
      layers: [layerOf("e1", "element"), layerOf("t1", "text")],
      pips: { elements: 1, texts: 1, unsourced: 0 },
      alts: [],
      proposal: { ops: ["subject"], conflicts: 1 },
    },
  ],
  tally: { total: 1, composed: 1, stale: 0, rejected: 0, unsourced: 0, clips: 0 },
  style: { name: "ink", fallback: false, refs: 0 },
  facts: [],
  proposal: { rows: 1, conflicts: 1, rejected: 0, missing: [] },
  checkpoint: true,
  direction: { runs: 0, usd: 0, unpriced: 0 },
} as unknown as FramesBoard;
const motionBoard = {
  face: "plates",
  units: [{ id: "u1", at: "0:00", title: "Open", beatKind: "open", plate, motion: "pan left", state: "moving", outcomeStale: false, clip: { status: "none", motion: "pan left", url: null } }],
  tally: { moving: 1, declined: 0, open: 0, total: 1, clips: 0 },
} as unknown as MotionBoard;
const trailerData = {
  face: "trailer",
  targetS: 90,
  runtimeS: 90,
  lane: "wide-release",
  movements: [],
  beats: [{ id: "b1", movement: "m1", at: "0:00", kind: "open", connector: null, label: "Cold open", text: "rain", raises: [], spends: [], edited: true }],
  energy: [],
  structure: { malformed: false, violations: 0, passes: 0, unmeasured: 0, notEngaged: 0, enforced: 100, findings: [] },
  spineMoved: false,
  origin: "fixture",
};

const MEDIA: readonly [string, (busy: boolean) => ReactElement, readonly string[]][] = [
  [
    "frames",
    (busy) => FramesEditor({ ...props(framesBoard), view: { data: framesBoard } as never, busy, send: spy.send }) as ReactElement,
    ["revert pass", "rederive", "accept", "accept over human", "discard", "accept row", "revert row", "×", "+ caption", "+ figure", "+ label", "hide"],
  ],
  ["motion", (busy) => MotionEditor({ ...props(motionBoard), view: { data: motionBoard } as never, busy, send: spy.send }) as ReactElement, ["clear"]],
  ["trailer", (busy) => TrailerEditor({ ...props(trailerData), busy, send: spy.send } as never) as ReactElement, ["reset to dealt"]],
];

describe("while a write is in flight no media write button reads as pressable", () => {
  for (const [name, run, expected] of MEDIA) {
    it(name, async () => {
      const bs = await writeButtons(() => run(true));
      expect(bs.map((b) => b.label)).toEqual(expect.arrayContaining([...expected]));
      expect(bs.filter((b) => !b.disabled).map((b) => b.label)).toEqual([]);
      expect((await writeButtons(() => run(false))).filter((b) => !b.disabled).map((b) => b.label)).toEqual(bs.map((b) => b.label));
    });
  }
});
