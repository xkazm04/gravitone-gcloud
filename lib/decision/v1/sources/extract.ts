import "server-only";

import { stat } from "node:fs/promises";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import type { Grade } from "@gt/domain/candidate";
import type { Decision } from "@gt/domain/decision";
import { err, ok, type Result } from "@gt/domain/errors";
import { SOURCES } from "@gt/domain/source";
import type { ApplyClaim } from "@gt/kernel/decision/apply";
import type { InitialDecision } from "@gt/kernel/decision/driver";
import type { ItemWords, RowWords } from "@gt/ui/board/port";

import { planExtractCommit } from "../../../foundry/commitPlan.ts";
import { commitExtractRun, EXTRACT_ROOT, getExtractRun, patchExtractVerdicts, previewExtractCommit, resolveInExtract } from "../../../foundry/extract/store.ts";
import type { ExtractManifest, ExtractVerdictRecord, ExtractVerdicts, ExtractedStyle } from "../../../foundry/extract/types.ts";
import { foundryFs } from "../../../foundry/fsPort.ts";
import { EXTRACT_COMMITTABLE } from "../../../foundry/plant.ts";
import { foundryFile } from "../../../foundry/runStore.ts";
import type { StyleDef } from "../../../foundry/types.ts";
import { packetIdOf } from "../../../ledger/v1/packet.ts";
import {
  buildConsequence,
  byOf,
  candidateOf,
  committedOutcome,
  decisionMap,
  foundryFileUrl,
  fromV1,
  instantOr,
  mediaRefs,
  mintPacket,
  runIdOf,
  v1By,
  v1Call,
  v1DigestOf,
  type AdapterRef,
  type DecisionAdapter,
  type DecisionsAt,
  type Loss,
  type OpenPlan,
  type Preview,
} from "../types.ts";

// THE EXTRACTOR'S CULL AS A PACKET - foundry-out/extract/<id>/ (lib/foundry/
// extract) read through getExtractRun, decided as a matrix cull, committed
// back through v1's own `patchExtractVerdicts` then `commitExtractRun`.
//
// THE SHAPE. A row is a LOOK (one ExtractedStyle): its reference is the
// gallery source it was read from (RowWords.ref - input, never output), and
// its cells are what the recipe PRODUCED - the best round of each replica and
// each transfer, the images v1's Board showed beside the source. v1 decides
// the look whole (verdicts.json is keyed by style id), so the look's verdict
// is read off its cells: KEPT when any of its images is kept (the recipe
// produces the style somewhere), REJECTED when every image is. A rejected
// image inside a kept look is still an exemplar in v1's catalogue (commit
// writes every replica and transfer); the consequence says so on that image
// rather than letting the operator believe the reject removed it.
//
// Absorbed: v1's verdict record (reasons + note, `by`), planExtractCommit's
// renames and near-duplicates as the blast radius, v1's refusal to commit a
// run with nothing kept ("Keep at least one style first.") - kept as a
// preview refusal, so the commit the operator confirms is one v1 will take.
// Upgraded: reasons are SENT now (the Board's extract source wrote bare
// keep/reject, lib/board/verdicts.ts withExtractVerdict); v1's free tags are
// mapped onto the extract reason list where a tag names one, and the rest kept
// in the note and disclosed as a loss - the kernel refuses unknown reasons.

const SPEC = SOURCES.extract;

export type ExtractV1 = {
  readonly run: ExtractManifest;
  readonly verdicts: ExtractVerdicts;
  readonly rev: number;
  /** pipeline/foundry/styles.json: the catalogue a commit writes into. */
  readonly catalogue: { readonly styles: readonly StyleDef[] };
  /** By run-relative file: the content address of every image a cell or a row may show. */
  readonly media: Readonly<Record<string, BlobRef>>;
  readonly verdictsAt: string;
};

/** One image a look produced, as a packet cell. */
type Cell = { readonly id: string; readonly look: string; readonly file: string; readonly role: "replica" | "transfer" | "source"; readonly score: number | null; readonly label: string; readonly prompt?: string };

/** The best round of a replica: the highest-scoring one with a file (commitExtractRun's own pick). */
function bestRound(r: ExtractedStyle["replicas"][number]) {
  return [...r.rounds].filter((x) => x.file).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
}

