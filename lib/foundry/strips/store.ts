// THE STRIPS DISK LAYER — server only.
//
// pipeline/strips/run.mts writes runs under foundry-out/strips/<id>/ (run.json
// plus one directory per card: strip.html, style.json, strip.mp4, strip.webm,
// poster.jpg, sheet.png, meta.json — lib/foundry/strips/types.ts draws the
// tree). This module is the app's only way to read them and the only way the
// /foundry Strips triage mutates them. Two things per run are the app's to
// write: verdicts.json, and on commit the deletions, findings.md and
// run.json's status flip. Everything else is the pipeline's.
//
// What a COMMIT is, precisely (docs/code-rendered-strips-plan.md, "The
// /foundry surface"):
//
//   KEPT      strip.html, style.json, poster.jpg and sheet.png are copied into
//             the git-tracked pipeline/foundry/motion-styles/<runId>--<cardId>/
//             and one entry joins pipeline/foundry/motion-styles.json as a
//             `candidate`. Nothing of the card is deleted.
//   REJECTED  its media (mp4, webm, poster, sheet) is deleted; strip.html,
//             style.json and meta.json stay in foundry-out for the record.
//   DECIDED   both of the above get a row in pipeline/foundry/strips-ledger.json
//             with their chips — a rejection is evidence too.
//   UNDECIDED untouched, on disk and in the indices.
//
// One catalogue transaction (lib/foundry/catalogue.ts, op "strip-commit"):
// the status check, the plan and its token, the copies, the two index writes,
// the deletions and the manifest flip all sit behind the lock the forge, the
// extractor and the Dojo commit under. Order is the forge's: keepers copied
// and indices written BEFORE anything is unlinked, so a failure before the
// deletions leaves every file where it was.
//
// Path safety: run ids pass RUN_ID_RE (runStore.ts); every run-relative path
// is resolved and held inside its run directory before it is read, served or
// unlinked; a card's files are resolved inside that card's own directory.
// strip.html is LLM-written code and is never served by the file route — only
// by GET /api/foundry/strips/<id>/page, under a sandbox CSP.

import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

import { withCatalogue } from "../catalogue";
import { foundryFs } from "../fsPort";
import {
  FoundryError,
  RUN_ID_RE,
  SERVABLE_EXTENSIONS,
  containedIn,
  foundryFile,
  listManifests,
  readJson,
  readManifestFile,
  runRoot,
  writeJsonAtomic,
} from "../runStore";
import {
  JUDGEABLE,
  STRIP_CHIPS_MAX,
  STRIP_COMMITTABLE,
  STRIP_NOTE_MAX,
  type MotionStyleEntry,
  type StripCommitPlan,
  type StripCommitResult,
  type StripLedgerRow,
  type StripRunDetail,
  type StripRunSummary,
} from "./triage";
import { STRIP_CHIPS, type Approach, type StripCard, type StripChip, type StripRun, type StripVerdict, type StripVerdicts } from "./types";

const OUT_ROOT = path.join(process.cwd(), "foundry-out", "strips");
/** Repo-relative, forward slashes on every OS — what the index records. */
const MOTION_STYLES_REL = "pipeline/foundry/motion-styles";

/** The file route serves these for strips and nothing else: the image/json set
 *  every kind serves, plus the two video encodings. Never .html. */
const STRIP_SERVABLE = new Set([...SERVABLE_EXTENSIONS, ".mp4", ".webm"]);

/** The card files a kept strip carries into git. */
const KEEP_FILES = ["html", "style", "poster", "sheet"] as const;
/** The card files a rejected strip loses. */
const MEDIA_FILES = ["mp4", "webm", "poster", "sheet"] as const;

function runDir(id: string): string {
  return runRoot(OUT_ROOT, id, "strip run");
}

/** A card's own directory, held inside its run. */
function cardDir(id: string, card: StripCard): string {
  return containedIn(runDir(id), card.id, false, "strip run");
}

/** A card-relative file, held inside the card's directory. */
function cardFile(id: string, card: StripCard, rel: string): string {
  return containedIn(cardDir(id, card), rel, false, "card");
}

