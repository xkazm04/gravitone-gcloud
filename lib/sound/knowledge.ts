// THE KNOWLEDGE RENDERER — the ledger in, knowledge/audio/{PATTERNS.md,
// params.json} out. Pure: no disk, no clock. `npx tsx pipeline/sound.mts
// knowledge` reads the ledger, calls this, and writes the two files; a probe
// calls it on a ledger it built and reads the strings.
//
// UNDER knowledge/README.md's EVIDENCE CONTRACT, which is the whole reason this
// is generated rather than written:
//
//   · Every strength is MEASURED, and a MEASURED line carries its number, the
//     command that produced it, and n. The command is the same on every line —
//     this renderer — so it is stated once in the header and once per file,
//     and n sits beside every figure.
//   · NOTHING BELOW n=3 IS CLAIMED. A cell with two judged takes is counted in
//     the "below the floor" line and never named: naming it would be a claim,
//     and two takes is a coincidence. The floor is MIN_N, stated in both files.
//   · A lesson is a person's reasoning across takes — INFERRED — and it is
//     quoted verbatim with the evidence it was confirmed on (n, keep rate,
//     mean score, the take ids), never paraphrased into authority.
//   · An empty ledger renders as an honest "no evidence yet", not as a page of
//     empty tables and not as a missing file.
//
// DETERMINISTIC ON PURPOSE. The as-of date is the newest judgement or lesson in
// the ledger, never the wall clock, so regenerating an unchanged ledger is a
// no-op in git and a diff of these files is always a diff in the evidence.

import { computeInsights, FACETS_FOR, keepRate } from "./insights";
import type { LedgerFile } from "./store";
import type { InsightCell, Lesson, SoundKind } from "./types";

export const MIN_N = 3;
export const KNOWLEDGE_COMMAND = "npx tsx pipeline/sound.mts knowledge";
export const LEDGER_REL = "pipeline/sound/ledger.json";

const KIND_LABEL: Record<SoundKind, string> = { music: "Music", sfx: "Sound effects" };
const FACET_LABEL: Record<InsightCell["facet"], string> = {
  genre: "genre",
  mood: "mood",
  instrument: "instrument",
  sfxCategory: "sfx category",
  technique: "technique",
};

export interface StrengthRow {
  provider: InsightCell["provider"];
  facet: InsightCell["facet"];
  value: string;
  evidence: "MEASURED";
  n: number;
  kept: number;
  rejected: number;
  keepRate: number;
  meanScore: number | null;
  topDefect: InsightCell["topDefect"];
}

