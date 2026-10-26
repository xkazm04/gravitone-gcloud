import "server-only";

import { err, ok, type Result } from "@gt/domain/errors";
import { LANE_CAPACITY } from "@gt/domain/lane";
import type { Receipt, ReceiptMode } from "@gt/domain/produce";
import { STYLE_TRIALS, blockDigest } from "@gt/domain/style.ratchet";
import type { Style } from "@gt/domain/style";
import type { StyleAct, StyleActOutcome } from "@gt/domain/styleView";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";

import { recipeSlots } from "../../../../../lib/foundry/adopt.ts";
import { actRefusal, imageOption, recognizeOption, styleJobId } from "../../../../../lib/producers/styleLaunch.ts";
import { digest } from "../../../projects/[id]/_part/hash.ts";
import { door, land, landedJob, loadStyle, recOf, type Media } from "./fixture.ts";
import { ADOPT_REPLY, ADOPT_SEEDS, DRY_GRID, presetPlate } from "./fixtureData.ts";

// A STYLE ACT IS A RECEIPT, THEN A CONFIRM (Phase 4 COMMON decision 3) - the two acts that call
// out of the studio:
//   adopt            v1 lib/foundry/adopt.ts, in place: refused for a candidate (v1's 409, kept)
//                    and for a style that already has a look; the palette is read off the first
//                    kept plate by the recognize model (priced: UNPRICED, the table's own reason),
//                    the recipe split into slots by v1's `recipeSlots` (the palette sentences
//                    dropped from finish so two palettes cannot disagree), the subject left for a
//                    person, and the kept text-lane forge plates seeded as UNDECIDED proofs that
//                    say where they came from (v1 seedProofs; never a production render).
//   generate-proofs  one plate per chosen trial under the CURRENT block, priced per image from the
//                    the real side's own option (lib/producers/styleLaunch.ts `imageOption`), each
//                    proof stamped with its trialId and blockDigest so coverage reads lineage.
// The token digests the style's rev, the act and its inputs and the mode: any write to the style
// makes an open receipt stale, and its confirm answers the fresh receipt instead of running.
// THIS SIDE IS DRY ONLY (GRAVITONE_DRY_ONLY): a live read is refused in words; a confirm lands
// the act's stand-in - the recorded palette reply, a committed grid plate - as the job would.

const DRY_ONLY = "this side runs dry only — nothing is generated live from the fixture universe";

type Basis = { readonly rev: number; readonly style: Style };

/** Why the act cannot run, in the real side's words and by its rule (the reference window counts
 *  approvals still sent, as the view's `sheet.full` does); kept = a recorded palette reply. */
const refusal = (act: StyleAct, b: Basis): string | null => actRefusal(act, b.style, ADOPT_REPLY[b.style.id] !== undefined);

/** The receipt, priced by the real side's own options (lib/producers/styleLaunch.ts: the frames
 *  catalog's Google row and the router's recognize model) through the kernel's own receipt, on an
 *  empty queue; only the token is the fixture's (a digest of the style, its rev, the act, the mode). */
function receiptOf(act: StyleAct, b: Basis, mode: ReceiptMode, now: number): Result<Receipt> {
  const day = new Date(now).toISOString().slice(0, 10);
  let lines: PlanLine[];
  if (act.kind === "adopt") {
    const option = recognizeOption(day);
    lines = [{ key: "palette", label: "palette readback", lane: option.lane, units: 1, option, after: [], order: 0, status: "pending" }];
  } else {
    const option = imageOption(day);
    if (option === undefined) return err("internal", "the frames catalog offers no Google image option to price a proof with");
    lines = act.trialIds.map((id, i) => {
      const t = STYLE_TRIALS.find((x) => x.id === id);
      return { key: id, label: `${t?.label ?? id} · ${t?.problem ?? "free"}`, lane: option.lane, units: 1, option, after: [], order: i, status: "pending" };
    });
  }
  const priced = receiptFor({ subject: { kind: "run", lane: "image" }, lines, plan: lines, queue: { others: [], digest: "" }, capacity: LANE_CAPACITY, now, mode });
  return ok({ ...priced, token: digest({ style: b.style.id, rev: b.rev, act, mode }) });
}