export async function readStripRun(id: string): Promise<StripRun> {
  const m = await readManifestFile<StripRun>(path.join(runDir(id), "run.json"), id, "strip run");
  if (m === undefined)
    throw new FoundryError(
      `The manifest of strip run ${id} is unreadable — the pipeline may be mid-write, or the file is damaged. Try again; if it persists, inspect foundry-out/strips/${id}/run.json.`,
      503,
    );
  if (!m) throw new FoundryError(`No strip run called ${id}.`, 404);
  return m;
}

async function readStripVerdicts(id: string): Promise<StripVerdicts> {
  return readJson<StripVerdicts>(path.join(runDir(id), "verdicts.json"), {});
}

const isDecided = (v: StripVerdict | undefined): v is StripVerdict => v?.verdict === "keep" || v?.verdict === "reject";

/* ── reads ────────────────────────────────────────────────────────────────── */

export async function listStripRuns(): Promise<StripRunSummary[]> {
  const { items } = await listManifests<StripRun, StripRunSummary>(OUT_ROOT, "run.json", async (name, m) => {
    const v = await readJson<StripVerdicts>(path.join(OUT_ROOT, name, "verdicts.json"), {}).catch(() => ({}) as StripVerdicts);
    const cards = Array.isArray(m.cards) ? m.cards : [];
    const lane = (l: "edu" | "stat") => {
      const cs = cards.filter((c) => c.lane === l);
      return { cards: cs.length, rendered: cs.filter((c) => c.status === "rendered").length };
    };
    const known = new Set(cards.map((c) => c.id));
    const decided = Object.entries(v).filter(([k, x]) => known.has(k) && isDecided(x));
    return {
      id: m.id ?? name,
      at: m.at,
      status: m.status,
      lanes: { edu: lane("edu"), stat: lane("stat") },
      cards: cards.length,
      decided: decided.length,
      kept: decided.filter(([, x]) => x.verdict === "keep").length,
    };
  });
  return items.sort((a, b) => (a.at < b.at ? 1 : -1));
}

export async function getStripRun(id: string): Promise<StripRunDetail> {
  const [run, verdicts] = await Promise.all([readStripRun(id), readStripVerdicts(id)]);
  return { run, verdicts };
}

/** Resolve a run-relative file for the file route: contained, and a servable
 *  extension for strips (images, json, mp4, webm — never the page). */
export async function stripFileStat(id: string, rel: string): Promise<{ abs: string; size: number }> {
  const abs = containedIn(runDir(id), rel, false, "strip run");
  if (!STRIP_SERVABLE.has(path.extname(abs).toLowerCase())) throw new FoundryError("Not a servable file.", 400);
  try {
    const s = await stat(abs);
    if (!s.isFile()) throw new Error("not a file");
    return { abs, size: s.size };
  } catch {
    throw new FoundryError("No such file in the strip run.", 404);
  }
}

/** The authored page of one card, for the sandboxed page route only. */
export async function stripPageFile(id: string, cardId: string): Promise<string> {
  const run = await readStripRun(id);
  const card = run.cards.find((c) => c.id === cardId);
  if (!card) throw new FoundryError(`Strip run ${id} has no card ${cardId}.`, 404);
  const rel = card.files.html ?? "strip.html";
  const abs = cardFile(id, card, rel);
  if (path.extname(abs).toLowerCase() !== ".html") throw new FoundryError("Not a strip page.", 400);
  try {
    if (!(await stat(abs)).isFile()) throw new Error("not a file");
  } catch {
    throw new FoundryError(`Card ${cardId} has no page on disk.`, 404);
  }
  return abs;
}

/* ── verdicts ─────────────────────────────────────────────────────────────── */

const CHIP_SET = new Set<string>(STRIP_CHIPS);

/** Validate the whole map against the run, or refuse it whole. Unlike the
 *  Dojo's (which drops what it cannot read), a strip verdict carries chips and
 *  a note, and a silently dropped chip is a learning signal lost with a 200. */
