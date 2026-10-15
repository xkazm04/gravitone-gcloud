import "server-only";

// The Board specimens' packets (./BoardKit.tsx), built on the server: a candidate or packet id
// is minted at its schema door (@gt/domain/ids, zod), and a client module that minted them would
// carry zod into /kit's bundle (tests/next-gates/client-closure.test.ts). Literal packets over
// the repo's own preset plates, so the sheet draws the same every time.

import type { Consequence, PacketSummary, PacketView } from "@gt/domain/board";
import { parseAt } from "@gt/domain/door";
import { candidateIdSchema, packetIdSchema } from "@gt/domain/ids";
import { SOURCES, type PacketSource } from "@gt/domain/source";
import type { BoardVerdict } from "@gt/ui/board/boardGate";
import type { BoardPacket } from "@gt/ui/board/port";

const must = <T,>(r: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};
const pid = (s: string) => must(parseAt("kit packet", packetIdSchema, s));
const cid = (s: string) => must(parseAt("kit candidate", candidateIdSchema, s));
const img = (id: string, row: string, url: string, mime = "image/jpeg") => ({ id: cid(id), row, url, media: { sha256: "0".repeat(64), bytes: 1, mime }, grades: [] });
const PRESETS = ["signal-ledger", "newsprint-cutout", "blueprint", "chalk-argument"] as const;

function packet(id: string, source: PacketSource, over: Partial<PacketView>, present: BoardPacket["present"]): BoardPacket {
  const spec = SOURCES[source];
  return {
    view: { id: pid(id), lane: "image", source, mode: "matrix-cull", state: "open", rev: 4, items: [], decisions: [], undecided: 0, canUndo: true, reasons: { list: spec.reasons, max: spec.maxReasons, noteMax: spec.noteMax }, pairs: [], ...over },
    present,
  };
}

const CULL = packet(
  "pkt:forge:sweep-01",
  "forge",
  { title: "Forge sweep-01", items: ["the-exit", "flywheel"].flatMap((row) => PRESETS.map((p) => img(`${row}/${p}`, row, `/presets/${p}.jpg`))) },
  {
    items: Object.fromEntries(["the-exit", "flywheel"].flatMap((row) => PRESETS.map((p) => [`${row}/${p}`, { label: p.replace(/-/g, " "), meta: "forge · sdxl" }]))),
    rows: [
      { id: "the-exit", label: "the exit", ref: "/deck-art/template-cinematic.webp" },
      { id: "flywheel", label: "flywheel", ref: "/deck-art/engine-reversal-chain.webp" },
    ],
    oracle: { passed: true, summary: "8 plates · 0 decode errors", digest: "grader 7c1e09", fixture: true },
    meta: "forge · 2 scenes × 4 styles",
  },
);
const CULL_VERDICTS: Readonly<Record<string, BoardVerdict>> = {
  "the-exit/signal-ledger": { verdict: "keep", reasons: [] },
  "the-exit/newsprint-cutout": { verdict: "reject", reasons: ["style", "text"] },
  "the-exit/blueprint": { verdict: "keep", reasons: [] },
};

const AUDIO = packet(
  "pkt:audio:takes-11",
  "audio",
  { lane: "audio", title: "Take triage 11", items: [1, 2].map((i) => img(`take-${i}`, "music", "", "audio/wav")) },
  {
    items: Object.fromEntries([1, 2].map((i) => [`take-${i}`, { label: `night drive ${i}`, meta: "suno · 0:42 · 92 bpm", prompt: "slow synth, warm bass, rain on glass", peaks: Array.from({ length: 40 }, (_, j) => 0.3 + 0.6 * Math.abs(Math.sin(i + j * 0.4))), music: true }])),
    rows: [{ id: "music", label: "music" }],
  },
);

const PAIR = packet(
  "pkt:dojo:cycle-3",
  "dojo",
  {
    mode: "blind-pair",
    title: "Dojo cycle 3",
    items: [img("p1/a", "p1", "/presets/blueprint.jpg"), img("p1/b", "p1", "/presets/data-neon.jpg"), img("p2/a", "p2", "/presets/paper-relief.jpg"), img("p2/b", "p2", "/presets/chalk-argument.jpg")],
    pairs: [
      { row: "p1", a: cid("p1/a"), b: cid("p1/b"), outcome: "a", machine: { candidate: cid("p1/a"), agrees: true } },
      { row: "p2", a: cid("p2/a"), b: cid("p2/b"), outcome: null },
    ],
  },
  { items: { "p1/a": { label: "baseline" }, "p1/b": { label: "improved" } }, rows: [], questions: { p1: "Which reads as one lit scene?", p2: "Which keeps the silhouette?" }, oracle: { passed: true, summary: "2 pairs · judge masked", fixture: true }, meta: "dojo · rim-light" },
);

