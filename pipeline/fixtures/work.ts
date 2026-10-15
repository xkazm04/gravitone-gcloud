// THE LIVE-WORK UNIVERSE — the stores the Phase 2 ledger projects that no other
// generator here writes, each holding at least one record in every state the
// projection maps (lib/ledger/v1/sources/*), so the reconcile probe
// (tests/golden-path/ledger-reconcile.probe.spec.ts) has live work, Weir piles
// and history in every source:
//
//   fixtures-out/strips/<id>/run.json + verdicts.json   running · awaiting-triage · committed
//   fixtures-out/articles/<id>/run.json (+ .driver)     driving · stalled · at the gate · landed · rejected
//   fixtures-out/sound/suno.json                        interrupted queue: queued · done · failed · cancelled, clips
//   fixtures-out/sound/mv.json                          active (live worker) · queued · done · failed
//   fixtures-out/turns/tn-*.json                        running · accepted with a gone owner · done · failed · orphaned
//   fixtures-out/spend/<class>.json                     rows, a hold, counters that add up
//   fixtures-out/gpu/queue.jsonl + lease.json           a closed tenancy, the current holder
//   fixtures-out/clips/clip-*.json                      queued · rendering · done · failed
//
// FOUR OF THESE ROOTS v1 NEVER READS IN FIXTURE MODE. strips, articles, turns,
// spend and clips resolve to foundry-out/ in both universes (their stores
// ignore lib/fixtures/mode.ts); the ledger's adapters read fixtures-out/ for
// them instead (lib/ledger/v1/sources/roots.ts says why). The Suno, MV and GPU
// stores DO follow the switch, so v1's Board and lease probe see these too.
//
// Deterministic as the kit requires: fixed ids, every instant an offset from
// NOW. Two values are this machine's on purpose, because v1's liveness rules
// read them: a live owner is pid ALIVE_PID (init / System - publish.ts's rule)
// on this host, so "alive" means alive here.

import { hostname } from "node:os";
import { rmSync } from "node:fs";

import type { ArticleRun } from "../../lib/articles/types";
import type { StripCard, StripRun, StripVerdicts } from "../../lib/foundry/strips/types";
import type { LeaseRecord } from "../../lib/gpu/lease";
import type { ClipRecord } from "../../lib/imaging/video/types";
import type { MvFile } from "../../lib/sound/mv/store";
import type { MvJob } from "../../lib/sound/mv/types";
import type { SunoFile } from "../../lib/sound/suno/store";
import type { SunoJob } from "../../lib/suno/types";
import type { TurnRecord } from "../../lib/turns/ledger";
import { HOUR, MIN, NOW, iso, outFile, writeBytes, writeJson } from "./kit";

const ALIVE_PID = process.platform === "win32" ? 4 : 1;
const HOST = hostname();
const ago = (ms: number): number => NOW - ms;

/* ── strips ──────────────────────────────────────────────────────────────── */

const card = (id: string, status: StripCard["status"], extra: Partial<StripCard> = {}): StripCard => ({
  id,
  lane: id.startsWith("stat") ? "stat" : "edu",
  case: id.split("--")[0] ?? id,
  approach: id.endsWith("--ctrl") ? "CTRL" : (id.split("--")[1] ?? "E01"),
  effort: "high",
  status,
  rounds: 0,
  authorMs: 610_000,
  renderMs: 24_000,
  files: status === "rendered" ? { html: "strip.html", style: "style.json", mp4: "strip.mp4", webm: "strip.webm", poster: "poster.jpg", sheet: "sheet.png" } : {},
  ...(status === "rendered" ? { costUsd: 1.62 } : {}),
  ...extra,
});

function stripRun(id: string, at: string, status: StripRun["status"], cards: StripCard[]): StripRun {
  return { version: 1, id, at, width: { edu: 1920, stat: 1080 }, height: { edu: 1080, stat: 1920 }, fps: 30, frames: 240, approaches: [], cards, status };
}