export function cleanStripVerdicts(run: StripRun, input: unknown): StripVerdicts {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FoundryError("Verdicts must be an object keyed by card id.", 400);
  const cards = new Map(run.cards.map((c) => [c.id, c]));
  const out: StripVerdicts = {};
  for (const [cid, raw] of Object.entries(input as Record<string, unknown>)) {
    const card = cards.get(cid);
    if (!card) throw new FoundryError(`Strip run ${run.id} has no card ${cid}.`, 400);
    if (raw === null) continue; // cleared
    if (!raw || typeof raw !== "object") throw new FoundryError(`Verdict for ${cid} is not an object.`, 400);
    const r = raw as Record<string, unknown>;
    if (r.verdict !== "keep" && r.verdict !== "reject") throw new FoundryError(`Verdict for ${cid} must be keep or reject.`, 400);
    if (!JUDGEABLE.includes(card.status)) throw new FoundryError(`Card ${cid} is ${card.status}; only a rendered strip takes a verdict.`, 400);
    const v: StripVerdict = { verdict: r.verdict, at: typeof r.at === "string" && r.at ? r.at : new Date().toISOString() };
    if (r.chips !== undefined) {
      if (!Array.isArray(r.chips)) throw new FoundryError(`Chips for ${cid} must be a list.`, 400);
      const bad = r.chips.find((c) => typeof c !== "string" || !CHIP_SET.has(c));
      if (bad !== undefined) throw new FoundryError(`Unknown reason chip "${String(bad)}" on ${cid}; the set is ${STRIP_CHIPS.join(", ")}.`, 400);
      const chips = [...new Set(r.chips as StripChip[])];
      if (chips.length > STRIP_CHIPS_MAX) throw new FoundryError(`At most ${STRIP_CHIPS_MAX} reason chips per strip; ${cid} has ${chips.length}.`, 400);
      if (chips.length) v.chips = chips;
    }
    if (r.note !== undefined && r.note !== null) {
      if (typeof r.note !== "string") throw new FoundryError(`Note for ${cid} must be text.`, 400);
      if (r.note.length > STRIP_NOTE_MAX) throw new FoundryError(`Note for ${cid} is ${r.note.length} characters; the limit is ${STRIP_NOTE_MAX}.`, 400);
      if (r.note.trim()) v.note = r.note;
    }
    out[cid] = v;
  }
  return out;
}

/** Replace the verdict map. Whole-map on purpose, like the cull's: the tab
 *  autosaves after every decision, and a last-writer-wins replace of one small
 *  file cannot half-apply. */
export async function putStripVerdicts(id: string, input: unknown): Promise<StripVerdicts> {
  const run = await readStripRun(id);
  if (run.status === "committed") throw new FoundryError("This strip run is committed; its verdicts are final.", 409);
  const clean = cleanStripVerdicts(run, input);
  await writeJsonAtomic(path.join(runDir(id), "verdicts.json"), clean);
  return clean;
}

/* ── the commit ───────────────────────────────────────────────────────────── */

const styleIdOf = (runId: string, cardId: string) => `${runId}--${cardId}`;

function approachOf(run: StripRun, card: StripCard): Approach | undefined {
  return run.approaches.find((a) => a.id === card.approach);
}

/** Pure projection of what `commitStripRun` will do. */
export function planStripCommit(run: StripRun, verdicts: StripVerdicts): StripCommitPlan {
  const kept = run.cards.filter((c) => verdicts[c.id]?.verdict === "keep");
  const rejected = run.cards.filter((c) => verdicts[c.id]?.verdict === "reject");
  const del: string[] = [];
  for (const c of rejected)
    for (const k of MEDIA_FILES) {
      const rel = c.files[k];
      if (rel) del.push(`${c.id}/${rel}`);
    }
  const verdictPayload = Object.keys(verdicts)
    .sort()
    .map((k) => `${k}:${verdicts[k]?.verdict}:${(verdicts[k]?.chips ?? []).join(",")}:${verdicts[k]?.note ?? ""}`)
    .join("|");
  const cardPayload = run.cards.map((c) => `${c.id}:${c.status}:${Object.keys(c.files).sort().join(",")}`).join("|");
  const token = createHash("sha256").update(`${run.id}:${run.status}:${verdictPayload}:${cardPayload}`).digest("hex");
  return {
    counts: { kept: kept.length, rejected: rejected.length, undecided: run.cards.length - kept.length - rejected.length },
    styles: kept.map((c) => styleIdOf(run.id, c.id)),
    delete: del,
    token,
  };
}

