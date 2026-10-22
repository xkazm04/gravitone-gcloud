// THE SCOUT DECISION ADAPTER (lib/decision/v1/sources/scout.ts): one /scout
// night as one matrix cull - a style candidate's looks (the extract adapter's
// own rows, ids under the candidate), a scene's replicas and clip under its
// keyframe, a finding and a watch line as text cells - and its commit through
// the writers each kind has: the extract run's verdicts and commit, a line in
// PATTERNS.md and the watchlist, and `night.committed` last. Idempotent, with
// every crash prefix recovering; a dry night records its verdicts and nothing
// else. Every store is a temp directory: nothing here reads the checkout's.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-scout-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "style-store", "gravitone.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "foundry-out", "extract");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "foundry-out", "scout");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { __setFoundryFsPort } from "../../lib/foundry/fsPort.ts";
import { closeKernel } from "../../lib/kernelStore.ts";
import { OBSERVABLE_FIELDS, type ExtractManifest, type ExtractVerdicts, type ExtractedStyle, type Observables } from "../../lib/foundry/extract/types.ts";
import { appendFinding, appendWatch } from "../../lib/foundry/scout/knowledge.ts";
import type { Candidate, Night } from "../../lib/foundry/scout/types.ts";
import { scoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import { RecordingPort } from "../golden-path/_effects.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const NIGHT = "2026-10-21";
const DRY = "2026-10-22";
const RUN1 = "2026-10-21-scout-c01";
const RUN2 = "2026-10-21-scout-c02";
const RUN3 = "2026-10-22-scout-c01";
const out = path.join(ROOT, "foundry-out");
const catDir = path.join(ROOT, "catalogue");
const know = path.join(ROOT, "knowledge");
const blobDir = path.join(ROOT, "blobs");
const PATTERNS = path.join(know, "templates", "cinematic", "steps", "02-frames", "PATTERNS.md");
const WATCHLIST = path.join(know, "scout", "watchlist.md");
const WATCH_BEFORE = "# Scout watchlist\n\n## Watching\n\n- tag: risograph - flat inks\n\n## Proposed by the scout\n";

afterEach(() => __setFoundryFsPort(null));
afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

/* ── an extract run, in the extract adapter test's shape ─────────────────────── */

const obs = (over: Partial<Observables> = {}): Observables => ({ ...(Object.fromEntries(OBSERVABLE_FIELDS.map((f) => [f, "x"])) as Observables), ...over });
const round = (n: number, file: string | null, score: number | null) => ({ n, file, score, per_field: {}, recipe: "r", prompt: `p${n}`, critique: null, generator: "g", vision: "v", error: file ? null : "generation failed" });
const look = (id: string, members: string[], over: Partial<ExtractedStyle> = {}): ExtractedStyle => ({ id, name: id.toUpperCase(), family: "illustration", members, observables: obs(), recipe: "r", negative: "n", recipe_history: ["r"], grouped_by: "engine", replicas: [], transfers: [], ...over });
const manifest = (id: string, styles: ExtractedStyle[], over: Partial<ExtractManifest> = {}): ExtractManifest => ({
  id,
  slug: id,
  created: "2026-10-21T01:00:00.000Z",
  finished: "2026-10-21T02:00:00.000Z",
  status: "done",
  progress: { stage: "done", done: 1, total: 1 },
  options: { rounds: 1, replicas: 1, transfers: 1, target: 0.8, seed: 1, grouping: "engine" },
  sources: [{ id: "s01", name: "a.png", file: "src/s01.png", mime: "image/png", width: 10, height: 10, aspect: "16:9", readback: null, error: null }],
  styles,
  engines: { vision: "qwen-vl" },
  log: [],
  ...over,
});
const inkWash = (): ExtractedStyle[] => [
  look("inkwash", ["s01"], { observables: obs({ render_mode: "ink" }), replicas: [{ source: "s01", rounds: [round(1, "rep/a.jpg", 0.8)] }], transfers: [{ scene: 0, brief: "a harbour", file: "tr/a.jpg", score: 0.7, per_field: {}, prompt: "tp", readback: null, generator: "g", vision: "v", error: null }] }),
];
const grain = (): ExtractedStyle[] => [look("grain", ["s01"], { observables: obs({ render_mode: "grain" }), replicas: [{ source: "s01", rounds: [round(1, "rep/a.jpg", 0.5)] }] })];

function seedRun(id: string, styles: ExtractedStyle[], over: Partial<ExtractManifest> = {}): void {
  const dir = path.join(out, "extract", id);
  for (const d of ["src", "rep", "tr"]) mkdirSync(path.join(dir, d), { recursive: true });
  for (const f of ["src/s01.png", "rep/a.jpg", "tr/a.jpg"]) writeFileSync(path.join(dir, f), `bytes ${id} ${f}`);
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(manifest(id, styles, over)));
  writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify({}));
}