/** A look's cells. A look that drew nothing shows its first gallery source, disclosed. */
function cellsOf(run: ExtractManifest, s: ExtractedStyle): Cell[] {
  const out: Cell[] = [];
  s.replicas.forEach((r, i) => {
    const best = bestRound(r);
    if (best?.file) out.push({ id: `${s.id}/replica-${i + 1}`, look: s.id, file: best.file, role: "replica", score: best.score, label: `replica of ${r.source}`, prompt: best.prompt });
  });
  s.transfers.forEach((t, i) => {
    if (t.file) out.push({ id: `${s.id}/transfer-${i + 1}`, look: s.id, file: t.file, role: "transfer", score: t.score, label: `transfer · ${t.brief}`, prompt: t.prompt });
  });
  if (out.length === 0) {
    const src = s.members.map((m) => run.sources.find((x) => x.id === m)).find((x) => x?.file);
    if (src) out.push({ id: `${s.id}/source`, look: s.id, file: src.file, role: "source", score: null, label: `gallery ${src.name}` });
  }
  return out;
}

/** Every file the packet may draw: cells and the row references. */
function filesOf(run: ExtractManifest): string[] {
  const files = new Set<string>();
  for (const s of run.styles) {
    for (const c of cellsOf(run, s)) files.add(c.file);
    const src = refSource(run, s);
    if (src) files.add(src);
  }
  return [...files];
}

const refSource = (run: ExtractManifest, s: ExtractedStyle): string | undefined => s.members.map((m) => run.sources.find((x) => x.id === m)?.file).find((f): f is string => !!f);

/* ── read ──────────────────────────────────────────────────────────────────── */

async function read(ref: AdapterRef): Promise<Result<ExtractV1>> {
  const id = ref.runId;
  const detail = await v1Call(() => getExtractRun(id));
  if (!detail.ok) return detail;
  const catalogue = await v1Call(() => foundryFs().readJson<{ styles: StyleDef[] }>(foundryFile("styles.json"), { styles: [] }));
  if (!catalogue.ok) return catalogue;
  const { run, verdicts, rev } = detail.value;
  const files: { key: string; abs: string }[] = [];
  for (const f of filesOf(run)) {
    try {
      files.push({ key: f, abs: resolveInExtract(id, f) });
    } catch (e) {
      return fromV1(e);
    }
  }
  const media = await mediaRefs(files);
  if (!media.ok) return media;
  const verdictsAt = await stat(path.join(EXTRACT_ROOT, id, "verdicts.json")).then(
    (s) => s.mtime.toISOString(),
    () => instantOr(run.finished, instantOr(run.created, new Date(0).toISOString()).at).at,
  );
  return ok({ run, verdicts, rev: rev ?? 0, catalogue: { styles: catalogue.value.styles ?? [] }, media: Object.fromEntries(media.value), verdictsAt });
}

/* ── v1 verdict <-> kernel decision ────────────────────────────────────────── */

type Imported = { readonly verdict: "keep" | "reject"; readonly reasons: readonly string[]; readonly note?: string; readonly lost: readonly string[]; readonly cut: boolean };

/** v1's record as the kernel takes it: tags that name an extract reason become reasons (on a reject); the rest stay in the note. */
export function importVerdict(rec: ExtractVerdictRecord): Imported {
  const tags = (rec.reasons ?? []).map((t) => t.trim()).filter((t) => t !== "");
  const named = new Set(tags.map((t) => t.toLowerCase()));
  const reasons: readonly string[] = rec.verdict === "reject" ? SPEC.reasons.filter((r) => named.has(r)) : [];
  const lost = tags.filter((t) => !reasons.includes(t.toLowerCase()));
  const text = [lost.length > 0 ? `tags: ${lost.join(", ")}` : "", rec.note ?? ""].filter((s) => s.trim() !== "").join("\n");
  const cut = text.length > SPEC.noteMax;
  const note = cut ? `${text.slice(0, SPEC.noteMax - 1)}…` : text;
  return { verdict: rec.verdict, reasons, ...(note === "" ? {} : { note }), lost, cut };
}

type LookDecision = { readonly verdict: "keep" | "reject" | null; readonly reasons: readonly string[]; readonly note?: string; readonly by: Decision["by"]; readonly at: string };

