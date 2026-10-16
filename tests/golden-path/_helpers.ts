// Shared fixtures for the golden-path dynamic probes.
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test } from "@playwright/test";

import { keepEnv, stripComments } from "./_pure";

export { keepEnv, stripComments };

import { cliArgs, probeClaude, USES_SHELL } from "@/lib/claudeCli";
import { retrieveArgs } from "@/lib/text/providers/claudeCliRetrieve";
import { closeKernel } from "@/lib/kernelStore";
import { PHASES, type PhaseKey, type PhaseState, type Project } from "@/lib/projects";

import { fingerprintOf, sha256 } from "../_engine/marker.mjs";


const allEmpty = (): Record<PhaseKey, PhaseState> =>
  Object.fromEntries(PHASES.map((p) => [p, "empty"])) as Record<PhaseKey, PhaseState>;

/** A valid v1 Project row (the fields the retired shelf read; lib/projects still reads them). */
export function mkProject(
  id: string,
  updatedAt: number,
  progress: Partial<Record<PhaseKey, PhaseState>> = {},
): Project {
  return {
    id,
    uid: "u1",
    title: `Project ${id}`,
    logline: "",
    template: "explainer" as Project["template"],
    targetS: 90,
    createdAt: updatedAt - 10_000,
    updatedAt,
    phase: "research",
    progress: { ...allEmpty(), ...progress },
  } as Project;
}

/** Walk a Playwright/React element tree, counting elements and collecting testids. */
export function walkTree(node: unknown, acc: { n: number; testids: string[]; handlers: unknown[] }) {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const c of node) walkTree(c, acc);
    return;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type !== undefined && el.props !== undefined) {
    acc.n++;
    const tid = el.props["data-testid"];
    if (typeof tid === "string") acc.testids.push(tid);
    if (typeof el.props.onClick === "function") acc.handlers.push(el.props.onClick);
    walkTree(el.props.children, acc);
  }
}

export const noopProps = {
  onOpen: () => {},
  onEdit: () => {},
  onDelete: () => {},
  onCreate: () => {},
};


/**
 * Aim the foundry's two VERSIONED indices at a fresh temp directory for the
 * duration of each test in the calling file, and return a getter for it.
 *
 * `pipeline/foundry/{ledger,styles}.json` are git-tracked, so before
 * `foundryFile()` existed (lib/foundry/store.ts) there was no way to watch a
 * commit do its work: `commitRun` and `commitExtractRun` could only be
 * exercised by letting them rewrite two files under version control, which no
 * probe may do. This helper is the other half of that override.
 *
 * A FRESH directory per test, not per file, because a commit's whole subject
 * is what the second call sees of the first — a shared directory would let
 * one test's rows decide another's count.
 *
 * Call it at FILE SCOPE. `keepEnv` is registered from inside so the snapshot
 * lands before the assignment and `FOUNDRY_DIR` is gone again afterwards, for
 * the same reason the doc above it gives.
 */
export function probeFoundryDir(): () => string {
  keepEnv(["FOUNDRY_DIR", "GRAVITONE_STORE_PATH"]);
  let dir = "";
  test.beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "foundry-probe-"));
    process.env.FOUNDRY_DIR = dir;
    // Since Phase 5 the catalogue's truth is the kernel store's `styles` table and styles.json its
    // export (lib/foundry/catalogue.ts). Each probe's catalogue gets its OWN store beside it, so
    // the styles.json a probe seeds is what that store imports on first touch - one store shared
    // by the lane would answer every later probe with the first probe's catalogue.
    process.env.GRAVITONE_STORE_PATH = path.join(dir, "store", "gravitone.sqlite");
  });
  test.afterEach(() => {
    // Close the process's store before deleting it: Windows refuses to remove an open file.
    closeKernel();
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });
  return () => dir;
}

/** Throw the probe's style store away (closed first: Windows will not delete an open file), so the
 *  styles.json the probe seeds next is what the store imports on its next first touch. For a probe
 *  that re-seeds INSIDE one test (a crash-prefix walk); `probeFoundryDir` already does it per test. */
export function resetStyleStore(): void {
  closeKernel();
  const at = process.env.GRAVITONE_STORE_PATH;
  if (at) rmSync(path.dirname(at), { recursive: true, force: true });
}

