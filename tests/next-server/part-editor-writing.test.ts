// THE WRITING PART EDITORS (app/(studio)/projects/[id]/[part]/_edit: research's notebook, beats
// and ads brief, script's document and scenarios, the album's words, and the island that sends
// their ops), driven through the node lane's one hook dispatcher (tests/golden-path/_studio/
// hooks.ts) the way tests/next-server/part-editor-media.test.ts drives the media ones. No DOM: an
// editor is called as the function it is and its JSX is walked for the props it hands down.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@gt/ui/keymap/dispatch", async (orig) => ({ ...(await orig<object>()), useKeys: () => {} }));

import { isValidElement, type ReactElement, type ReactNode } from "react";

import type { PartOp, PartView, WordsData } from "@gt/domain/partView";

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