/** A plate's id names the receipt that made it, as the real producer's does (`pr-<token tail>-<trial>`,
 *  lib/producers/style.ts), so an id never repeats after an undecided plate leaves the sheet. */
const plateId = (token: string, trialId: string): string => `pr-${token.slice(0, 12)}-${trialId}`;

const styleIdOf = (act: StyleAct): string => (act.kind === "adopt" ? act.fromStyleId : act.styleId);

async function basis(act: StyleAct, mode: ReceiptMode, media: Media): Promise<Result<Basis>> {
  if (mode === "live") return err("refused", DRY_ONLY);
  const b = await recOf(styleIdOf(act), media);
  if (!b.ok) return b;
  // The act's baseRev is not checked here: the token digests the rev, so a confirm after any
  // write answers the FRESH receipt (and lands on a second ⏎), never a bare conflict.
  const why = refusal(act, b.value);
  return why === null ? b : err("refused", why);
}

export async function actReceipt(act: StyleAct, mode: ReceiptMode, now: number, media: Media): Promise<Result<Receipt>> {
  const b = await basis(act, mode, media);
  return b.ok ? receiptOf(act, b.value, mode, now) : b;
}

async function landed(act: StyleAct, b: Basis, at: string, token: string, media: Media): Promise<Result<Style>> {
  const s = b.style;
  if (act.kind === "adopt") {
    const palette = (ADOPT_REPLY[s.id] ?? []).map((c) => ({ ...c }));
    const { technique, finish } = recipeSlots(s.recipe);
    const seeds = [];
    for (const k of ADOPT_SEEDS[s.id] ?? []) {
      const m = await media(k.file);
      if (!m.ok) return m;
      const rel = `scenes/${k.scene}/candidates/${s.id}--text--s${k.seed}.png`;
      seeds.push({ id: `forge:${k.run}/${rel}`, label: `${k.scene} · seed ${k.seed}`, media: m.value, state: "pending" as const, model: k.model, provider: "comfy-local", source: `forge:${k.run}/${rel}`, at });
    }
    return door({ ...s, palette, block: { technique, subject: "", palette, finish }, proofs: [...s.proofs, ...seeds] });
  }
  if (s.block === undefined) return err("refused", `${s.name} has no block yet`);
  const image = imageOption(at.slice(0, 10));
  if (image === undefined) return err("internal", "the frames catalog offers no Google image option to price a proof with");
  const d = blockDigest(s.block);
  const made = [];
  for (const id of act.trialIds) {
    const t = STYLE_TRIALS.find((x) => x.id === id);
    const m = await media(presetPlate(DRY_GRID[s.id] ?? "newsprint-cutout"));
    if (!m.ok) return m;
    made.push({ id: plateId(token, id), label: `${t?.label ?? id} · dry stand-in`, media: m.value, state: "pending" as const, trialId: id, blockDigest: d, provider: "dry-run", model: image.model, costUsd: 0, at });
  }
  return door({ ...s, proofs: [...s.proofs, ...made] });
}

export async function confirmAct(act: StyleAct, mode: ReceiptMode, token: string, now: number, media: Media): Promise<Result<StyleActOutcome>> {
  // The real side's job id (lib/producers/styleLaunch.ts): a second confirm of one token - a double
  // Enter, a retried request - answers the job the first made and renders nothing more.
  const jobId = styleJobId(styleIdOf(act), token);
  if (landedJob(jobId)) {
    const v = await loadStyle(styleIdOf(act), media);
    return v.ok ? ok({ kind: "launched", jobId, view: v.value }) : v;
  }
  const b = await basis(act, mode, media);
  if (!b.ok) return b;
  const fresh = receiptOf(act, b.value, mode, now);
  if (!fresh.ok) return fresh;
  if (fresh.value.token !== token) return ok({ kind: "stale", fresh: fresh.value });
  const at = new Date(now).toISOString();
  const next = await landed(act, b.value, at, token, media);
  if (!next.ok) return next;
  const done = land(b.value.style.id, b.value.rev, next.value, at, jobId);
  return done.ok ? ok({ kind: "launched", jobId: done.value.jobId, view: done.value.view }) : done;
}