const REVIEW = packet(
  "pkt:article:run-42",
  "article",
  { lane: "article", mode: "packet-review", title: "Retry budgets that end", items: [img("draft-3", "d", "/file.svg", "text/markdown")] },
  {
    items: {},
    rows: [],
    oracle: { passed: true, summary: "0 errors · quorum 2/3", fixture: true },
    meta: "software-engineering/retry-backoff · turn 3",
    review: {
      title: "Retry budgets that end",
      standfirst: "A retry loop without a ceiling is an outage you scheduled in advance.",
      turn: 3,
      illustrative: true,
      sections: [
        { id: "s1", heading: "The loop that never stops", text: "Every client library ships a retry. Few ship the budget that says when retrying has become the failure." },
        { id: "s2", heading: "Jitter is not optional", text: "Synchronised clients turn a brief blip into a thundering herd.", regenerated: true },
      ],
      checks: [
        { name: "deterministic checks", value: "0 errors", ok: true },
        { name: "voice", value: "1 flag", ok: false },
      ],
      reviewers: [
        { who: "claude · depth", vote: "approve", note: "The budget section carries the argument." },
        { who: "qwen · voice", vote: "request", note: "Section 2 opens on a cliché." },
      ],
      spend: { low: 0.4, high: 0.9 },
    },
  },
);

const CUT = packet(
  "pkt:step:cut-01",
  "step",
  { lane: "video", mode: "packet-review", title: "Flywheel explainer cut", items: [img("export-1", "e", "/clips/presets/blueprint.webm", "video/webm")] },
  {
    items: {},
    rows: [],
    meta: "flywheel · cut",
    cut: {
      video: "/clips/presets/blueprint.webm",
      poster: "/clips/presets/blueprint.jpg",
      channels: ["youtube"],
      beats: [
        { t0: 0, t1: 1.5, text: "Every flywheel starts as a push." },
        { t0: 1.5, t1: 3, text: "Then the push becomes the habit." },
      ],
    },
  },
);

const sum = (id: string, lane: PacketView["lane"], mode: PacketView["mode"], title: string, state: PacketView["state"] = "open", items = 8, decided = 3): PacketSummary => ({
  id: pid(id),
  lane,
  source: "forge",
  mode,
  state,
  title,
  rev: 1,
  items,
  decided,
  openedAt: "2026-10-15T08:00:00.000Z",
});
const RAIL: readonly PacketSummary[] = [
  sum("pkt:forge:sweep-01", "image", "matrix-cull", "Forge sweep-01"),
  sum("pkt:dojo:cycle-3", "image", "blind-pair", "Dojo cycle 3", "open", 4, 2),
  sum("pkt:extract:x-2", "image", "matrix-cull", "Extract batch 2", "committed"),
  sum("pkt:article:run-42", "article", "packet-review", "Retry budgets that end", "open", 1, 0),
  sum("pkt:article:run-40", "article", "packet-review", "Leases with a fence", "returned", 1, 0),
  sum("pkt:audio:takes-11", "audio", "matrix-cull", "Take triage 11", "open", 6, 1),
];

const CONSEQUENCE: Consequence = {
  packetId: pid("pkt:forge:sweep-01"),
  rev: 7,
  counts: { kept: 2, rejected: 6, undecided: 0 },
  deletes: [
    { target: "foundry-out/runs/sweep-01/the-exit/newsprint-cutout.png", candidate: "the-exit/newsprint-cutout" },
    { target: "foundry-out/runs/sweep-01/flywheel/chalk-argument.png", candidate: "flywheel/chalk-argument" },
  ],
  writes: [{ kind: "index-row", target: "pipeline/foundry/styles.json", candidate: "the-exit/signal-ledger", detail: "signal ledger" }],
  promotions: [{ target: "style signal ledger", candidate: "the-exit/signal-ledger", detail: "candidate → proven" }],
  renames: [],
  nearDuplicates: [{ candidate: "the-exit/blueprint", of: "the-exit/signal-ledger", distance: 0.08 }],
  outward: [{ kind: "pull-request", sentence: "push branch article/retry-budgets-that-end to ai-registry and open a PR" }],
  v1Digest: "fixture",
  token: "5f2c9a1e77b04d31",
};

export type BoardKitData = {
  readonly cull: BoardPacket;
  readonly cullVerdicts: Readonly<Record<string, BoardVerdict>>;
  readonly audio: BoardPacket;
  readonly pair: BoardPacket;
  readonly review: BoardPacket;
  readonly cut: BoardPacket;
  readonly rail: readonly PacketSummary[];
  readonly consequence: Consequence;
};

export function boardKitData(): BoardKitData {
  return { cull: CULL, cullVerdicts: CULL_VERDICTS, audio: AUDIO, pair: PAIR, review: REVIEW, cut: CUT, rail: RAIL, consequence: CONSEQUENCE };
}
