import "server-only";

import { stat } from "node:fs/promises";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import type { Decision } from "@gt/domain/decision";
import { err, ok, type Result } from "@gt/domain/errors";
import { SOURCES } from "@gt/domain/source";
import type { ApplyClaim } from "@gt/kernel/decision/apply";
import type { InitialDecision } from "@gt/kernel/decision/driver";
import type { ItemWords, RowWords } from "@gt/ui/board/port";

import { commitStripRun, getStripRun, patchStripVerdicts, planStripCommit, previewStripCommit, stripFileStat, stripsRoot } from "../../../foundry/strips/store.ts";
import { JUDGEABLE, STRIP_COMMITTABLE } from "../../../foundry/strips/triage.ts";
import { STRIP_CHIPS, type StripCard, type StripChip, type StripRun, type StripVerdict, type StripVerdicts } from "../../../foundry/strips/types.ts";
import { packetIdOf } from "../../../ledger/v1/packet.ts";
import {
  buildConsequence,
  byOf,
  candidateOf,
  committedOutcome,
  decisionMap,
  foundryFileUrl,
  instantOr,
  mediaRef,
  mintPacket,
  runIdOf,
  sameVerdict,
  v1Call,
  v1DigestOf,
  type AdapterRef,
  type DecisionAdapter,
  type DecisionsAt,
  type Loss,
  type OpenPlan,
  type Preview,
} from "../types.ts";

// THE STRIPS TRIAGE AS A PACKET - foundry-out/strips/<id>/ (pipeline/strips/
// run.mts) read through getStripRun, decided as a matrix cull with v1's
// reason chips, committed through v1's own `patchStripVerdicts` then
// `commitStripRun`.
//
// Absorbed: only a `rendered` card is judgeable (triage.ts JUDGEABLE, the
// same rule cleanStripVerdicts refuses on); STRIP_CHIPS are the reasons, at
// most three (STRIP_CHIPS_MAX), in their own order - @gt/domain/source holds
// the same list, so a chip is a reason with no mapping; the blast radius is
// planStripCommit (copies into git, ledger rows, the rejected media deleted);
// v1's refuse-don't-trim validation still runs on apply (cleanStripVerdicts).
// Upgraded: v1 let a KEEP carry chips; the kernel's door gives reasons to a
// reject only, so a keep's chips ride in its note, disclosed as a loss, and go
// back to v1 as chips when the operator leaves the verdict as it was. Rows are
// the brief a card renders (`case`), the subject the cards are compared on.
// Dropped: nothing. A card that is not rendered is not in the packet and v1's
// commit leaves it undecided and untouched, as v1 always did.

const SPEC = SOURCES.strips;
const CHIPS: ReadonlySet<string> = new Set<string>(STRIP_CHIPS);

export type StripsV1 = {
  readonly run: StripRun;
  readonly verdicts: StripVerdicts;
  readonly rev: number;
  /** By card id: the playback file's content address. A rendered card absent here has no file on disk. */
  readonly media: Readonly<Record<string, BlobRef>>;
  readonly verdictsAt: string;
};

/** The file the grid plays: the webm copy, else the mp4 master, else the poster (triage.ts header). */
function playback(c: StripCard): string | undefined {
  const rel = c.files.webm ?? c.files.mp4 ?? c.files.poster;
  return rel === undefined ? undefined : `${c.id}/${rel}`;
}

const rendered = (run: StripRun): StripCard[] => run.cards.filter((c) => JUDGEABLE.includes(c.status));

/* ── read ──────────────────────────────────────────────────────────────────── */