/* ── a night ──────────────────────────────────────────────────────────────────── */

const base = { sourceIds: ["s-01"], status: "rendered" } as const;
const recipe = { shot: "wide", camera: "low angle, 24mm", motion: "slow push-in", composition: "lone figure on the left third", lighting: "hard key from frame left", palette: ["teal ground"], rhythm: "long holds", durationS: 4.2, prompt: "wide low-angle shot of a lone figure" } as const;
const candidates = (night: string): Candidate[] => [
  { ...base, id: "c-01", kind: "style", extractRunId: night === NIGHT ? RUN1 : RUN3 },
  ...(night === NIGHT ? [{ ...base, id: "c-02", kind: "style" as const, extractRunId: RUN2 }] : []),
  { ...base, id: "c-03", kind: "scene", keyframes: ["sources/s-01/k-001.jpg"], recipe, replicas: ["scenes/c-03/replica-1.jpg", "scenes/c-03/replica-2.jpg"], clipRequested: true, clip: { path: "scenes/c-03/clip.mp4", durationS: 5, from: "scenes/c-03/replica-1.jpg" } },
  { ...base, id: "c-04", kind: "finding", template: "cinematic", step: "02-frames", claim: "Hold the subject still and let the camera move", quote: "pick one: the lens or the actor" },
  { ...base, id: "c-05", kind: "watch", entry: "channel: lighting breakdowns - https://example.com/b", why: "motivated key and practicals" },
  { id: "c-06", kind: "style", sourceIds: ["s-01"], status: "failed", error: "gemini answered 429: quota exhausted for the day" },
];

function seedNight(id: string, dry: boolean): void {
  const dir = path.join(out, "scout", id);
  for (const d of ["sources/s-01", "scenes/c-03"]) mkdirSync(path.join(dir, d), { recursive: true });
  for (const f of ["sources/s-01/k-001.jpg", "scenes/c-03/replica-1.jpg", "scenes/c-03/replica-2.jpg", "scenes/c-03/clip.mp4"]) writeFileSync(path.join(dir, f), `bytes ${id} ${f}`);
  const night: Night = {
    id,
    startedAt: `${id.slice(0, 10)}T00:00:00.000Z`,
    ceilingUsd: 15,
    target: 20,
    clipCap: 2,
    dry,
    state: "closed",
    stop: "target",
    closedAt: `${id.slice(0, 10)}T05:00:00.000Z`,
    sources: [{ id: "s-01", url: "https://example.com/v/1", kind: "video", title: "a breakdown", why: "cut rhythm", found: "search", rights: "reference-only", status: "ingested", files: ["sources/s-01/k-001.jpg"] }],
    candidates: candidates(id),
    jobs: [],
  };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
}

