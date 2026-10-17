// pipeline/decide.mts - THE BOARD'S VERBS WITHOUT A BROWSER (Phase 6 L67), driven as the Dojo
// skill drives it: a real `node` process per verb, over the fixture universe seeded into a temp
// directory (`ledger-sync.mts seed-fixtures`, as the ledger probes do) and a temp kernel store.
// Nothing here opens the operator's store, and nothing leaves the machine.
//
// What is pinned, each against the record that would show it broken:
//   - a write with no `--by` is a usage error (exit 2) and writes nothing: the ledger never
//     records an agent's pick as the operator's by default;
//   - the dojo packet opens on first sight, blind: an unjudged pair carries no arm words;
//   - a commit without the preview's token is refused, a stale token is exit 1 and commits
//     nothing, the fresh one commits and the apply lands in v1 (cycle.json committed);
//   - a retried commit with the same token is the same act (exit 0, one commit), never a second.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

const ROOT = process.cwd();
const CLI = path.join(ROOT, "pipeline", "decide.mts");
const CYCLE = "2026-10-16-wet-surface-cues";
const PACKET = `pkt:dojo:${CYCLE}`;
let dir = "";
let env: NodeJS.ProcessEnv = { ...process.env };

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-decide-cli-"));
  env = { ...process.env, GRAVITONE_STORE_PATH: path.join(dir, "kernel.sqlite") };
  for (const k of ["SOUND_STORE_DIR", "SOUND_LEDGER_PATH", "PUBLISH_STORE_DIR", "ARTICLES_STORE_DIR", "STRIPS_STORE_DIR", "FOUNDRY_DIR"]) delete env[k];
  execFileSync(process.execPath, [path.join(ROOT, "pipeline", "ledger-sync.mts"), "seed-fixtures"], { cwd: dir, env, encoding: "utf8" });
}, 120_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function decide(...argv: string[]): { code: number; out: string; err: string } {
  const r = spawnSync(process.execPath, [CLI, ...argv, "--fixtures", "--json"], { cwd: dir, env, encoding: "utf8" });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}
const docOf = <S extends z.ZodType>(schema: S, out: string): z.output<S> => schema.parse(JSON.parse(out));

const viewSchema = z.object({
  id: z.string(),
  mode: z.string(),
  state: z.string(),
  rev: z.number(),
  undecided: z.number(),
  pairs: z.array(z.object({ row: z.string(), a: z.string(), b: z.string(), outcome: z.string().nullable() })),
  items: z.array(z.object({ id: z.string(), words: z.unknown().optional() })),
  decisions: z.array(z.object({ key: z.string(), verdict: z.string().nullable(), by: z.string(), surface: z.string() })),
});
const cycleStatus = (): string => z.object({ status: z.string() }).loose().parse(JSON.parse(readFileSync(path.join(dir, "fixtures-out", "training", CYCLE, "cycle.json"), "utf8"))).status;

describe("pipeline/decide.mts over the dojo gate", () => {
  it("lists the unopened dojo pile, and opens it blind", { timeout: 120_000 }, () => {
    const list = decide("list");
    expect(list.code, list.err).toBe(0);
    expect(docOf(z.object({ unopened: z.array(z.object({ id: z.string() })) }).loose(), list.out).unopened.map((u) => u.id)).toContain(PACKET);
    const show = decide("show", PACKET);
    expect(show.code, show.err).toBe(0);
    const v = docOf(viewSchema, show.out);
    expect([v.id, v.mode, v.state]).toEqual([PACKET, "blind-pair", "open"]);
    expect(v.pairs.length).toBeGreaterThan(0);
    expect(v.pairs.every((p) => p.outcome === null)).toBe(true);
    // The blind: no arm of an unjudged pair carries its words.
    const arms = new Set(v.pairs.flatMap((p) => [p.a, p.b]));
    expect(v.items.filter((i) => arms.has(i.id) && i.words !== undefined)).toEqual([]);
  });

  it("refuses a write that does not say who decides, and writes nothing", { timeout: 120_000 }, () => {
    const v = docOf(viewSchema, decide("show", PACKET).out);
    const first = v.pairs[0];
    if (first === undefined) throw new Error("no pair to pick");
    const r = decide("pick", PACKET, first.row, "a");
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/--by agent\|operator/);
    expect(docOf(viewSchema, decide("show", PACKET).out).rev).toBe(v.rev);
  });

  it("picks every pair as the agent, then commits only the shown consequence, once, and the apply lands in v1", { timeout: 180_000 }, () => {
    const v = docOf(viewSchema, decide("show", PACKET).out);
    for (const p of v.pairs) {
      const r = decide("pick", PACKET, p.row, "a", "--by", "agent");
      expect(r.code, r.err).toBe(0);
    }
    const picked = docOf(viewSchema, decide("show", PACKET).out);
    expect(picked.undecided).toBe(0);
    expect(picked.decisions.filter((d) => d.verdict !== null).every((d) => d.by === "agent" && d.surface === "cli")).toBe(true);

    expect(decide("commit", PACKET, "--by", "agent").code).toBe(2);
    const stale = decide("commit", PACKET, "--by", "agent", "--token", "stale");
    expect(stale.code).toBe(1);
    expect(docOf(z.object({ detail: z.string() }).loose(), stale.out).detail).toBe("stale-preview");
    expect(cycleStatus()).toBe("awaiting-gate");

    const token = docOf(z.object({ token: z.string() }).loose(), decide("preview", PACKET).out).token;
    const done = decide("commit", PACKET, "--by", "agent", "--token", token);
    expect(done.code, done.out + done.err).toBe(0);
    const doc = docOf(z.object({ packetId: z.string(), rev: z.number(), apply: z.object({ state: z.string() }).loose() }).loose(), done.out);
    expect([doc.packetId, doc.apply.state]).toEqual([PACKET, "applied"]);
    expect(cycleStatus()).toBe("committed");

    // The same token again is the same act: the first result, not a second commit.
    const again = decide("commit", PACKET, "--by", "agent", "--token", token);
    expect(again.code, again.err).toBe(0);
    expect(docOf(z.object({ rev: z.number() }).loose(), again.out).rev).toBe(doc.rev);
  });
});
