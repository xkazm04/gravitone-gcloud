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

import type { AdFinishData, AdsClips, AdsTakes, BedData, PartView, RenderData } from "@gt/domain/partView";
import { BINDINGS } from "@gt/ui/keymap/bindings";
import { keyTable, type KeyRow } from "@gt/ui/keymap/keymap";

import { useTransport } from "../../app/(studio)/projects/[id]/[part]/_edit/CutClock.tsx";
import { CutFinish } from "../../app/(studio)/projects/[id]/[part]/_edit/CutFinish.tsx";
import type { EditorProps, Frame } from "../../app/(studio)/projects/[id]/[part]/_edit/PartEditor.tsx";
import { RenderEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Render.tsx";
import { ScoreBed } from "../../app/(studio)/projects/[id]/[part]/_edit/ScoreBed.tsx";
import { AdsClipsEditor, AdsTakesEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Takes.tsx";
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
