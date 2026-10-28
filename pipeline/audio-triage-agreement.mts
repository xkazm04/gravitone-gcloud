// AUDIO TRIAGE vs THE EAR - how far the detectors agree with a person who listened.
//
//   npx tsx pipeline/audio-triage-agreement.mts [--out <dir>] [--json]
//
// Reads the sound store (SOUND_STORE_DIR): takes.json for each take's verdict and defect reasons,
// and triage.json (pipeline/sound-triage.mts) for what the detectors said about the same bytes.
// Only JUDGED takes count (kept or rejected); a take judged without a triage record is listed,
// never guessed.
//
// PER CHECK. The person's positive is "rejected AND named this check's defect"
// (@gt/domain/audio.triage CHECK_DEFECT - two checks share `clipping`); everything else they judged
// is a negative - a keep, or a reject for another reason. The detector's positive is a `flag`; a
// `skip` is excluded from that check's table (no context, no claim). Precision, recall, and
// Cohen's kappa (agreement beyond chance), with every disagreement listed by take and value - the
// rows a person reads to decide whether the detector or the label was wrong.
// VERDICT LEVEL. Any non-experimental flag vs rejected: how well "the detectors found something"
// predicts "a person threw it out" - the number that decides whether triage may ORDER the pile.
//
// Small samples are reported as counts beside every rate: n = 3 is a story, not a measurement.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { CHECK_DEFECT, EXPERIMENTAL_CHECKS, TRIAGE_CHECKS, type Triage, type TriageCheck } from "@gt/domain/audio.triage";

export type JudgedTake = { readonly id: string; readonly title: string; readonly kind: string; readonly verdict: "kept" | "rejected"; readonly reasons: readonly string[] };
export type Confusion = { tp: number; fp: number; fn: number; tn: number };
export type Disagreement = { readonly take: string; readonly title: string; readonly said: "flag" | "pass"; readonly person: "defect" | "no defect"; readonly value: number | null; readonly note?: string };
export type CheckAgreement = { readonly check: TriageCheck; readonly defect: string; readonly experimental: boolean; readonly n: number; readonly skipped: number; readonly c: Confusion; readonly precision: number | null; readonly recall: number | null; readonly kappa: number | null; readonly disagreements: readonly Disagreement[] };
export type Agreement = { readonly judged: number; readonly withoutTriage: readonly string[]; readonly checks: readonly CheckAgreement[]; readonly verdict: { readonly c: Confusion; readonly precision: number | null; readonly recall: number | null; readonly kappa: number | null } };

const rate = (a: number, b: number): number | null => (b === 0 ? null : a / b);

/** Cohen's kappa for a 2x2 table; null when either rater never varied (kappa is undefined there). */
export function kappa(c: Confusion): number | null {
  const n = c.tp + c.fp + c.fn + c.tn;
  if (n === 0) return null;
  const po = (c.tp + c.tn) / n;
  const pe = ((c.tp + c.fp) / n) * ((c.tp + c.fn) / n) + ((c.fn + c.tn) / n) * ((c.fp + c.tn) / n);
  return pe === 1 ? null : (po - pe) / (1 - pe);
}

function tally(c: Confusion, said: boolean, truth: boolean): void {
  if (said && truth) c.tp++;
  else if (said) c.fp++;
  else if (truth) c.fn++;
  else c.tn++;
}

