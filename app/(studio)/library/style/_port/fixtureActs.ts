import "server-only";

import { err, ok, type Result } from "@gt/domain/errors";
import type { Receipt, ReceiptLine, ReceiptMode } from "@gt/domain/produce";
import { STYLE_TRIALS, blockDigest } from "@gt/domain/style.ratchet";
import type { Style } from "@gt/domain/style";
import type { StyleAct, StyleActOutcome } from "@gt/domain/styleView";
import { quote } from "@gt/kernel/pricing/quote";

import { recipeSlots } from "../../../../../lib/foundry/adopt.ts";
import { digest } from "../../../projects/[id]/_part/hash.ts";
import { door, land, recOf, type Media } from "./fixture.ts";
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
//                    kernel table (google gemini-3.1-flash-image at 1K, $0.045 measured), each
//                    proof stamped with its trialId and blockDigest so coverage reads lineage.
// The token digests the style's rev, the act and its inputs and the mode: any write to the style
// makes an open receipt stale, and its confirm answers the fresh receipt instead of running.
// THIS SIDE IS DRY ONLY (GRAVITONE_DRY_ONLY): a live read is refused in words; a confirm lands
// the act's stand-in - the recorded palette reply, a committed grid plate - as the job would.

const IMAGE = { provider: "google", model: "gemini-3.1-flash-image", size: "1K" } as const;
const RECOGNIZE = { provider: "google", model: "gemini-3.6-flash" } as const;
/** Fixture-assumed durations (no measurement behind them): the receipt marks them illustrative. */
const IMAGE_S = 20;
const RECOGNIZE_S = 8;
const DRY_ONLY = "this side runs dry only — nothing is generated live from the fixture universe";

type Basis = { readonly rev: number; readonly style: Style };

function line(key: string, label: string, p: { readonly provider: string; readonly model: string }, seconds: number, startMs: number, q: ReturnType<typeof quote>): ReceiptLine {
  return {
    key,
    label,
    lane: "cloud.google",
    provider: p.provider,
    model: p.model,
    units: 1,
    seconds,
    usd: q.usd,
    ...(q.usd === null ? { unpricedReason: q.note } : {}),
    src: "illustrative",
    queuePos: 1,
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + seconds * 1000).toISOString(),
  };
}

function refusal(act: StyleAct, b: Basis): string | null {
  if (act.kind === "adopt") {
    if (b.style.block !== undefined) return `${b.style.name} already has a look — duplicate it to start another`;
    if (b.style.status !== "proven") return `${b.style.name} is a ${b.style.status}; only a proven style is adopted`;
    return ADOPT_REPLY[b.style.id] === undefined ? `${b.style.name} has no kept plate to read a palette from` : null;
  }
  if (b.style.block === undefined) return `${b.style.name} has no block yet — adopt it or write its four slots first`;
  const unknown = act.trialIds.filter((t) => !STYLE_TRIALS.some((x) => x.id === t));
  if (unknown.length > 0) return `no trial ${unknown.join(", ")}`;
  const approved = b.style.proofs.filter((p) => p.state === "approved").length;
  if (approved >= 14) return "the reference window is full — reject an approval to make room";
  return null;
}

function receiptOf(act: StyleAct, b: Basis, mode: ReceiptMode, now: number): Receipt {
  const lines: ReceiptLine[] = [];
  if (act.kind === "adopt") {
    lines.push(line("palette", "palette readback", RECOGNIZE, RECOGNIZE_S, now, quote({ ...RECOGNIZE, usage: { "input-token": 1, "output-token": 1 }, on: new Date(now).toISOString() })));
  } else {
    let at = now;
    for (const id of act.trialIds) {
      const t = STYLE_TRIALS.find((x) => x.id === id);
      lines.push(line(id, `${t?.label ?? id} · ${t?.problem ?? "free"}`, IMAGE, IMAGE_S, at, quote({ ...IMAGE, usage: { image: 1 }, on: new Date(now).toISOString() })));
      at += IMAGE_S * 1000;
    }
  }
  const seconds = lines.reduce((a, l) => a + l.seconds, 0);
  const unpriced = lines.filter((l) => l.usd === null).length;
  const usd = Math.round(lines.reduce((a, l) => a + (l.usd ?? 0), 0) * 1000) / 1000;
  const end = new Date(now + seconds * 1000).toISOString();
  return {
    token: digest({ style: b.style.id, rev: b.rev, act, mode }),
    subject: { kind: "run", lane: "image" },
    mode,
    lines,
    totals: { seconds, usd, unpriced, src: "illustrative" },
    queuePos: 1,
    etaAt: end,
    overCeiling: false,
    readAt: new Date(now).toISOString(),
  };
}

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
  return b.ok ? ok(receiptOf(act, b.value, mode, now)) : b;
}

async function landed(act: StyleAct, b: Basis, at: string, media: Media): Promise<Result<Style>> {
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
  const d = blockDigest(s.block);
  const made = [];
  let n = s.proofs.length;
  for (const id of act.trialIds) {
    const t = STYLE_TRIALS.find((x) => x.id === id);
    const m = await media(presetPlate(DRY_GRID[s.id] ?? "newsprint-cutout"));
    if (!m.ok) return m;
    n += 1;
    made.push({ id: `pr-${s.id}-${n}`, label: `${t?.label ?? id} · dry stand-in`, media: m.value, state: "pending" as const, trialId: id, blockDigest: d, provider: "dry-run", model: IMAGE.model, costUsd: 0, at });
  }
  return door({ ...s, proofs: [...s.proofs, ...made] });
}

export async function confirmAct(act: StyleAct, mode: ReceiptMode, token: string, now: number, media: Media): Promise<Result<StyleActOutcome>> {
  const b = await basis(act, mode, media);
  if (!b.ok) return b;
  const fresh = receiptOf(act, b.value, mode, now);
  if (fresh.token !== token) return ok({ kind: "stale", fresh });
  const at = new Date(now).toISOString();
  const next = await landed(act, b.value, at, media);
  if (!next.ok) return next;
  const done = land(b.value.style.id, b.value.rev, next.value, at);
  return done.ok ? ok({ kind: "launched", jobId: done.value.jobId, view: done.value.view }) : done;
}
