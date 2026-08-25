// LANE — FORMAT-AWARE DIRECTION (dynamic, plus one source-coupled half).
//
// What landed: `Project.template` and `Project.targetS` now reach the art-
// direction pass, rendered into THE RUN by lib/formatBrief.ts from a table keyed
// on `TemplateId`. Three properties of that are worth a gate, and one of them is
// the reason this file exists at all.
//
//  1. EXHAUSTIVENESS is already held by the compiler (`Record<TemplateId, …>`),
//     but only for ids that go through `TEMPLATES`. This probe drives the real
//     catalogue and asserts a brief comes back for every entry — so the day
//     someone adds a format, the failure is here rather than in a silently
//     format-blind run.
//
//  2. NO INVENTED FORMAT. An id this studio does not know must produce a block
//     that says so. `templateOf` in lib/projects.ts deliberately falls back to
//     the middle template, which is right for a dropdown and would be a lie in a
//     prompt: it would put a format the user never chose into the model's
//     instructions with nothing on screen saying so. The fixture in
//     `_helpers.ts` already carries `template: "explainer"`, which is not a
//     `TemplateId` at all — an invalid id is not hypothetical here.
//
//  3. THE EVIDENCE CONTRACT, ENFORCED. knowledge/README.md: "A claim without a
//     label is not a claim, it is a preference", and the Frames step's own
//     PATTERNS.md refuses to ship a `params.json` rather than launder
//     impressions into machine-readable authority. Every one of these direction
//     lines lands in a prompt as instruction, where a model cannot tell an
//     impression from a measurement. So the rule is checked, not merely written
//     in the module header: any line carrying a digit must also carry its
//     label. The ONE exception is the rendered runtime, which is not a claim
//     about craft — it is the number the director typed into the create dialog.
//
// WHY ONE ASSERTION READS SOURCE. Whether the ROUTE actually sends the block
// cannot be observed from here: `app/api/frames/route.ts` builds its prompt
// inline and hands it to `runClaude`, which spawns the `claude` CLI, and a route
// file may not export a helper for a test to call (Next validates the export
// surface of `route.ts`). So the wiring is asserted against the source, in the
// same shape as harness-gate.probe.spec.ts — and it is labelled as such, because
// it proves the call is written, not that its output reached a model.

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { TEMPLATES, type TemplateId } from "@/lib/projects";
import { FORMAT_BRIEFS, compileFormatBrief, formatBriefFor, runtimeWords } from "@/lib/formatBrief";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const PROMPT_MD = "pipeline/FRAMES-SCENE-PROMPT.md";
const ROUTE_TS = "app/api/frames/route.ts";

/** The labels knowledge/README.md's evidence contract defines, plus the two
 *  lower-case forms the library itself uses in prose ("measured", "n=3"). */
const EVIDENCE = /MEASURED|OBSERVED|INFERRED|ASSUMED|measured|n=\d/;

test("every template in the catalogue has a format brief", () => {
  for (const t of TEMPLATES) {
    const brief = formatBriefFor(t.id);
    expect(brief, `no format brief for template "${t.id}"`).not.toBeNull();
    expect(brief!.name.length).toBeGreaterThan(0);
    expect(brief!.direction.length).toBeGreaterThan(0);
  }
  // And nothing extra: a brief for an id the catalogue dropped would render a
  // format nobody can choose.
  expect(Object.keys(FORMAT_BRIEFS).sort()).toEqual(TEMPLATES.map((t) => t.id).sort());
});

test("each brief names the knowledge document it was written from", () => {
  for (const id of Object.keys(FORMAT_BRIEFS) as TemplateId[]) {
    expect(FORMAT_BRIEFS[id].what, `${id}: \`what\` cites no source`).toContain(
      `knowledge/templates/${id}/`,
    );
  }
});