export function agreement(takes: readonly JudgedTake[], triage: ReadonlyMap<string, Triage>): Agreement {
  const scored = takes.filter((t) => triage.has(t.id));
  const checks = TRIAGE_CHECKS.map((check): CheckAgreement => {
    const defect = CHECK_DEFECT[check];
    const c: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 };
    const disagreements: Disagreement[] = [];
    let skipped = 0;
    for (const t of scored) {
      const f = triage.get(t.id)?.findings.find((x) => x.check === check);
      if (f === undefined || f.verdict === "skip") {
        skipped++;
        continue;
      }
      const said = f.verdict === "flag";
      const truth = t.verdict === "rejected" && t.reasons.includes(defect);
      tally(c, said, truth);
      if (said !== truth) disagreements.push({ take: t.id, title: t.title, said: said ? "flag" : "pass", person: truth ? "defect" : "no defect", value: f.value, ...(f.note === undefined ? {} : { note: f.note }) });
    }
    return { check, defect, experimental: EXPERIMENTAL_CHECKS.has(check), n: c.tp + c.fp + c.fn + c.tn, skipped, c, precision: rate(c.tp, c.tp + c.fp), recall: rate(c.tp, c.tp + c.fn), kappa: kappa(c), disagreements };
  });
  const v: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const t of scored) {
    const flagged = (triage.get(t.id)?.findings ?? []).some((f) => f.verdict === "flag" && !EXPERIMENTAL_CHECKS.has(f.check));
    tally(v, flagged, t.verdict === "rejected");
  }
  return {
    judged: takes.length,
    withoutTriage: takes.filter((t) => !triage.has(t.id)).map((t) => t.id),
    checks,
    verdict: { c: v, precision: rate(v.tp, v.tp + v.fp), recall: rate(v.tp, v.tp + v.fn), kappa: kappa(v) },
  };
}

const f2 = (x: number | null): string => (x === null ? "-" : x.toFixed(2));

export function toMarkdown(a: Agreement): string {
  const lines = [
    "# Audio triage vs the ear",
    "",
    `${a.judged} judged take(s); ${a.withoutTriage.length} without a triage record${a.withoutTriage.length ? ` (${a.withoutTriage.join(", ")})` : ""}.`,
    "",
    `**Verdict level** (any non-experimental flag vs rejected): TP ${a.verdict.c.tp} · FP ${a.verdict.c.fp} · FN ${a.verdict.c.fn} · TN ${a.verdict.c.tn} · precision ${f2(a.verdict.precision)} · recall ${f2(a.verdict.recall)} · kappa ${f2(a.verdict.kappa)}`,
    "",
    "| check | defect | n | skipped | TP | FP | FN | TN | precision | recall | kappa |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...a.checks.map((x) => `| ${x.check}${x.experimental ? " (exp.)" : ""} | ${x.defect} | ${x.n} | ${x.skipped} | ${x.c.tp} | ${x.c.fp} | ${x.c.fn} | ${x.c.tn} | ${f2(x.precision)} | ${f2(x.recall)} | ${f2(x.kappa)} |`),
    "",
    "## Disagreements",
    "",
  ];
  for (const x of a.checks)
    for (const d of x.disagreements) lines.push(`- **${x.check}** ${d.take} "${d.title}": detector ${d.said} (value ${d.value ?? "null"}${d.note ? `, ${d.note}` : ""}), person: ${d.person}`);
  return lines.join("\n") + "\n";
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const outAt = args.indexOf("--out");
  const root = process.env["SOUND_STORE_DIR"]?.trim();
  if (root === undefined || root === "") {
    console.error("SOUND_STORE_DIR must name the sound store whose verdicts are scored");
    return 2;
  }
  const takesDoc = JSON.parse(await readFile(path.join(root, "takes.json"), "utf8")) as { takes?: unknown } | unknown[];
  const raw = (Array.isArray(takesDoc) ? takesDoc : Array.isArray(takesDoc.takes) ? takesDoc.takes : Object.values((takesDoc as { takes: Record<string, unknown> }).takes ?? {})) as { id: string; title: string; kind: string; verdict: string; reasons?: string[] }[];
  const judged: JudgedTake[] = raw.filter((t) => t.verdict === "kept" || t.verdict === "rejected").map((t) => ({ id: t.id, title: t.title, kind: t.kind, verdict: t.verdict as "kept" | "rejected", reasons: t.reasons ?? [] }));
  let records: Record<string, { triage: Triage }> = {};
  try {
    records = JSON.parse(await readFile(path.join(root, "triage.json"), "utf8")) as Record<string, { triage: Triage }>;
  } catch {
    records = {};
  }
  const a = agreement(judged, new Map(Object.entries(records).map(([id, r]) => [id, r.triage])));
  const md = toMarkdown(a);
  if (outAt > 0 && args[outAt + 1]) {
    const out = path.resolve(args[outAt + 1] ?? ".");
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, "agreement.json"), JSON.stringify(a, null, 2), "utf8");
    await writeFile(path.join(out, "agreement.md"), md, "utf8");
  }
  console.log(args.includes("--json") ? JSON.stringify(a) : md);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(await main());
