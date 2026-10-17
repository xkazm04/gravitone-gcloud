// A TRIAL'S MEASUREMENT, WRITTEN THE REGISTRY'S OWN WAY. Pure: text in, text out.
//
// A trial run's registry outcome is its measurement, recorded as an APPLICATION of the
// technique under test (ai-registry docs/rkb-profile.md §3): frontmatter `applied:
// experiment`, `ab_verdict`, `proof: ab-paired` - the convention 932 applications already
// carry - and a body a reader can re-run: the claim quoted, the alternative with its dated
// source, both arms, the one optimized metric and its band, the guards, the controls, the
// measured commands with their dates, a table per arm, and the verdict with its reason.
// Measured 2026-10-18 across 17 runs: the pipeline proposed 17 registry patches, 14 to the
// technical-writing bundle and 0 to the run's own subject, and none was adopted. This file
// is what replaces them: a record of something measured, about the subject itself.
//
// THE LAYER RULE (rkb-profile §1): an application may name a stack and carry numbers, each
// with its n and its date; it carries no consumer repo path. So every command argument is
// stripped of its machine prefix before it is written (`publicArg`): the registry's
// check-public-paths and the publications lane's privacy rule both fail a home directory,
// and an absolute path names one machine's layout whichever directory it starts in.
//
// AN EXISTING RECORD IS EVIDENCE. When the registry already holds a file at the trial's
// application path, `appendTrialSection` adds a dated section and leaves the frontmatter and
// the body as they were: a trial adds to a measurement, it never overwrites one.
//
// `ab_verdict` answers "did the technique, as written, prove better?" - so `upheld` is
// `better`, and both `challenged` and `null` are `not-better` (a null is a technique that
// did not beat its alternative beyond the band it declared).

import type { RegistryLead } from "./leads";
import type {
  ArticleTrialRef,
  TrialArmId,
  TrialArmSummary,
  TrialExecRecord,
  TrialPrereg,
  TrialResults,
  TrialVerdict,
  TrialVerdictKind,
} from "../types";

export interface TrialRecordInput {
  prereg: TrialPrereg;
  verdict: TrialVerdict;
  results: TrialResults;
  execs: TrialExecRecord[];
  trialId: string;
  /** YYYY-MM-DD the measurement was verified on; the verdict's date when absent. */
  date?: string;
}

/** The registry's `<stack>@<version>` (ai-registry scripts/check-bundles.mjs VERIFIED_AGAINST_RE). */
const VERIFIED_AGAINST_RE = /^[a-z0-9][a-z0-9-]*@\d+(?:\.\d+){0,2}$/;

export const CONVERGE_LINE = "node scripts/converge.mjs --pending --write";

export function abVerdictOf(v: TrialVerdictKind): "better" | "not-better" {
  return v === "upheld" ? "better" : "not-better";
}

const dateOf = (input: Pick<TrialRecordInput, "date" | "verdict">) => input.date ?? input.verdict.at.slice(0, 10);

/* ── formatting ────────────────────────────────────────────────────────────── */

/** Four significant figures, no exponent for the magnitudes a harness reports. */
export function num(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  if (Number.isInteger(x)) return String(x);
  const p = Number(x.toPrecision(4));
  return Math.abs(p) >= 1e-4 ? String(p) : p.toExponential(2);
}

const signed = (x: number) => `${x > 0 ? "+" : ""}${num(x)}`;
const withUnit = (s: string, unit: string) => (unit ? `${s} ${unit}` : s);

function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 120) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

/** One line, no table-breaking pipe. */
const cell = (s: string) => s.replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();
/** Inline code that survives a backtick inside it. */
const code = (s: string) => (s.includes("`") ? `\`\` ${s} \`\`` : `\`${s}\``);
/** Link text with no bracket that would end it early. */
const linkText = (s: string) => s.replace(/[[\]]/g, (c) => `\\${c}`);