export async function previewStripCommit(id: string): Promise<StripCommitPlan> {
  const [run, verdicts] = await Promise.all([readStripRun(id), readStripVerdicts(id)]);
  return planStripCommit(run, verdicts);
}

/** The keep-rate table: one line per attribute value, n beside every rate. */
export function stripFindings(run: StripRun, verdicts: StripVerdicts, at: string): string {
  const decided = run.cards.filter((c) => isDecided(verdicts[c.id]));
  const kept = decided.filter((c) => verdicts[c.id].verdict === "keep");
  const rows: string[] = [];
  rows.push(`# Strips findings — ${run.id}`, "");
  rows.push(`Committed ${at}. ${run.cards.length} card(s), ${decided.length} decided, ${kept.length} kept.`, "");

  const attr = (title: string, of: (c: StripCard) => string | undefined) => {
    const groups = new Map<string, { n: number; k: number }>();
    for (const c of decided) {
      const key = of(c) ?? "—";
      const g = groups.get(key) ?? { n: 0, k: 0 };
      g.n++;
      if (verdicts[c.id].verdict === "keep") g.k++;
      groups.set(key, g);
    }
    rows.push(`## ${title}`, "");
    if (!groups.size) rows.push("- nothing decided", "");
    for (const [key, g] of [...groups].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))) {
      rows.push(`- ${key}: ${g.k}/${g.n} kept (${Math.round((100 * g.k) / g.n)}%, n=${g.n})`);
    }
    rows.push("");
  };
  const ap = (c: StripCard) => approachOf(run, c);
  const control = (c: StripCard) => c.approach === "CTRL";
  attr("lane", (c) => c.lane);
  attr("kind", (c) => (control(c) ? "control" : c.replicaOf ? "replica" : "original"));
  attr("medium", (c) => (control(c) ? "control" : ap(c)?.medium));
  attr("motion grammar", (c) => (control(c) ? "control" : ap(c)?.grammar));
  attr("density", (c) => (control(c) ? "control" : ap(c)?.density));
  attr("seat (stat lane)", (c) => (c.lane !== "stat" ? undefined : control(c) ? "control" : (ap(c)?.seat ?? "unset")));
  attr("leonardo asset", (c) => (control(c) ? "control" : ap(c)?.leonardo));
  attr("fix rounds", (c) => String(c.rounds));
  attr("all four gates passed", (c) => (!c.gates ? "ungated" : Object.values(c.gates).every((g) => g.ok) ? "yes" : "no"));

  rows.push("## reason chips", "");
  const chipRows = STRIP_CHIPS.map((chip) => {
    const on = decided.filter((c) => verdicts[c.id].chips?.includes(chip));
    const k = on.filter((c) => verdicts[c.id].verdict === "keep").length;
    return { chip, n: on.length, k };
  }).filter((r) => r.n > 0);
  if (!chipRows.length) rows.push("- no chips cast");
  for (const r of chipRows) rows.push(`- ${r.chip}: on ${r.n} card(s) — ${r.k} kept, ${r.n - r.k} rejected (n=${r.n})`);
  rows.push("");

  if (run.discrimination && Object.keys(run.discrimination).length) {
    rows.push("## replica discrimination", "");
    for (const [a, d] of Object.entries(run.discrimination)) rows.push(`- ${a}: ${d.toFixed(2)}${d >= 1.5 ? "" : " (below 1.5 — picks only)"}`);
    rows.push("");
  }

  const notes = decided.filter((c) => verdicts[c.id].note);
  if (notes.length) {
    rows.push("## notes", "");
    for (const c of notes) rows.push(`- ${c.id} (${verdicts[c.id].verdict}): ${verdicts[c.id].note}`);
    rows.push("");
  }
  const undecided = run.cards.filter((c) => !isDecided(verdicts[c.id]));
  rows.push(`Undecided (untouched): ${undecided.length}${undecided.length ? ` (${undecided.map((c) => c.id).join(", ")})` : ""}.`, "");
  return rows.join("\n");
}

/** Copy the kept into git, delete the rejected media, append the ledger, flip
 *  the run. DESTRUCTIVE and one-way for the rejected; see the header. */
