// THE STRIPS DECISION ADAPTER (lib/decision/v1/sources/strips.ts): rendered
// cards by brief, v1's chips as the reasons (a keep's chips kept in its note),
// planStripCommit as the blast radius, and the commit through
// patchStripVerdicts + commitStripRun - idempotent, refusing a different v1
// outcome, recovering from every crash prefix.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-strips-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { __setFoundryFsPort } from "../../lib/foundry/fsPort.ts";
import type { Approach, StripCard, StripRun, StripVerdicts } from "../../lib/foundry/strips/types.ts";
import { importVerdict, stripsAdapter, type StripsV1 } from "../../lib/decision/v1/sources/strips.ts";
import { RecordingPort } from "../golden-path/_effects.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const RUN = "2026-10-14-strips";
const runDir = path.join(ROOT, "foundry-out", "strips", RUN);
const catDir = path.join(ROOT, "catalogue");
const blobDir = path.join(ROOT, "blobs");

afterEach(() => __setFoundryFsPort(null));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const FILES = { html: "strip.html", style: "style.json", mp4: "strip.mp4", webm: "strip.webm", poster: "poster.jpg", sheet: "sheet.png" };
const ok4 = { seek: { ok: true, detail: "" }, legibility: { ok: true, detail: "" }, motion: { ok: true, detail: "" }, length: { ok: true, detail: "" } };
const card = (id: string, kase: string, approach: string, status: StripCard["status"] = "rendered"): StripCard => ({ id, lane: "edu", case: kase, approach, effort: "e", status, gates: ok4, rounds: 0, authorMs: 1, renderMs: 1, files: { ...FILES } });
const approach = (id: string): Approach => ({ id, lane: "edu", case: "c1", name: `Approach ${id}`, medium: "svg", grammar: "draw-on", density: "low", leonardo: "none", direction: `direction ${id}`, falsifier: "f" });

const CARDS: StripCard[] = [
  card("edu-c1--E03", "c1", "E03"),
  card("edu-c1--CTRL", "c1", "CTRL"),
  card("edu-c2--E04", "c2", "E04"),
  card("edu-c2--E05", "c2", "E05", "lint-failed"),
  card("edu-c2--E06", "c2", "E06"), // rendered, but its media never reached the disk
];

const manifest = (over: Partial<StripRun> = {}): StripRun => ({
  version: 1,
  id: RUN,
  at: "2026-10-14T09:00:00.000Z",
  width: { edu: 1920, stat: 1080 },
  height: { edu: 1080, stat: 1920 },
  fps: 30,
  frames: 240,
  approaches: ["E03", "E04", "E05", "E06"].map(approach),
  cards: CARDS,
  status: "awaiting-triage",
  ...over,
});

const VERDICTS: StripVerdicts = {
  "edu-c2--E04": { verdict: "keep", at: "2026-10-14T10:00:00.000Z", chips: ["craft"], note: "nice" },
  "edu-c1--CTRL": { verdict: "reject", at: "2026-10-14T10:01:00.000Z", chips: ["generic", "broken"] },
};

function seed(): void {
  rmSync(path.join(ROOT, "foundry-out"), { recursive: true, force: true });
  rmSync(catDir, { recursive: true, force: true });
  mkdirSync(catDir, { recursive: true });
  for (const c of CARDS) {
    mkdirSync(path.join(runDir, c.id), { recursive: true });
    if (c.id === "edu-c2--E06") continue;
    for (const f of Object.values(FILES)) writeFileSync(path.join(runDir, c.id, f), `${c.id} ${f}`);
  }
  writeFileSync(path.join(runDir, "run.json"), JSON.stringify(manifest()));
  writeFileSync(path.join(runDir, "verdicts.json"), JSON.stringify(VERDICTS));
}

const SHA = "d".repeat(64);
const literal = (over: Partial<StripsV1> = {}): StripsV1 => ({
  run: manifest(),
  verdicts: VERDICTS,
  rev: 2,
  media: Object.fromEntries(["edu-c1--E03", "edu-c1--CTRL", "edu-c2--E04"].map((id) => [id, { sha256: SHA, bytes: 3, mime: "video/webm" }])),
  verdictsAt: "2026-10-14T12:00:00.000Z",
  ...over,
});