/** A look's verdict from its cells' decisions: kept when any is kept, rejected when every one is. */
export function lookDecision(all: readonly (Decision | undefined)[], order: readonly string[] = SPEC.reasons): LookDecision {
  const cells = all.filter((d): d is Decision => d !== undefined);
  const decided = cells.filter((d) => d.verdict !== null);
  const latest = [...cells].sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const by = cells.some((d) => d.by === "operator") ? "operator" : "agent";
  const at = latest?.at ?? new Date(0).toISOString();
  if (decided.length < all.length || all.length === 0) return { verdict: null, reasons: [], by, at };
  const notes = [...new Set(cells.map((d) => d.note).filter((n): n is string => n !== undefined))];
  const note = notes.join("\n");
  if (cells.some((d) => d.verdict === "keep")) return { verdict: "keep", reasons: [], ...(note === "" ? {} : { note }), by, at };
  const reasons = order.filter((r) => cells.some((d) => d.reasons.includes(r)));
  return { verdict: "reject", reasons, ...(note === "" ? {} : { note }), by, at };
}

const same = (a: { verdict: string | null; reasons: readonly string[]; note?: string }, b: { verdict: string | null; reasons: readonly string[]; note?: string }): boolean =>
  a.verdict === b.verdict && a.reasons.join("\u0000") === b.reasons.join("\u0000") && (a.note ?? "") === (b.note ?? "");

function recordOf(d: LookDecision): ExtractVerdictRecord {
  return { verdict: d.verdict === "keep" ? "keep" : "reject", at: d.at, ...(d.reasons.length > 0 ? { reasons: [...d.reasons] } : {}), ...(d.note === undefined ? {} : { note: d.note }), by: v1By(d.by) };
}

/* ── packet ────────────────────────────────────────────────────────────────── */

function refusal(run: ExtractManifest): string | undefined {
  // v1's own sentences (lib/foundry/extract/store.ts commitExtractRun).
  if (run.status === "committed") return "This run is already committed.";
  if (!EXTRACT_COMMITTABLE.includes(run.status)) return "The extract is still running this run.";
  // Since L29 the writer marks a run whose vendor calls were stand-ins; v1's commit refuses it.
  if (run.dry === true) return "This run was dry: its images are stand-ins, and a dry run is never committed.";
  return undefined;
}

/** The cells the packet holds: those whose image is on disk. */
function judgeable(v1: ExtractV1): Cell[] {
  return v1.run.styles.flatMap((s) => cellsOf(v1.run, s)).filter((c) => v1.media[c.file] !== undefined);
}

const takenBy = (catalogue: ExtractV1["catalogue"], run: ExtractManifest, id: string): boolean => catalogue.styles.some((s) => s.id === id && s.origin?.source !== run.id);

