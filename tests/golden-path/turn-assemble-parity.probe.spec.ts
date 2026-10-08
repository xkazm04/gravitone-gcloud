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
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { POST as recalibratePOST } from "@/app/api/recalibrate/route";
import { POST as framesPOST } from "@/app/api/frames/route";
import { CONCLUSIONS } from "@/app/_phases/_shared/notebook/conclusions";
import { ATTRIBUTION } from "@/app/_phases/script/impact";
import { EDIT_PLAN_SCHEMA } from "@/app/_phases/script/editPlan";
import { compileFormatBrief } from "@/lib/formatBrief";
import { schemaInstruction } from "@/lib/text/json";
import { assembleFrames } from "@/lib/turns/assemble/frames";
import { assembleRecalibrate } from "@/lib/turns/assemble/recalibrate";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, withFakeEngine, type Cassette } from "./_helpers";

keepEnv([...FAKE_ENGINE_ENV, "TEXT_TURN_DIR", "TEXT_ENV", "LOCAL_BINARIES", "GOOGLE_AI_API_KEY", "NEXT_PUBLIC_DEV_AUTH", "LIGHTTRACK_DISABLE"]);

// /api/recalibrate runs as a ledger turn since AIO-A stage 2; its records go to
// a temp directory of this file's own, never foundry-out/.
let turnDir = "";
test.beforeAll(() => {
  turnDir = mkdtempSync(join(tmpdir(), "gravitone-parity-turns-"));
});
test.afterAll(() => {
  if (turnDir) rmSync(turnDir, { recursive: true, force: true });
});

test.beforeEach(() => {
  process.env.TEXT_TURN_DIR = turnDir;
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
function currentInputs(g: Golden): Record<string, string> {
  return KIND(g) === "recalibrate"
    ? { conclusions: short(CONCLUSIONS), attribution: short(ATTRIBUTION), editPlanSchema: short(EDIT_PLAN_SCHEMA) }
    : { formatBrief: sha(compileFormatBrief(g.body.template, g.body.targetS)).slice(0, 16) };
}

function staleInputs(g: Golden): string | null {
  const now = currentInputs(g);
  const moved = Object.entries(now)
    .filter(([k, v]) => g.inputs[k] !== v)
    .map(([k]) => k);
  return moved.length
    ? `${g.name}: the golden's input moved (${moved.join(", ")}) since ${g.capturedAt} - this is a fixture change, not ` +
        `assembly drift. Re-capture with TURN_GOLDEN_RECAPTURE=1, read the diff, and commit it.`
    : null;
}

/** The assembler's tail for a golden's body: its prompt minus the system prompt
 *  it was handed. */
function assembled(g: Golden, system: string) {
  return KIND(g) === "recalibrate" ? assembleRecalibrate({ ...g.body, conclusions: CONCLUSIONS }, system) : assembleFrames(g.body, system);
}

// RE-CAPTURE, ON PURPOSE ONLY. When a golden's INPUT moved (a conclusion edited,
// the edit-plan schema changed, a format brief rewritten), the golden is stale
// rather than the assembly wrong. `TURN_GOLDEN_RECAPTURE=1 npx playwright test
// turn-assemble-parity` rewrites every tail from the assembler; the diff is
// then READ before it is committed — a recapture accepts whatever the assembler
// builds now, so it is never the answer to a red parity case on its own.
if (process.env.TURN_GOLDEN_RECAPTURE === "1")
  test("recapture: rewrite every golden from the assembler", () => {
    for (const g of GOLDENS) {
      const system = systemFor(KIND(g));
      g.tail = assembled(g, system).prompt.slice(system.length);
      g.tailChars = g.tail.length;
      g.tailSha256 = sha(g.tail);
      g.inputs = currentInputs(g);
      g.capturedAt = new Date().toISOString().slice(0, 10);
      writeFileSync(join(GOLDEN_DIR, `${g.name}.json`), JSON.stringify(g, null, 2) + "\n");
      console.log(`[parity] recaptured ${g.name}: ${g.tailChars} chars`);
    }
  });

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
        // `?wait=1` and a projectId: recalibrate answers 202 by default since
        // AIO-A stage 2, and frames since stage 3. Neither reaches the prompt —
        // the assembler reads only the keys it names — which is exactly what
        // this case pins.
        new Request(`http://localhost/api/${kind}?wait=1`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": `10.79.0.${++ip}` },
          body: JSON.stringify({ ...g.body, ...(KIND(g) === "recalibrate" ? { conclusions: CONCLUSIONS } : {}), projectId: "p-parity" }),
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

/** The first place two strings part, with a little of each side: a sha
 *  mismatch alone says nothing about where to look. */
function firstDiff(want: string, got: string): string {
  let i = 0;
  while (i < want.length && i < got.length && want[i] === got[i]) i++;
  if (i === want.length && i === got.length) return "identical";
  return `at char ${i}: golden ${JSON.stringify(want.slice(i, i + 60))}, assembler ${JSON.stringify(got.slice(i, i + 60))}`;
}

for (const g of GOLDENS) {
  test(`assembler parity: ${g.name} is the golden byte for byte, and its manifest accounts for every char`, () => {
    const system = systemFor(KIND(g));
    const { prompt, manifest } = assembled(g, system);
    expect(firstDiff(system + g.tail, prompt), `${g.name}: the assembler drifted from the pre-extraction route`).toBe("identical");
    expect(manifest.totalChars).toBe(prompt.length);
    expect(manifest.blocks.reduce((n, b) => n + b.chars, 0), `${g.name}: the blocks do not sum to the prompt`).toBe(prompt.length);
    expect(manifest.blocks[0]).toEqual({ name: "system", chars: system.length + "\n\n---\n\n".length });

    // The system prompt is a prefix and nothing else: another one moves no byte
    // of what follows it.
    const other = assembled(g, "# A DIFFERENT SYSTEM PROMPT\n").prompt;
    expect(other.slice("# A DIFFERENT SYSTEM PROMPT\n".length)).toBe(g.tail);
  });
}