function strips(): number {
  const runs: [StripRun, StripVerdicts][] = [
    [stripRun("strips-fx-running", iso(-40 * MIN), "running", [card("edu-rate-hike--ctrl", "rendered"), card("edu-rate-hike--E01", "rendered"), card("stat-supply--S01", "pending")]), {}],
    [
      stripRun("strips-fx-triage", iso(-26 * HOUR), "awaiting-triage", [
        card("edu-aqueduct--ctrl", "rendered"),
        card("edu-aqueduct--E11", "rendered"),
        card("edu-aqueduct--E12", "rendered"),
        card("edu-aqueduct--E13", "lint-failed", { lint: ["no-network: fetch( in strip.html"], error: "lint failed after 2 fix rounds", rounds: 2 }),
      ]),
      { "edu-aqueduct--ctrl": { verdict: "keep", at: iso(-3 * HOUR), chips: ["concept"] }, "edu-aqueduct--E11": { verdict: "reject", at: iso(-3 * HOUR + MIN), chips: ["too-busy"], note: "three motions at once" } },
    ],
    [
      stripRun("strips-fx-committed", iso(-6 * 24 * HOUR), "committed", [card("edu-chokepoint--E06", "rendered"), card("edu-chokepoint--E07", "rendered")]),
      { "edu-chokepoint--E06": { verdict: "keep", at: iso(-5 * 24 * HOUR) }, "edu-chokepoint--E07": { verdict: "reject", at: iso(-5 * 24 * HOUR + MIN), chips: ["legibility"] } },
    ],
  ];
  for (const [run, verdicts] of runs) {
    writeJson(outFile("strips", run.id, "run.json"), run);
    writeJson(outFile("strips", run.id, "verdicts.json"), verdicts);
  }
  return runs.length;
}

/* ── articles ────────────────────────────────────────────────────────────── */

const SUBJECTS: Record<string, string> = {
  "fx-art-driving": "two-clock-records",
  "fx-art-stalled": "append-only-design",
  "fx-art-gate": "delivery-guarantees",
  "fx-art-landed": "measurement-honesty",
  "fx-art-rejected": "dead-code",
};

function article(id: string, status: ArticleRun["status"], createdMs: number, steps: ArticleRun["steps"], extra: Partial<ArticleRun> = {}): ArticleRun {
  const subject = SUBJECTS[id] ?? id;
  return {
    id,
    status,
    topic: { kind: "subject", bundle: "software-engineering", subject, text: subject.replace(/-/g, " ") },
    promptRef: { file: "pipeline/ARTICLE-POST-PROMPT.md", sha: "0f1e2d3c" },
    standard: { recipe: "technical-blog-post-authoring", bundle: "technical-writing", subjects: ["technical-blog-post-authoring"] },
    model: "claude-opus-5",
    effort: "high",
    steps,
    createdAt: iso(-createdMs),
    updatedAt: iso(-createdMs + 30 * MIN),
    ...extra,
  };
}
const step = (name: ArticleRun["steps"][number]["name"], startMs: number, endMs: number | null, cost?: number): ArticleRun["steps"][number] => ({
  name,
  status: endMs === null ? "running" : "done",
  startedAt: iso(-startMs),
  ...(endMs === null ? {} : { endedAt: iso(-endMs) }),
  ...(cost === undefined ? {} : { costUsd: cost }),
});
const allFive = (from: number): ArticleRun["steps"] => [
  step("research", from, from - 9 * MIN, 0.42),
  step("outline", from - 9 * MIN, from - 12 * MIN, 0.08),
  step("draft", from - 12 * MIN, from - 25 * MIN, 0.61),
  step("critique", from - 25 * MIN, from - 38 * MIN, 0.9),
  step("check", from - 38 * MIN, from - 39 * MIN),
];

function articles(): number {
  const runs: ArticleRun[] = [
    article("fx-art-driving", "drafting", 20 * MIN, [step("research", 20 * MIN, 11 * MIN, 0.38), step("outline", 11 * MIN, 8 * MIN, 0.07), step("draft", 8 * MIN, null)]),
    article("fx-art-stalled", "researching", 5 * HOUR, [step("research", 5 * HOUR, null)]),
    article("fx-art-gate", "awaiting-approval", 30 * HOUR, allFive(30 * HOUR), { rework: { at: iso(-29 * HOUR), note: "lead with the reconcile failure, not the theory", count: 1 } }),
    article("fx-art-landed", "landed", 9 * 24 * HOUR, allFive(9 * 24 * HOUR), {
      approval: { at: iso(-8 * 24 * HOUR), patches: ["p1"] },
      landing: { slug: "measurement-honesty", branch: "article/measurement-honesty", prUrl: "https://example.invalid/pr/12", gates: [{ lane: "check:articles", mode: "check", ok: true }] },
      landedAt: iso(-8 * 24 * HOUR + 20 * MIN),
    }),
    article("fx-art-rejected", "rejected", 4 * 24 * HOUR, allFive(4 * 24 * HOUR), { rejection: { at: iso(-3 * 24 * HOUR), note: "the subject has no measured case yet" } }),
  ];
  for (const r of runs) writeJson(outFile("articles", r.id, "run.json"), r);
  writeJson(outFile("articles", "fx-art-driving", ".driver"), { pid: ALIVE_PID, at: iso(-20 * MIN) });
  return runs.length;
}

