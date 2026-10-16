import "server-only";

import type { BlobRef } from "@gt/domain/blob";
import { err, ok, type Result } from "@gt/domain/errors";
import { blockDigest } from "@gt/domain/style.ratchet";
import type { Style } from "@gt/domain/style";
import type { StyleOpOutcome, StyleOpRequest, StyleSummary, StyleView } from "@gt/domain/styleView";

import { applyOp, door, type Who } from "./apply.ts";
import { SEEDS, type Seed } from "./fixtureData.ts";
import { summaryOf, viewOf } from "./view.ts";

// THE FIXTURE STYLE STORE - one revisioned record per style, in memory, with the rules the
// kernel's `styles` module keeps for the real side (COMMON decisions 1-3):
//   · every op names the rev it was made against; a stale one writes nothing and answers the
//     view as it is now (`conflict`), the part driver's shape;
//   · every write passes the record's door (status re-derived, never written by a caller) and the
//     ratchet (`refused`, in its own words, writes nothing);
//   · a duplicate is a new record at rev 1, named by a fresh id;
//   · acts (./fixtureActs.ts) land through `land`, one write each, like a job's landing.
// Pictures are blobs: each seed file is put into the kernel's content-addressed store once, so
// the atelier draws `/api/blob/<sha>` exactly as it will on the real side. State is on globalThis
// for the server process, like the produce and part fixtures.

/** A public file as a blob; injected so a test needs no kernel. */
export type Media = (file: string) => Promise<Result<BlobRef>>;

type Rec = { rev: number; style: Style; at: string };
type World = { readonly styles: Map<string, Rec>; seq: number; seeded: boolean };

declare global {
  var __gtStyleFixture: World | undefined;
}

const world = (): World => (globalThis.__gtStyleFixture ??= { styles: new Map(), seq: 0, seeded: false });

/** Start the style universe over (the live lane's reset, beside `resetProduce`). */
export function resetStyles(): void {
  globalThis.__gtStyleFixture = { styles: new Map(), seq: 0, seeded: false };
}

async function recordOf(seed: Seed, media: Media): Promise<Result<Style>> {
  const digest = seed.block === undefined ? undefined : blockDigest(seed.block);
  const { proofs, exemplars, block, ...rest } = seed;
  const { kind, models, ...originRest } = seed.origin;
  const outProofs = [];
  for (const { file, digest: d, ...p } of proofs) {
    const m = await media(file);
    if (!m.ok) return m;
    outProofs.push({ ...p, media: m.value, ...(d === undefined ? {} : { blockDigest: d === "current" ? (digest ?? d) : d }) });
  }
  const outExemplars = [];
  for (const { file, ...x } of exemplars) {
    const m = await media(file);
    if (!m.ok) return m;
    outExemplars.push({ ...x, media: m.value });
  }
  return door({
    ...rest,
    origin: { kind, ...originRest, ...(models === undefined ? {} : { models: [...models] }) },
    observables: { ...seed.observables },
    elements: [...seed.elements],
    evidence: [...seed.evidence],
    ...(block === undefined ? {} : { block, palette: block.palette }),
    exemplars: outExemplars,
    proofs: outProofs,
  });
}

async function seeded(media: Media): Promise<Result<World>> {
  const w = world();
  if (w.seeded) return ok(w);
  for (const seed of SEEDS) {
    const r = await recordOf(seed, media);
    if (!r.ok) return err(r.error.code, `fixture seed ${seed.id}: ${r.error.message}`);
    w.styles.set(seed.id, { rev: 1, style: r.value, at: seed.lock?.at ?? seed.proofs.at(-1)?.at ?? "2026-08-27T07:13:28.768Z" });
  }
  w.seeded = true;
  return ok(w);
}

const viewOfRec = (r: Rec): StyleView => viewOf(r.style, r.rev, r.at);

export async function loadStyle(id: string, media: Media): Promise<Result<StyleView>> {
  const w = await seeded(media);
  if (!w.ok) return w;
  const r = w.value.styles.get(id);
  return r === undefined ? err("not-found", `no style ${id}`) : ok(viewOfRec(r));
}

export async function listStyles(media: Media): Promise<Result<readonly StyleSummary[]>> {
  const w = await seeded(media);
  if (!w.ok) return w;
  return ok([...w.value.styles.values()].map((r) => summaryOf(viewOfRec(r))));
}

function freshId(w: World, base: string): string {
  for (let n = 1; ; n++) {
    const id = `${base}-copy${n === 1 ? "" : `-${n}`}`;
    if (!w.styles.has(id)) return id;
  }
}

export async function opStyle(req: StyleOpRequest, who: Who, media: Media): Promise<Result<StyleOpOutcome>> {
  const w = await seeded(media);
  if (!w.ok) return w;
  const r = w.value.styles.get(req.styleId);
  if (r === undefined) return err("not-found", `no style ${req.styleId}`);
  if (r.rev !== req.baseRev) return ok({ kind: "conflict", view: viewOfRec(r) });
  const done = applyOp(r.style, req.op, who, () => freshId(w.value, r.style.id));
  if (!done.ok) return done;
  if (done.value.kind === "refused") return ok({ kind: "refused", reason: done.value.reason, view: viewOfRec(r) });
  const { next, created } = done.value;
  if (created !== undefined) {
    w.value.styles.set(created.id, { rev: 1, style: created, at: who.at });
    return ok({ kind: "applied", view: viewOfRec(r), created: created.id });
  }
  r.style = next;
  r.rev += 1;
  r.at = who.at;
  return ok({ kind: "applied", view: viewOfRec(r) });
}

/** The record an act reads, with its revision (./fixtureActs.ts prices and lands against it). */
export async function recOf(id: string, media: Media): Promise<Result<{ readonly rev: number; readonly style: Style }>> {
  const w = await seeded(media);
  if (!w.ok) return w;
  const r = w.value.styles.get(id);
  return r === undefined ? err("not-found", `no style ${id}`) : ok({ rev: r.rev, style: r.style });
}

/** An act's landing: one write through the door at the rev the act was priced against. */
export function land(id: string, rev: number, next: Style, at: string): Result<{ readonly view: StyleView; readonly jobId: string }> {
  const w = world();
  const r = w.styles.get(id);
  if (r === undefined) return err("not-found", `no style ${id}`);
  if (r.rev !== rev) return err("conflict", `${r.style.name} changed while the act was priced — read its receipt again`);
  r.style = next;
  r.rev += 1;
  r.at = at;
  w.seq += 1;
  return ok({ view: viewOfRec(r), jobId: `job:style-${id}-${w.seq}` });
}
