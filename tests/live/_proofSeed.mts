// THE PROOF + FRAMES UNIVERSE for tests/live/proof-frames.live.spec.ts (Phase 5, L56): into the
// kernel store named on the command line - never the operator's - one v1 theme imported through
// the importer's own door (`importV1ThemeIn`, id `v1-theme:th-live`) with one approval and three
// proofs pending, their bytes the committed preset thumbnails; and one project bound to that
// style with a frames part holding two picture units. Prints what it seeded, as JSON.
//
//   node tests/live/_proofSeed.mts <store.sqlite>

import { readFileSync } from "node:fs";
import path from "node:path";

const storePath = process.argv[2];
if (storePath === undefined || storePath.endsWith(path.join("foundry-out", "gravitone.sqlite"))) {
  console.error("usage: node tests/live/_proofSeed.mts <a temp store.sqlite> (never the operator's store)");
  process.exit(2);
}

const { PRESETS } = await import("../../packages/catalog/src/presets.ts");
const { ok } = await import("../../packages/domain/src/errors.ts");
const { blockDigest } = await import("../../packages/domain/src/style.ratchet.ts");
const { blobStore } = await import("../../packages/kernel/src/blob.ts");
const { openKernel } = await import("../../packages/kernel/src/kernel.ts");
const { writePart } = await import("../../packages/kernel/src/parts/driver.ts");
const { compose } = await import("../../packages/kernel/src/records/write.ts");
const { draftFromV1Theme, importV1ThemeIn } = await import("../../packages/kernel/src/styles/v1theme.ts");

const OP = { kind: "operator", id: "op-live" } as const;
const STYLE = "v1-theme:th-live";
const PROJECT = "proof-frames";

function must<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

const k = must(openKernel(storePath));
const blobs = blobStore(path.join(path.dirname(storePath), "blobs"));
const block = PRESETS[1]?.block;
if (block === undefined) throw new Error("the catalog needs a second preset");
const digest = blockDigest(block);
const day = (d: number) => Date.parse(`2026-09-${String(d).padStart(2, "0")}T10:00:00.000Z`);

const pictures: Record<string, string> = { a1: "blueprint.jpg", p1: "chalk-argument.jpg", p2: "data-neon.jpg", p3: "newsprint-cutout.jpg" };
type BlobRef = import("../../packages/domain/src/blob.ts").BlobRef;
const media = new Map<string, BlobRef>();
for (const [id, file] of Object.entries(pictures)) media.set(id, must(await blobs.put(new Uint8Array(readFileSync(path.join(process.cwd(), "public", "presets", file))), "image/jpeg")));

const proof = (id: string, state: string, trialId: string, d: number) => ({ id, label: `proof ${id}`, state, trialId, blockDigest: digest, createdAt: day(d), model: "nb2", costUsd: 0.039 });
const theme = {
  id: "th-live",
  name: "Live Ink",
  origin: "preset",
  presetId: PRESETS[1]?.id,
  block,
  elements: [],
  createdAt: day(1),
  updatedAt: day(4),
  proofs: [proof("a1", "approved", "peak-and-fall", 1), proof("p1", "pending", "wish-list", 2), proof("p2", "pending", "booking-not-meal", 3), proof("p3", "pending", "flywheel", 4)],
};
const draft = must(draftFromV1Theme(theme, (id) => media.get(id)));
must(k.store.tx((t) => importV1ThemeIn(t, draft, OP)));

const unit = (id: string, at: string) => ({
  id, sourceId: "r1", beatRef: { at }, ordinal: 1, ofBeat: 1, startS: 0, holdS: 5, kind: "beat", beatKind: "hook", title: `beat ${id}`, line: "a line",
  plate: { subject: `a wide quiet field of soft shapes, ${id}`, state: "empty" },
  clip: { status: "not-started", motion: "" }, elements: [], texts: [],
});
must(compose(k.store, { recipe: "film/short-educational-video", styleId: STYLE }, OP, { id: PROJECT }));
must(writePart(k.store, { projectId: PROJECT, partId: `${PROJECT}/frames`, baseRev: "current", act: "land", op: { seed: true }, label: "seed", by: { kind: "machine", id: "live-seed" }, next: () => ok({ frames: { units: [unit("u1", "0:00"), unit("u2", "0:05")], renderId: "r1" } }) }));
k.close();
console.log(JSON.stringify({ style: STYLE, project: PROJECT, pending: ["p1", "p2", "p3"] }));
