import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PartView } from "@gt/domain/partView";
import type { PlanPart, PlanView } from "@gt/domain/produce";

import { loadPart, resetParts } from "../../app/(studio)/projects/[id]/_part/fixture.ts";
import { resetProduce } from "../../app/(studio)/projects/_port/fixture.ts";
import { fixtureProduce } from "../../app/(studio)/projects/_port/port.ts";

// THE FIXTURE WORLD AGREES WITH ITSELF (registry demo-data-plane, fixture-self-consistency: every
// fixture in the demo world projects from one source). The source is the produce fixture's Plan;
// the part editors' records are projected from it (app/(studio)/projects/[id]/_part/fixtureWorld/).
// For every project the fixture universe seeds, every Plan row with an editor is read through the
// part fixture's public `loadPart` and held to what its state claims:
//
//   ratified   the editor's verdict is READY, and what the part MADE equals the Plan's units
//              (plates composed, clips rendered, cues with a take, exports);
//   running    the editor's `running` names the Plan's job;
//   failed     the editor is not READY and made less than the Plan planned;
//   otherwise  nothing is made (draft, queued, blocked, paused): no unit made, not READY.
//
// And a picture the editor derives is the picture the Plan planned: once Frames has units, their
// count is the Plan's plate count. Editing either side alone breaks a row here - a Plan literal
// typed beside the derived cut, a landing removed, a job state flipped.

const at = Date.parse("2026-11-09T09:00:00Z");

beforeEach(() => {
  resetProduce(at);
  resetParts();
});

type Work = Extract<PlanPart, { readonly units: number }>;
const isWork = (p: PlanPart): p is Work => p.kind !== "gate" && p.kind !== "slot";
const keyOf = (projectId: string, p: PlanPart): string => p.id.slice(projectId.length + 1);

/** What a part made, in its Plan unit; null for a kind the Plan counts in turns or runs. */
function made(v: PartView): number | null {
  switch (v.kind) {
    case "frames":
      return v.data.face === "takes" ? v.data.shots.filter((s) => s.adopted !== null).length : v.data.tally.composed;
    case "motion":
      return v.data.face === "clips" ? v.data.shots.filter((s) => s.adopted !== null).length : v.data.tally.clips;
    case "score":
      return v.data.face === "bed" ? (v.data.activeTakeId === null ? 0 : 1) : v.data.cues.filter((c) => c.activeTakeId !== null).length;
    case "cut":
      return v.data.face === "finish" ? v.data.aspects.filter((a) => a.export !== null).length : v.data.exports.length;
    default:
      return null;
  }
}

/** Rows that claim work the fixture holds nothing to back, each with why. A row listed here must
 *  STILL disagree: the day it agrees, its line comes out (the last test below). */
const KNOWN_GAPS: Readonly<Record<string, string>> = {
  // No notebook was ever transcribed for this topic (fixtureResearch REPLAYS holds why-bitcoin's
  // run only), so research, the script over it and the score over its picture have nothing to show.
  "the-quiet-tariff/research": "no notebook transcribed for the tariff topic",
  "the-quiet-tariff/script": "no notebook, so no candidate to adopt",
  "the-quiet-tariff/score": "no adopted script, so no picture to spot",
};

type Row = { readonly project: string; readonly key: string; readonly part: Work; readonly view: PartView };

function world(): { plans: PlanView[]; rows: Row[] } {
  // The first part read composes the part side's own seeds (ads, free, album) through the port.
  const first = loadPart("why-bitcoin", "research", at);
  if (!first.ok) throw first.error;
  const list = fixtureProduce().listProjects();
  if (!list.ok) throw list.error;
  const plans: PlanView[] = [];
  const rows: Row[] = [];
  for (const p of list.value.projects) {
    const plan = fixtureProduce().loadPlan({ id: p.id });
    if (!plan.ok) throw plan.error;
    plans.push(plan.value);
    for (const part of plan.value.parts.filter(isWork)) {
      const key = keyOf(p.id, part);
      const view = loadPart(p.id, key, at);
      if (view.ok) rows.push({ project: p.id, key, part, view: view.value });
      // A part with no editor (an album's still) answers not-found; anything else is a defect.
      else expect(view.error.code, `${p.id}/${key}`).toBe("not-found");
    }
  }
  return { plans, rows };
}

