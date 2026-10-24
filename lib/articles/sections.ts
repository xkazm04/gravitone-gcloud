// A POST CUT INTO SECTIONS - the two readers of post.md that need it in pieces. Pure: no disk, no
// clock, so the Board, the explainer's article part and a test cut the same text the same way.
//
//   sectionsOf           the Board's cut (lib/decision/v1/sources/article.ts imports it from here):
//                        split at `## `, a section's id is its heading so a rework note names
//                        sections the way the writer reads them, repeats told apart as "(2)",
//                        Sources kept - the reviewer reads the sources too. Pinned by
//                        tests/next-server/decision-v1-article.test.ts, so it is moved here as it
//                        was, line for line.
//   explainerSectionsOf  the explainer's cut (an article part adopting a finished post): the same
//                        `## ` split, but a `## ` inside a fenced code block is code, not a heading
//                        (a post that shows a markdown snippet would otherwise be cut mid-fence);
//                        the Sources section is dropped (a card per citation list draws nothing);
//                        the text before the first heading is "Opening"; ids are slugs
//                        (lib/articles/store.ts `slugify`, the run ids' own) with `-2` on a repeat
//                        and `s<n>` when a heading slugs to nothing, because the strip cards key on
//                        `card-<sectionId>` and a card id must be a stable, URL-safe token. A
//                        section's body is its markdown as written - images, code and tables kept,
//                        the strip author turn reads them.

import { slugify } from "./store";

export type PostSection = { readonly id: string; readonly heading: string; readonly text: string };
export type ExplainerSection = { readonly id: string; readonly heading: string; readonly body: string };

/** post.md cut at its `## ` headings (the cut lib/articles/checksProse.ts reads
 *  the closing section by). A section's id is its heading, so the rework note
 *  rendered from an edit plan names sections the way the writer reads them. */
export function sectionsOf(md: string): PostSection[] {
  const parts = md.split(/^## /m);
  const seen = new Map<string, number>();
  const named = (h: string): string => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  };
  const out: PostSection[] = [];
  const opening = (parts[0] ?? "").replace(/^# [^\n]*\n?/, "").trim();
  if (opening !== "") out.push({ id: named("Opening"), heading: "Opening", text: opening });
  for (const p of parts.slice(1)) {
    const nl = p.indexOf("\n");
    const heading = (nl < 0 ? p : p.slice(0, nl)).trim();
    if (heading === "") continue;
    out.push({ id: named(heading), heading, text: nl < 0 ? "" : p.slice(nl + 1).trim() });
  }
  return out;
}

/** A fence opener (CommonMark: up to three spaces, then three or more backticks or tildes). */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const SOURCES = /^sources$/i;

type Block = { readonly heading: string | null; readonly lines: string[] };

/** The post's lines grouped under their `## ` headings, a heading inside a fence left as text. */
function blocksOf(md: string): Block[] {
  const blocks: Block[] = [{ heading: null, lines: [] }];
  let fence: { readonly ch: string; readonly len: number } | null = null;
  for (const line of md.replace(/\r\n?/g, "\n").split("\n")) {
    const cur = blocks[blocks.length - 1] as Block;
    const f = FENCE_OPEN.exec(line)?.[1];
    if (fence !== null) {
      cur.lines.push(line);
      // A closing fence is the same character, at least as long, and nothing after it.
      if (f !== undefined && f[0] === fence.ch && f.length >= fence.len && line.trim() === f) fence = null;
      continue;
    }
    if (f !== undefined) {
      fence = { ch: f[0] as string, len: f.length };
      cur.lines.push(line);
      continue;
    }
    const h = /^## (.*)$/.exec(line);
    if (h !== null) blocks.push({ heading: (h[1] ?? "").replace(/\s+#+\s*$/, "").trim(), lines: [] });
    else cur.lines.push(line);
  }
  return blocks;
}

/** post.md as the explainer's sections: Opening, then each `## ` heading outside a fence, no Sources. */
export function explainerSectionsOf(md: string): ExplainerSection[] {
  const taken = new Set<string>();
  const idOf = (slug: string, n: number): string => {
    const base = slug === "" ? `s${n}` : slug;
    let id = base;
    for (let k = 2; taken.has(id); k++) id = `${base}-${k}`;
    taken.add(id);
    return id;
  };
  const out: ExplainerSection[] = [];
  for (const b of blocksOf(md)) {
    if (b.heading !== null && SOURCES.test(b.heading)) continue;
    const lines = b.heading === null ? dropTitle(b.lines) : b.lines;
    const body = lines.join("\n").trim();
    const heading = b.heading ?? "Opening";
    if (body === "" && (b.heading === null || heading === "")) continue;
    out.push({ id: idOf(slugify(heading), out.length + 1), heading, body });
  }
  return out;
}

/** The opening without the post's `# ` title line (the title is the article's, not a section's). */
function dropTitle(lines: readonly string[]): string[] {
  const i = lines.findIndex((l) => l.trim() !== "");
  return i >= 0 && /^# /.test(lines[i] as string) ? lines.slice(i + 1) : [...lines];
}

/** The post's title: its first `# ` line, outside a fence. */
export function titleOf(md: string): string | null {
  const first = blocksOf(md)[0];
  const line = first?.lines.find((l) => l.trim() !== "");
  return line !== undefined && /^# /.test(line) ? line.slice(2).trim() || null : null;
}
