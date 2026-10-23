// The Dojo lifecycle (foundry-dojo-A stage 1): acceptance cases 1, 2, 4 and 5.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";

import { assertLedgerRows, normalizeLedgerRow, replaceCycleRows } from "@/lib/foundry/training/ledger";
import { lifecycleState } from "@/lib/foundry/training/lifecycle";

const base = { cycle: "c", dimension: "d", subject: "s", technique: "t", verdict: "better", judge_pick_rate: 1, at: "2026-10-19" };
const facts = (ancestors: string[] = [], passing = true) => ({ isAncestor: (s: string) => ancestors.includes(s), pinPasses: () => passing });
const tmp = mkdtempSync(path.join(tmpdir(), "dojo-lifecycle-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("lifecycle", () => {
  it("1: a reject is closed-no-edit", () => {
    expect(lifecycleState(normalizeLedgerRow({ ...base, human: "reject", reflected: false }), facts())).toBe("closed-no-edit");
  });

  it("2: an approve whose sha is not an ancestor of HEAD is proposed, not merged (tmp fixture repo)", () => {
    const git = (...a: string[]) => execFileSync("git", ["-C", tmp, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    writeFileSync(path.join(tmp, "a"), "1");
    git("add", "a");
    git("commit", "-qm", "one");
    const merged = git("rev-parse", "--short", "HEAD");
    git("checkout", "-qb", "reflect");
    writeFileSync(path.join(tmp, "a"), "2");
    git("commit", "-qam", "two");
    const unmerged = git("rev-parse", "--short", "HEAD");
    git("checkout", "-q", "main");
    const isAncestor = (sha: string) => {
      try {
        execFileSync("git", ["-C", tmp, "merge-base", "--is-ancestor", sha, "HEAD"], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    };
    const row = (sha: string) => normalizeLedgerRow({ ...base, human: "approve", reflected: sha });
    expect(lifecycleState(row(unmerged), { isAncestor, pinPasses: () => true })).toBe("proposed");
    expect(lifecycleState(row(merged), { isAncestor, pinPasses: () => true })).toBe("merged");
  });

  it("walks owed → proposed → merged → pinned → live", () => {
    const pins = [{ surface: "a.ts", pattern: "x" }, { surface: "b.ts", pattern: "y" }];
    const r = { human: "approve" as const, pins: [] as typeof pins, reflection: undefined as undefined | { sha: string; branch: string } };
    expect(lifecycleState(r, facts())).toBe("owed");
    r.reflection = { sha: "abc", branch: "b" };
    expect(lifecycleState(r, facts())).toBe("proposed");
    expect(lifecycleState(r, facts(["abc"]))).toBe("merged");
    r.pins = pins;
    expect(lifecycleState(r, { isAncestor: () => true, pinPasses: (p) => p.surface === "a.ts" })).toBe("pinned");
    expect(lifecycleState(r, facts(["abc"]))).toBe("live");
  });
});

describe("reader accepts v1 and schema-2 rows", () => {
  it("4: reflected:'f33275c' → reflection.sha; 'not-better:no-edit' → closed-no-edit", () => {
    const a = normalizeLedgerRow({ ...base, human: "approve", reflected: "f33275c" });
    expect(a.reflection?.sha).toBe("f33275c");
    expect(a.schema).toBe(2);
    expect("reflected" in a).toBe(false);
    const r = normalizeLedgerRow({ ...base, human: "reject", reflected: "not-better:no-edit" });
    expect(r.reflection).toBeUndefined();
    expect(lifecycleState(r, facts())).toBe("closed-no-edit");
    expect(lifecycleState(normalizeLedgerRow({ ...base, human: "approve", reflected: false }), facts())).toBe("owed");
  });

  it("passes a schema-2 row through", () => {
    const v2 = { ...base, human: "approve" as const, schema: 2 as const, reflection: { sha: "abc", branch: "dojo/x" }, pins: [{ surface: "s.ts", pattern: "p" }] };
    expect(normalizeLedgerRow(v2)).toEqual(v2);
  });
});

describe("ledger writer", () => {
  it("5: a row with human: null throws and the file stays byte-identical", () => {
    const file = path.join(tmp, "training-ledger.json");
    writeFileSync(file, JSON.stringify({ rows: [{ ...base, human: "approve", reflected: false }] }, null, 2));
    const before = readFileSync(file);
    const doc = JSON.parse(before.toString()) as { rows: { cycle: string }[] };
    const snapshot = JSON.stringify(doc);
    expect(() => replaceCycleRows(doc.rows, "c2", [{ ...base, cycle: "c2", human: null } as never])).toThrow(/without a verdict/);
    expect(() => assertLedgerRows([{ ...base, human: undefined }])).toThrow();
    expect(JSON.stringify(doc)).toBe(snapshot);
    expect(readFileSync(file).equals(before)).toBe(true);
  });
});