export interface AudioParams {
  $comment: string;
  version: 1;
  source: string;
  command: string;
  asOf: string | null;
  min_n: number;
  evidence_contract: Record<string, string>;
  kinds: Record<SoundKind, { judged: number; strengths: StrengthRow[]; belowFloor: number }>;
  lessons: (Lesson & { evidenceLabel: "INFERRED" })[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

function asOfOf(ledger: LedgerFile): string | null {
  const stamps = [...ledger.verdicts.map((v) => v.judgedAt), ...ledger.lessons.map((l) => l.confirmedAt)].filter(Boolean).sort();
  return stamps.length ? stamps[stamps.length - 1] : null;
}

/** Cells that clear the floor, strongest first: keep rate, then mean score,
 *  then n — a 3-of-3 and a 30-of-30 tie on rate and the bigger sample leads. */
export function strengthsOf(cells: readonly InsightCell[]): StrengthRow[] {
  return cells
    .filter((c) => c.n >= MIN_N)
    .map((c) => ({
      provider: c.provider,
      facet: c.facet,
      value: c.value,
      evidence: "MEASURED" as const,
      n: c.n,
      kept: c.kept,
      rejected: c.rejected,
      keepRate: r2(keepRate(c) ?? 0),
      meanScore: c.meanScore,
      topDefect: c.topDefect,
    }))
    .sort(
      (a, b) =>
        b.keepRate - a.keepRate ||
        (b.meanScore ?? -1) - (a.meanScore ?? -1) ||
        b.n - a.n ||
        a.provider.localeCompare(b.provider) ||
        a.facet.localeCompare(b.facet) ||
        a.value.localeCompare(b.value),
    );
}

export function renderParams(ledger: LedgerFile): AudioParams {
  const kinds = {} as AudioParams["kinds"];
  for (const kind of ["music", "sfx"] as const) {
    const { cells, judged } = computeInsights(ledger.verdicts, kind);
    kinds[kind] = { judged, strengths: strengthsOf(cells), belowFloor: cells.filter((c) => c.n < MIN_N).length };
  }
  return {
    $comment:
      "GENERATED — do not edit. Machine-readable half of knowledge/audio/PATTERNS.md: per-provider strengths counted from the sound ledger. Prompt composers read `kinds.<kind>.strengths`; every row is MEASURED with its own n, and no row below `min_n` is ever written.",
    version: 1,
    source: LEDGER_REL,
    command: KNOWLEDGE_COMMAND,
    asOf: asOfOf(ledger),
    min_n: MIN_N,
    evidence_contract: {
      MEASURED: `Counted from ${LEDGER_REL} by \`${KNOWLEDGE_COMMAND}\`; n is beside every figure; only cells with n >= ${MIN_N}.`,
      INFERRED: "A lesson: one person's claim across judged takes, quoted verbatim with the evidence it was confirmed on.",
      excluded:
        "Fixture takes (design samples) never enter the ledger, so nothing here counts them; nor does a Suno return filed as a version of an already-judged take with no score or defect of its own.",
    },
    kinds,
    lessons: ledger.lessons.map((l) => ({ ...l, evidenceLabel: "INFERRED" as const })),
  };
}

function lessonLine(l: Lesson): string {
  const e = l.evidence;
  const bits = [`n=${e.n}`];
  if (e.keepRate !== null) bits.push(`keep ${pct(e.keepRate)}`);
  if (e.meanScore !== null) bits.push(`mean ${r2(e.meanScore)}`);
  if (e.takeIds.length) bits.push(`takes ${e.takeIds.slice(0, 8).join(", ")}${e.takeIds.length > 8 ? ` +${e.takeIds.length - 8}` : ""}`);
  const who = [l.provider, l.technique.length ? l.technique.join(" + ") : null, l.source === "hunt" && l.huntId ? `hunt ${l.huntId}` : l.source]
    .filter(Boolean)
    .join(" · ");
  return `- **INFERRED** — "${l.claim}"  \n  ${who} · evidence ${bits.join(" · ")} · confirmed ${l.confirmedAt.slice(0, 10)} · \`${l.id}\``;
}

export function renderPatterns(ledger: LedgerFile): string {
  const params = renderParams(ledger);
  const out: string[] = [];
  out.push("# Audio patterns — what the sound ledger has measured");
  out.push("");
  out.push(
    `GENERATED from [\`${LEDGER_REL}\`](../../${LEDGER_REL}) by \`${KNOWLEDGE_COMMAND}\` — do not edit by hand; judge takes and confirm lessons, then regenerate. ` +
      `Machine-readable twin: [\`params.json\`](params.json).`,
  );
  out.push("");
  out.push(
    `**Evidence contract** ([knowledge/README.md](../README.md)): every strength below is **MEASURED** — counted from the ledger by the command above, n beside it — ` +
      `and **nothing with fewer than ${MIN_N} judged takes is claimed**. Lessons are **INFERRED**: a person's claim, quoted verbatim with the evidence it was confirmed on. ` +
      `Fixture takes never reach the ledger.`,
  );
  out.push("");
  out.push(`As of: ${params.asOf ?? "no judgement recorded yet"}`);
  for (const kind of ["music", "sfx"] as const) {
    const k = params.kinds[kind];
    out.push("");
    out.push(`## ${KIND_LABEL[kind]}`);
    out.push("");
    out.push(`Judged takes in the ledger: **${k.judged}**. Facets counted: ${FACETS_FOR[kind].map((f) => FACET_LABEL[f]).join(", ")}.`);
    out.push("");
    out.push(`### Strengths (MEASURED, n ≥ ${MIN_N})`);
    out.push("");
    if (!k.strengths.length) {
      out.push(
        k.judged
          ? `No evidence yet: ${k.judged} judged take${k.judged === 1 ? "" : "s"}, and no provider × term cell reaches n=${MIN_N}.`
          : "No evidence yet: nothing of this kind has been judged.",
      );
    } else {
      out.push("| provider | facet | value | n | kept | keep rate | mean score | top defect |");
      out.push("|---|---|---|---:|---:|---:|---:|---|");
      for (const s of k.strengths)
        out.push(
          `| ${s.provider} | ${FACET_LABEL[s.facet]} | ${s.value.replace(/\|/g, "/")} | ${s.n} | ${s.kept} | ${pct(s.keepRate)} | ${s.meanScore === null ? "—" : s.meanScore} | ${s.topDefect ?? "—"} |`,
        );
    }
    if (k.belowFloor) {
      out.push("");
      out.push(`Below the floor: ${k.belowFloor} cell${k.belowFloor === 1 ? "" : "s"} with fewer than ${MIN_N} judged takes — counted, not claimed.`);
    }
    out.push("");
    out.push("### Lessons (INFERRED)");
    out.push("");
    const lessons = ledger.lessons.filter((l) => l.kind === kind);
    if (!lessons.length) out.push("No lesson confirmed yet.");
    else for (const l of lessons) out.push(lessonLine(l));
  }
  out.push("");
  return out.join("\n");
}
