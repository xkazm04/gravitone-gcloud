// LANE — DOES THE GRADER PREDICT THE HUMAN? (dynamic, foundry-forge-A)
//
// The forge draws two automatic scores under every cull tile, and the cull is
// where the human decides. pipeline/foundry/README.md calls grading "a
// pre-filter, never a verdict" and says the ledger is "how we learn whether the
// grader predicts the human" -- but nothing ever measured it across runs. The
// moonshot card measured it by hand on 2026-10-05 against the 87 rows of
// pipeline/foundry/ledger.json: craft ranks kept against rejected BACKWARDS
// (AUC 0.29), style is near chance (0.58), and the text veto has never fired.
// The meters were steering the curator the wrong way and nothing could say so.
//
// lib/foundry/calibration.ts is that measurement as a pure function, and this
// file holds it to the card's acceptance cases:
//
//   1. over the REAL tracked ledger: craft inverted, style chance, has_text
//      insufficient -- read from disk, never copied into a fixture, so a ledger
//      that changes moves this probe and not a stale constant;
//   2. below the minimum-sample floor a field is `insufficient` and carries no
//      AUC at all -- never a number that looks like a measurement;
//   4. a row graded by another grader version is excluded from the series and
//      counted in `other_graders`;
//   5. the cull-order function ignores a field the calibration says is inverted.
//
// Cases 3 (commitRun writes grader-calibration.json) and 6 (thumbnails kept
// before unlink) live in lib/foundry/store.ts's commit and wait for the
// foundry-engine-A write lock; they are not asserted here.
//
// And the cull itself: an inverted or chance field is drawn as a <Ghost> meter
// (signal vocabulary) with its accessible reading kept.

import { readFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ScoreMeters, ScorePill } from "@/app/foundry/ui";
import { Ghost } from "@/components/ui/signal";
import {
  CALIBRATION_METHOD,
  calibrate,
  calibrationFile,
  cullOrder,
  fieldStatus,
  seriesKey,
  type CalibrationRow,
} from "@/lib/foundry/calibration";
import type { Candidate, LedgerRow } from "@/lib/foundry/types";

const LEDGER = path.join(process.cwd(), "pipeline", "foundry", "ledger.json");
const realRows = (): LedgerRow[] => (JSON.parse(readFileSync(LEDGER, "utf8")) as { rows: LedgerRow[] }).rows;

/** n keeps and m rejects, with a field that separates them perfectly (or not). */
function rows(nKeep: number, nReject: number, opts: { craftKeep?: (i: number) => number; craftReject?: (i: number) => number; mechanism?: string; digest?: string | null } = {}): CalibrationRow[] {
  const out: CalibrationRow[] = [];
  for (let i = 0; i < nKeep; i++)
    out.push({ mechanism: opts.mechanism ?? "text", verdict: "keep", craft: opts.craftKeep?.(i) ?? 0.8 + i * 0.001, style_score: 0.5, has_text: false, grader: "g", grader_digest: opts.digest ?? null });
  for (let i = 0; i < nReject; i++)
    out.push({ mechanism: opts.mechanism ?? "text", verdict: "reject", craft: opts.craftReject?.(i) ?? 0.2 + i * 0.001, style_score: 0.5, has_text: false, grader: "g", grader_digest: opts.digest ?? null });
  return out;
}

/** Every element in a React element tree, function components left unexpanded. */
function elements(node: unknown, acc: { type: unknown; props: Record<string, unknown> }[] = []) {
  if (node == null || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const c of node) elements(c, acc);
    return acc;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type !== undefined && el.props !== undefined) {
    acc.push({ type: el.type, props: el.props });
    elements(el.props.children, acc);
  }
  return acc;
}
const textOf = (node: unknown): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  const el = node as { props?: { children?: unknown } };
  return el.props ? textOf(el.props.children) : "";
};

/* ── 1. the real ledger ───────────────────────────────────────────────────── */