function packet(v1: ExtractV1): Result<OpenPlan> {
  const { run } = v1;
  const no = refusal(run);
  if (no !== undefined) return err("refused", `extract run ${run.id}: ${no}`);
  const losses: Loss[] = [];
  const all = run.styles.flatMap((s) => cellsOf(run, s));
  for (const c of all) if (v1.media[c.file] === undefined) losses.push({ candidate: c.id, grade: "dropped", reason: `${c.file} is not on disk` });
  for (const c of all) if (c.role === "source") losses.push({ candidate: c.id, grade: "approximate", reason: `look ${c.look} drew no replica or transfer; its gallery source stands in` });
  const cells = judgeable(v1);
  if (cells.length === 0) return err("refused", `extract run ${run.id} has no look with an image on disk to judge`);
  const looks = new Set(cells.map((c) => c.look));
  for (const s of run.styles) if (!looks.has(s.id)) losses.push({ candidate: s.id, grade: "dropped", reason: `look ${s.id} has no image on disk; it stays undecided in v1` });

  const jobId = `extract:${run.id}`;
  const grade = (c: Cell): Grade[] =>
    c.score === null || c.role === "source" ? [] : [{ field: `${c.role}_score`, value: c.score, series: run.engines.vision ?? "unknown", calibration: { status: "insufficient", short: "floor", nKeep: 0, nReject: 0 } }];
  const minted = mintPacket({
    id: packetIdOf("extract", run.id),
    lane: "image",
    source: "extract",
    mode: "matrix-cull",
    state: "open",
    runId: run.id,
    title: `extract ${run.slug}`,
    items: cells.map((c) => ({ id: c.id, jobId, media: v1.media[c.file], row: c.look, grades: grade(c) })),
  });
  if (!minted.ok) return minted;

  const initial: InitialDecision[] = [];
  for (const look of looks) {
    const rec = v1.verdicts[look];
    if (rec === undefined || (rec.verdict !== "keep" && rec.verdict !== "reject")) continue;
    const imp = importVerdict(rec);
    const when = instantOr(rec.at, v1.verdictsAt);
    if (imp.lost.length > 0) losses.push({ candidate: look, grade: "approximate", reason: `v1 tag(s) ${imp.lost.join(", ")} are not extract reasons; kept in the note` });
    if (imp.cut) losses.push({ candidate: look, grade: "approximate", reason: `v1's note is longer than ${SPEC.noteMax} characters; the packet holds it cut` });
    if (!when.exact) losses.push({ candidate: look, grade: "approximate", reason: "v1 recorded no readable instant; the verdict map's write time stands in" });
    // v1 decided the look whole: every image of it carries the look's verdict.
    for (const c of cells.filter((x) => x.look === look)) {
      initial.push({ candidate: c.id, verdict: imp.verdict, reasons: imp.reasons, ...(imp.note === undefined ? {} : { note: imp.note }), by: byOf(rec.by), surface: "v1", at: when.at });
    }
  }

  const rows: RowWords[] = run.styles
    .filter((s) => looks.has(s.id))
    .map((s) => {
      const src = refSource(run, s);
      return { id: s.id, label: `${s.name} · ${s.family}`, ...(src ? { ref: foundryFileUrl(run.id, src, "extract") } : {}), inCatalogue: takenBy(v1.catalogue, run, s.id) };
    });
  const items: Record<string, ItemWords> = {};
  const urls: Record<string, string> = {};
  for (const c of cells) {
    const score = c.score === null ? "" : ` · ${Math.round(c.score * 100)}%`;
    items[c.id] = { label: c.label, meta: `${c.role}${score}`, ...(c.prompt ? { prompt: c.prompt } : {}) };
    urls[c.id] = foundryFileUrl(run.id, c.file, "extract");
  }
  const failed = run.styles.reduce((n, s) => n + s.transfers.filter((t) => t.error).length + s.replicas.reduce((m, r) => m + r.rounds.filter((x) => x.error).length, 0), 0);
  return ok({
    packet: minted.value,
    initial,
    present: {
      items,
      rows,
      oracle: { passed: failed === 0 && run.status === "done", summary: `${looks.size} looks · ${cells.length} images · ${failed} failed unit(s)${run.stopped ? ` · stopped by ${run.stopped.by}` : ""}` },
      meta: `extract · ${run.slug} · ${run.sources.length} sources`,
    },
    urls,
    losses,
  });
}

/* ── consequence ───────────────────────────────────────────────────────────── */

/** Each look's decision, from the kernel's decisions on its cells. */
function looksOf(v1: ExtractV1, decisions: readonly Decision[]): Map<string, LookDecision> {
  const byCell = decisionMap(decisions);
  const cells = judgeable(v1);
  const out = new Map<string, LookDecision>();
  for (const look of new Set(cells.map((c) => c.look))) {
    out.set(look, lookDecision(cells.filter((c) => c.look === look).map((c) => byCell.get(c.id))));
  }
  return out;
}

function effectiveVerdicts(v1: ExtractV1, looks: ReadonlyMap<string, LookDecision>): ExtractVerdicts {
  const out: ExtractVerdicts = {};
  for (const [k, rec] of Object.entries(v1.verdicts)) if (!looks.has(k)) out[k] = rec;
  for (const [k, d] of looks) if (d.verdict !== null) out[k] = recordOf(d);
  return out;
}

function digestOf(v1: ExtractV1): string {
  const own = planExtractCommit(v1.run, v1.verdicts, { styles: [...v1.catalogue.styles] });
  return v1DigestOf({ source: "extract", run: v1.run.id, token: own.token, media: Object.entries(v1.media).map(([k, b]) => [k, b.sha256]).sort() });
}