/* ── the engine stand-in lane (CIP-A) ────────────────────────────────────── */

/** The variables `withFakeEngine` writes. A probe that uses it registers these
 *  with `keepEnv` at file scope, on top of the helper's own `finally`, so a
 *  throw anywhere between the two still cannot leave the stand-in on PATH for
 *  every later file in this serial, single-process lane. */
export const FAKE_ENGINE_ENV = ["PATH", "FAKE_CLAUDE_CASSETTE", "FAKE_CLAUDE_LOG"] as const;

export const CASSETTE_DIR = path.join(process.cwd(), "tests", "_engine", "cassettes");
const FAKE_CLAUDE = path.join(process.cwd(), "tests", "_engine", "fake-claude.mjs");
/** What tests/_engine/fake-claude.mjs answers to `--version`. */
const FAKE_VERSION = "0.0.0-fake";

/**
 * How old a cassette may be before it is refused.
 *
 * The envelope is the CLI's contract, not ours, and it moves with CLI releases;
 * a cassette that is never re-checked is a claim about a binary nobody runs any
 * more. Past this window the probe fails with "re-record" rather than passing
 * against a shape that may no longer exist. A hand-written cassette is re-dated
 * by hand, after checking its envelope against one real
 * `claude -p --output-format json` answer.
 */
export const CASSETTE_MAX_AGE_DAYS = 180;

/** One scripted answer. `match` fields that are absent match anything. */
export interface CassetteTurn {
  match?: { heading?: string | null; headingSha256?: string | null; schemaSha256?: string | null };
  /** The prompt this envelope was recorded against — a hash and a length,
   *  never the text. `null` on a hand-written turn, which had no prompt. */
  prompt: { sha256: string; chars: number } | null;
  mode?: "ok" | "is_error" | "not-json" | "login-stderr" | "slow" | "stream" | `exit:${number}`;
  slowMs?: number;
  /** `mode: "stream"` only — the stream-json events written one per line, as
   *  the retrieval door reads them. `resultJson` fills the result event's
   *  `result` when it carries none. */
  stream?: Record<string, unknown>[];
  stderr?: string;
  envelope?: {
    type?: string;
    subtype?: string;
    is_error?: boolean;
    result?: string;
    session_id?: string;
    total_cost_usd?: number;
    duration_ms?: number;
    [k: string]: unknown;
  };
  /** Serialised into `envelope.result` by the stand-in. */
  resultJson?: unknown;
}

export interface Cassette {
  name: string;
  source: "hand-written" | "recorded";
  /** Which door's argv this cassette was made against: the reasoning door
   *  (`cliArgs`, the default) or the retrieval rung's (`retrieveArgs`,
   *  research-run-engine-B). The fingerprint below is checked against THAT
   *  door, so a change to either argv refuses only its own cassettes. */
  door?: "reason" | "retrieve";
  /** YYYY-MM-DD. */
  recordedAt: string;
  cliVersion: string;
  /** `cliArgsFingerprint(door)` when the cassette was made. */
  cliArgsFingerprint: string;
  turns: CassetteTurn[];
}

/** One invocation of the stand-in, as it recorded itself. Variable NAMES only. */
export interface FakeCall {
  kind: "version" | "turn";
  argv: string[];
  envKeys: string[];
  /** The stand-in's own pid (turns only) — the bottom of the spawned tree. */
  pid?: number;
  promptChars?: number;
  promptSha256?: string;
  heading?: string | null;
  headingSha256?: string | null;
  schemaSha256?: string | null;
  /** The cassette turn that answered, or null when none matched. */
  turn?: number | null;
  mode?: string | null;
}

/** The sha256 the stand-in computes for a schema the router appended, so a
 *  cassette's `match.schemaSha256` can be checked against the live schema. */
export const schemaSha256 = (schema: unknown): string => sha256(JSON.stringify(schema));

/** The argv the door sends, platform-neutral (the off-shell form). The model id
 *  is in it, so a model change, a flag change or a sandbox change all make
 *  every cassette refuse until it is re-recorded against the new door. */
export function cliArgsFingerprint(door: Cassette["door"] = "reason"): string {
  return fingerprintOf(door === "retrieve" ? retrieveArgs(false) : cliArgs(false));
}

