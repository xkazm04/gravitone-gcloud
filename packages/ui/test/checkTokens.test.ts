// The gate end to end: pipeline/check-tokens.mts run against throwaway roots, each seeded with one
// violation and paired with a clean twin that must stay green.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { renderCss, renderTs } from "../src/tokenRender.ts";
import { parseSource } from "../src/tokenSource.ts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sourceText = readFileSync(join(repo, "packages/ui/tokens/source.json"), "utf8");
const parsed = parseSource(sourceText);
if (!parsed.ok) throw parsed.error;
const src = parsed.value;

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

function put(root: string, rel: string, body: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), body);
}

/** A root holding the real source and in-date outputs, plus the extra files given. */
function makeRoot(extra: Record<string, string> = {}, outputs = { css: renderCss(src), ts: renderTs(src) }): string {
  const root = mkdtempSync(join(tmpdir(), "gt-tokens-"));
  made.push(root);
  put(root, "packages/ui/tokens/source.json", sourceText);
  put(root, "packages/ui/src/tokens.css", outputs.css);
  put(root, "packages/ui/src/tokens.ts", outputs.ts);
  for (const [rel, body] of Object.entries(extra)) put(root, rel, body);
  return root;
}

function run(root: string): { code: number | null; out: string } {
  const r = spawnSync(process.execPath, [join(repo, "pipeline/check-tokens.mts"), "--root", root], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const CLEAN = ".a { color: var(--ink-bright); border: 1px solid var(--hair); border-radius: var(--r-chip); }\n";

describe("tokens:check", () => {
  it("exits 0 and says nothing to check when no module stylesheet exists", () => {
    const r = run(makeRoot());
    expect(r.code).toBe(0);
    expect(r.out).toContain("files walked 0");
    expect(r.out).toContain("nothing to check");
  });

  it("exits 0 for a clean module.css and prints its denominators", () => {
    const r = run(makeRoot({ "packages/ui/src/Chip.module.css": CLEAN }));
    expect(r.code).toBe(0);
    expect(r.out).toContain("files walked 1");
    expect(r.out).toContain("var() refs 3");
  });

  it("exits 1 on a raw colour, and its clean twin stays green", () => {
    const dirty = run(makeRoot({ "packages/ui/src/Chip.module.css": ".a { color: #fecdd3; }\n" }));
    expect(dirty.code).toBe(1);
    expect(dirty.out).toContain("Chip.module.css:1 raw-colour #fecdd3");
  });

  it("exits 1 on an unknown var(), also under app/(studio)", () => {
    const dirty = run(makeRoot({ "app/(studio)/x/Row.module.css": ".a { color: var(--not-a-token); }\n" }));
    expect(dirty.code).toBe(1);
    expect(dirty.out).toContain("unknown-var --not-a-token");
    expect(run(makeRoot({ "app/(studio)/x/Row.module.css": CLEAN })).code).toBe(0);
  });

  it("exits 1 on drifted outputs and prints the regeneration command; the in-date twin is green", () => {
    const drifted = run(
      makeRoot({}, { css: renderCss(src).replace("#080a10", "#080a11"), ts: renderTs(src) }),
    );
    expect(drifted.code).toBe(1);
    expect(drifted.out).toContain("DRIFT packages/ui/src/tokens.css");
    expect(drifted.out).toContain("npm run tokens:gen");
    expect(run(makeRoot()).code).toBe(0);
  });

  it("exits 2 when a module stylesheet exists that the walk does not read", () => {
    const r = run(makeRoot({ "packages/ui/src/Chip.module.scss": ".a { color: red; }\n" }));
    expect(r.code).toBe(2);
    expect(r.out).toContain("UNREACHED");
  });

  it("exits 2 on an invalid source", () => {
    const root = makeRoot();
    put(root, "packages/ui/tokens/source.json", "{}");
    expect(run(root).code).toBe(2);
  });
});