async function read(ref: AdapterRef): Promise<Result<StripsV1>> {
  const id = ref.runId;
  const detail = await v1Call(() => getStripRun(id));
  if (!detail.ok) return detail;
  const { run, verdicts, rev } = detail.value;
  const media: Record<string, BlobRef> = {};
  for (const c of rendered(run)) {
    const rel = playback(c);
    if (rel === undefined) continue;
    // v1's own resolver: contained in the run, and a servable extension.
    const at = await v1Call(() => stripFileStat(id, rel));
    if (!at.ok) {
      if (at.error.code === "not-found") continue;
      return at;
    }
    const ref = await mediaRef(at.value.abs);
    if (ref.ok) media[c.id] = ref.value;
    else if (ref.error.code !== "not-found") return ref;
  }
  const map = await v1Call(() => stripFileStat(id, "verdicts.json"));
  const verdictsAt = map.ok ? await stat(map.value.abs).then((s) => s.mtime.toISOString(), () => instantOr(run.at, new Date(0).toISOString()).at) : instantOr(run.at, new Date(0).toISOString()).at;
  return ok({ run, verdicts, rev, media, verdictsAt });
}

/* ── v1 verdict <-> kernel decision ────────────────────────────────────────── */

type Imported = { readonly verdict: "keep" | "reject"; readonly reasons: readonly string[]; readonly note?: string; readonly moved: readonly string[] };

/** v1's verdict as the kernel takes it. A reject's chips are its reasons; a keep's chips stay in the note's first line. */
export function importVerdict(v: StripVerdict): Imported {
  const chips = (v.chips ?? []).filter((c) => CHIPS.has(c));
  const reasons: readonly string[] = v.verdict === "reject" ? SPEC.reasons.filter((r) => chips.includes(r as StripChip)) : [];
  const moved = v.verdict === "reject" ? [] : chips;
  const note = [moved.length > 0 ? `chips: ${moved.join(", ")}` : "", v.note ?? ""].filter((s) => s.trim() !== "").join("\n");
  return { verdict: v.verdict, reasons, ...(note === "" ? {} : { note }), moved };
}

function recordOf(d: Decision): StripVerdict {
  const chips = STRIP_CHIPS.filter((c) => d.reasons.includes(c));
  return { verdict: d.verdict === "keep" ? "keep" : "reject", at: d.at, ...(chips.length > 0 ? { chips } : {}), ...(d.note === undefined ? {} : { note: d.note }) };
}

/* ── packet ────────────────────────────────────────────────────────────────── */

function refusal(run: StripRun): string | undefined {
  // v1's own sentences (lib/foundry/strips/store.ts commitStripRun).
  if (run.status === "committed") return "This strip run is already committed.";
  if (!STRIP_COMMITTABLE.includes(run.status)) return "The pipeline is still running this strip run.";
  if (run.dry === true) return "This strip run was a dry job: its pages are stand-ins and nothing was captured. It cannot be committed.";
  return undefined;
}

const judgeable = (v1: StripsV1): StripCard[] => rendered(v1.run).filter((c) => v1.media[c.id] !== undefined);

function labelOf(run: StripRun, c: StripCard): ItemWords {
  const ap = run.approaches.find((a) => a.id === c.approach);
  const gates = c.gates ? Object.values(c.gates) : [];
  const passed = gates.filter((g) => g.ok).length;
  const kind = c.approach === "CTRL" ? "control" : c.replicaOf ? `replica of ${c.replicaOf}` : (ap?.medium ?? c.approach);
  return {
    label: c.approach === "CTRL" ? `${c.case} control` : (ap?.name ?? c.approach),
    meta: `${c.lane} · ${kind}${ap ? ` · ${ap.grammar}` : ""}${gates.length > 0 ? ` · gates ${passed}/${gates.length}` : ""}`,
    ...(ap ? { prompt: ap.direction } : {}),
  };
}