/** One row against the law; the words name what disagrees. */
function breach(r: Row): string | null {
  const v = r.view;
  const n = made(v);
  const units = r.part.units;
  switch (r.part.state) {
    case "ratified":
      if (v.verdict.state !== "ready") return `ratified, editor ${v.verdict.state}: ${v.verdict.codes.map((c) => c.text).join(" · ")}`;
      return n !== null && n !== units ? `ratified ${units} ${r.part.unitNoun}, editor made ${n}` : null;
    case "running":
      return v.running.some((x) => x.jobId === r.part.jobId) ? null : `running ${r.part.jobId ?? "(no job)"}, editor shows no running job`;
    case "failed":
      if (v.verdict.state === "ready") return "failed, editor READY";
      return n !== null && n >= units ? `failed, editor made all ${n}` : null;
    default:
      if (v.verdict.state === "ready") return `${r.part.state}, editor READY`;
      return n !== null && n > 0 ? `${r.part.state}, editor made ${n}` : null;
  }
}

describe("the fixture world: what a Plan row claims, its part editor shows", () => {
  it("holds for every Plan row of every seeded project", () => {
    const { rows } = world();
    const broken = rows.flatMap((r) => {
      const id = `${r.project}/${r.key}`;
      const b = breach(r);
      return b === null || id in KNOWN_GAPS ? [] : [`${id}: ${b}`];
    });
    expect(broken).toEqual([]);
    // Every seeded project is read: the five produce seeds, the teaser, and the part side's three.
    expect(new Set(rows.map((r) => r.project)).size).toBeGreaterThanOrEqual(9);
  });

  it("draws the picture the Plan planned: once Frames has units, their count is the Plan's plates", () => {
    const { rows } = world();
    const frames = rows.filter((r) => r.view.kind === "frames" && r.view.data.face !== "takes" && r.view.data.tally.total > 0);
    expect(frames.map((r) => r.project).sort()).toEqual(["glass-harbor-teaser", "glass-harbor-trailer"]);
    for (const r of frames) if (r.view.kind === "frames" && r.view.data.face !== "takes") expect(r.view.data.tally.total, r.project).toBe(r.part.units);
  });

  it("lands each done job as one write the undo trail never offers (a job's write is not an operator's step)", () => {
    const { rows } = world();
    const trailer = rows.filter((r) => r.project === "glass-harbor-trailer" && ["frames", "motion", "score", "cut"].includes(r.key));
    expect(trailer.map((r) => [r.key, r.view.ops])).toEqual(trailer.map((r) => [r.key, []]));
    for (const r of trailer) expect(r.view.rev, r.key).toBe(2);
  });

  it("keeps every unmade, waiting and failed state the editors are photographed and tested in", () => {
    const { plans, rows } = world();
    const at_ = (project: string, key: string): PartView => {
      const r = rows.find((x) => x.project === project && x.key === key);
      if (r === undefined) throw new Error(`${project}/${key} not read`);
      return r.view;
    };
    // The trailer's unmade picture: shots without plates, cues not spotted, a cut with no picture.
    expect(at_("glass-harbor-teaser", "frames").verdict.codes).toEqual([{ code: "plates-composed", text: "0 of 30 plates composed" }]);
    expect(at_("glass-harbor-teaser", "score").verdict.codes).toEqual([{ code: "no-cues", text: "no cues spotted" }]);
    expect(at_("glass-harbor-teaser", "cut").verdict.codes).toEqual([{ code: "no-picture", text: "no picture to cut" }]);
    // A plan with nothing made: every editor empty.
    expect(rows.filter((r) => r.project === "untitled-port-strike").map((r) => [r.key, r.view.verdict.state])).toEqual(
      rows.filter((r) => r.project === "untitled-port-strike").map((r) => [r.key, "empty"]),
    );
    // A turn in flight: the script's running job, with the stage the Plan's job reports.
    expect(at_("why-bitcoin", "script").running).toEqual([expect.objectContaining({ jobId: "job:part:why-bitcoin:script", act: "compose-candidates", stage: "turn 2 of 2" })]);
    // A failed part: the Plan carries the job's own words; its editor is not READY.
    const tariff = plans.find((p) => p.project.id === "the-quiet-tariff")?.parts.find((p) => p.id === "the-quiet-tariff:frames");
    expect(tariff && isWork(tariff) ? [tariff.state, tariff.error] : null).toEqual(["failed", "gate: 0 of 18 plates kept · reason style · re-run needs a new route"]);
    expect(at_("the-quiet-tariff", "frames").verdict.state).not.toBe("ready");
  });

  it("names only gaps that are still gaps", () => {
    const { rows } = world();
    for (const id of Object.keys(KNOWN_GAPS)) {
      const r = rows.find((x) => `${x.project}/${x.key}` === id);
      expect(r === undefined ? "not read" : breach(r), id).not.toBeNull();
    }
  });
});
