// THE WRITING PART EDITORS (app/(studio)/projects/[id]/[part]/_edit: research's notebook, beats
// and ads brief, script's document and scenarios, the album's words, and the island that sends
// their ops), driven through the node lane's one hook dispatcher (tests/golden-path/_studio/
// hooks.ts) the way tests/next-server/part-editor-media.test.ts drives the media ones. No DOM: an
// editor is called as the function it is and its JSX is walked for the props it hands down.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@gt/ui/keymap/dispatch", async (orig) => ({ ...(await orig<object>()), useKeys: () => {} }));

import { isValidElement, type ReactElement, type ReactNode } from "react";

import type { NotebookBoard, PartOp, PartView, ResearchCard, ResearchData, WordsData } from "@gt/domain/partView";

import { NotebookEditor } from "../../app/(studio)/projects/[id]/[part]/_edit/Notebook.tsx";
import type { EditorProps, Frame } from "../../app/(studio)/projects/[id]/[part]/_edit/PartEditor.tsx";
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