function consequence(v1: ExtractV1, at: DecisionsAt): Result<Preview> {
  const no = refusal(v1.run);
  if (no !== undefined) return err("refused", `extract run ${v1.run.id}: ${no}`);
  const looks = looksOf(v1, at.decisions);
  const plan = planExtractCommit(v1.run, effectiveVerdicts(v1, looks), { styles: [...v1.catalogue.styles] });
  const cells = judgeable(v1);
  const every = new Set(at.decisions.filter((d) => d.verdict !== null).map(candidateOf));
  // v1 refuses a commit that keeps nothing; the preview refuses it first, in v1's words.
  if (plan.counts.kept === 0 && cells.every((c) => every.has(c.id))) return err("invalid", "Keep at least one style first.");
  const byCell = decisionMap(at.decisions);
  const v1Digest = digestOf(v1);
  const runRel = (rel: string) => `foundry-out/extract/${v1.run.id}/${rel}`;
  return ok({
    v1Digest,
    consequence: buildConsequence(at, cells.map((c) => c.id), {
      writes: [
        ...plan.written.map((w) => ({ kind: "index-row" as const, target: "pipeline/foundry/styles.json", candidate: w.from, detail: `${w.to}: a candidate style with its exemplars` })),
        ...cells
          .filter((c) => looks.get(c.look)?.verdict === "keep" && byCell.get(c.id)?.verdict === "reject")
          .map((c) => ({ kind: "index-row" as const, target: "pipeline/foundry/styles.json", candidate: c.id, detail: `still an exemplar of ${c.look}: v1 keeps a look whole` })),
        { kind: "file" as const, target: runRel("verdicts.json") },
        { kind: "file" as const, target: runRel("run.json"), detail: "status committed" },
      ],
      promotions: plan.written.map((w) => ({ target: w.to, candidate: w.from, detail: "joins the catalogue as a candidate" })),
      renames: plan.written.filter((w) => w.from !== w.to).map((w) => ({ from: w.from, to: w.to })),
      nearDuplicates: Object.entries(plan.similar).flatMap(([candidate, of]) => of.map((o) => ({ candidate, of: o }))),
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
  const fresh = await v1Call(() => getExtractRun(id));
  if (!fresh.ok) return fresh;
  const { run, verdicts } = fresh.value;
  // The looks, from the packet's own cells (ids are `<look>/<cell>`).
  const cellsByLook = new Map<string, (Decision | undefined)[]>();
  const byCell = decisionMap(claim.decisions);
  for (const item of claim.packet.items) {
    const look = item.row ?? item.id.slice(0, item.id.lastIndexOf("/"));
    cellsByLook.set(look, [...(cellsByLook.get(look) ?? []), byCell.get(item.id)]);
  }
  // A look with an undecided cell is undecided (lookDecision reads a missing row as one).
  const looks = new Map([...cellsByLook].map(([look, ds]) => [look, lookDecision(ds)]));

  if (run.status === "committed") {
    const kept = new Set(run.committed?.kept ?? []);
    const differ = [...looks].filter(([look, d]) => d.verdict !== null && (d.verdict === "keep") !== kept.has(look));
    if (differ.length === 0) return ok(undefined);
    return err("refused", `extract run ${id} was committed in v1 with other verdicts: ${differ.map(([look, d]) => `${look} is ${kept.has(look) ? "kept" : "not kept"} in v1, ${d.verdict} here`).join("; ")}`);
  }

  const set: Record<string, ExtractVerdictRecord> = {};
  const clear: string[] = [];
  for (const [look, d] of looks) {
    const current = verdicts[look];
    if (d.verdict === null) {
      if (current !== undefined) clear.push(look);
      continue;
    }
    if (current !== undefined && same(importVerdict(current), d)) continue;
    set[look] = recordOf(d);
  }
  if (Object.keys(set).length > 0 || clear.length > 0) {
    const patched = await v1Call(() => patchExtractVerdicts(id, { set, clear, baseRev: fresh.value.rev ?? 0, by: "human", surface: "board" }));
    if (!patched.ok) return patched;
  }
  const plan = await v1Call(() => previewExtractCommit(id));
  if (!plan.ok) return plan;
  const committed = await v1Call(() => commitExtractRun(id, { token: plan.value.token }));
  return committed.ok ? ok(undefined) : committed;
}

export const extractAdapter: DecisionAdapter<ExtractV1> = { source: "extract", read, packet, consequence, apply };