export function loadCassette(name: string): Cassette {
  return JSON.parse(readFileSync(path.join(CASSETTE_DIR, `${name}.json`), "utf8")) as Cassette;
}

/** Why this cassette may not be played, or `null` when it may. */
export function cassetteStaleness(c: Cassette, now: number = Date.now()): string | null {
  const fp = cliArgsFingerprint(c.door);
  if (c.cliArgsFingerprint !== fp)
    return `cassette ${c.name} was made against ${c.door === "retrieve" ? "retrieveArgs()" : "cliArgs()"} ${c.cliArgsFingerprint}, and the door now sends ${fp} - re-record it.`;
  const at = Date.parse(`${c.recordedAt}T00:00:00Z`);
  if (!Number.isFinite(at)) return `cassette ${c.name} has no readable recordedAt (${c.recordedAt}) - re-record it.`;
  const days = Math.floor((now - at) / 86_400_000);
  if (days > CASSETTE_MAX_AGE_DAYS)
    return `cassette ${c.name} is ${days} days old, past the ${CASSETTE_MAX_AGE_DAYS}-day window - re-record it.`;
  return null;
}

/**
 * Run `fn` with the stand-in `claude` first on PATH, answering from `cassette`
 * (a name under tests/_engine/cassettes/, or an inline Cassette).
 *
 * Writes a platform shim into a fresh temp dir — `claude.cmd` where the door
 * spawns through cmd.exe (`USES_SHELL`), an executable `claude` elsewhere —
 * prepends that dir to PATH, and points the stand-in at the cassette and at a
 * side log `engine.calls()` reads back. Everything is put back in `finally`.
 *
 * TWO REFUSALS BEFORE `fn` RUNS, both loud:
 *   · a stale cassette (`cassetteStaleness`) throws "re-record";
 *   · `claude --version` must answer as the stand-in. This machine may have a
 *     real, logged-in `claude`; if the shim were ever not the one the shell
 *     resolved, the next turn would spend real money from a test. The check
 *     goes through `probeClaude`, i.e. the same spawn shape and environment
 *     the door uses.
 */
export async function withFakeEngine<T>(
  cassette: string | Cassette,
  fn: (engine: { calls: () => FakeCall[]; turns: () => FakeCall[] }) => Promise<T>,
): Promise<T> {
  const c = typeof cassette === "string" ? loadCassette(cassette) : cassette;
  const stale = cassetteStaleness(c);
  if (stale) throw new Error(stale);

  const dir = mkdtempSync(path.join(tmpdir(), "gravitone-engine-"));
  const cassetteFile = path.join(dir, "cassette.json");
  const log = path.join(dir, "calls.jsonl");
  writeFileSync(cassetteFile, JSON.stringify(c));
  if (USES_SHELL) {
    writeFileSync(
      path.join(dir, "claude.cmd"),
      ["@echo off", `"${process.execPath}" "${FAKE_CLAUDE}" %*`, "exit /b %ERRORLEVEL%", ""].join("\r\n"),
    );
  } else {
    const sh = path.join(dir, "claude");
    writeFileSync(sh, `#!/bin/sh\nexec "${process.execPath}" "${FAKE_CLAUDE}" "$@"\n`);
    chmodSync(sh, 0o755);
  }

  const saved = Object.fromEntries(FAKE_ENGINE_ENV.map((v) => [v, process.env[v]]));
  const calls = (): FakeCall[] =>
    existsSync(log)
      ? readFileSync(log, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l) as FakeCall)
      : [];
  try {
    process.env.PATH = `${dir}${path.delimiter}${saved.PATH ?? ""}`;
    process.env.FAKE_CLAUDE_CASSETTE = cassetteFile;
    process.env.FAKE_CLAUDE_LOG = log;

    const p = await probeClaude();
    if (!p.ok || p.version !== FAKE_VERSION)
      throw new Error(
        `withFakeEngine: \`claude --version\` answered ${JSON.stringify(p.version ?? p.detail)}, not the stand-in - ` +
          `refusing to send a turn that could reach a real engine.`,
      );

    return await fn({ calls, turns: () => calls().filter((x) => x.kind === "turn") });
  } finally {
    for (const v of FAKE_ENGINE_ENV) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
    rmSync(dir, { recursive: true, force: true });
  }
}
