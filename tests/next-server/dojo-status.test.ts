// The Dojo lifecycle status CLI (foundry-dojo-A stage 2): acceptance case 6 and its fixtures.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { gitFacts, run, statusReport } from "../../pipeline/dojo-status.mts";

const tmp = mkdtempSync(path.join(tmpdir(), "dojo-status-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const row = (over: Record<string, unknown>) => ({
  cycle: "c", dimension: "d", subject: "s", technique: "t", human: "approve", verdict: "better",
  judge_pick_rate: 1, reflected: false, at: "2026-10-18T00:00:00.000Z", ...over,
});
const cli = (...args: string[]) => {
  const r = run(args);
  return { status: r.code, stdout: r.stdout };
};

describe("dojo-status", () => {
  it("6: the committed ledger reports exactly the four owed rows", () => {
    const r = cli("--json");
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    const owed = out.rows.filter((x: { state: string }) => x.state === "owed").map((x: { cycle: string }) => x.cycle);
    expect(out.counts.owed).toBe(4);
    expect(owed.map((c: string) => c.replace(/^\d{4}-\d{2}-\d{2}-/, "")).sort()).toEqual(
      ["build-key-flip", "nb-counted-beats", "nb-what-stays-dark", "reference-sheet"],
    );
  });

  it("an approved row reads proposed until its sha is an ancestor of main (tmp fixture repo)", () => {
    const git = (...a: string[]) => execFileSync("git", ["-C", tmp, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    writeFileSync(path.join(tmp, "a"), "1");
    git("add", "a");
    git("commit", "-qm", "one");
    git("checkout", "-qb", "reflect");
    writeFileSync(path.join(tmp, "a"), "2");
    git("commit", "-qam", "two");
    const sha = git("rev-parse", "--short", "HEAD");
    const rows = [row({ reflected: sha })];
    const now = new Date("2026-10-19T00:00:00Z");
    expect(statusReport(rows, gitFacts(tmp), now).rows[0].state).toBe("proposed");
    git("checkout", "-q", "main");
    git("merge", "-q", "--ff-only", "reflect");
    const after = statusReport(rows, gitFacts(tmp), now);
    expect(after.rows[0].state).toBe("merged");
    expect(after.rows[0].reflection).toBe(sha);
  });

  it("a stale owed row is flagged and still exits 0; an unreadable ledger exits non-zero", () => {
    const old = path.join(tmp, "ledger.json");
    writeFileSync(old, JSON.stringify({ rows: [row({ at: "2026-01-01T00:00:00.000Z" })] }));
    const r = cli("--json", "--ledger", old);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).rows[0]).toMatchObject({ state: "owed", stale: true });
    expect(cli("--json", "--ledger", path.join(tmp, "missing.json")).status).not.toBe(0);
  });
});
