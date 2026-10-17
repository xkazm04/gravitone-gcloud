// THE TRIAL'S VERDICT: prereg + results in, one of upheld / challenged / null / void out.
// Pure. The rule is the contract (lib/articles/types.ts `TrialVerdict`), stated once here:
//
//   void        a control did not hold, or an arm has fewer than `n` observations
//               (measurement-honesty/control-failure-is-not-a-datum-state; minimum-sample-floors),
//               or the harness made more model calls than the prereg budgeted (a protocol breach:
//               the budget was part of what was sealed)
//   band        minEffect.value, or minEffect.value x |golden mean| when relative
//   eligible    an arm clears every threshold
//   challenged  the alternative is eligible AND delta > band
//   upheld      the golden arm is eligible AND (delta < -band OR the alternative is not eligible)
//   null        anything else
//
// delta = alternative mean - golden mean, sign-flipped when the metric's direction is
// "lower", so a positive delta always favours the alternative. `deltaCi95` is a seeded
// bootstrap (fixed seed, 2000 resamples): reported, never decisive.
//
// THE VALIDATORS COLLECT, THEY DO NOT STOP AT THE FIRST PROBLEM. The prereg is written by an
// agent that is billed per round trip; an error that names one problem at a time costs one
// round trip per problem. Every problem is named in one ArticleError.

import { ArticleError } from "../store";
import {
  TRIAL_ARM_IDS,
  VALIDITY_STATES,
  type TrialArmResult,
  type TrialArmSummary,
  type TrialPrereg,
  type TrialResults,
  type TrialThreshold,
  type TrialValidity,
  type TrialVerdict,
  type TrialVerdictKind,
} from "../types";

/* ── shapes ────────────────────────────────────────────────────────────────── */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const filled = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** A registry slug: the shape `bundle/slug` addresses and application filenames are built from. */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** YYYY, YYYY-MM or YYYY-MM-DD, and a real calendar date. */
export function isIsoDate(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(v);
  if (!m) return false;
  const month = m[2] ? Number(m[2]) : 1;
  if (month < 1 || month > 12) return false;
  if (!m[3]) return true;
  const day = Number(m[3]);
  return day >= 1 && day <= new Date(Date.UTC(Number(m[1]), month, 0)).getUTCDate();
}

