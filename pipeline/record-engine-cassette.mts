// RECORD AN ENGINE CASSETTE — one real `claude` turn, kept as an envelope (CIP-A).
//
//   npx tsx pipeline/record-engine-cassette.mts <name> --prompt <file> [--schema <file.json>] --yes
//
// THIS SPENDS. It sends one real turn through the operator's logged-in seat, at
// the door's own model and effort. It refuses without `--yes`, and nothing in
// `npm test` or `npm run verify` calls it: playback (tests/_engine/fake-claude.mjs
// behind `withFakeEngine`) is the lane's default, and `npm run verify:text` stays
// the live certification of the ladder.
//
// WHAT IT WRITES — tests/_engine/cassettes/<name>.json, in the shape the stand-in
// plays and tests/golden-path/_helpers.ts checks:
//   · the envelope exactly as the CLI returned it;
//   · the turn marker (first `# ` heading, sha256 of the appended schema line)
//     computed by tests/_engine/marker.mjs, the same module the stand-in uses to
//     select a turn — so a recording cannot be keyed differently from playback;
//   · `recordedAt`, the CLI's version, and the fingerprint of `cliArgs(false)`;
//   · the prompt's sha256 and length. NEVER ITS TEXT: a recalibration prompt
//     carries the creator's notebook and notes, and lib/text/log.ts's rule — the
//     characters that went in, never the prompt — holds for a fixture as much as
//     for a log line. The prompt file stays wherever the operator keeps it.
//
// The prompt is sent the way the router sends it to an engine that cannot
// enforce a schema: the prompt, then `schemaInstruction(schema)` when `--schema`
// is given. Spawned with the door's argv, shell setting and seat-only
// environment (lib/claudeCli.ts), because the envelope this produces has to be
// the one the door would have parsed.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { cliArgs, probeClaude, seatOnlyEnv, USES_SHELL } from "../lib/claudeCli";
import { schemaInstruction } from "../lib/text/json";
import { fingerprintOf, markerOf, sha256 } from "../tests/_engine/marker.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const name = argv[0];
const promptFile = flag("--prompt");
const schemaFile = flag("--schema");

if (!name || name.startsWith("--") || !promptFile) {
  console.error("usage: npx tsx pipeline/record-engine-cassette.mts <name> --prompt <file> [--schema <file.json>] --yes");
  process.exit(2);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  console.error(`cassette name "${name}" must be lowercase words joined by hyphens.`);
  process.exit(2);
}
if (!argv.includes("--yes")) {
  console.error("This sends one real, billed turn through the logged-in `claude`. Re-run with --yes to record.");
  process.exit(2);
}

const base = readFileSync(promptFile, "utf8");
const schema = schemaFile ? (JSON.parse(readFileSync(schemaFile, "utf8")) as Record<string, unknown>) : null;
const prompt = schema ? `${base}\n${schemaInstruction(schema)}` : base;

const version = await probeClaude();
if (!version.ok) {
  console.error(`No usable \`claude\` here: ${version.detail}`);
  process.exit(1);
}

const raw = await new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
  const child = spawn("claude", cliArgs(), { stdio: ["pipe", "pipe", "pipe"], shell: USES_SHELL, env: seatOnlyEnv() });
  let out = "";
  let err = "";
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (err += c));
  child.stdin.on("error", () => {});
  child.on("close", (code) => resolve({ code, out, err }));
  child.stdin.end(prompt);
});

let envelope: Record<string, unknown>;
try {
  envelope = JSON.parse(raw.out) as Record<string, unknown>;
} catch {
  console.error(`The CLI exited ${raw.code} without a JSON envelope. stderr: ${raw.err.slice(-400)}`);
  process.exit(1);
}

const cassette = {
  name,
  source: "recorded",
  recordedAt: new Date().toISOString().slice(0, 10),
  cliVersion: version.version ?? "unknown",
  cliArgsFingerprint: fingerprintOf(cliArgs(false)),
  turns: [
    {
      match: markerOf(prompt),
      prompt: { sha256: sha256(prompt), chars: prompt.length },
      mode: envelope.is_error ? "is_error" : "ok",
      envelope,
    },
  ],
};

const dir = path.join(ROOT, "tests", "_engine", "cassettes");
mkdirSync(dir, { recursive: true });
const at = path.join(dir, `${name}.json`);
writeFileSync(at, `${JSON.stringify(cassette, null, 2)}\n`);
console.log(
  `recorded ${path.relative(ROOT, at)}: ${prompt.length} prompt chars, ` +
    `cost ${String(envelope.total_cost_usd ?? "unreported")}, subtype ${String(envelope.subtype)}`,
);