function packet(v1: StripsV1): Result<OpenPlan> {
  const { run } = v1;
  const no = refusal(run);
  if (no !== undefined) return err("refused", `strip run ${run.id}: ${no}`);
  const losses: Loss[] = [];
  for (const c of rendered(run)) if (v1.media[c.id] === undefined) losses.push({ candidate: c.id, grade: "dropped", reason: `card ${c.id} has no playable file on disk; it stays undecided in v1` });
  const cards = judgeable(v1);
  if (cards.length === 0) return err("refused", `strip run ${run.id} has no rendered strip to judge`);
  const jobId = `strips:${run.id}`;
  const minted = mintPacket({
    id: packetIdOf("strips", run.id),
    // The strips are clips: the Floor's video lane, as the projection files them (lib/ledger/v1/sources/strips.ts).
    lane: "video",
    source: "strips",
    mode: "matrix-cull",
    state: "open",
    runId: run.id,
    title: `strips ${run.id}`,
    items: cards.map((c) => ({ id: c.id, jobId, media: v1.media[c.id], row: c.case, grades: [] })),
  });
  if (!minted.ok) return minted;

  const initial: InitialDecision[] = [];
  for (const c of cards) {
    const v = v1.verdicts[c.id];
    if (v === undefined || (v.verdict !== "keep" && v.verdict !== "reject")) continue;
    const imp = importVerdict(v);
    const when = instantOr(v.at, v1.verdictsAt);
    if (imp.moved.length > 0) losses.push({ candidate: c.id, grade: "approximate", reason: `v1 chips on a keep (${imp.moved.join(", ")}) ride in the note; only a reject carries reasons` });
    if (!when.exact) losses.push({ candidate: c.id, grade: "approximate", reason: "v1 recorded no readable instant; the verdict map's write time stands in" });
    // StripVerdict has no `by`: every v1 strip verdict was cast in the triage by hand.
    initial.push({ candidate: c.id, verdict: imp.verdict, reasons: imp.reasons, ...(imp.note === undefined ? {} : { note: imp.note }), by: byOf(undefined), surface: "v1", at: when.at });
  }

  const cases = [...new Set(cards.map((c) => c.case))];
  const rows: RowWords[] = cases.map((k) => ({ id: k, label: k }));
  const items: Record<string, ItemWords> = {};
  const urls: Record<string, string> = {};
  for (const c of cards) {
    items[c.id] = labelOf(run, c);
    urls[c.id] = foundryFileUrl(run.id, playback(c) ?? c.id, "strips");
  }
  const gated = cards.filter((c) => c.gates !== undefined);
  const allPass = gated.filter((c) => c.gates !== undefined && Object.values(c.gates).every((g) => g.ok)).length;
  const failed = run.cards.filter((c) => c.status !== "rendered" && c.status !== "pending").length;
  return ok({
    packet: minted.value,
    initial,
    present: {
      items,
      rows,
      oracle: { passed: failed === 0 && allPass === gated.length, summary: `${cards.length} strips · ${allPass}/${gated.length} pass all four gates · ${failed} failed to render` },
      meta: `strips · ${cases.length} brief(s) · ${run.id}`,
    },
    urls,
    losses,
  });
}

/* ── consequence ───────────────────────────────────────────────────────────── */

function effectiveVerdicts(v1: StripsV1, at: DecisionsAt, items: ReadonlySet<string>): StripVerdicts {
  const out: StripVerdicts = {};
  for (const [k, v] of Object.entries(v1.verdicts)) if (!items.has(k)) out[k] = v;
  for (const d of decisionMap(at.decisions).values()) {
    const id = candidateOf(d);
    if (items.has(id) && d.verdict !== null) out[id] = writtenOf(v1.verdicts[id], d);
  }
  return out;
}

/** What apply leaves in v1 for one card: v1's own record when the decision is still the imported one. */
function writtenOf(current: StripVerdict | undefined, d: Decision): StripVerdict {
  return current !== undefined && sameVerdict(importVerdict(current), d) ? current : recordOf(d);
}

function digestOf(v1: StripsV1): string {
  return v1DigestOf({ source: "strips", run: v1.run.id, token: planStripCommit(v1.run, v1.verdicts).token, media: Object.entries(v1.media).map(([k, b]) => [k, b.sha256]).sort() });
}

