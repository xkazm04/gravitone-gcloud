// VERIFY THE REASONING ENGINE — the pass that turns claims into measurements.
//
//   npx tsx pipeline/verify-text-engine.mts            # ladder behaviour only (free)
//   npx tsx pipeline/verify-text-engine.mts --roster   # + list what the key can reach (free)
//   npx tsx pipeline/verify-text-engine.mts --spend    # + real turns through the router (costs)
//
// WHY THIS EXISTS. lib/text/providers/google.ts's MODEL_FOR_TURN table and
// lib/text/pricing.ts's rows both carry dated measurements and both tell the
// reader to "re-run the pass" before promoting a model or filling in a rate.
// A comment that names a pass nobody can run is folklore, so here is the pass.
//
// It was written because the first draft of that table named `gemini-3.6-pro`,
// a model that does not exist on the roster — every edit-plan turn would have
// 404'd, and nothing in the repo would have said so until a creator clicked
// Recalibrate. `--roster` is the check that would have caught it in two seconds.
//
// WHAT IT COSTS. Nothing by default: the ladder checks use the posture gates and
// the probes, which are zero-token by construction. `--roster` calls
// `models.list`, which is free. Only `--spend` sends real turns, and it sends
// the smallest ones that can still prove native schema enforcement worked.
//
// NOT A TEST. It talks to a live vendor, so it can fail for reasons that are
// nobody's fault (the 503 this pass recorded for gemini-3.7-flash). Keeping it
// out of `npm test` is deliberate — a suite that goes red when a vendor is busy
// teaches people to ignore red suites.

import fs from "node:fs";
import path from "node:path";

/** Load .env then .env.local, without clobbering anything already exported.
 *  Next does this for the app; a bare tsx process gets nothing. */