test("EVIDENCE CONTRACT: no number in the table without its label", () => {
  const unlabelled: string[] = [];
  for (const id of Object.keys(FORMAT_BRIEFS) as TemplateId[]) {
    const brief = FORMAT_BRIEFS[id];
    for (const line of [brief.name, brief.what, ...brief.direction]) {
      if (/\d/.test(line) && !EVIDENCE.test(line)) unlabelled.push(`${id}: ${line.slice(0, 90)}…`);
    }
  }
  console.log(`[format] ${Object.keys(FORMAT_BRIEFS).length} briefs checked, ${unlabelled.length} unlabelled`);
  expect(
    unlabelled,
    "a figure in a format brief with no MEASURED/OBSERVED/INFERRED/ASSUMED label. " +
      "knowledge/README.md: an estimate laundered into authority is worse than a gap.",
  ).toEqual([]);
});

test("a known format compiles into a block naming the format AND the runtime", () => {
  const out = compileFormatBrief("mid-educational-video", 300);
  expect(out).toContain("## THE FORMAT — what kind of piece this is");
  expect(out).toContain("a mid-length educational video");
  expect(out).toContain("300s (5:00)");
  expect(out).toContain("What the format changes about your direction:");
  // The direction notes are actually rendered, not just the heading.
  for (const d of FORMAT_BRIEFS["mid-educational-video"].direction) expect(out).toContain(d);
});

test("all three catalogue formats compile to DIFFERENT direction", () => {
  const blocks = TEMPLATES.map((t) => compileFormatBrief(t.id, t.defaultS));
  expect(new Set(blocks).size).toBe(TEMPLATES.length);
  for (const [i, t] of TEMPLATES.entries()) {
    expect(blocks[i]).toContain(FORMAT_BRIEFS[t.id].name);
    console.log(`[format] ${t.id} @ ${t.defaultS}s -> ${blocks[i].length} chars`);
  }
});

test("an UNKNOWN format is NOT filled in with a default", () => {
  // "explainer" is what tests/golden-path/_helpers.ts already stores.
  for (const bad of ["explainer", "trailer", "", "short-form", 7, null, undefined, {}]) {
    const out = compileFormatBrief(bad, 30);
    expect(out).toContain("## THE FORMAT — NOT STATED");
    for (const id of Object.keys(FORMAT_BRIEFS) as TemplateId[])
      expect(out, `"${String(bad)}" was answered with the ${id} brief`).not.toContain(
        FORMAT_BRIEFS[id].name,
      );
  }
});

test("a runtime that cannot be read is reported as absent, never printed", () => {
  for (const bad of [undefined, null, "120", NaN, Infinity, 0, -5, {}]) {
    expect(runtimeWords(bad)).toBeNull();
    const out = compileFormatBrief("short-form-clip", bad);
    expect(out).toContain("No target runtime was sent with this run.");
    expect(out).not.toContain("undefined");
    expect(out).not.toContain("NaN");
  }
  expect(runtimeWords(30)).toBe("30s");
  expect(runtimeWords(59)).toBe("59s");
  expect(runtimeWords(60)).toBe("60s (1:00)");
  expect(runtimeWords(125)).toBe("125s (2:05)");
});

test("the prompt's `## The format` section sits between the motion rules and the output contract", () => {
  const md = read(PROMPT_MD);
  const motion = md.indexOf("## Rules for the motion");
  const format = md.indexOf("## The format");
  const output = md.indexOf("## Output");
  expect(motion, `${PROMPT_MD}: no motion rules`).toBeGreaterThan(-1);
  expect(format, `${PROMPT_MD}: no \`## The format\` section`).toBeGreaterThan(-1);
  expect(output, `${PROMPT_MD}: no output contract`).toBeGreaterThan(-1);
  expect(motion).toBeLessThan(format);
  expect(format).toBeLessThan(output);
  // The section must carry the rule the compiler's NOT-STATED branch relies on:
  // absent a format, the model says so rather than assuming one.
  const section = md.slice(format, output);
  expect(section).toMatch(/states no format/i);
});

// SOURCE-COUPLED — see the header. This proves the call is written into the
// route, not that a model received its output.
test("the frames route compiles the format block into THE RUN (source-level)", () => {
  const src = read(ROUTE_TS);
  expect(src).toContain('from "@/lib/formatBrief"');
  expect(src).toContain("compileFormatBrief(body.template, body.targetS)");
  // Ahead of the script: the kind of piece frames how every beat after it reads.
  expect(src.indexOf("compileFormatBrief(body.template")).toBeLessThan(src.indexOf("## THE SCRIPT"));
});