test("calibration over the tracked ledger: craft inverted, style chance, has_text insufficient", () => {
  const all = realRows();
  // The walk read something: a ledger that came back empty would make every
  // field `insufficient` and the has_text assertion would pass vacuously.
  expect(all.length).toBeGreaterThanOrEqual(87);
  const cal = calibrate(all);
  expect(cal.n).toBe(all.length);

  const craft = cal.fields.craft.all;
  expect(craft.n_keep + craft.n_reject).toBe(all.length);
  expect(craft.auc).not.toBeNull();
  expect(craft.auc!).toBeCloseTo(0.29, 1);
  expect(craft.status).toBe("inverted");
  expect(craft.ci![1]).toBeLessThan(0.5);

  expect(cal.fields.style_score.all.status).toBe("chance");
  expect(cal.fields.style_score.all.auc!).toBeCloseTo(0.58, 1);

  expect(cal.fields.has_text.all.status).toBe("insufficient");
  expect(cal.fields.has_text.all.auc).toBeNull();

  // THE MECHANISM SPLIT IS MANDATORY: the card's own risk note says the
  // inversion may be a ref-early artifact. Both lanes are reported on their own.
  expect(Object.keys(cal.fields.craft.by_mechanism).sort()).toEqual(["ref-early", "text"]);
});

test("calibration is deterministic: a fixed seed, the same CI every time", () => {
  const a = calibrate(realRows());
  const b = calibrate(realRows());
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(CALIBRATION_METHOD.seed).toBeGreaterThan(0);
});

/* ── 2. the floor ─────────────────────────────────────────────────────────── */

test("below the floor a field is insufficient and carries no number", () => {
  const floor = CALIBRATION_METHOD.floor;
  // A perfect separator -- it would read calibrated if the floor were not there.
  const thin = calibrate(rows(floor - 1, 40));
  expect(thin.fields.craft.all.status).toBe("insufficient");
  expect(thin.fields.craft.all.auc).toBeNull();
  expect(thin.fields.craft.all.ci).toBeNull();
  expect(thin.fields.craft.all.short).toBe("floor");

  // At the floor the same separator is a calibrated field, and its reverse inverted.
  expect(calibrate(rows(floor + 4, floor + 4)).fields.craft.all.status).toBe("calibrated");
  expect(
    calibrate(rows(floor + 4, floor + 4, { craftKeep: (i) => 0.1 + i * 0.001, craftReject: (i) => 0.9 - i * 0.001 })).fields.craft.all.status,
  ).toBe("inverted");

  // A field that never varies is not evidence either way.
  const constant = calibrate(rows(20, 20));
  expect(constant.fields.has_text.all.status).toBe("insufficient");
  expect(constant.fields.has_text.all.short).toBe("constant");
});

/* ── 4. the grader digest ─────────────────────────────────────────────────── */

test("a row graded by another grader version is excluded and counted in other_graders", () => {
  const current = rows(12, 12, { digest: "aaaa1111bbbb2222" });
  const older = rows(3, 5, { digest: "0000ffff0000ffff" });
  const unstamped = rows(2, 2, { digest: null });
  const series = seriesKey(current[0]);
  expect(series).toBe("g@aaaa1111bbbb2222");
  expect(seriesKey(unstamped[0])).toBe("unstamped");

  const cal = calibrate([...current, ...older, ...unstamped], { series });
  expect(cal.series).toBe(series);
  expect(cal.n).toBe(24);
  expect(cal.fields.craft.all.n_keep + cal.fields.craft.all.n_reject).toBe(24);
  expect(cal.other_graders).toEqual({ "g@0000ffff0000ffff": 8, unstamped: 4 });

  // The file names every series the ledger holds, each measured on its own rows.
  const file = calibrationFile([...current, ...older, ...unstamped]);
  expect(Object.keys(file.series).sort()).toEqual(["g@0000ffff0000ffff", "g@aaaa1111bbbb2222", "unstamped"]);
  expect(file.series["g@aaaa1111bbbb2222"].n).toBe(24);
});