function consequence(v1: StripsV1, at: DecisionsAt): Result<Preview> {
  const no = refusal(v1.run);
  if (no !== undefined) return err("refused", `strip run ${v1.run.id}: ${no}`);
  const cards = judgeable(v1);
  const ids = new Set(cards.map((c) => c.id));
  const verdicts = effectiveVerdicts(v1, at, ids);
  const plan = planStripCommit(v1.run, verdicts);
  // The universe's own root (store.ts `stripsRoot`, Phase 4 L33), repo-relative as the consequence names it.
  const runRel = (rel: string) => `${path.relative(process.cwd(), stripsRoot()).replace(/\\/g, "/")}/${v1.run.id}/${rel}`;
  const keptCards = v1.run.cards.filter((c) => verdicts[c.id]?.verdict === "keep");
  const decided = v1.run.cards.filter((c) => verdicts[c.id] !== undefined);
  const v1Digest = digestOf(v1);
  return ok({
    v1Digest,
    consequence: buildConsequence(at, [...ids], {
      deletes: plan.delete.map((rel) => ({ target: runRel(rel), candidate: rel.slice(0, rel.indexOf("/")), detail: "rejected strip's media" })),
      writes: [
        ...keptCards.flatMap((c) =>
          (["html", "style", "poster", "sheet"] as const)
            .filter((k) => c.files[k] !== undefined)
            .map((k) => ({ kind: "file" as const, target: `pipeline/foundry/motion-styles/${v1.run.id}--${c.id}/${(c.files[k] ?? "").split("/").pop() ?? ""}`, candidate: c.id, detail: `copied: ${k}` })),
        ),
        ...keptCards.map((c) => ({ kind: "index-row" as const, target: "pipeline/foundry/motion-styles.json", candidate: c.id, detail: `${v1.run.id}--${c.id}: a candidate motion style` })),
        ...decided.map((c) => ({ kind: "index-row" as const, target: "pipeline/foundry/strips-ledger.json", candidate: c.id, detail: `${verdicts[c.id]?.verdict ?? ""}${(verdicts[c.id]?.chips ?? []).length > 0 ? ` · ${(verdicts[c.id]?.chips ?? []).join(", ")}` : ""}` })),
        { kind: "file" as const, target: runRel("findings.md") },
        { kind: "file" as const, target: runRel("run.json"), detail: "status committed" },
      ],
      promotions: plan.styles.map((s) => ({ target: s, candidate: s.slice(v1.run.id.length + 2), detail: "joins motion-styles.json as a candidate" })),
    }, v1Digest),
  });
}

/* ── apply ─────────────────────────────────────────────────────────────────── */

async function apply(claim: ApplyClaim): Promise<Result<void>> {
  const done = committedOutcome(claim);
  if (!done.ok) return done;
  const runId = runIdOf(claim);
  if (!runId.ok) return runId;
  const id = runId.value;
  const fresh = await v1Call(() => getStripRun(id));
  if (!fresh.ok) return fresh;
  const { run, verdicts, rev } = fresh.value;
  const items = new Set<string>(claim.packet.items.map((c) => c.id));
  const final = [...decisionMap(claim.decisions).values()].filter((d) => items.has(candidateOf(d)));

  if (run.status === "committed") {
    const differ = final.filter((d) => d.verdict !== null && verdicts[candidateOf(d)]?.verdict !== d.verdict);
    if (differ.length === 0) return ok(undefined);
    return err("refused", `strip run ${id} was committed in v1 with other verdicts: ${differ.map((d) => `${candidateOf(d)} is ${verdicts[candidateOf(d)]?.verdict ?? "undecided"} in v1, ${d.verdict} here`).join("; ")}`);
  }

  const set: Record<string, StripVerdict> = {};
  const clear: string[] = [];
  for (const d of final) {
    const c = candidateOf(d);
    const current = verdicts[c];
    if (d.verdict === null) {
      if (current !== undefined) clear.push(c);
      continue;
    }
    const next = writtenOf(current, d);
    if (next !== current) set[c] = next;
  }
  if (Object.keys(set).length > 0 || clear.length > 0) {
    const patched = await v1Call(() => patchStripVerdicts(id, { set, clear, baseRev: rev, by: "human", surface: "board" }));
    if (!patched.ok) return patched;
  }
  const plan = await v1Call(() => previewStripCommit(id));
  if (!plan.ok) return plan;
  const committed = await v1Call(() => commitStripRun(id, plan.value.token));
  return committed.ok ? ok(undefined) : committed;
}

export const stripsAdapter: DecisionAdapter<StripsV1> = { source: "strips", read, packet, consequence, apply };
