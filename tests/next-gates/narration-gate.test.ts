// THE NARRATION GATE, PROVEN RED (pipeline/check-narration.mjs).
//
// A ratchet at zero that reads nothing is green forever. Before Phase 6 the gate walked only
// app/ + components/ and read only v1's `<Hint>children</Hint>`, so @gt/ui - the package every
// (studio) screen is built from, whose Hint takes `text=` - was reported clean by never being
// looked at. Each case below seeds one disclosure in a temp tree and runs the real gate over it
// with `--root`, so a gate that stopped walking packages/ui, or stopped reading the prop, goes
// red here rather than silently green in `npm run verify`.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, test } from "vitest";

const GATE = join(process.cwd(), "pipeline", "check-narration.mjs");
const roots: string[] = [];

function gate(files: Readonly<Record<string, string>>): { readonly code: number | null; readonly out: string } {
  const root = mkdtempSync(join(tmpdir(), "narration-"));
  roots.push(root);
  for (const [rel, src] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), src);
  }
  const r = spawnSync(process.execPath, [GATE, "--root", root], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const THIRTEEN = "one two three four five six seven eight nine ten eleven twelve thirteen";
const TWELVE = "one two three four five six seven eight nine ten eleven twelve";

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

describe("check:narration", () => {
  test("a twelve-word @gt/ui hint passes", () => {
    expect(gate({ "packages/ui/src/a/A.tsx": `<Hint text="${TWELVE}" name="n" />` }).code).toBe(0);
  });
  test("a thirteen-word @gt/ui hint prop fails, under packages/ui/src", () => {
    const r = gate({ "packages/ui/src/a/A.tsx": `<Hint text="${THIRTEEN}" name="n" />` });
    expect(r.code).toBe(1);
    expect(r.out).toContain("packages/ui/src/a/A.tsx");
  });
  test("a braced prop is read by its longest static fragment, past an arrow in another prop", () => {
    const src = `<Hint name="n" onPointerDown={() => go()} text={on ? \`${THIRTEEN}\` : "short"} />`;
    expect(gate({ "app/(studio)/x/B.tsx": src }).code).toBe(1);
  });
  test("v1's children spelling still counts", () => {
    expect(gate({ "components/C.tsx": `<Hint label="l">${THIRTEEN}</Hint>` }).code).toBe(1);
  });
  test("past the hard cap is named as a paragraph", () => {
    const r = gate({ "packages/ui/src/d/D.tsx": `<Hint text="${THIRTEEN} ${THIRTEEN}" name="n" />` });
    expect(r.code).toBe(1);
    expect(r.out).toContain("hard cap");
  });
  test("a long native title= in @gt/ui fails", () => {
    expect(gate({ "packages/ui/src/e/E.tsx": `<span title="a title attribute long enough to count as prose here" />` }).code).toBe(1);
  });
});