/* ── the Suno and music-video queues ─────────────────────────────────────── */

function suno(): string {
  const job = (id: string, title: string, state: SunoJob["state"], enq: number, extra: Partial<SunoJob> = {}): SunoJob => ({
    id,
    proposalId: `sp-${id.slice(3)}`,
    fields: { title, style: "slow tremolo strings, harbor ambience" },
    lane: { axis: "group", value: "harbor" },
    state,
    models: ["v6", "v6-wild"],
    enqueuedAt: ago(enq),
    clipIds: [],
    ...extra,
  });
  const file: SunoFile = {
    version: 1,
    queue: { running: false, interrupted: `"Harbor glass" on v6 was being created when the server stopped; check your Suno library before starting` },
    proposals: ["0a0a0a0a01", "0a0a0a0a02", "0a0a0a0a03", "0a0a0a0a04", "0a0a0a0a05"].map((h, i) => ({
      id: `sp-${h}`,
      fields: { style: "slow tremolo strings" },
      lane: { axis: "group", value: "harbor" },
      origin: i === 0 ? "custom" : "llm",
      createdAt: ago((10 - i) * HOUR),
    })),
    jobs: [
      job("sj-0a0a0a0a01", "Harbor glass", "queued", 3 * HOUR, { startedAt: ago(3 * HOUR - MIN) }),
      job("sj-0a0a0a0a02", "Low tide", "queued", 2 * HOUR),
      job("sj-0a0a0a0a03", "Lantern", "done", 9 * HOUR, { startedAt: ago(9 * HOUR - MIN), endedAt: ago(9 * HOUR - 6 * MIN), clipIds: ["sc-0b0b0b0b01", "sc-0b0b0b0b02"] }),
      job("sj-0a0a0a0a04", "Breakwater", "failed", 8 * HOUR, { startedAt: ago(8 * HOUR - MIN), endedAt: ago(8 * HOUR - 2 * MIN), error: "Suno: the Create button never enabled (credits exhausted?)" }),
      job("sj-0a0a0a0a05", "Fog bell", "cancelled", 7 * HOUR, { endedAt: ago(7 * HOUR - 5 * MIN) }),
    ],
    clips: [
      { id: "sc-0b0b0b0b01", songId: "fx-song-1", url: "https://suno.com/song/fx-song-1", audioUrl: null, imageUrl: null, title: "Lantern", durationS: 182, origin: "queue", jobId: "sj-0a0a0a0a03", model: "v6", createdAt: ago(9 * HOUR - 4 * MIN), verdict: "keep" },
      { id: "sc-0b0b0b0b02", songId: "fx-song-2", url: "https://suno.com/song/fx-song-2", audioUrl: null, imageUrl: null, title: "Lantern", durationS: 176, origin: "queue", jobId: "sj-0a0a0a0a03", model: "v6-wild", createdAt: ago(9 * HOUR - 6 * MIN), verdict: null },
      { id: "sc-0b0b0b0b03", songId: "fx-song-3", url: "https://suno.com/song/fx-song-3", audioUrl: null, imageUrl: null, title: "Old pier", durationS: 201, origin: "library", jobId: null, model: "v4.5", createdAt: ago(30 * HOUR), verdict: null },
    ],
  };
  writeJson(outFile("sound", "suno.json"), file);
  return `${file.jobs.length} suno jobs`;
}

