import "server-only";

import type { BlobRef } from "@gt/domain/blob";
import { err, ok, type Result } from "@gt/domain/errors";
import { blockDigest, ratchetBlocker } from "@gt/domain/style.ratchet";
import type { Style } from "@gt/domain/style";
import { styleView, summaryOfView, type StyleOpOutcome, type StyleOpRequest, type StyleSummary, type StyleView } from "@gt/domain/styleView";
import { planOp, withStatus } from "@gt/kernel/styles/core";
import { admit } from "@gt/kernel/styles/driver";

import { SEEDS, type Seed } from "./fixtureData.ts";

// THE FIXTURE STYLE STORE - one revisioned record per style, in memory, written by the kernel's
// OWN pure op core (@gt/kernel/styles/core `planOp`) through its door (`admit`) and the ratchet -
// the same three the real side's driver runs inside its transaction, so the fixture cannot drift
// from the store (L51 kept a twin, ./apply.ts; wave B L54 retired it). The rules (COMMON 1-3):
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

/** When and by whom an op is made (the lock's `by`, every judgement's evidence row). */
export type Who = { readonly at: string; readonly by: string };

/** Any plain shape of a style through the store's door, its status derived first. */
export function door<T extends Parameters<typeof withStatus>[0]>(draft: T): Result<Style> {
  return admit(withStatus(draft));
}

type Rec = { rev: number; style: Style; at: string };
/** `jobs`: the job ids acts have landed as (one confirm, one job - a second confirm finds it). */
type World = { readonly styles: Map<string, Rec>; readonly jobs: Set<string>; seeded: boolean };

declare global {
  var __gtStyleFixture: World | undefined;
}

const world = (): World => (globalThis.__gtStyleFixture ??= { styles: new Map(), jobs: new Set(), seeded: false });

/** Start the style universe over (the live lane's reset, beside `resetProduce`). */
export function resetStyles(): void {
  globalThis.__gtStyleFixture = { styles: new Map(), jobs: new Set(), seeded: false };
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

const viewOfRec = (r: Rec): StyleView => styleView(r.style, r.rev, r.at);

export async function loadStyle(id: string, media: Media): Promise<Result<StyleView>> {
  const w = await seeded(media);
  if (!w.ok) return w;
  const r = w.value.styles.get(id);
  return r === undefined ? err("not-found", `no style ${id}`) : ok(viewOfRec(r));
}

export async function listStyles(media: Media): Promise<Result<readonly StyleSummary[]>> {
  const w = await seeded(media);
  if (!w.ok) return w;
  return ok([...w.value.styles.values()].map((r) => summaryOfView(viewOfRec(r))));
}

export async function opStyle(req: StyleOpRequest, who: Who, media: Media): Promise<Result<StyleOpOutcome>> {
  const w = await seeded(media);
  if (!w.ok) return w;
  const r = w.value.styles.get(req.styleId);
  if (r === undefined) return err("not-found", `no style ${req.styleId}`);
  if (r.rev !== req.baseRev) return ok({ kind: "conflict", view: viewOfRec(r) });
  const planned = planOp(r.style, req.op, { at: who.at, by: who.by, taken: (id) => w.value.styles.has(id) });
  if (!planned.ok) return planned.error.code === "refused" ? ok({ kind: "refused", reason: planned.error.message, view: viewOfRec(r) }) : planned;
  const next = admit(planned.value.next);
  if (!next.ok) return next;
  if (planned.value.created) {
    const made: Rec = { rev: 1, style: next.value, at: who.at };
    w.value.styles.set(next.value.id, made);
    return ok({ kind: "applied", view: viewOfRec(made), created: next.value.id });
  }
  const blocked = ratchetBlocker(r.style, next.value);
  if (blocked !== null) return ok({ kind: "refused", reason: blocked, view: viewOfRec(r) });
  r.style = next.value;
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

/** Whether an act's job has landed already (its confirm is answered by that job, not run again). */
export const landedJob = (jobId: string): boolean => world().jobs.has(jobId);

/** An act's landing as job `jobId`: one write through the door at the rev the act was priced against. */
export function land(id: string, rev: number, next: Style, at: string, jobId: string): Result<{ readonly view: StyleView; readonly jobId: string }> {
  const w = world();
  const r = w.styles.get(id);
  if (r === undefined) return err("not-found", `no style ${id}`);
  if (r.rev !== rev) return err("conflict", `${r.style.name} changed while the act was priced — read its receipt again`);
  // The ratchet holds on a landing as on an op (the real driver's putStyleIn runs it on every write).
  const blocked = ratchetBlocker(r.style, next);
  if (blocked !== null) return err("refused", blocked);
  r.style = next;
  r.rev += 1;
  r.at = at;
  w.jobs.add(jobId);
  return ok({ view: viewOfRec(r), jobId });
}