export function isHttpUrl(v: unknown): boolean {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function text(p: string[], o: Obj, key: string, at: string): void {
  if (!filled(o[key])) p.push(`${at}${key} must be a non-empty string`);
}

function sourceProblems(p: string[], v: unknown, at: string): void {
  if (!isObj(v)) {
    p.push(`${at} must be an object {url, title, date}`);
    return;
  }
  if (!isHttpUrl(v.url)) p.push(`${at}.url must be an http(s) URL`);
  text(p, v, "title", `${at}.`);
  if (!isIsoDate(v.date)) p.push(`${at}.date must be an ISO date (YYYY, YYYY-MM or YYYY-MM-DD)`);
}

/* ── prereg.json ───────────────────────────────────────────────────────────── */

/** Every problem with a prereg.json as parsed JSON; empty when it is a valid TrialPrereg. */
export function preregProblems(raw: unknown): string[] {
  const p: string[] = [];
  if (!isObj(raw)) return ["prereg.json must be a JSON object"];
  if (raw.schema !== "article-trial-prereg/1") p.push(`schema must be "article-trial-prereg/1"`);

  if (!isObj(raw.subject)) p.push("subject must be an object {bundle, slug}");
  else {
    if (typeof raw.subject.bundle !== "string" || !SLUG.test(raw.subject.bundle)) p.push("subject.bundle must be a registry slug");
    if (typeof raw.subject.slug !== "string" || !SLUG.test(raw.subject.slug)) p.push("subject.slug must be a registry slug");
  }
  if (typeof raw.technique !== "string" || !SLUG.test(raw.technique)) p.push("technique must be the slug of a technique of the subject");
  for (const k of ["claim", "prior", "question"]) text(p, raw, k, "");
  // stack names the application file (`<stack>--<technique>.md`), so it is held to a slug.
  if (typeof raw.stack !== "string" || !SLUG.test(raw.stack)) p.push("stack must be a lowercase slug (node, python, claude-code ...)");
  // environment is the application's `verified_against`, which the registry's currency
  // check splits on "@" (check-currency.mjs).
  if (typeof raw.environment !== "string" || !/^[^@\s]+@[^@\s]+$/.test(raw.environment)) p.push("environment must be <stack>@<version>");

  if (!isObj(raw.alternative)) p.push("alternative must be an object {name, description, source}");
  else {
    text(p, raw.alternative, "name", "alternative.");
    text(p, raw.alternative, "description", "alternative.");
    sourceProblems(p, raw.alternative.source, "alternative.source");
  }

  if (!Array.isArray(raw.arms) || raw.arms.length !== 2) p.push(`arms must be exactly [golden, alternative]`);
  else
    raw.arms.forEach((arm: unknown, i: number) => {
      if (!isObj(arm)) {
        p.push(`arms[${i}] must be an object {id, label, description}`);
        return;
      }
      if (arm.id !== TRIAL_ARM_IDS[i]) p.push(`arms[${i}].id must be "${TRIAL_ARM_IDS[i]}"`);
      text(p, arm, "label", `arms[${i}].`);
      text(p, arm, "description", `arms[${i}].`);
    });

  if (!isObj(raw.metric)) p.push("metric must be an object {id, label, unit, direction}");
  else {
    for (const k of ["id", "label", "unit"]) text(p, raw.metric, k, "metric.");
    if (raw.metric.direction !== "higher" && raw.metric.direction !== "lower") p.push(`metric.direction must be "higher" or "lower"`);
  }

  if (!isObj(raw.minEffect)) p.push("minEffect must be an object {kind, value}");
  else {
    const { kind, value } = raw.minEffect;
    if (kind !== "absolute" && kind !== "relative") p.push(`minEffect.kind must be "absolute" or "relative"`);
    if (!finite(value) || value <= 0) p.push("minEffect.value must be a number above 0");
    else if (kind === "relative" && value > 1) p.push("minEffect.value is a share of the golden mean when relative, so at most 1");
  }

  if (!Array.isArray(raw.thresholds)) p.push("thresholds must be an array (empty when no guard applies)");
  else {
    const seen = new Set<string>();
    raw.thresholds.forEach((t: unknown, i: number) => {
      if (!isObj(t)) {
        p.push(`thresholds[${i}] must be an object {metric, op, value, label}`);
        return;
      }
      if (!filled(t.metric)) p.push(`thresholds[${i}].metric must be a non-empty string`);
      else if (seen.has(t.metric)) p.push(`thresholds[${i}].metric "${t.metric}" is guarded twice`);
      else seen.add(t.metric);
      if (t.op !== ">=" && t.op !== "<=") p.push(`thresholds[${i}].op must be ">=" or "<="`);
      if (!finite(t.value)) p.push(`thresholds[${i}].value must be a finite number`);
      text(p, t, "label", `thresholds[${i}].`);
    });
  }

  // A floor of 3 per arm: below it the sample sd is one degree of freedom from meaningless
  // (measurement-honesty/minimum-sample-floors).
  if (!int(raw.n) || raw.n < 3) p.push("n must be an integer of at least 3");

  if (!Array.isArray(raw.controls) || raw.controls.length < 1) p.push("controls must list at least one condition both arms share");
  else {
    const seen = new Set<string>();
    raw.controls.forEach((c: unknown, i: number) => {
      if (!isObj(c)) {
        p.push(`controls[${i}] must be an object {id, statement}`);
        return;
      }
      if (!filled(c.id)) p.push(`controls[${i}].id must be a non-empty string`);
      else if (seen.has(c.id)) p.push(`controls[${i}].id "${c.id}" is listed twice`);
      else seen.add(c.id);
      text(p, c, "statement", `controls[${i}].`);
    });
  }

  if (!isObj(raw.budget)) p.push("budget must be an object {wallMin, modelCalls}");
  else {
    const { wallMin, modelCalls } = raw.budget;
    if (!finite(wallMin) || wallMin < 1 || wallMin > 240) p.push("budget.wallMin must be a number of minutes from 1 to 240");
    if (!int(modelCalls) || modelCalls < 0 || modelCalls > 500) p.push("budget.modelCalls must be an integer from 0 to 500");
  }
  return p;
}

const refuse = (file: string, code: string, problems: string[]) =>
  new ArticleError(`${file} has ${problems.length} problem${problems.length === 1 ? "" : "s"}: ${problems.join("; ")}`, 400, code);

/** A prereg.json as parsed JSON -> a TrialPrereg, or an ArticleError 400 `bad-prereg` naming every problem. */
export function validatePrereg(raw: unknown): TrialPrereg {
  const p = preregProblems(raw);
  if (p.length) throw refuse("prereg.json", "bad-prereg", p);
  return raw as TrialPrereg;
}

/* ── results.json ──────────────────────────────────────────────────────────── */

/** Every problem with a results.json as parsed JSON, measured against its prereg. */
export function resultsProblems(raw: unknown, prereg: TrialPrereg): string[] {
  const p: string[] = [];
  if (!isObj(raw)) return ["results.json must be a JSON object"];
  if (raw.schema !== "article-trial-results/1") p.push(`schema must be "article-trial-results/1"`);
  const guarded = prereg.thresholds.map((t) => t.metric).sort();

  if (!Array.isArray(raw.arms) || raw.arms.length !== 2) p.push(`arms must be exactly [${prereg.arms.map((a) => a.id).join(", ")}]`);
  else
    raw.arms.forEach((arm: unknown, i: number) => {
      const want = prereg.arms[i].id;
      if (!isObj(arm)) {
        p.push(`arms[${i}] must be an object {id, observations, guards}`);
        return;
      }
      if (arm.id !== want) p.push(`arms[${i}].id must be "${want}"`);
      if (!Array.isArray(arm.observations)) p.push(`arms[${i}].observations must be an array of numbers`);
      else {
        const bad = arm.observations.map((v: unknown, j: number) => (finite(v) ? -1 : j)).filter((j: number) => j >= 0);
        if (bad.length) p.push(`arms[${i}].observations[${bad.join(", ")}] ${bad.length === 1 ? "is not a finite number" : "are not finite numbers"}`);
      }
      if (!isObj(arm.guards)) p.push(`arms[${i}].guards must be an object keyed by ${guarded.length ? guarded.join(", ") : "(no guard: an empty object)"}`);
      else {
        const keys = Object.keys(arm.guards).sort();
        const missing = guarded.filter((k) => !keys.includes(k));
        const extra = keys.filter((k) => !guarded.includes(k));
        if (missing.length) p.push(`arms[${i}].guards lacks ${missing.join(", ")}`);
        if (extra.length) p.push(`arms[${i}].guards has ${extra.join(", ")}, which the prereg does not guard`);
        for (const k of keys) if (guarded.includes(k) && !finite(arm.guards[k])) p.push(`arms[${i}].guards.${k} must be a finite number`);
      }
    });

  const declared = prereg.controls.map((c) => c.id);
  if (!Array.isArray(raw.controls)) p.push(`controls must report ${declared.join(", ")}`);
  else {
    const seen: string[] = [];
    raw.controls.forEach((c: unknown, i: number) => {
      if (!isObj(c)) {
        p.push(`controls[${i}] must be an object {id, held, evidence}`);
        return;
      }
      if (typeof c.id !== "string" || !declared.includes(c.id)) p.push(`controls[${i}].id ${JSON.stringify(c.id)} is not a control the prereg declared`);
      else if (seen.includes(c.id)) p.push(`controls[${i}].id "${c.id}" is reported twice`);
      else seen.push(c.id);
      if (typeof c.held !== "boolean") p.push(`controls[${i}].held must be true or false`);
      text(p, c, "evidence", `controls[${i}].`);
    });
    const missing = declared.filter((id) => !seen.includes(id));
    if (missing.length) p.push(`controls lacks ${missing.join(", ")}`);
  }

  if (!int(raw.modelCalls) || raw.modelCalls < 0) p.push("modelCalls must be an integer of at least 0");
  if (raw.notes !== undefined && typeof raw.notes !== "string") p.push("notes, when present, must be a string");
  return p;
}

/** A results.json as parsed JSON -> TrialResults matching the prereg's arms, metric guards and
 *  controls, or an ArticleError 400 `bad-results` naming every problem. */
export function validateResults(raw: unknown, prereg: TrialPrereg): TrialResults {
  const p = resultsProblems(raw, prereg);
  if (p.length) throw refuse("results.json", "bad-results", p);
  return raw as TrialResults;
}

/* ── validity.json ─────────────────────────────────────────────────────────── */

export function validityProblems(raw: unknown): string[] {
  const p: string[] = [];
  if (!isObj(raw)) return ["validity.json must be a JSON object"];
  if (!VALIDITY_STATES.includes(raw.state as (typeof VALIDITY_STATES)[number])) p.push(`state must be one of ${VALIDITY_STATES.join(", ")}`);
  if (!Array.isArray(raw.reasons) || raw.reasons.some((r) => !filled(r))) p.push("reasons must be an array of non-empty strings");
  if (!Array.isArray(raw.sources)) p.push("sources must be an array of {url, title, date}");
  else raw.sources.forEach((s: unknown, i: number) => sourceProblems(p, s, `sources[${i}]`));
  return p;
}

/** A validity.json as parsed JSON -> TrialValidity, or an ArticleError 400 `bad-validity`. */
export function validateValidity(raw: unknown): TrialValidity {
  const p = validityProblems(raw);
  if (p.length) throw refuse("validity.json", "bad-validity", p);
  return raw as TrialValidity;
}

/* ── the verdict ───────────────────────────────────────────────────────────── */

export function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

/** Sample standard deviation (n - 1); 0 below two observations. */
export function sampleSd(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** The bootstrap's constants. Fixed so that the same inputs give the same interval on every
 *  machine and every call: an interval that moved between two reads of one trial would be a
 *  number nobody could cite. */
export const BOOTSTRAP = { seed: 0x7e1a1, resamples: 2000 } as const;

/** mulberry32: small, seedable, and identical in every JS engine. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Percentile bootstrap of the sign-adjusted difference of means, 2.5th and 97.5th. */
export function bootstrapDeltaCi(golden: readonly number[], alternative: readonly number[], sign: 1 | -1): [number, number] {
  const rand = seeded(BOOTSTRAP.seed);
  const draw = (xs: readonly number[]) => {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rand() * xs.length)];
    return s / xs.length;
  };
  const deltas: number[] = [];
  for (let b = 0; b < BOOTSTRAP.resamples; b++) deltas.push(sign * (draw(alternative) - draw(golden)));
  deltas.sort((x, y) => x - y);
  const B = deltas.length;
  return [deltas[Math.floor(0.025 * B)], deltas[Math.ceil(0.975 * B) - 1]];
}