function mv(): string {
  const job = (id: string, title: string, state: MvJob["state"], enq: number, extra: Partial<MvJob> = {}): MvJob => ({
    id,
    source: { kind: "take", id: `st-${id.slice(3)}`, title },
    state,
    files: {},
    verdict: null,
    enqueuedAt: ago(enq),
    ...extra,
  });
  const file: MvFile = {
    version: 1,
    queue: { running: true },
    jobs: [
      job("mj-0c0c0c0c01", "Stay Here", "active", 20 * MIN, { phase: "rendering", startedAt: ago(18 * MIN) }),
      job("mj-0c0c0c0c02", "Night Ferry", "queued", 10 * MIN),
      job("mj-0c0c0c0c03", "Siren", "done", 6 * HOUR, { startedAt: ago(6 * HOUR - MIN), endedAt: ago(5 * HOUR), files: { video: "mv/mj-0c0c0c0c03/video.mp4" } }),
      job("mj-0c0c0c0c04", "Undertow", "done", 30 * HOUR, { startedAt: ago(30 * HOUR - MIN), endedAt: ago(29 * HOUR), verdict: "keep" }),
      job("mj-0c0c0c0c05", "Shoal", "failed", 4 * HOUR, { startedAt: ago(4 * HOUR - MIN), endedAt: ago(4 * HOUR - 3 * MIN), error: "Leonardo studio: the signed-in profile has no credits left" }),
    ],
    imports: [],
    progress: {},
    worker: { pid: ALIVE_PID, at: ago(MIN) },
  };
  writeJson(outFile("sound", "mv.json"), file);
  return `${file.jobs.length} mv jobs`;
}

/* ── the turn ledger ─────────────────────────────────────────────────────── */

function turns(): number {
  const base = (id: string, status: TurnRecord["status"], startMs: number, extra: Partial<TurnRecord>): TurnRecord => ({
    v: 1, id, kind: "recalibrate", turn: "edit-plan", projectId: "seed-glass-harbor", slot: null, status,
    bootId: "b-fixture-gone", pid: 999_999, host: "fixture-elsewhere",
    startedAt: iso(-startMs), updatedAt: iso(-startMs + MIN), promptDigest: "0".repeat(64), promptChars: 4120, ...extra,
  });
  const recs: TurnRecord[] = [
    base("tn-0d0d0d0d0d01", "running", 2 * MIN, { pid: ALIVE_PID, host: HOST, bootId: "b-fixture-live", slot: "seed-glass-harbor:recalibrate" }),
    base("tn-0d0d0d0d0d02", "accepted", 40 * MIN, { kind: "compose", turn: "compose" }),
    base("tn-0d0d0d0d0d03", "done", 3 * HOUR, {
      endedAt: iso(-3 * HOUR + 2 * MIN),
      receipt: { provider: "claude-cli", model: "claude-opus-5", transport: "local-subprocess", rung: "preferred", turn: "edit-plan", schemaEnforcement: "prompted", durationMs: 98_000, costUsd: 0.37, costBasis: "vendor-reported", promptChars: 4120 },
      result: { scenes: 6 },
    }),
    base("tn-0d0d0d0d0d04", "failed", 5 * HOUR, {
      kind: "key-image", turn: "image-generate", endedAt: iso(-5 * HOUR + MIN),
      receipt: { lane: "imaging", provenance: { provider: "google", model: "gemini-3.1-flash-image", modelBasis: "requested", durationMs: 41_000, costUsd: 0.045, costBasis: "estimated" } },
      error: { kind: "refused", message: "the vendor refused the prompt: IMAGE_SAFETY" },
    }),
    base("tn-0d0d0d0d0d05", "orphaned", 26 * HOUR, {
      endedAt: iso(-25 * HOUR),
      error: { kind: "orphaned", message: "The server that was running this turn stopped before it finished. Its result was never received; nothing was changed." },
    }),
  ];
  for (const r of recs) writeJson(outFile("turns", `${r.id}.json`), r);
  return recs.length;
}

/* ── spend ───────────────────────────────────────────────────────────────── */

