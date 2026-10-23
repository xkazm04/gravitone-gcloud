// THE SCOUT UNIVERSE - two /scout nights in the on-disk shape lib/foundry/scout/store.ts
// documents, for the Floor's pile, the Board's `pkt:scout:<night>` and the Library's
// scout feed (spark media-training-loop):
//
//   fixtures-out/scout/<night>/night.json               the manifest
//   fixtures-out/scout/<night>/sources/s-NN/k-NNN.jpg    a found video's gated keyframes
//   fixtures-out/scout/<night>/scenes/c-NN/replica-N.jpg a scene's replica stills
//   fixtures-out/scout/<night>/assets/c-NN/concept-N.png  a game asset's concepts
//
// Yesterday's night is CLOSED and waits on the Floor; the night before was COMMITTED
// (a scene kept as a poster, a finding kept, a watch line rejected with its reason).
// No style candidate: a scout-owned extract run would leave the extract fixtures'
// own pile, and those fixtures belong to foundry.ts. Yesterday's night also briefed a game asset
// whose mesh asset is the hooded archer ./mesh.ts writes (its `night` is the same day), so the
// fixture Board's scout packet has a `3d` row: two finished variants, poster tiles, a viewer in Z.

import { rmSync } from "node:fs";

import { standConcept } from "../../lib/foundry/scout/concept";
import type { Asset3dCandidate, Night, SceneCandidate, ScoutSource } from "../../lib/foundry/scout/types";
import { DAY, HOUR, NOW, outFile, plate, writeBytes, writeJson } from "./kit";

const PALETTE = ["#1d2b3a", "#e0a458", "#5c8a8a", "#f2e8cf"];
const dayOf = (agoMs: number): string => new Date(NOW - agoMs).toISOString().slice(0, 10);
const at = (ms: number): string => new Date(ms).toISOString();

function source(night: string, id: string, title: string, frames: number): ScoutSource {
  const files = Array.from({ length: frames }, (_, i) => `sources/${id}/k-${String(i + 1).padStart(3, "0")}.jpg`);
  for (const f of files) writeBytes(outFile("scout", night, f), plate(`scout:${night}:${f}`, PALETTE, 320, 180));
  return {
    id,
    url: `https://www.youtube.com/watch?v=fixture${id.slice(2)}`,
    kind: "video",
    title,
    channel: "Fixture Studio",
    why: "a long held wide shot with one motivated key",
    found: "search",
    rights: "reference-only",
    status: "ingested",
    files,
    durationS: 142.6,
    at: Object.fromEntries(files.map((f, i) => [f, 2 + i * 1.5])),
  };
}

function scene(night: string, id: string, src: ScoutSource, clip: boolean): SceneCandidate {
  const replicas = [1, 2].map((n) => `scenes/${id}/replica-${n}.jpg`);
  for (const r of replicas) writeBytes(outFile("scout", night, r), plate(`scout:${night}:${r}`, PALETTE, 320, 180));
  return {
    id,
    kind: "scene",
    sourceIds: [src.id],
    status: "rendered",
    jobId: `job:scout-scene:${night}:${id}`,
    keyframes: src.files.slice(0, 3),
    recipe: {
      shot: "wide",
      camera: "low angle, 24mm, subject on the left third",
      motion: "slow push-in; dust drifts right to left",
      composition: "lone figure against a lit doorway",
      lighting: "hard warm key from frame left, cool fill",
      palette: ["deep navy ground", "amber key", "teal fill"],
      rhythm: "long holds, a cut on the settle",
      durationS: 4.5,
      prompt: "wide low-angle shot, lone figure against a lit doorway, hard warm key from the left, cool teal fill",
    },
    replicas,
    ...(clip ? { clipRequested: true as const, error: "clip: the vendor refused this generation" } : {}),
  };
}

function asset(night: string, id: string): Asset3dCandidate {
  const concepts = [`assets/${id}/concept-1.png`, `assets/${id}/concept-2.png`];
  writeBytes(outFile("scout", night, concepts[0] ?? ""), standConcept("character", "canonical"));
  writeBytes(outFile("scout", night, concepts[1] ?? ""), standConcept("character", "game-camera"));
  return {
    id,
    kind: "asset3d",
    sourceIds: [],
    status: "rendered",
    jobId: `job:scout-asset:${night}:${id}`,
    brief: { class: "character", subject: "hooded archer, leather, chunky silhouette", style: "chunky game-camera read, flat leather browns", budgetTris: 40_000, rig: "ue5-mannequin" },
    concepts,
    assetId: "hooded-archer",
  };
}

function closedNight(): Night {
  const id = dayOf(DAY);
  const s1 = source(id, "s-01", "Fixture trailer one", 4);
  return {
    id,
    startedAt: at(NOW - DAY - 2 * HOUR),
    deadline: at(NOW - DAY + 6 * HOUR),
    ceilingUsd: 15,
    target: 20,
    clipCap: 2,
    assetCap: 3,
    dry: false,
    state: "closed",
    stop: "sources-exhausted",
    closedAt: at(NOW - DAY + 3 * HOUR),
    sources: [s1],
    candidates: [
      scene(id, "c-01", s1, true),
      { id: "c-02", kind: "finding", sourceIds: [s1.id], status: "rendered", template: "cinematic", step: "02-frames", claim: "Hold a wide shot until the subject settles, then cut.", quote: "the push-in only reads once the figure stops moving" },
      { id: "c-03", kind: "watch", sourceIds: [s1.id], status: "rendered", entry: "channel: Fixture Studio - https://www.youtube.com/@fixture", why: "two usable long takes in one night" },
      asset(id, "c-04"),
    ],
    jobs: ["job:run:scout-ingest:" + id, `job:scout-scene:${id}:c-01`, `job:scout-asset:${id}:c-04`],
  };
}

function committedNight(): Night {
  const id = dayOf(2 * DAY);
  const s1 = source(id, "s-01", "Fixture trailer two", 3);
  return {
    id,
    startedAt: at(NOW - 2 * DAY - 2 * HOUR),
    ceilingUsd: 15,
    target: 20,
    clipCap: 2,
    dry: false,
    state: "committed",
    stop: "target",
    closedAt: at(NOW - 2 * DAY + 4 * HOUR),
    sources: [s1],
    candidates: [
      scene(id, "c-01", s1, false),
      { id: "c-02", kind: "watch", sourceIds: [s1.id], status: "rendered", entry: "site: fixture-gallery.example", why: "one coherent look" },
    ],
    jobs: ["job:run:scout-ingest:" + id, `job:scout-scene:${id}:c-01`],
    committed: { at: at(NOW - DAY - 12 * HOUR), by: "operator", kept: ["c-01/replica-1"], rejected: ["c-01/replica-2", "c-02/text"], reasons: { "c-02/text": ["generic"] }, notes: {}, dry: false },
  };
}

export function generate(): string {
  rmSync(outFile("scout"), { recursive: true, force: true });
  const nights = [closedNight(), committedNight()];
  for (const n of nights) writeJson(outFile("scout", n.id, "night.json"), n);
  return `${nights.length} scout nights (${nights.map((n) => `${n.id} ${n.state}`).join(", ")})`;
}
