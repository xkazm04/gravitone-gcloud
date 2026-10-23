// THE SCOUT'S KNOWLEDGE WRITER (lib/foundry/scout/knowledge.ts): a kept
// finding becomes one line under `## Scout findings` in its step's
// PATTERNS.md, a kept watch line one line under `## Proposed by the scout`;
// no other line is rewritten, the marker makes a second write a no-op, and a
// step that does not exist yet is made with a title. Every tree is a temp
// directory (the root is injected): the checkout's knowledge/ is never touched.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendFinding, appendUnder, appendWatch, findingLine, knowledgeRoot, knowledgeState, markerOf, patternsRel } from "../../lib/foundry/scout/knowledge.ts";
import type { FindingCandidate, WatchCandidate } from "../../lib/foundry/scout/types.ts";

let root = "";
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "gt-scout-knowledge-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const finding = (over: Partial<FindingCandidate> = {}): FindingCandidate => ({ id: "c-04", kind: "finding", sourceIds: ["s-01"], status: "rendered", template: "trailer", step: "03-score", claim: "Cut on the downbeat\nonly at act breaks", quote: "the hit lands, then the picture moves", ...over });
const watch: WatchCandidate = { id: "c-09", kind: "watch", sourceIds: ["s-02"], status: "rendered", entry: "channel: title design - https://example.com/t", why: "type-led openers" };

describe("appendUnder (pure)", () => {
  const H = "## Scout findings";
  it("appends the heading at the end when the file has none, and keeps every other line", () => {
    expect(appendUnder("# T\n\n## 1 · Rule\n\nbody\n", H, "- a", "<!-- m -->", "# x")).toBe("# T\n\n## 1 · Rule\n\nbody\n\n## Scout findings\n\n- a\n");
  });
  it("puts the line at the end of the section, before the next heading", () => {
    const before = "# T\n\n## Scout findings\n\n- one\n\n## Later\n\ntext\n";
    expect(appendUnder(before, H, "- two", "<!-- m -->", "# x")).toBe("# T\n\n## Scout findings\n\n- one\n- two\n\n## Later\n\ntext\n");
  });
  it("under an empty heading, after a blank line; a file that holds the marker is not written", () => {
    expect(appendUnder("# W\n\n## Scout findings\n", H, "- a <!-- m -->", "<!-- m -->", "# x")).toBe("# W\n\n## Scout findings\n\n- a <!-- m -->\n");
    expect(appendUnder("# W\n\n## Scout findings\n\n- a <!-- m -->\n", H, "- a <!-- m -->", "<!-- m -->", "# x")).toBeNull();
  });
  it("a new file opens with its title; CRLF stays CRLF", () => {
    expect(appendUnder(null, H, "- a", "<!-- m -->", "# trailer - 03-score")).toBe("# trailer - 03-score\n\n## Scout findings\n\n- a\n");
    expect(appendUnder("# T\r\n\r\n## Scout findings\r\n", H, "- a", "<!-- m -->", "# x")).toBe("# T\r\n\r\n## Scout findings\r\n\r\n- a\r\n");
  });
});

describe("the writers, over an injected root", () => {
  it("a finding for a step with no directory makes it, titled, and a second write is a no-op", async () => {
    mkdirSync(path.join(root, "templates", "trailer", "steps", "01-script"), { recursive: true });
    const a = await appendFinding("2026-10-21", finding(), "https://example.com/v/1", { root });
    expect(a).toMatchObject({ rel: "templates/trailer/steps/03-score/PATTERNS.md", wrote: true, created: true });
    const want = `# trailer - 03-score\n\n## Scout findings\n\n- Cut on the downbeat only at act breaks - "the hit lands, then the picture moves" (n=1, scout 2026-10-21, https://example.com/v/1) <!-- scout:2026-10-21/c-04 -->\n`;
    expect(readFileSync(a.file, "utf8")).toBe(want);
    expect((await appendFinding("2026-10-21", finding(), "https://example.com/v/1", { root })).wrote).toBe(false);
    expect(readFileSync(a.file, "utf8")).toBe(want);
    expect(await knowledgeState(a.rel, markerOf("2026-10-21", "c-04"), { root })).toEqual({ exists: true, holds: true });
  });

  it("a watch line lands under its heading in the existing watchlist; the rest is byte-identical", async () => {
    mkdirSync(path.join(root, "scout"), { recursive: true });
    const before = "# Scout watchlist\n\n## Watching\n\n- tag: risograph\n\n## Proposed by the scout\n";
    writeFileSync(path.join(root, "scout", "watchlist.md"), before);
    const w = await appendWatch("2026-10-21", watch, { root });
    expect(readFileSync(w.file, "utf8")).toBe(`${before}\n- channel: title design - https://example.com/t - type-led openers <!-- scout:2026-10-21/c-09 -->\n`);
  });

  it("refuses a template or step name that climbs; SCOUT_KNOWLEDGE_DIR is read per call", () => {
    expect(() => patternsRel("../x", "01-script")).toThrow(/not a template directory name/);
    expect(() => patternsRel("trailer", "..")).toThrow(/not a step directory name/);
    const was = process.env["SCOUT_KNOWLEDGE_DIR"];
    process.env["SCOUT_KNOWLEDGE_DIR"] = root;
    try {
      expect(knowledgeRoot()).toBe(path.resolve(root));
    } finally {
      if (was === undefined) delete process.env["SCOUT_KNOWLEDGE_DIR"];
      else process.env["SCOUT_KNOWLEDGE_DIR"] = was;
    }
    expect(findingLine("n", finding({ claim: "a", quote: "b" }), undefined)).toBe('- a - "b" (n=1, scout n) <!-- scout:n/c-04 -->');
  });
});
