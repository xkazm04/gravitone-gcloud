// THE WRITING PART EDITORS (app/(studio)/projects/[id]/[part]/_edit: research's notebook, beats
// and ads brief, script's document and scenarios, the album's words, and the island that sends
// their ops), driven through the node lane's one hook dispatcher (tests/golden-path/_studio/
// hooks.ts) the way tests/next-server/part-editor-media.test.ts drives the media ones. No DOM: an
// editor is called as the function it is and its JSX is walked for the props it hands down.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@gt/ui/keymap/dispatch", async (orig) => ({ ...(await orig<object>()), useKeys: () => {} }));

import { isValidElement, type ReactElement, type ReactNode } from "react";

import type { Candidate, NotebookBoard, PartOp, PartView, ResearchCard, ResearchData, ScriptData, ScriptDocument, WordsData } from "@gt/domain/partView";

import { AdsBriefEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/AdsBrief.tsx";
import { BeatsEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Beats.tsx";
import { DocumentEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Document.tsx";
import { NotebookEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Notebook.tsx";
import type { EditorProps, Frame } from "../../app/(studio)/projects/[id]/[part]/_edit/PartEditor.tsx";
import { ScenariosEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Scenarios.tsx";
import { WordsEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Words.tsx";
import cut from "../../app/(studio)/projects/[id]/[part]/_edit/Cut.module.css";
import { harness } from "../golden-path/_studio/hooks.ts";

afterEach(() => {
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

/** Every element in a tree whose props match `pick` (children and the slot objects' children). */
function all(node: ReactNode, pick: (el: ReactElement, p: Record<string, unknown>) => boolean, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const n of node) all(n, pick, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  const p = node.props as Record<string, unknown>;
  if (pick(node, p)) out.push(node);
  for (const v of Object.values(p)) {
    if (isValidElement(v) || Array.isArray(v)) all(v as ReactNode, pick, out);
    else if (v !== null && typeof v === "object" && "children" in v) all((v as { children: ReactNode }).children, pick, out);
  }
  return out;
}
const named = (name: string) => (el: ReactElement) => typeof el.type === "function" && el.type.name === name;
/* ── the album's words (Words.tsx): counted as the platform counts them ── */

// The platform's rule is lib/publish/youtube.ts `snippetProblem` (API-NOTES "Video resource"):
// the title in characters, the description in UTF-8 BYTES, the tags with a comma between each
// and quotes around a tag that holds a space. The editor's header promises exactly that.

const words = (w: Partial<WordsData> = {}): WordsData => ({ face: "words", track: null, title: "", description: "", tags: [], tagChars: 0, edited: false, ...w });

/** The words editor's three counted fields, each rendered under its own dispatcher. */
async function fields(d: WordsData): Promise<{ sent: PartOp[]; field: (label: string) => Promise<{ count: () => Promise<string>; over: () => Promise<boolean>; type: (v: string) => Promise<void> }> }> {
  const sent: PartOp[] = [];
  const p = { view: { data: d } as PartView<"words">, frame, send: (op: PartOp) => void sent.push(op), busy: false, error: null, act: () => {} } satisfies EditorProps<PartView<"words">>;
  const ws = WordsEditor(p) as ReactElement;
  const counted = all(ws, named("Counted"));
  return {
    sent,
    field: async (label) => {
      const el = counted.find((c) => (c.props as { label: string }).label.startsWith(label));
      if (el === undefined) throw new Error(`no ${label} field`);
      const h = harness(() => (el.type as (q: unknown) => ReactElement)(el.props));
      const badge = async (): Promise<ReactElement<{ readonly children?: ReactNode }>> => {
        const b = all(await h.settleUp(), (_, q) => typeof q.className === "string" && q.className.split(" ").includes(cut.count))[0];
        if (b === undefined) throw new Error(`no count on ${label}`);
        return b as ReactElement<{ readonly children?: ReactNode }>;
      };
      return {
        count: async () => String((await badge()).props.children),
        over: async () => ((await badge()).props as { className: string }).className.split(" ").includes(cut.over),
        type: async (v) => {
          const box = all(await h.settleUp(), (_, q) => typeof q.onBlur === "function")[0];
          if (box === undefined) throw new Error(`no input on ${label}`);
          (box.props as { onChange: (e: unknown) => void }).onChange({ currentTarget: { value: v } });
          const after = all(await h.settleUp(), (_, q) => typeof q.onBlur === "function")[0];
          (after?.props as { onBlur: () => void }).onBlur();
          await h.settleUp();
        },
      };
    },
  };
}

describe("the words are counted as the platform counts them", () => {
  it("a title counts characters, not UTF-16 halves", async () => {
    const f = await (await fields(words({ title: "🎵 Salt lines" }))).field("title");
    expect(await f.count()).toBe("12 / 100");
  });

  it("a description counts bytes: 3000 accented letters are over 5000", async () => {
    const f = await (await fields(words({ description: "é".repeat(3000) }))).field("description");
    expect(await f.count()).toBe("6000 / 5000");
    expect(await f.over()).toBe(true);
  });

  it("tags count a comma between each and quotes around a tag with a space", async () => {
    const f = await (await fields(words({ tags: ["lo fi", "rain"] }))).field("tags");
    expect(await f.count()).toBe("12 / 500");
  });
});

describe("a tag edit sends the tags as they will land", () => {
  it("respelling the same tags sends nothing (the kind refuses an unchanged list on the error line)", async () => {
    const f = await fields(words({ tags: ["lofi", "rain"] }));
    await (await f.field("tags")).type("lofi,rain, ");
    expect(f.sent).toEqual([]);
  });

  it("a new tag sends the list trimmed, empties dropped", async () => {
    const f = await fields(words({ tags: ["lofi", "rain"] }));
    await (await f.field("tags")).type("lofi, rain,, night ");
    expect(f.sent).toEqual([{ op: "words-tags", tags: ["lofi", "rain", "night"] }]);
  });
});

/* ── research · the notebook (Notebook.tsx) ────────────────────────────── */

const card = (id: string, c: Partial<ResearchCard> = {}): ResearchCard => ({ id, kind: "fact", dimension: "d1", title: `claim ${id}`, loadBearing: false, required: false, hottest: false, dependsOn: [], contests: [], qualifies: [], scope: "in", liked: false, deepen: false, moved: false, ...c });
const notebook = (cards: readonly ResearchCard[], followUps: NotebookBoard["followUps"] = []): ResearchData => ({
  offers: ["notebook", "beats"],
  face: "notebook",
  topic: "salt",
  source: { kind: "replay", digest: "dg", claims: cards.length },
  dimensions: [{ id: "d1", label: "history", kept: cards.filter((c) => c.scope === "in").length, total: cards.length }],
  cards,
  tally: { kept: 1, total: cards.length, descoped: 0, notTaken: 0, liked: 0, deepen: 0, wounded: 0, broken: 0, requiredGone: [] },
  scope: { confirmed: false, moved: 0 },
  followUps,
});
const research = (data: ResearchData, busy: boolean, sent: PartOp[]) => ({ view: { data } as PartView<"research">, frame, send: (op: PartOp) => void sent.push(op), busy, error: null, act: () => {} }) satisfies EditorProps<PartView<"research">>;

describe("a follow-up typed while a write is in flight", () => {
  async function ask(busy: boolean): Promise<{ sent: PartOp[]; left: unknown }> {
    const sent: PartOp[] = [];
    const p = research(notebook([card("c1")]), busy, sent);
    const ws = (await harness(() => NotebookEditor({ ...p, data: p.view.data as never }), { settleWhen: "stable" }).settleUp()) as ReactElement;
    const el = all(ws, named("FollowUps"))[0];
    if (el === undefined) throw new Error("no follow-ups");
    const h = harness(() => (el.type as (q: unknown) => ReactElement)(el.props));
    const input = (t: ReactNode) => all(t, (_, q) => q["aria-label"] === "question")[0]?.props as { value: string; onChange: (e: unknown) => void };
    input(await h.settleUp()).onChange({ currentTarget: { value: "who salted the road?" } });
    const form = all(await h.settleUp(), (x) => x.type === "form")[0]?.props as { onSubmit: (e: unknown) => void };
    form.onSubmit({ preventDefault: () => {} });
    return { sent, left: input(await h.settleUp()).value };
  }

  it("stays in the field and is not sent", async () => {
    expect(await ask(true)).toEqual({ sent: [], left: "who salted the road?" });
  });

  it("with nothing in flight is queued and the field clears", async () => {
    expect(await ask(false)).toEqual({ sent: [{ op: "queue-follow-up", prompt: "who salted the road?" }], left: "" });
  });
});

/* ── a write button and its key say the same thing while a write is in flight ── */

// Every editor's keys already decline while `busy` (the island answers one write at a time); a
// Button that still looks pressable sends an op the island drops without a word.

const LOCAL = new Set(["Inspector", "FollowUps", "Usage"]);
/** The Buttons an editor draws, its own sub-components rendered (the kit's are not). */
async function buttons(run: () => ReactElement): Promise<{ label: string; disabled: boolean }[]> {
  const out: ReactElement[] = [];
  const walk = (node: ReactNode): void => {
    for (const el of all(node, (x) => named("Button")(x) || (typeof x.type === "function" && LOCAL.has(x.type.name)))) {
      if (named("Button")(el)) out.push(el);
      else walk((el.type as (q: unknown) => ReactNode)(el.props));
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
  return out.map((b) => ({ label: (b.props as { label: string }).label, disabled: (b.props as { disabled?: boolean }).disabled === true }));
}
const live = (bs: { label: string; disabled: boolean }[]): string[] => bs.filter((b) => !b.disabled).map((b) => b.label);

const gate = { blocked: false, violations: 0, passes: 1, unmeasured: 0, notEngaged: 0, enforced: 100, findings: [] };
const candidate = (id: string): Candidate => ({ id, title: `cand ${id}`, engine: "e", durationS: 60, words: 120, beats: [], weakness: "thin", gate, ledger: [], usage: [] });
const version = (id: string): ScriptDocument["versions"][number] => ({ id, label: id, basedOn: null, at: "t", notes: 0 });
const script = (data: ScriptData, busy: boolean) => ({ view: { data } as PartView<"script">, frame, send: () => {}, busy, error: null, act: () => {} }) satisfies EditorProps<PartView<"script">>;

const EDITORS: readonly [string, (busy: boolean) => ReactElement][] = [
  [
    "the notebook",
    (busy) => {
      const d = notebook([card("c1")], [{ id: "fu-1", kind: "question", prompt: "why", status: "queued" }, { id: "fu-2", kind: "question", prompt: "how", status: "returned", result: { verdict: "strengthened", summary: "", sources: [], effects: [{ index: 0, kind: "add", target: "c1", note: "", landing: "pending" }] } }]);
      const p = research(d, busy, []);
      return NotebookEditor({ ...p, data: d as never }) as ReactElement;
    },
  ],
  [
    "the ads brief",
    (busy) => {
      const d: ResearchData = { offers: ["notebook"], face: "ads", brief: { product: "coat", audience: "", proposition: "", tone: "", mustInclude: [], cta: "", platform: "" }, missing: [], ideas: [{ id: "i1", angle: "rain", title: "dry", hook: "h", twist: "t", whyItWorks: "w", risk: "r", gateNotes: [] }], picked: null, briefChanged: false };
      const p = research(d, busy, []);
      return AdsBriefEditor({ ...p, data: d as never }) as ReactElement;
    },
  ],
  [
    "the beat board",
    (busy) => {
      const v = { id: "v1", kind: "open", connector: null, at: "0:00", label: "cold open", text: "t", rationale: "r", raises: [], spends: 0 } as const;
      const d: ResearchData = { offers: ["notebook", "beats"], face: "beats", slots: [{ id: "s1", label: "open", role: "open", pick: "v1", variants: [v] }], picked: 1, spine: { composed: false, moved: false }, origin: "generated" };
      const p = research(d, busy, []);
      return BeatsEditor({ ...p, data: d as never }) as ReactElement;
    },
  ],
  [
    "the beat document",
    (busy) => {
      const d: ScriptData = { face: "document", targetS: 60, writtenAgainst: { claims: 0, loadBearing: 0, mechanisms: 0, reversals: 0, kept: 0 }, candidates: [candidate("k1")], adopted: null, rollup: { enforced: 100, blocking: [] }, versions: [version("v1"), version("v2")], staged: { ...version("v3"), gate: { blocked: false, blocking: [] }, refusals: [] }, notes: [{ id: "n1", cardId: "c1", cardTitle: "c1", kind: "more-focus", label: "more focus" }], noteKinds: [], conflicts: [] };
      const p = script(d, busy);
      return DocumentEditor({ ...p, data: d as never }) as ReactElement;
    },
  ],
  [
    "the ad's scenarios",
    (busy) => {
      const d: ScriptData = { face: "ads", idea: null, ideaChanged: false, targetS: 15, range: [10, 20], scenarios: [{ id: "x1", title: "rain", logline: "l", shots: [], endCard: { cta: "buy", line: null, holdS: 2 }, runtimeS: 12, musicMood: "warm" }], picked: null };
      const p = script(d, busy);
      return ScenariosEditor({ ...p, data: d as never }) as ReactElement;
    },
  ],
];

describe("while a write is in flight no write button reads as pressable", () => {
  for (const [name, run] of EDITORS) {
    it(name, async () => {
      const bs = await buttons(() => run(true));
      expect(bs.length).toBeGreaterThan(0);
      expect(live(bs)).toEqual([]);
      expect(live(await buttons(() => run(false)))).toEqual(bs.map((b) => b.label));
    });
  }
});

/* ── a card's row says its scope out loud (Notebook.tsx CardRow) ───────── */

/** The text a node draws, aria-hidden subtrees left out (what a screen reader is handed). */
function spoken(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(spoken).join(" ");
  if (!isValidElement(node)) return "";
  const p = node.props as Record<string, unknown>;
  if (p["aria-hidden"] === "true" || p["aria-hidden"] === true) return "";
  if (typeof node.type === "function" && node.type.name === "SrOnly") return String(p.text);
  return spoken(p.children as ReactNode);
}

describe("a card's row in the scope board", () => {
  async function said(c: ResearchCard): Promise<string> {
    const d = notebook([c]);
    const p = research(d, false, []);
    const ws = (await harness(() => NotebookEditor({ ...p, data: d as never }), { settleWhen: "stable" }).settleUp()) as ReactElement;
    const list = all(ws, named("RailList"))[0];
    if (list === undefined) throw new Error("no card list");
    const row = (list.props as { row: (x: ResearchCard) => ReactElement }).row(c);
    return spoken((row.type as (q: unknown) => ReactNode)(row.props));
  }

  it("speaks a descoped card as descoped, as the strike-through draws it", async () => {
    expect(await said(card("c1", { scope: "descoped" }))).toContain("descoped");
  });

  it("speaks the like and the deepen the glyphs draw", async () => {
    const s = await said(card("c1", { liked: true, deepen: true }));
    expect(s).toContain("in scope");
    expect(s).toContain("liked");
    expect(s).toContain("deepen");
  });
});
