// LANE — THE TWO DEAREST PROMPTS ARE PINNED BYTE FOR BYTE (dynamic, AIO-B acceptance 2).
//
// /api/recalibrate and /api/frames build the two most expensive prompts in the
// app, and AIO-B moves that assembly out of the route handlers into
// lib/turns/assemble/. A one-byte drift in either is a different question put
// to a model on the operator's seat, and nothing in a typecheck or a status
// code would show it. This is the instrument that would.
//
// THE GOLDENS (tests/_golden/turn-prompts/*.json) were captured from the routes'
// own inline assembly BEFORE the extraction: each fixture body was POSTed to the
// real handler, a stand-in `claude` wrote its stdin to a file, and the router's
// schema line (recalibrate only) was cut off the end. What is stored is the
// prompt AFTER the system prompt — the `tail`. The system prompt is a markdown
// file edited far more often than either handler; pinning it here would make
// every prompt edit look like assembly drift. It is read live and prepended.
//
// THE INPUTS ARE FINGERPRINTED, so a red here says which kind of change it is.
// The tail depends on module data the route imports (CONCLUSIONS, ATTRIBUTION,
// EDIT_PLAN_SCHEMA, the format brief). When one of those moves, the golden is
// stale rather than the assembly wrong, and the failure says so by name.
//
// TWO HALVES, BOTH THROUGH REAL CODE:
//   · through the ROUTE: the fixture is POSTed, `withFakeEngine` (CIP-A) puts
//     the cassette stand-in on PATH, and the sha256 of what reached its stdin is
//     compared with system + tail (+ the router's schema line). Nothing mocked.
//   · the ASSEMBLER, called directly (added with the extraction): its prompt
//     must equal system + tail exactly, and its manifest must account for every
//     character of it.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { POST as recalibratePOST } from "@/app/api/recalibrate/route";
import { POST as framesPOST } from "@/app/api/frames/route";
import { CONCLUSIONS } from "@/app/_phases/_shared/notebook/conclusions";
import { ATTRIBUTION } from "@/app/_phases/script/impact";
import { EDIT_PLAN_SCHEMA } from "@/app/_phases/script/editPlan";
import { compileFormatBrief } from "@/lib/formatBrief";
import { schemaInstruction } from "@/lib/text/json";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, withFakeEngine, type Cassette } from "./_helpers";

keepEnv([...FAKE_ENGINE_ENV, "TEXT_ENV", "LOCAL_BINARIES", "GOOGLE_AI_API_KEY", "NEXT_PUBLIC_DEV_AUTH", "LIGHTTRACK_DISABLE"]);

test.beforeEach(() => {
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "on";
  delete process.env.GOOGLE_AI_API_KEY;
  process.env.LIGHTTRACK_DISABLE = "1";
});

const ROOT = process.cwd();
const GOLDEN_DIR = join(ROOT, "tests", "_golden", "turn-prompts");
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const short = (v: unknown) => sha(JSON.stringify(v)).slice(0, 16);

interface Golden {
  name: string;
  route: string;
  capturedAt: string;
  inputs: Record<string, string>;
  body: Record<string, unknown>;
  tailChars: number;
  tailSha256: string;
  tail: string;
}

const KIND = (g: Golden): "recalibrate" | "frames" => (g.route.includes("recalibrate") ? "recalibrate" : "frames");

/** Derived from the directory, never listed — a golden added later is pinned
 *  without anyone remembering to name it here. */
const GOLDENS: Golden[] = readdirSync(GOLDEN_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(GOLDEN_DIR, f), "utf8")) as Golden);

const systemFor = (kind: "recalibrate" | "frames") =>
  readFileSync(join(ROOT, "pipeline", kind === "recalibrate" ? "RECALIBRATE-PROMPT.md" : "FRAMES-SCENE-PROMPT.md"), "utf8");