describe("strips adapter - the packet (pure)", () => {
  it("only rendered cards with a playable file, rowed by the brief they render", () => {
    const plan = must(stripsAdapter.packet(literal()));
    expect(plan.packet.items.map((c) => [c.id, c.row])).toEqual([
      ["edu-c1--E03", "c1"],
      ["edu-c1--CTRL", "c1"],
      ["edu-c2--E04", "c2"],
    ]);
    expect(plan.packet.lane).toBe("video");
    expect(plan.losses).toContainEqual(expect.objectContaining({ candidate: "edu-c2--E06", grade: "dropped" }));
    expect(plan.urls["edu-c1--E03"]).toBe(`/api/foundry/file?run=${RUN}&path=edu-c1--E03%2Fstrip.webm&kind=strips`);
    expect(plan.present.items["edu-c1--CTRL"]?.label).toBe("c1 control");
    expect(plan.present.items["edu-c1--E03"]?.meta).toBe("edu · svg · draw-on · gates 4/4");
  });

  it("a reject's chips are its reasons; a keep's chips ride in its note, disclosed", () => {
    const plan = must(stripsAdapter.packet(literal()));
    expect(plan.initial).toEqual([
      { candidate: "edu-c1--CTRL", verdict: "reject", reasons: ["generic", "broken"], by: "operator", surface: "v1", at: "2026-10-14T10:01:00.000Z" },
      { candidate: "edu-c2--E04", verdict: "keep", reasons: [], note: "chips: craft\nnice", by: "operator", surface: "v1", at: "2026-10-14T10:00:00.000Z" },
    ]);
    expect(plan.losses).toContainEqual(expect.objectContaining({ candidate: "edu-c2--E04", grade: "approximate" }));
    expect(importVerdict({ verdict: "reject", at: "x", chips: ["motion", "concept"] }).reasons).toEqual(["concept", "motion"]);
  });

  it("refuses a run v1 would not commit, in v1's words", () => {
    const r = stripsAdapter.packet(literal({ run: manifest({ status: "running" }) }));
    expect(r.ok ? "" : r.error.message).toContain("The pipeline is still running this strip run.");
  });
});

describe("strips adapter - consequence and apply over a temp v1 store", () => {
  it("previews planStripCommit over the kernel's verdicts and commits them through v1's writers", async () => {
    seed();
    const flow = await openFlow(stripsAdapter, RUN, blobDir);
    flow.patch([{ candidate: "edu-c1--E03", verdict: "reject", reasons: ["too-busy", "legibility"], note: "crowded" }]);
    const p = must(flow.preview());
    expect(p.consequence.counts).toEqual({ kept: 1, rejected: 2, undecided: 0 });
    expect(p.consequence.promotions.map((x) => x.target)).toEqual([`${RUN}--edu-c2--E04`]);
    expect(p.consequence.deletes.map((d) => d.target)).toContain(`foundry-out/strips/${RUN}/edu-c1--E03/strip.webm`);
    expect(p.consequence.writes.filter((w) => w.target === "pipeline/foundry/strips-ledger.json").map((w) => w.detail)).toEqual(["reject · legibility, too-busy", "reject · generic, broken", "keep · craft"]);
    must(flow.commit());
    expect((await flow.deliver())?.result).toBe("applied");
    const v = JSON.parse(readFileSync(path.join(runDir, "verdicts.json"), "utf8")) as StripVerdicts;
    expect(v["edu-c1--E03"]).toMatchObject({ verdict: "reject", chips: ["legibility", "too-busy"], note: "crowded" });
    // Left as imported: v1's record, chips on a keep included, byte-identical.
    expect(v["edu-c2--E04"]).toEqual(VERDICTS["edu-c2--E04"]);
    expect((JSON.parse(readFileSync(path.join(runDir, "run.json"), "utf8")) as StripRun).status).toBe("committed");
    expect(existsSync(path.join(runDir, "edu-c1--E03", "strip.webm"))).toBe(false);
    expect(existsSync(path.join(catDir, "motion-styles", `${RUN}--edu-c2--E04`, "strip.html"))).toBe(true);
  });

  it("a second delivery is a no-op, a different v1 outcome is refused, and every crash prefix recovers", async () => {
    seed();
    const flow = await openFlow(stripsAdapter, RUN, blobDir);
    flow.patch([{ candidate: "edu-c1--E03", verdict: "keep" }]);
    must(flow.commit());
    const claim = flow.claim();
    const clean = new RecordingPort();
    __setFoundryFsPort(clean);
    must(await stripsAdapter.apply(claim));
    __setFoundryFsPort(null);
    const snapshot = () => {
      const strip = (s: string) => s.replace(/"at":\s*"[^"]*"/g, '"at":""').replace(/"_rev":\s*\d+/g, '"_rev":0').replace(/Committed \d{4}-\d\d-\d\dT[\d:.]+Z\./, "Committed.");
      return [path.join(catDir, "motion-styles.json"), path.join(catDir, "strips-ledger.json"), path.join(runDir, "verdicts.json"), path.join(runDir, "run.json"), path.join(runDir, "findings.md")].map((f) => strip(readFileSync(f, "utf8")));
    };
    const want = snapshot();
    must(await stripsAdapter.apply(claim));
    expect(snapshot()).toEqual(want);
    for (let k = 1; k <= clean.applied; k++) {
      seed();
      __setFoundryFsPort(new RecordingPort({ crashAt: k }));
      expect((await stripsAdapter.apply(claim)).ok, `crash at ${k}`).toBe(false);
      __setFoundryFsPort(null);
      must(await stripsAdapter.apply(claim));
      expect(snapshot(), `retry after a crash at mutation ${k}`).toEqual(want);
    }
    const v = JSON.parse(readFileSync(path.join(runDir, "verdicts.json"), "utf8")) as StripVerdicts;
    writeFileSync(path.join(runDir, "verdicts.json"), JSON.stringify({ ...v, "edu-c1--E03": { verdict: "reject", at: "x" } }));
    const r = await stripsAdapter.apply(claim);
    expect(r.ok ? "" : r.error.message).toContain("edu-c1--E03 is reject in v1, keep here");
  }, 30_000); // every crash prefix replays a commit: slow under a full parallel run
});