export async function commitStripRun(id: string, token?: string): Promise<StripCommitResult> {
  const dir = runDir(id);
  return withCatalogue({ op: "strip-commit", run: id }, async (tx) => {
    const fs = foundryFs();
    const run = await readStripRun(id);
    if (run.status === "committed") throw new FoundryError("This strip run is already committed.", 409);
    if (!STRIP_COMMITTABLE.includes(run.status)) throw new FoundryError("The pipeline is still running this strip run.", 409);
    const verdicts = await readStripVerdicts(id);
    const plan = planStripCommit(run, verdicts);
    if (token !== undefined && token !== plan.token) throw new FoundryError("The run state changed since the preview was generated.", 409);

    const at = new Date().toISOString();
    const decided = run.cards.filter((c) => isDecided(verdicts[c.id]));
    const kept = decided.filter((c) => verdicts[c.id].verdict === "keep");
    const rejected = decided.filter((c) => verdicts[c.id].verdict === "reject");

    // (1) Keepers into git first.
    const entries: MotionStyleEntry[] = [];
    for (const c of kept) {
      const sid = styleIdOf(id, c.id);
      if (!RUN_ID_RE.test(sid)) throw new FoundryError(`Style id ${sid} is not a safe directory name.`, 400);
      const dst = foundryFile(path.join("motion-styles", sid));
      await fs.mkdir(dst);
      const files: MotionStyleEntry["files"] = {};
      for (const k of KEEP_FILES) {
        const rel = c.files[k];
        if (!rel) continue;
        const name = path.basename(rel);
        await fs.copyFile(cardFile(id, c, rel), path.join(dst, name));
        files[k] = `${MOTION_STYLES_REL}/${sid}/${name}`;
      }
      const v = verdicts[c.id];
      const ap = approachOf(run, c);
      entries.push({
        id: sid,
        name: c.approach === "CTRL" ? `${c.case} control` : (ap?.name ?? c.approach),
        lane: c.lane,
        case: c.case,
        approach: c.approach,
        status: "candidate",
        origin: { kind: "code", run: id, card: c.id },
        chips: v.chips ?? [],
        ...(v.note ? { note: v.note } : {}),
        ...(c.gates ? { gates: c.gates } : {}),
        files,
      });
    }

    // (2) The indices. A run's entries and rows are REPLACED, never appended
    //     twice: a retried commit converges on the uninterrupted result.
    const styles = await tx.read("motion-styles.json");
    const ledger = await tx.read("strips-ledger.json");
    await tx.begin(entries.map((e) => e.id));
    styles.styles = (styles.styles ?? []).filter((s) => s.origin?.run !== id).concat(entries);
    styles._rev = tx.revision ?? styles._rev;
    ledger.rows = (ledger.rows ?? []).filter((r) => r.run !== id);
    for (const c of decided) {
      const v = verdicts[c.id];
      const row: StripLedgerRow = { run: id, card: c.id, approach: c.approach, lane: c.lane, case: c.case, verdict: v.verdict, chips: v.chips ?? [], at: v.at || at };
      if (v.note) row.note = v.note;
      ledger.rows.push(row);
    }
    await tx.write("motion-styles.json");
    await tx.write("strips-ledger.json");
    await tx.stamp();

    // (3) The rejected lose their media — only AFTER the indices landed. An
    //     absent file counts as deleted (an earlier attempt of this commit).
    let deleted = 0;
    for (const c of rejected) {
      for (const k of MEDIA_FILES) {
        const rel = c.files[k];
        if (!rel) continue;
        try {
          await fs.unlink(cardFile(id, c, rel));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
        delete c.files[k];
        deleted++;
      }
    }

    // (4) Findings, then the manifest flip — last, so a retry still sees a
    //     committable run.
    const findings = stripFindings(run, verdicts, at);
    await fs.writeFile(path.join(dir, "findings.md"), findings);
    run.status = "committed";
    await fs.writeJsonAtomic(path.join(dir, "run.json"), run);

    return {
      kept: kept.length,
      rejected: rejected.length,
      undecided: run.cards.length - decided.length,
      deleted,
      styles: entries.map((e) => e.id),
      ledgerRows: decided.length,
      findings,
    };
  });
}