/** Why this golden can no longer speak for the assembly, or null. */
function staleInputs(g: Golden): string | null {
  const now =
    KIND(g) === "recalibrate"
      ? { conclusions: short(CONCLUSIONS), attribution: short(ATTRIBUTION), editPlanSchema: short(EDIT_PLAN_SCHEMA) }
      : { formatBrief: sha(compileFormatBrief(g.body.template, g.body.targetS)).slice(0, 16) };
  const moved = Object.entries(now)
    .filter(([k, v]) => g.inputs[k] !== v)
    .map(([k]) => k);
  return moved.length
    ? `${g.name}: the golden's input moved (${moved.join(", ")}) since ${g.capturedAt} - this is a fixture change, not ` +
        `assembly drift. Re-capture with TURN_GOLDEN_RECAPTURE=1, read the diff, and commit it.`
    : null;
}

test("goldens: the population is derived, covers both routes, and each one is intact", () => {
  console.log(`[parity] ${GOLDENS.length} goldens: ${GOLDENS.map((g) => g.name).join(", ")}`);
  expect(GOLDENS.filter((g) => KIND(g) === "recalibrate").length, "fewer than two recalibrate goldens").toBeGreaterThanOrEqual(2);
  expect(GOLDENS.filter((g) => KIND(g) === "frames").length, "fewer than two frames goldens").toBeGreaterThanOrEqual(2);
  // The withheld-material branches are the ones a refactor is likeliest to drop.
  expect(GOLDENS.some((g) => g.tail.includes("\n## RENDERS NOT SENT\n")), "no golden exercises RENDERS NOT SENT").toBe(true);
  expect(GOLDENS.some((g) => g.tail.includes("\n## CONCLUSIONS NOT SENT\n")), "no golden exercises CONCLUSIONS NOT SENT").toBe(true);
  for (const g of GOLDENS) {
    expect(sha(g.tail), `${g.name}: the stored tail no longer matches its own sha - the golden was hand-edited`).toBe(g.tailSha256);
    expect(g.tail.length).toBe(g.tailChars);
    expect(staleInputs(g)).toBeNull();
  }
});

/** A cassette for /api/frames: one unconditional turn answering an empty scene
 *  list. Frames has no cassette of its own in this tree (CIP-A's lane), and the
 *  answer is irrelevant here — only the stdin is read. Door metadata is borrowed
 *  from a live cassette so the staleness checks apply unchanged. */
function framesCassette(): Cassette {
  const base = loadCassette("recalibrate-ok");
  return {
    ...base,
    name: "turn-parity-frames",
    turns: [{ prompt: null, mode: "ok", envelope: base.turns[0]!.envelope, resultJson: { scenes: [] } }],
  };
}

let ip = 0;
for (const g of GOLDENS) {
  test(`route parity: ${g.name} reaches the engine byte-identical to the golden`, async () => {
    const kind = KIND(g);
    const system = systemFor(kind);
    const prompt = system + g.tail;
    const stdin = kind === "recalibrate" ? `${prompt}\n${schemaInstruction(EDIT_PLAN_SCHEMA)}` : prompt;
    const POST = kind === "recalibrate" ? recalibratePOST : framesPOST;
    await withFakeEngine(kind === "recalibrate" ? "recalibrate-ok" : framesCassette(), async (engine) => {
      const res = await POST(
        new Request(`http://localhost/api/${kind}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": `10.79.0.${++ip}` },
          body: JSON.stringify(g.body),
        }),
      );
      const turns = engine.turns();
      console.log(`[parity] ${g.name} -> ${res.status}, ${turns[0]?.promptChars ?? 0} chars reached the engine`);
      expect(turns, `${g.name}: no prompt reached the engine (status ${res.status})`).toHaveLength(1);
      expect(turns[0]!.promptChars, `${g.name}: the prompt's LENGTH moved`).toBe(stdin.length);
      expect(turns[0]!.promptSha256, `${g.name}: same length, different bytes`).toBe(sha(stdin));
    });
  });
}
