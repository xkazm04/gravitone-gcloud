import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Style } from "@gt/domain/style";
import type { Reader, Store } from "../store.ts";
import { catalogueRevIn, listStylesIn } from "./driver.ts";

// THE GIT EXPORT - pipeline/foundry/styles.json as a PROJECTION of the store (Phase 5 decision
// 3), for the Python READERS (forge.py `prepare`, grade.py `style_score`) and for a diff a person
// can read in review. It used to be the truth, hand-edited on purpose (forge.py says so) and
// written by six writers through lib/foundry/catalogue.ts; it is now written by exactly one
// function, from the store, and a hand edit reaches the store through the importer
// (pipeline/import/styles.mts), never by being the file the next writer happens to read.
//
// BYTE-STABLE: the same store exports the same bytes. Key order inside a style is v1's StyleDef
// order (lib/foundry/types.ts) and the observables keep the order they were written in, so the
// first export after the import is a diff of exactly what changed (`_rev`, a blob digest beside
// each exemplar file), not a reshuffle; styles keep the order they entered the store. The file
// stays readable by the importer (it is the hand-edit path's input). v1's words where a v1 reader still meets them: an operator's evidence
// row carries no `by` (absent meant a human's) and an agent's says "model".
//
// THE RENDER IS SERIALISED BY THE STORE'S WRITE LOCK, THE FILE WRITE IS NOT: the bytes are
// rendered inside one (empty) write transaction, and the temp write and rename run after it has
// committed, so a rename retrying against an indexer never holds the lock or blocks other
// writers. Two exporters racing between commit and rename can land the older render last; the
// next export (which compares bytes) repairs it. The file is replaced by rename from a temp
// beside it (a reader sees the old file or the new, never half), and skipped when its bytes
// already match.

const HEAD = {
  _purpose:
    "The art-style catalogue the foundry forges against. Each style is TWO halves: `observables` are the measurable half (the style.py vocabulary a vision model can read back off any image, so adherence is a comparison of enums rather than an opinion) and `recipe` is the generator-facing half (what to tell an image model, concrete visual instructions, no proper nouns). A style enters as `candidate`; it becomes `proven` only through the cull, when a human keeps its renders across more than one craft problem. `evidence` is appended by /foundry commits and is the durable index the knowledge write-up reads.",
  _source:
    "EXPORTED from the kernel store's `styles` table (packages/kernel/src/styles/export.ts); `_rev` is the store's catalogue revision. Do not edit by hand and expect it to stick: edit, then run `node pipeline/import/styles.mts --yes`, which carries name/family/recipe/negative/observables edits into the store.",
  _origin_kinds: {
    readback: "acquired from a best-in-class source by style.py multi-frame readback (style-onboarding-from-sample), then edited by hand -- the source frames never become references",
    authored: "written from the attribute grammar directly",
    extracted:
      "Read off a gallery by the Extract tab / pipeline/foundry/extract.mts: sources read back one by one, grouped by look, the recipe replicated from words alone with self-critique rounds and transferred onto a neutral scene, then KEPT by a human. Arrives with `exemplars` (source / replica / transfer files under foundry-out/extract/<run>/, each with its blob digest) and `origin.source` = the extract run id. Candidate until the forge's cull proves it.",
    preset: "a v1 Library theme started from one of the six presets",
    plate: "a v1 Library theme forked off a plate already on the shelf",
    foundry: "a v1 Library theme adopted from a proven Foundry style",
  },
};

/** One style in the export's shape: v1 StyleDef keys first, in v1's order, then the look. */
export function exportedStyle(s: Style): Record<string, unknown> {
  return {
    id: s.id,
    name: s.name,
    family: s.family,
    status: s.status,
    origin: s.origin,
    observables: s.observables,
    recipe: s.recipe,
    negative: s.negative,
    evidence: s.evidence.map(({ by, ...e }) => (by === "agent" ? { ...e, by: "model" } : e)),
    ...(s.exemplars.length
      ? { exemplars: s.exemplars.map((e) => ({ kind: "extract", run: e.run, ...(e.file === undefined ? {} : { file: e.file }), role: e.role, ...(e.settled === undefined ? {} : { settled: e.settled }), sha256: e.media.sha256 })) }
      : {}),
    ...(s.palette === undefined ? {} : { palette: s.palette }),
    ...(s.block === undefined ? {} : { block: s.block }),
    ...(s.lock === undefined ? {} : { locked: s.lock }),
  };
}

/** The whole file, as text, from a read of the store. */
export function exportStylesIn(r: Reader): string {
  const doc = { ...HEAD, _rev: catalogueRevIn(r), styles: listStylesIn(r).map((row) => exportedStyle(row.style)) };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function exportStylesJson(store: Store): Result<string> {
  return store.read(exportStylesIn);
}

const fileIds = z.object({ styles: z.array(z.object({ id: z.string() })) });

function current(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") return null;
    throw e;
  }
}

const RENAME_RETRY = new Set(["EPERM", "EBUSY", "EACCES"]);

/** blob.ts's Windows rule, synchronously (the thread blocks): a rename onto a file an indexer or
 *  an editor holds open fails for a few milliseconds, so it is retried, briefly, then reported. */
function renameRetrying(tmp: string, file: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmp, file);
      return;
    } catch (e) {
      const code = e instanceof Error && "code" in e && typeof e.code === "string" ? e.code : "";
      if (!RENAME_RETRY.has(code) || attempt >= 8) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * 2 ** attempt);
    }
  }
}

export type ExportReport = { readonly rev: number; readonly changed: boolean; readonly styles: number };

/**
 * Re-export the store to `file`. REFUSES to overwrite a file that names a style the store does
 * not hold: that file is a catalogue nobody imported (or a hand-added style), and replacing it
 * from a store that lacks the entry would delete it from the only place it lives.
 */
export function writeStylesExport(store: Store, file: string): Result<ExportReport> {
  // The transaction is only a consistent read (and the write lock that orders two exporters'
  // renders); the file I/O, whose rename may retry for ~5 s, runs after it has committed.
  const plan = store.tx((t): Result<ExportReport & { readonly text: string | null }> => {
    const text = exportStylesIn(t);
    const styles = listStylesIn(t);
    const before = current(file);
    const rev = catalogueRevIn(t);
    if (before === text) return ok({ rev, changed: false, styles: styles.length, text: null });
    if (before !== null) {
      const parsed = parseJsonAt(file, fileIds, before);
      if (!parsed.ok) return err("refused", `${file} is not a catalogue the export can replace: ${parsed.error.message}`);
      const held = new Set<string>(styles.map((s) => s.style.id));
      const lost = parsed.value.styles.map((s) => s.id).filter((id) => !held.has(id));
      if (lost.length) return err("refused", `${file} holds ${lost.length} style(s) the store does not (${lost.slice(0, 5).join(", ")}${lost.length > 5 ? ", …" : ""}) — run \`node pipeline/import/styles.mts --yes\` first`);
    }
    return ok({ rev, changed: true, styles: styles.length, text });
  });
  if (!plan.ok) return plan;
  if (!plan.value.ok) return plan.value;
  const { text, ...report } = plan.value.value;
  if (text === null) return ok(report);
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, text, "utf8");
    renameRetrying(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw new AppError("unavailable", `cannot write ${file}`, { cause: e });
  }
  return ok(report);
}