function spend(): string {
  const counters = (booked: number, evicted: number, evictedAmount: number) => ({
    refusals: 0, refused: 0, booked, bookedFailed: 1, failed: 0.045, unpriced: 0, evicted, evictedAmount, lastEvictionAt: evicted > 0 ? ago(2 * HOUR) : null, expiredHolds: 0, expiredAmount: 0, lateWrites: 0,
  });
  // booked = rows still held + rows evicted: the identity the adapter checks (lib/spend/meter.ts book, prune).
  writeJson(outFile("spend", "imaging-usd.json"), {
    rows: [
      { at: ago(40 * MIN), amount: 0.045, outcome: "served", basis: "vendor-reported", axes: { cap: "generate", provider: "google", model: "gemini-3.1-flash-image" } },
      { at: ago(25 * MIN), amount: 0.045, outcome: "failed", basis: "estimated", axes: { cap: "generate", provider: "google", model: "gemini-3.1-flash-image" } },
      { at: ago(10 * MIN), amount: 0.0257, outcome: "served", basis: "vendor-reported", axes: { cap: "generate", provider: "leonardo", model: "lucid-origin" } },
    ],
    holds: { [`hold-${ALIVE_PID}-1-${ago(MIN)}`]: { id: `hold-${ALIVE_PID}-1-${ago(MIN)}`, amount: 0.05, createdAt: ago(MIN), pid: ALIVE_PID } },
    counters: counters(7, 4, 0.19),
  });
  writeJson(outFile("spend", "text-usd.json"), {
    rows: [{ at: ago(3 * HOUR - 2 * MIN), amount: 0.37, outcome: "served", basis: "vendor-reported", axes: { turn: "edit-plan", provider: "claude-cli", model: "claude-opus-5" } }],
    holds: {},
    counters: counters(1, 0, 0),
  });
  return "2 spend classes";
}

/* ── the GPU lease ───────────────────────────────────────────────────────── */

function gpu(): string {
  const holder: LeaseRecord = { tenant: "forge-comfy", engine: "comfy", vramGb: 20, pid: ALIVE_PID, host: HOST, jobPrefix: "forge", acquiredAt: ago(30 * MIN), heartbeatAt: NOW, ttlS: 120, ticket: "0e0e0e0e0e02" };
  const lines = [
    { at: ago(3 * HOUR), ev: "grant", ticket: "0e0e0e0e0e01", tenant: "next-ollama-eye", engine: "ollama", pid: 40388, host: HOST },
    { at: ago(3 * HOUR - 4 * MIN), ev: "release", ticket: "0e0e0e0e0e01", tenant: "next-ollama-eye" },
    { at: ago(31 * MIN), ev: "wait", ticket: "0e0e0e0e0e02", tenant: "forge-comfy", engine: "comfy", pid: ALIVE_PID, host: HOST },
    { at: ago(30 * MIN), ev: "grant", ticket: "0e0e0e0e0e02", tenant: "forge-comfy", engine: "comfy", pid: ALIVE_PID, host: HOST },
  ];
  writeBytes(outFile("gpu", "queue.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  writeJson(outFile("gpu", "lease.json"), holder);
  return `${lines.length} lease events`;
}

/* ── video clips ─────────────────────────────────────────────────────────── */

function clips(): number {
  const clip = (id: string, status: ClipRecord["status"], createdMs: number, extra: Partial<ClipRecord> = {}): ClipRecord => ({
    clipId: id, projectId: "seed-glass-harbor", status, model: "hailuo-03", durationS: 5, aspect: "16:9", motion: "slow push in over the harbor",
    vendorJobId: null, costUsd: null, costBasis: "unpriced", error: null, createdAt: ago(createdMs), finishedAt: null, ...extra,
  });
  const recs = [
    clip("clip-fx-queued01", "queued", 2 * MIN),
    clip("clip-fx-render01", "rendering", 6 * MIN, { vendorJobId: "gen-fx-1" }),
    clip("clip-fx-done0001", "done", 5 * HOUR, { vendorJobId: "gen-fx-2", costUsd: 0.75, costBasis: "vendor-reported", finishedAt: ago(5 * HOUR - 4 * MIN) }),
    clip("clip-fx-fail0001", "failed", 7 * HOUR, { error: "Leonardo: generation failed (CONTENT_FILTER)", finishedAt: ago(7 * HOUR - MIN) }),
  ];
  for (const r of recs) writeJson(outFile("clips", `${r.clipId}.json`), r);
  return recs.length;
}

export function generate(): string {
  // Idempotent under `--only work`: these roots and two sound files are this generator's.
  for (const d of ["strips", "articles", "turns", "spend", "gpu", "clips"]) rmSync(outFile(d), { recursive: true, force: true });
  const parts = [`${strips()} strip runs`, `${articles()} articles`, suno(), mv(), `${turns()} turns`, spend(), gpu(), `${clips()} clips`];
  return parts.join(", ");
}