function loadEnv(root: string) {
  for (const f of [".env", ".env.local"]) {
    const at = path.join(root, f);
    if (!fs.existsSync(at)) continue;
    for (const line of fs.readFileSync(at, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (v && process.env[k] === undefined) process.env[k] = v;
    }
  }
}

const ROOT = path.resolve(import.meta.dirname, "..");
loadEnv(ROOT);

const { reason, engineStatus, planFor } = await import("../lib/text/router");
const { currentTextEnv } = await import("../lib/text/env");
const { localPosture, describePosture } = await import("../lib/deployment");

const wantRoster = process.argv.includes("--roster");
const wantSpend = process.argv.includes("--spend");

const rule = (s: string) => console.log(`\n${s}\n${"─".repeat(s.length)}`);

/* ───────────────────────────────────────────── 1 · posture, free */

rule("POSTURE");
console.log(`  local posture : ${localPosture()} — ${describePosture()}`);
console.log(`  text env      : ${currentTextEnv()}  (TEXT_ENV=${process.env.TEXT_ENV || "unset"})`);
for (const turn of ["edit-plan", "scene-direction"] as const)
  console.log(`  plan[${turn}] : ${planFor(turn).join(" -> ")}`);

rule("PROBES (zero-token)");
const st = await engineStatus("edit-plan");
console.log(`  env=${st.env} serving=${st.serving ?? "NOBODY"}`);
for (const c of st.candidates) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.provider.padEnd(11)} ${c.detail}`);

/* ───────────────────────────────────────────── 2 · roster, free */

if (wantRoster) {
  rule("ROSTER — what this key can actually reach");
  const key = process.env.GOOGLE_AI_API_KEY?.trim();
  if (!key) console.log("  GOOGLE_AI_API_KEY is not set; skipping.");
  else {
    const base = process.env.GOOGLE_TEXT_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta";
    const models: { name: string; supportedGenerationMethods?: string[] }[] = [];
    let pageToken: string | undefined;
    do {
      const u = new URL(`${base}/models`);
      u.searchParams.set("pageSize", "200");
      if (pageToken) u.searchParams.set("pageToken", pageToken);
      const r = await fetch(u, { headers: { "x-goog-api-key": key } });
      if (!r.ok) {
        console.log(`  models.list -> HTTP ${r.status}. The key cannot enumerate the roster.`);
        break;
      }
      const j = (await r.json()) as { models?: typeof models; nextPageToken?: string };
      models.push(...(j.models ?? []));
      pageToken = j.nextPageToken;
    } while (pageToken);

    const ids = new Set(models.map((m) => m.name.replace("models/", "")));
    console.log(`  ${models.length} model(s) on the roster.`);
    // THE CHECK THAT MATTERS: is every id this app would send actually there?
    for (const [turn, envVar, fallback] of [
      ["edit-plan", "GOOGLE_TEXT_MODEL_PLAN", "gemini-3.1-pro-preview"],
      ["scene-direction", "GOOGLE_TEXT_MODEL", "gemini-3.6-flash"],
    ] as const) {
      const id = process.env[envVar]?.trim() || fallback;
      console.log(`  ${ids.has(id) ? "ok   " : "ABSENT"} ${turn.padEnd(16)} -> ${id}`);
    }
  }
}

/* ───────────────────────────────────────────── 3 · real turns, costs money */

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: { renderId: { type: "string" }, op: { type: "string" } },
        required: ["renderId", "op"],
      },
    },
  },
  required: ["summary", "edits"],
};

type Prov = Awaited<ReturnType<typeof reason>>["provenance"];
const show = (label: string, p: Prov, json: unknown) => {
  console.log(`  ${label}`);
  console.log(`    provider=${p.provider} model=${p.model} rung=${p.rung} transport=${p.transport}`);
  console.log(`    schema=${p.schemaEnforcement} cost=${p.costUsd ?? "unpriced"} (${p.costBasis}) ms=${p.durationMs}`);
  if (p.reroutedFrom)
    console.log(`    reroutedFrom=${p.reroutedFrom.map((s) => `${s.provider}:${s.why}`).join(",")}`);
  console.log(`    json=${JSON.stringify(json).slice(0, 130)}`);
};

if (wantSpend) {
  rule("REAL TURNS (spends)");

  // A · cloud posture — google is the only rung, so it serves as `preferred`.
  process.env.TEXT_ENV = "cloud";
  delete process.env.LOCAL_BINARIES;
  {
    const r = await reason({
      prompt: "Render r-1 runs long. Propose exactly one edit that shortens it. Summary under 12 words.",
      turn: "edit-plan",
      schema: SCHEMA,
    });
    show("A · cloud posture · edit-plan", r.provenance, r.json);
  }

  // B · local posture with the binary forbidden. THE LADDER MUST DESCEND and
  //     record why — this is the non-silent-elimination invariant, live.
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "off";
  {
    const r = await reason({
      prompt: "A beat about compound interest. Reply with a summary and an empty edits array.",
      turn: "scene-direction",
      schema: SCHEMA,
    });
    show("B · local posture, LOCAL_BINARIES=off · scene-direction", r.provenance, r.json);
    if (r.provenance.rung !== "alternate" || !r.provenance.reroutedFrom?.length)
      console.log("    !! expected rung=alternate WITH a descent record. The ladder is not labelling itself.");
  }

  // C · nothing available. The bottom must be an honest refusal naming every
  //     candidate — not a bare failure, and not an empty success.
  const saved = process.env.GOOGLE_AI_API_KEY;
  delete process.env.GOOGLE_AI_API_KEY;
  try {
    await reason({ prompt: "x", turn: "edit-plan" });
    console.log("  C · !! rung 4 did not refuse. That is a bug.");
  } catch (e) {
    const err = e as { kind?: string; message?: string };
    console.log(`  C · bottom of the ladder — kind=${err.kind}`);
    console.log(`      ${err.message}`);
  }
  process.env.GOOGLE_AI_API_KEY = saved;
} else {
  console.log("\n(--spend not given: no real turns were sent, so nothing was billed.)");
}

console.log("");