const clears = (v: number | undefined, t: TrialThreshold) => finite(v) && (t.op === ">=" ? v >= t.value : v <= t.value);

/** A number as a sentence carries it: integers above 100, two decimals above 1, four below. */
function fmt(n: number): string {
  const a = Math.abs(n);
  return String(Number(n.toFixed(a >= 100 ? 0 : a >= 1 ? 2 : 4)));
}

export function computeVerdict(prereg: TrialPrereg, results: TrialResults, now: Date = new Date()): TrialVerdict {
  const unit = prereg.metric.unit;
  const armOf = (id: string): TrialArmResult => results.arms.find((a) => a.id === id) ?? { id: id as TrialArmResult["id"], observations: [], guards: {} };
  const golden = armOf("golden");
  const alternative = armOf("alternative");
  const failedGuards = (arm: TrialArmResult) => prereg.thresholds.filter((t) => !clears(arm.guards[t.metric], t));
  const summary = (arm: TrialArmResult): TrialArmSummary => ({
    id: arm.id,
    n: arm.observations.length,
    mean: mean(arm.observations),
    sd: sampleSd(arm.observations),
    guardsCleared: failedGuards(arm).length === 0,
  });
  const G = summary(golden);
  const A = summary(alternative);
  const sign: 1 | -1 = prereg.metric.direction === "lower" ? -1 : 1;
  const delta = sign * (A.mean - G.mean);
  const band = prereg.minEffect.kind === "relative" ? prereg.minEffect.value * Math.abs(G.mean) : prereg.minEffect.value;

  const guardText = (arm: TrialArmResult) =>
    failedGuards(arm)
      .map((t) => `"${t.label}" (${t.metric} ${finite(arm.guards[t.metric]) ? fmt(arm.guards[t.metric]) : "missing"}, needs ${t.op} ${fmt(t.value)})`)
      .join(" and ");
  const means = `golden ${fmt(G.mean)} vs alternative ${fmt(A.mean)} ${unit} mean`;
  const gap = fmt(Math.abs(A.mean - G.mean));
  const bothClear = prereg.thresholds.length ? "both arms cleared every guard" : "no guard was declared";

  // void first: a broken protocol is not a datum, whatever the numbers say.
  const voids: string[] = [];
  const broken = results.controls.filter((c) => !c.held);
  if (broken.length) voids.push(`control${broken.length > 1 ? "s" : ""} ${broken.map((c) => `"${c.id}"`).join(" and ")} did not hold`);
  for (const s of [G, A]) if (s.n < prereg.n) voids.push(`the ${s.id} arm has ${s.n} of the ${prereg.n} observations the prereg requires`);
  if (results.modelCalls > prereg.budget.modelCalls) voids.push(`the harness made ${results.modelCalls} model calls against a sealed budget of ${prereg.budget.modelCalls}`);

  let verdict: TrialVerdictKind;
  let reason: string;
  if (voids.length) {
    verdict = "void";
    reason = `${voids.join("; ")}, so nothing was measured`;
  } else if (A.guardsCleared && delta > band) {
    verdict = "challenged";
    reason =
      `alternative ${gap} ${unit} ${prereg.metric.direction} than golden (${means}), beyond the ${fmt(band)} ${unit} band; ` +
      (G.guardsCleared ? bothClear : `golden also failed ${guardText(golden)}`);
  } else if (G.guardsCleared && delta < -band) {
    verdict = "upheld";
    reason =
      `golden ${gap} ${unit} ${prereg.metric.direction} than the alternative (${means}), beyond the ${fmt(band)} ${unit} band; ` +
      (A.guardsCleared ? bothClear : `the alternative also failed ${guardText(alternative)}`);
  } else if (G.guardsCleared && !A.guardsCleared) {
    verdict = "upheld";
    reason = `the alternative failed ${guardText(alternative)} while golden cleared every guard (${means})`;
  } else {
    verdict = "null";
    if (!G.guardsCleared && !A.guardsCleared) reason = `neither arm cleared every guard: golden failed ${guardText(golden)}, the alternative failed ${guardText(alternative)}`;
    else if (!G.guardsCleared)
      reason =
        delta < -band
          ? `golden failed ${guardText(golden)}, so its ${gap} ${unit} lead (${means}) does not uphold it`
          : `golden failed ${guardText(golden)} and the ${gap} ${unit} difference (${means}) is within the ${fmt(band)} ${unit} band`;
    else reason = `the ${gap} ${unit} difference (${means}) is within the ${fmt(band)} ${unit} band; ${bothClear}`;
  }

  return {
    schema: "article-trial-verdict/1",
    verdict,
    reason,
    arms: [G, A],
    delta,
    band,
    ...(verdict === "void" ? {} : { deltaCi95: bootstrapDeltaCi(golden.observations, alternative.observations, sign) }),
    at: now.toISOString(),
  };
}