function seed(): void {
  closeKernel();
  for (const d of ["style-store", "foundry-out", "catalogue", "knowledge"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(catDir, { recursive: true });
  writeFileSync(path.join(catDir, "styles.json"), JSON.stringify({ styles: [] }));
  seedRun(RUN1, inkWash());
  seedRun(RUN2, grain());
  seedRun(RUN3, inkWash(), { dry: true });
  seedNight(NIGHT, false);
  seedNight(DRY, true);
  mkdirSync(path.join(know, "templates", "cinematic", "steps", "01-script"), { recursive: true });
  mkdirSync(path.dirname(WATCHLIST), { recursive: true });
  writeFileSync(WATCHLIST, WATCH_BEFORE);
}

const nightOf = (id: string): Night => JSON.parse(readFileSync(path.join(out, "scout", id, "night.json"), "utf8")) as Night;
const runOf = (id: string): ExtractManifest => JSON.parse(readFileSync(path.join(out, "extract", id, "run.json"), "utf8")) as ExtractManifest;
const verdictsOf = (id: string): ExtractVerdicts => JSON.parse(readFileSync(path.join(out, "extract", id, "verdicts.json"), "utf8")) as ExtractVerdicts;
const text = (f: string): string => (existsSync(f) ? readFileSync(f, "utf8") : "<absent>");

/** The operator's morning, the same in every test that commits. */
const VERDICTS = [
  { candidate: "c-01/inkwash/replica-1", verdict: "keep" as const },
  { candidate: "c-01/inkwash/transfer-1", verdict: "keep" as const },
  { candidate: "c-02/grain/replica-1", verdict: "reject" as const, reasons: ["style", "rights"] },
  { candidate: "c-03/replica-1", verdict: "keep" as const },
  { candidate: "c-03/replica-2", verdict: "reject" as const, reasons: ["craft"], note: "the horizon tilts" },
  { candidate: "c-03/clip", verdict: "keep" as const },
  { candidate: "c-04/text", verdict: "keep" as const },
  { candidate: "c-05/text", verdict: "keep" as const },
];

describe("scout adapter - the packet", () => {
  it("a row per candidate in kind order; style cells are the extract adapter's under the candidate; text cells carry their words", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    const { packet, present, urls, losses } = flow.plan;
    expect(packet.id).toBe(`pkt:scout:${NIGHT}`);
    expect(packet.items.map((c) => [c.id, c.row])).toEqual([
      ["c-01/inkwash/replica-1", "c-01/inkwash"],
      ["c-01/inkwash/transfer-1", "c-01/inkwash"],
      ["c-02/grain/replica-1", "c-02/grain"],
      ["c-03/replica-1", "c-03"],
      ["c-03/replica-2", "c-03"],
      ["c-03/clip", "c-03"],
      ["c-04/text", "c-04"],
      ["c-05/text", "c-05"],
    ]);
    expect(packet.items.find((c) => c.id === "c-03/clip")?.media.mime).toBe("video/mp4");
    expect(packet.items.find((c) => c.id === "c-04/text")?.media.mime).toBe("text/plain");
    expect(urls["c-01/inkwash/replica-1"]).toBe(`/api/foundry/file?run=${RUN1}&path=rep%2Fa.jpg&kind=extract`);
    expect(urls["c-03/clip"]).toBe(`/api/foundry/file?run=${NIGHT}&path=scenes%2Fc-03%2Fclip.mp4&kind=scout`);
    expect(present.rows.find((r) => r.id === "c-03")).toEqual({ id: "c-03", label: "wide · low angle", group: "videos", ref: `/api/foundry/file?run=${NIGHT}&path=sources%2Fs-01%2Fk-001.jpg&kind=scout` });
    expect(present.items["c-04/text"]).toEqual({ label: "Hold the subject still and let the camera move", meta: "cinematic · 02-frames", prompt: "pick one: the lens or the actor" });
    expect(present.items["c-03/replica-1"]).toEqual({ label: "replica 1", prompt: "lone figure on the left third · hard key from frame left · wide low-angle shot of a lone figure" });
    expect(present.items["c-03/clip"]).toEqual({ label: "clip · replica-1", meta: "5s", prompt: "slow push-in · long holds" });
    // A failed candidate is not a cell: its error rides verbatim in a Loss the gate draws.
    expect(losses).toContainEqual({ candidate: "c-06", grade: "dropped", reason: "gemini answered 429: quota exhausted for the day" });
  });

  it("refuses a night still running, and one already committed", async () => {
    seed();
    const v1 = must(await scoutAdapter.read({ runId: NIGHT }));
    const open = scoutAdapter.packet({ ...v1, night: { ...v1.night, state: "open" } });
    expect(open.ok ? "" : open.error.message).toBe(`scout night ${NIGHT}: The night is still running.`);
    const done = scoutAdapter.packet({ ...v1, night: { ...v1.night, state: "committed" } });
    expect(done.ok ? "" : done.error.code).toBe("refused");
  });
});

describe("scout adapter - consequence and apply over a temp night", () => {
  it("previews every file and store, then commits styles, knowledge and the night's record", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    flow.patch(VERDICTS);
    const p = must(flow.preview()).consequence;
    expect(p.counts).toEqual({ kept: 6, rejected: 2, undecided: 0 });
    const targets = p.writes.map((w) => [w.target, w.candidate ?? ""]);
    expect(targets).toContainEqual(["pipeline/foundry/styles.json", "c-01/inkwash"]);
    expect(targets).toContainEqual([`foundry-out/extract/${RUN2}/verdicts.json`, "c-02"]);
    expect(targets).toContainEqual(["knowledge/templates/cinematic/steps/02-frames/PATTERNS.md", "c-04/text"]);
    expect(targets).toContainEqual(["knowledge/scout/watchlist.md", "c-05/text"]);
    expect(p.writes.at(-1)).toMatchObject({ target: `foundry-out/scout/${NIGHT}/night.json` });
    expect(p.promotions).toContainEqual({ target: `motion:scout:${NIGHT}:c-03`, candidate: "c-03/clip", detail: "a reference-only clip in the Library" });

    must(flow.commit());
    expect((await flow.deliver())?.result).toBe("applied");
    expect(runOf(RUN1)).toMatchObject({ status: "committed", committed: { kept: ["inkwash"] } });
    // Every look of c-02 rejected: v1's verdicts, the scout's reason extract has no word for in the note, no commit.
    expect(runOf(RUN2).status).toBe("done");
    expect(verdictsOf(RUN2)["grain"]).toMatchObject({ verdict: "reject", reasons: ["style"], note: "scout: rights", by: "human" });
    const night = nightOf(NIGHT);
    expect(night.state).toBe("committed");
    expect(night.committed).toMatchObject({ by: "operator", dry: false, kept: ["c-01/inkwash/replica-1", "c-01/inkwash/transfer-1", "c-03/replica-1", "c-03/clip", "c-04/text", "c-05/text"], rejected: ["c-02/grain/replica-1", "c-03/replica-2"], reasons: { "c-02/grain/replica-1": ["style", "rights"], "c-03/replica-2": ["craft"] }, notes: { "c-03/replica-2": "the horizon tilts" } });
    expect(text(PATTERNS)).toBe(`# cinematic - 02-frames\n\n## Scout findings\n\n- Hold the subject still and let the camera move - "pick one: the lens or the actor" (n=1, scout ${NIGHT}, https://example.com/v/1) <!-- scout:${NIGHT}/c-04 -->\n`);
    expect(text(WATCHLIST)).toBe(`${WATCH_BEFORE}\n- channel: lighting breakdowns - https://example.com/b - motivated key and practicals <!-- scout:${NIGHT}/c-05 -->\n`);
  });

  it("a second delivery is a no-op, a different outcome is refused, and every crash prefix recovers", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    flow.patch(VERDICTS);
    must(flow.commit());
    const claim = flow.claim();
    const clean = new RecordingPort();
    __setFoundryFsPort(clean);
    must(await scoutAdapter.apply(claim));
    __setFoundryFsPort(null);
    const snapshot = () => {
      const strip = (s: string) => s.replace(/"at":\s*"[^"]*"/g, '"at":""').replace(/"_rev":\s*\d+/g, '"_rev":0');
      const files = [path.join(catDir, "styles.json"), path.join(out, "extract", RUN1, "run.json"), path.join(out, "extract", RUN1, "verdicts.json"), path.join(out, "extract", RUN2, "verdicts.json"), path.join(out, "scout", NIGHT, "night.json"), PATTERNS, WATCHLIST];
      return files.map((f) => strip(text(f)));
    };
    const want = snapshot();
    must(await scoutAdapter.apply(claim));
    expect(snapshot()).toEqual(want);

    // A crash inside the extract run's commit, at every one of its disk effects.
    expect(clean.applied).toBeGreaterThan(0);
    for (let k = 1; k <= clean.applied; k++) {
      seed();
      __setFoundryFsPort(new RecordingPort({ crashAt: k }));
      expect((await scoutAdapter.apply(claim)).ok, `crash at ${k}`).toBe(false);
      __setFoundryFsPort(null);
      expect(nightOf(NIGHT).state, `crash at ${k}`).toBe("closed");
      must(await scoutAdapter.apply(claim));
      expect(snapshot(), `retry after a crash at mutation ${k}`).toEqual(want);
    }
    // A crash after the knowledge lines landed and before the night's record: no line twice.
    seed();
    const night = nightOf(NIGHT);
    const [finding, watch] = [night.candidates[3], night.candidates[4]];
    if (finding?.kind !== "finding" || watch?.kind !== "watch") throw new Error("seed order");
    await appendFinding(NIGHT, finding, "https://example.com/v/1");
    await appendWatch(NIGHT, watch);
    must(await scoutAdapter.apply(claim));
    expect(snapshot()).toEqual(want);
    // ...and when every write but the record landed.
    writeFileSync(path.join(out, "scout", NIGHT, "night.json"), JSON.stringify(night));
    must(await scoutAdapter.apply(claim));
    expect(snapshot()).toEqual(want);

    // The night already holds another outcome: refused, loudly, and nothing is overwritten.
    const done = nightOf(NIGHT);
    writeFileSync(path.join(out, "scout", NIGHT, "night.json"), JSON.stringify({ ...done, committed: { ...done.committed, kept: ["c-03/replica-1"], rejected: ["c-03/clip"] } }));
    const r = await scoutAdapter.apply(claim);
    expect(r.ok ? "" : [r.error.code, r.error.message]).toEqual(["refused", expect.stringContaining("c-03/clip is reject in v1, keep here")]);
  }, 60_000); // every crash prefix replays an extract commit
});

describe("scout adapter - a dry night", () => {
  it("records every verdict with dry: true and writes nothing else", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, DRY, blobDir);
    // The dry run's look is triaged here (planLooks), though extract never commits it.
    expect(flow.plan.packet.items.map((c) => c.id)).toContain("c-01/inkwash/replica-1");
    flow.patch(flow.plan.packet.items.map((c) => ({ candidate: c.id, verdict: "keep" as const })));
    const p = must(flow.preview()).consequence;
    expect(p.writes).toEqual([{ kind: "file", target: `foundry-out/scout/${DRY}/night.json`, detail: "committed · dry: the verdicts only; no style, scene or knowledge is admitted" }]);
    expect(p.promotions).toEqual([]);
    must(flow.commit());
    expect((await flow.deliver())?.result).toBe("applied");
    expect(nightOf(DRY)).toMatchObject({ state: "committed", committed: { dry: true, kept: flow.plan.packet.items.map((c) => c.id), rejected: [] } });
    expect(runOf(RUN3).status).toBe("done");
    expect(verdictsOf(RUN3)).toEqual({});
    expect(existsSync(PATTERNS)).toBe(false);
    expect(text(WATCHLIST)).toBe(WATCH_BEFORE);
  });
});