test("the tracked grader-calibration.json is the calibration of the tracked ledger", () => {
  const tracked = JSON.parse(readFileSync(path.join(process.cwd(), "pipeline", "foundry", "grader-calibration.json"), "utf8"));
  const fresh = calibrationFile(realRows());
  expect(tracked.method).toEqual(fresh.method);
  expect(Object.keys(tracked.series)).toEqual(Object.keys(fresh.series));
});

/* ── 5. the cull order ────────────────────────────────────────────────────── */

function cand(id: string, craft: number, style: number): Candidate {
  return {
    id,
    scene: "s",
    style: "st",
    mechanism: "text",
    seed: 1,
    file: `${id}.png`,
    sidecar: `${id}.json`,
    status: "graded",
    error: null,
    grade: {
      grader: "g",
      at: "",
      craft: { score: craft, per_field: {}, annotation: {} },
      style: { score: style, per_field: {}, readback: { has_text: false, render_mode: "", palette_strategy: "", edge_treatment: "", black_handling: "", dominant_colours: [], depiction: "" } },
      veto: { has_text: false },
      unmeasured: [],
    },
  };
}

test("the cull order ignores an inverted field", () => {
  // craft inverted (rejects score higher), style calibrated.
  const ledger: CalibrationRow[] = [
    ...rows(12, 12, { craftKeep: (i) => 0.1 + i * 0.001, craftReject: (i) => 0.9 - i * 0.001 }).map((r) => ({
      ...r,
      style_score: r.verdict === "keep" ? 0.9 : 0.1,
    })),
  ];
  const cal = calibrate(ledger);
  expect(fieldStatus(cal, "craft", "text")).toBe("inverted");
  expect(fieldStatus(cal, "style_score", "text")).toBe("calibrated");

  // high craft / low style first in input order; an order that read craft
  // would keep it first.
  const cs = [cand("a", 0.95, 0.2), cand("b", 0.1, 0.9), cand("c", 0.5, 0.5)];
  expect(cullOrder(cs, cal)).toEqual(["b", "c", "a"]);

  // Nothing calibrated: the order is the run's own, untouched.
  expect(cullOrder(cs, calibrate(realRows()))).toEqual(["a", "b", "c"]);
  expect(cullOrder(cs, null)).toEqual(["a", "b", "c"]);
});

test("the real ledger: no field steers the cull today", () => {
  const cal = calibrate(realRows());
  for (const m of ["text", "ref-early"]) {
    for (const f of ["craft", "style_score", "has_text"] as const) expect(fieldStatus(cal, f, m)).not.toBe("calibrated");
  }
});

/* ── the meters ───────────────────────────────────────────────────────────── */

test("an inverted or chance field is drawn as a Ghost, its accessible reading kept", () => {
  const tree = ScoreMeters({
    rows: [
      { label: "craft", value: 0.64, status: "inverted" },
      { label: "style", value: 0.5, status: "chance" },
      { label: "veto", value: 0.9, status: "calibrated" },
    ],
  });
  const all = elements(tree);
  const ghosts = all.filter((e) => e.type === Ghost);
  expect(ghosts.map((g) => g.props.label)).toEqual(["craft grader inverted", "style grader chance"]);
  // The screen-reader reading of the score stays whole.
  const sr = all.filter((e) => e.props.className === "sr-only").map((e) => textOf(e.props.children));
  expect(sr).toContain("craft 64%, partly held");
  expect(sr).toContain("veto 90%, held");

  // Without a status (or calibrated / insufficient) the meter is the meter.
  expect(elements(ScoreMeters({ rows: [{ label: "craft", value: 0.64 }] })).some((e) => e.type === Ghost)).toBe(false);
  expect(elements(ScoreMeters({ rows: [{ label: "craft", value: 0.64, status: "insufficient" }] })).some((e) => e.type === Ghost)).toBe(false);

  const pill = elements(ScorePill({ label: "craft", value: 0.64, status: "inverted" }));
  expect(pill.filter((e) => e.type === Ghost).map((g) => g.props.label)).toEqual(["craft grader inverted"]);
  expect(pill.filter((e) => e.props.className === "sr-only").map((e) => textOf(e.props.children))).toContain("craft 64%, partly held");
});
