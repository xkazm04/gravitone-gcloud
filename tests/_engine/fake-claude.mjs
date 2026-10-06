#!/usr/bin/env node
// A STAND-IN FOR THE `claude` BINARY — replays a recorded envelope (CIP-A).
//
// lib/claudeCli.ts is the single spawn door for every reasoning turn, and until
// this file the probe lane could only exercise that door with NOTHING behind
// it (cli-transport-resilience empties PATH) or with a replica of the spawn
// (cli-sandbox-args used to echo argv through its own `spawn`). A successful
// turn through the real door — the real argv, the real shell quoting on
// Windows, the real seat-only environment, the real envelope parse — had never
// run outside `npm run verify:text`, which spends.
//
// So this is put FIRST ON PATH by `withFakeEngine` (tests/golden-path/
// _helpers.ts), behind a platform shim (`claude.cmd` on win32, where the door
// spawns through cmd.exe; an executable `claude` elsewhere). Production code
// has no injection point and gains none: the door spawns "claude" and this is
// what the shell finds.
//
// WHAT IT DOES
//   · `--version` answers with FAKE_VERSION and exits 0, so the router's probe
//     (probeClaude) sees an installed engine. The probe helper also uses that
//     answer to prove the fake — not a real, spending `claude` — is the one the
//     shell resolved, before any turn is sent.
//   · Otherwise it reads the prompt from stdin, derives the TURN MARKER from it
//     (the first `# ` heading line — or its sha256, for a heading that is a
//     prompt document's own text — and the sha256 of the one-line JSON Schema
//     lib/text/router.ts appends after "It must satisfy this JSON Schema:"),
//     picks the cassette turn whose `match` agrees, and answers in that turn's
//     mode. No match is exit 3 with a sentence saying "re-record": a schema or
//     prompt that moved under a cassette fails loudly, never silently passes.
//   · Every invocation appends one JSON line to FAKE_CLAUDE_LOG — argv, the
//     NAMES of the environment variables it received (never their values), and
//     the prompt's length and sha256. Never the prompt text: that is
//     lib/text/log.ts's rule, and a side log is a log.
//
// MODES (cassette turn `mode`, default `ok`)
//   ok            the envelope on stdout, exit 0
//   is_error      the envelope with is_error forced true, exit 0
//   not-json      prose on stdout, exit 0
//   login-stderr  a login complaint on stderr, exit 1
//   exit:N        the turn's `stderr` (if any) on stderr, exit N
//   slow          waits `slowMs` (default 2000), then as `ok`
//   stream        the turn's `stream` events as stream-json lines, exit 0 —
//                 the retrieval door's output (waits `slowMs` first if set)
//
// A turn may carry `resultJson` instead of a string `envelope.result`; it is
// serialised here, so a hand-written cassette does not have to hold JSON
// escaped inside JSON. A recorded cassette holds the string the CLI returned.

import { appendFileSync, readFileSync } from "node:fs";

import { markerOf, sha256 } from "./marker.mjs";

const FAKE_VERSION = "0.0.0-fake";
const NL = "\n";

const argv = process.argv.slice(2);
const envKeys = Object.keys(process.env).sort();

function record(entry) {
  const log = process.env.FAKE_CLAUDE_LOG;
  if (log) appendFileSync(log, JSON.stringify(entry) + NL);
}

/** Write and let the process end on its own with `code`. A pipe may be
 *  asynchronous (it is on some platforms), and `process.exit` straight after
 *  `write` can drop the very envelope this lane exists to deliver. */