const ABS_PATH = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/;
const lastSegment = (p: string) => p.split(/[\\/]+/).filter(Boolean).pop() ?? p;

/** A command argument with every machine prefix taken off: an absolute path becomes its
 *  last segment, an embedded one too, and a home directory inside any text becomes `~`. */
export function publicArg(a: string): string {
  if (ABS_PATH.test(a) && /[\\/]/.test(a.slice(1))) return lastSegment(a);
  // A drive letter only where no word character precedes it (`https:` is not a drive); a
  // POSIX path only after `=`, `,`, `;` or a space, never after `:` (a URL's `//host/x`).
  return a
    .replace(/(?<!\w)[A-Za-z]:[\\/][^\s"'=,;]*/g, (m) => lastSegment(m))
    .replace(/(^|[=,;\s])(\/[^\s"'=,;/]+\/[^\s"'=,;]*)/g, (_m, pre: string, p: string) => `${pre}${lastSegment(p)}`)
    .replace(/(^|[^\w.~:/-])\/(?:home|Users)\/[^/\s"']+/g, "$1~");
}

export function commandLine(cmd: string[]): string {
  return cmd.map((a) => publicArg(a)).map((a) => (/[\s"]/.test(a) ? JSON.stringify(a) : a)).join(" ");
}

/* ── the shared blocks ─────────────────────────────────────────────────────── */

const armOf = <T extends { id: TrialArmId }>(xs: readonly T[], id: TrialArmId): T | undefined => xs.find((x) => x.id === id);

function bandLine(p: TrialPrereg, v: TrialVerdict): string {
  const b = `±${withUnit(num(v.band), p.metric.unit)}`;
  return p.minEffect.kind === "relative" ? `${b} (${num(p.minEffect.value * 100)}% of the golden arm's mean)` : `${b} (absolute)`;
}

function setupLines(p: TrialPrereg, v: TrialVerdict): string[] {
  return [
    `- **Question.** ${p.question}`,
    ...p.arms.map((a) => `- **Arm \`${a.id}\`: ${a.label}.** ${a.description}`),
    `- **Metric.** ${p.metric.label} (\`${p.metric.id}\`${p.metric.unit ? `, ${p.metric.unit}` : ""}), ${p.metric.direction} is better. The one optimized metric; every other number is a guard.`,
    `- **Band.** ${bandLine(p, v)}: a difference inside it is no difference.`,
    p.thresholds.length
      ? `- **Guards.** ${p.thresholds.map((t) => `${t.label} (\`${t.metric}\` ${t.op} ${num(t.value)})`).join("; ")}. An arm that misses one cannot win.`
      : "- **Guards.** none declared.",
    `- **n.** ${p.n} observations per arm, declared before the first measured command; it is also the floor.`,
    p.controls.length ? `- **Controls.** ${p.controls.map((c) => `${c.statement} (\`${c.id}\`)`).join("; ")}.` : "- **Controls.** none declared.",
    `- **Environment.** ${p.environment}.`,
    `- **Budget.** ${p.budget.wallMin} min of wall time, ${p.budget.modelCalls} model call${p.budget.modelCalls === 1 ? "" : "s"}.`,
  ];
}

function commandsBlock(execs: TrialExecRecord[]): string[] {
  const measured = execs.filter((e) => !e.pilot);
  const pilots = execs.length - measured.length;
  const rows = measured.map(
    (e) => `| ${e.at.slice(0, 10)} | ${cell(code(commandLine(e.cmd)))} | ${e.timedOut ? "timed out" : e.exitCode === null ? "killed" : e.exitCode} | ${duration(e.durationMs)} |`,
  );
  return [
    ...(rows.length ? ["| date | command | exit | duration |", "| --- | --- | ---: | ---: |", ...rows] : ["No measured command was logged."]),
    "",
    pilots ? `${pilots} pilot command${pilots === 1 ? "" : "s"} ran before the seal and ${pilots === 1 ? "is" : "are"} not part of the measurement.` : "No pilot command ran.",
  ];
}

function measurementTable(p: TrialPrereg, v: TrialVerdict, r: TrialResults): string[] {
  const head = ["arm", "n", withUnit(`mean`, p.metric.unit ? `(${p.metric.unit})` : ""), "sd", ...p.thresholds.map((t) => `${t.label} (${t.op} ${num(t.value)})`), "guards cleared"];
  const rows = p.arms.map((a) => {
    const s: TrialArmSummary | undefined = armOf(v.arms, a.id);
    const res = armOf(r.arms, a.id);
    const guards = p.thresholds.map((t) => {
      const val = res?.guards[t.metric];
      return typeof val === "number" ? num(val) : "not reported";
    });
    return [`\`${a.id}\`: ${a.label}`, s ? String(s.n) : "0", s ? num(s.mean) : "-", s ? num(s.sd) : "-", ...guards, s ? (s.guardsCleared ? "yes" : "no") : "no"];
  });
  const align = head.map((_, i) => (i === 0 || i === head.length - 1 ? "---" : "---:"));
  return [`| ${head.map(cell).join(" | ")} |`, `| ${align.join(" | ")} |`, ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)];
}

function deltaLines(p: TrialPrereg, v: TrialVerdict): string[] {
  return [
    `Delta, alternative minus golden, signed so that a positive value favours the alternative: **${withUnit(signed(v.delta), p.metric.unit)}** against a band of ${bandLine(p, v)}.`,
    ...(v.deltaCi95
      ? ["", `Seeded bootstrap 95% interval of the delta (2,000 resamples): [${num(v.deltaCi95[0])}, ${num(v.deltaCi95[1])}]${p.metric.unit ? ` ${p.metric.unit}` : ""}. Reported, not decisive: the verdict is the declared rule, not the interval.`]
      : []),
  ];
}

function controlsTable(p: TrialPrereg, r: TrialResults): string[] {
  if (!r.controls.length) return ["No control was reported."];
  const statement = new Map(p.controls.map((c) => [c.id, c.statement]));
  return [
    "| control | held | evidence |",
    "| --- | --- | --- |",
    ...r.controls.map((c) => `| ${cell(statement.get(c.id) ?? c.id)} | ${c.held ? "held" : "did not hold"} | ${cell(c.evidence)} |`),
  ];
}

/** Everything below the title, with section headings at `level`. */
function trialBody(input: TrialRecordInput, level: number): string {
  const { prereg: p, verdict: v, results: r, execs } = input;
  const h = "#".repeat(level);
  const alt = p.alternative;
  const altLink = /^https?:\/\//.test(alt.source.url) ? `[${linkText(alt.source.title)}](${alt.source.url})` : `${alt.source.title} (${alt.source.url})`;
  const lines = [
    `Measured ${dateOf(input)} by article trial ${code(input.trialId)} on ${p.environment}. The preregistration was sealed before the first measured command, and the verdict was computed by code from the sealed declaration and the results.`,
    "",
    `${h} The claim under test`,
    "",
    `Technique \`${p.technique}\` of \`${p.subject.slug}\`:`,
    "",
    ...p.claim.split(/\r?\n/).map((l) => `> ${l}`),
    "",
    `Prior, declared before the first search: ${p.prior}`,
    "",
    `${h} The alternative`,
    "",
    `**${alt.name}.** ${alt.description} Source: ${altLink}, ${alt.source.date}.`,
    "",
    `${h} Setup`,
    "",
    ...setupLines(p, v),
    "",
    `${h}# Measured commands`,
    "",
    ...commandsBlock(execs),
    "",
    `${h} The measurement`,
    "",
    ...measurementTable(p, v, r),
    "",
    ...deltaLines(p, v),
    "",
    ...controlsTable(p, r),
    "",
    `Model calls: ${r.modelCalls} of ${p.budget.modelCalls} budgeted.${r.notes?.trim() ? ` Notes from the harness: ${r.notes.trim()}` : ""}`,
    "",
    `${h} Verdict`,
    "",
    `**${v.verdict}** (\`ab_verdict: ${abVerdictOf(v.verdict)}\`). ${v.reason}`,
    "",
  ];
  return lines.join("\n");
}

/* ── the application file ──────────────────────────────────────────────────── */

/** The full application file for a trial with no record in the registry yet. */
export function applicationMarkdown(input: TrialRecordInput): string {
  const { prereg: p, verdict: v } = input;
  const verifiedAgainst =
    p.stack !== "process" && VERIFIED_AGAINST_RE.test(p.environment) && p.environment.split("@")[0] === p.stack ? p.environment : undefined;
  const fm = [
    "---",
    "layer: application",
    "type: application",
    `subject: ${p.subject.slug}`,
    `technique: ${p.technique}`,
    `stack: ${p.stack}`,
    `verified_on: ${dateOf(input)}`,
    ...(verifiedAgainst ? [`verified_against: ${verifiedAgainst}`] : []),
    "applied: experiment",
    `ab_verdict: ${abVerdictOf(v.verdict)}`,
    "proof: ab-paired",
    "---",
  ];
  const title = `# ${p.arms[0].label} against ${p.alternative.name}: ${p.metric.label}`;
  return `${fm.join("\n")}\n\n${title}\n\n${trialBody(input, 2)}`;
}

/** The registry's existing file plus one dated section for this trial; the frontmatter and
 *  the body above it are left exactly as they were. Idempotent per trial id. */
export function appendTrialSection(existingText: string, input: TrialRecordInput): string {
  const existing = existingText.replace(/\r\n/g, "\n");
  if (existing.includes(`\n## Trial ${input.trialId} (`)) return existing;
  const head = existing.endsWith("\n") ? existing : `${existing}\n`;
  return `${head}\n## Trial ${input.trialId} (${dateOf(input)}): ${input.verdict.verdict}\n\n${trialBody(input, 3)}`;
}

/* ── SOURCES.md `## Experiments` ───────────────────────────────────────────── */

/** The publication's own account of its first-hand measurement, appended to SOURCES.md. */
export function experimentsMarkdown(input: TrialRecordInput & { applicationPath: string }): string {
  const { prereg: p, verdict: v, results: r, execs } = input;
  return [
    "## Experiments",
    "",
    `Trial ${code(input.trialId)}, ${dateOf(input)}, ${p.environment}. The record is source 1, the registry application ${code(input.applicationPath)}, which lands with this publication.`,
    "",
    `- **Claim under test** (\`${p.technique}\`): "${p.claim.replace(/\s+/g, " ").trim()}"`,
    `- **Alternative.** ${p.alternative.name}, ${p.alternative.source.url} (${p.alternative.source.date}).`,
    ...setupLines(p, v),
    "",
    ...measurementTable(p, v, r),
    "",
    ...deltaLines(p, v),
    "",
    ...controlsTable(p, r),
    "",
    "Measured commands:",
    "",
    ...commandsBlock(execs),
    "",
    `**Verdict: ${v.verdict}** (\`ab_verdict: ${abVerdictOf(v.verdict)}\`). ${v.reason}`,
    "",
  ].join("\n");
}

/* ── the PR body ───────────────────────────────────────────────────────────── */

export function trialPrBlock(input: { ref: ArticleTrialRef; prereg: TrialPrereg; verdict: TrialVerdict; governsHere: string[] }): string[] {
  const { ref, prereg: p, verdict: v } = input;
  const g = armOf(v.arms, "golden");
  const a = armOf(v.arms, "alternative");
  const means = g && a ? `; golden ${num(g.mean)} ± ${num(g.sd)}, alternative ${num(a.mean)} ± ${num(a.sd)}` : "";
  return [
    `### Trial \`${ref.id}\`: ${v.verdict}`,
    "",
    `- Claim under test (\`${p.technique}\`): "${p.claim.replace(/\s+/g, " ").trim()}"`,
    `- Alternative: ${p.alternative.name} (${p.alternative.source.url}, ${p.alternative.source.date})`,
    `- Metric: ${p.metric.label}${p.metric.unit ? ` (${p.metric.unit})` : ""}, ${p.metric.direction} is better; n = ${p.n} per arm${means}; delta ${withUnit(signed(v.delta), p.metric.unit)}, band ±${num(v.band)}`,
    `- Application record: \`${ref.applicationPath}\` (\`ab_verdict: ${abVerdictOf(v.verdict)}\`), patch t1, which lands with this post`,
    `- Governs in the consuming project: ${input.governsHere.length ? input.governsHere.join(", ") : "no context known"}`,
    `- After merge: run \`${CONVERGE_LINE}\` in the registry to queue the changed subject in every consuming project.`,
    "",
  ];
}

/* ── leads ─────────────────────────────────────────────────────────────────── */

export interface TrialLeadInput {
  /** `technique`: a challenged or null trial landed, so /deepen weighs the golden path.
   *  `application`: the post was rejected, and the measurement must not be lost with it. */
  kind: "technique" | "application";
  prereg: TrialPrereg;
  verdict: TrialVerdict;
  trialId: string;
  applicationPath: string;
  /** When the lead is written. */
  now: Date;
  runId?: string;
  /** The rejection note, for an application lead. */
  note?: string;
}

/** One `.ai/registry-leads.jsonl` row (lib/articles/trial/leads.ts), claim in the registry's
 *  "When X, do Y, because Z" form. Confidence is `medium` only for a challenged verdict whose
 *  reported interval also excludes zero; one trial in one environment is otherwise `low`. */
export function trialLead(input: TrialLeadInput): RegistryLead {
  const { prereg: p, verdict: v } = input;
  const g = armOf(v.arms, "golden");
  const a = armOf(v.arms, "alternative");
  const gm = g ? num(g.mean) : "-";
  const am = a ? num(a.mean) : "-";
  const unit = p.metric.unit ? ` ${p.metric.unit}` : "";
  const when = `When ${p.technique} is applied on ${p.environment}`;
  const tail = `(n=${p.n} per arm, band ±${num(v.band)}${unit})`;
  const claim =
    v.verdict === "challenged"
      ? `${when}, prefer ${p.alternative.name} to the rule as written, because trial ${input.trialId} measured ${p.metric.label} at ${am} against ${gm}${unit}, beyond the declared band ${tail}.`
      : v.verdict === "null"
        ? `${when}, do not prefer the rule as written over ${p.alternative.name} on ${p.metric.label}, because trial ${input.trialId} measured ${am} against ${gm}${unit}, inside the declared band ${tail}.`
        : `${when}, keep the rule as written rather than ${p.alternative.name}, because trial ${input.trialId} upheld it on ${p.metric.label} at ${gm} against ${am}${unit} ${tail}.`;
  const rejected =
    input.kind === "application"
      ? ` The post written around it${input.runId ? ` (run ${input.runId})` : ""} was rejected at the gate${input.note ? `: ${input.note.replace(/\s+/g, " ").trim().slice(0, 300)}` : ""}.`
      : "";
  const ci = v.deltaCi95;
  return {
    ts: input.now.toISOString(),
    bundle: p.subject.bundle,
    nearest: p.subject.slug,
    kind: input.kind,
    claim,
    because: `${v.verdict}: ${v.reason} Record ${input.applicationPath}, ab_verdict ${abVerdictOf(v.verdict)}.${rejected}`,
    confidence: v.verdict === "challenged" && ci && ci[0] > 0 && ci[1] > 0 ? "medium" : "low",
    from: `article-trial@${input.now.toISOString().slice(0, 10)}`,
  };
}