function finish(stream, text, code) {
  process.exitCode = code;
  stream.write(text);
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

/** The turn whose `match` agrees with the marker (./marker.mjs). Both halves of
 *  the marker are derived from the prompt the door actually wrote, so a
 *  selected turn is evidence that this prompt, with this schema, reached the
 *  engine. Absent `match` fields match anything. */
function pick(cassette, marker) {
  const turns = Array.isArray(cassette.turns) ? cassette.turns : [];
  const i = turns.findIndex((t) => {
    const m = t.match ?? {};
    if (m.heading !== undefined && m.heading !== marker.heading) return false;
    if (m.headingSha256 !== undefined && m.headingSha256 !== marker.headingSha256) return false;
    if (m.schemaSha256 !== undefined && m.schemaSha256 !== marker.schemaSha256) return false;
    return true;
  });
  return i < 0 ? null : { index: i, turn: turns[i] };
}

function envelopeOf(turn, forceError) {
  const env = { ...(turn.envelope ?? {}) };
  if (turn.resultJson !== undefined) env.result = JSON.stringify(turn.resultJson);
  if (forceError) {
    env.is_error = true;
    if (!env.subtype || env.subtype === "success") env.subtype = "error_during_execution";
  }
  return JSON.stringify(env);
}

async function main() {
  if (argv.includes("--version")) {
    record({ kind: "version", argv, envKeys });
    return finish(process.stdout, `${FAKE_VERSION} (Claude Code stand-in)${NL}`, 0);
  }

  const prompt = await readStdin();
  const marker = markerOf(prompt);
  // `pid` is this process's own: the bottom of the tree the door spawned (under
  // cmd.exe on win32). A probe that cancels a turn asks whether it is still
  // alive, the sleeper-pid technique cli-kill-tree uses for the timeout.
  const seen = {
    kind: "turn",
    argv,
    envKeys,
    pid: process.pid,
    promptChars: prompt.length,
    promptSha256: sha256(prompt),
    ...marker,
  };

  let cassette;
  try {
    cassette = JSON.parse(readFileSync(process.env.FAKE_CLAUDE_CASSETTE ?? "", "utf8"));
  } catch {
    record({ ...seen, turn: null, mode: null });
    const at = process.env.FAKE_CLAUDE_CASSETTE ?? "(unset)";
    return finish(process.stderr, `fake-claude: no readable cassette at FAKE_CLAUDE_CASSETTE=${at}${NL}`, 3);
  }

  const hit = pick(cassette, marker);
  record({ ...seen, turn: hit ? hit.index : null, mode: hit ? (hit.turn.mode ?? "ok") : null });
  if (!hit) {
    const schema = marker.schemaSha256 ? marker.schemaSha256.slice(0, 12) : "none";
    return finish(
      process.stderr,
      `fake-claude: cassette ${cassette.name ?? "(unnamed)"} has no turn for heading=${marker.heading} ` +
        `schema=${schema} - the prompt or schema moved; re-record.${NL}`,
      3,
    );
  }

  const { turn } = hit;
  const mode = String(turn.mode ?? "ok");

  if (mode === "slow") await new Promise((r) => setTimeout(r, Number(turn.slowMs ?? 2000)));
  if (mode === "stream") {
    // The retrieval door's shape (research-run-engine-B): stream-json, one
    // event per line. `slowMs` holds the stream back so a cancel can land
    // while a run is in flight.
    if (turn.slowMs) await new Promise((r) => setTimeout(r, Number(turn.slowMs)));
    const events = Array.isArray(turn.stream) ? turn.stream : [];
    const lines = events.map((e) =>
      JSON.stringify(
        e && e.type === "result" && e.result === undefined && turn.resultJson !== undefined
          ? { ...e, result: JSON.stringify(turn.resultJson) }
          : e,
      ),
    );
    return finish(process.stdout, lines.join(NL) + NL, 0);
  }
  if (mode === "ok" || mode === "slow" || mode === "is_error")
    return finish(process.stdout, envelopeOf(turn, mode === "is_error"), 0);
  if (mode === "not-json")
    return finish(process.stdout, `I have read the notebook and here are my thoughts, in prose.${NL}`, 0);
  if (mode === "login-stderr") return finish(process.stderr, `Invalid API key - Please run /login${NL}`, 1);

  const exit = /^exit:(\d+)$/.exec(mode);
  if (exit) {
    const line = turn.stderr ?? `fake-claude: scripted exit ${exit[1]}`;
    return finish(process.stderr, `${String(line)}${NL}`, Number(exit[1]));
  }

  return finish(process.stderr, `fake-claude: unknown mode ${mode}${NL}`, 3);
}

await main();
