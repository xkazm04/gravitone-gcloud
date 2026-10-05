// THE RETRIEVAL RUNG — the local engine, allowed to search and fetch, and
// nothing else (research-run-engine-B, stages 1-2).
//
// /api/research's header has said since it was written that "THIS ENGINE CANNOT
// SEARCH, on either rung", and that the honest upgrade is "a second capability
// and a second adapter". This is the adapter. It is reached only through
// router.ts::retrieve, only when the operator has set TEXT_RETRIEVE (env.ts),
// and only for a turn the router's RETRIEVE_PLAN names.
//
// ── THE FENCE, STATED WHERE IT IS BUILT ─────────────────────────────────────
//
// A fetched page is untrusted text, and the model reading it can be talked into
// things. The answer is to make "things" mean nothing on this machine: the run
// is given EXACTLY `WebSearch,WebFetch` — no Bash, no Read, no Edit, no Write —
// so the worst a hostile page can do is steer what gets cited, and that is what
// the receipts and lib/notebook/validate.ts::crossCheckRetrieval are for. The
// fence is built three times over, because each layer has failed somewhere
// before:
//
//   1. the ARGV — `--tools` (what exists in the session) and `--allowed-tools`
//      (what is pre-approved) both name the two tools, `--permission-mode
//      dontAsk` denies anything that would still ask, and `--safe-mode` /
//      `--strict-mcp-config` / `--disable-slash-commands` close the doors a
//      user's own configuration would open (CLAUDE.md, hooks, MCP servers).
//      The flag set is lib/agent/cliSeam.ts's, read off `claude --help` and
//      proven to parse on 2026-10-05; it is reused, not re-derived;
//   2. the SHELL — on Windows the door spawns through cmd.exe, which ate this
//      exact flag once (lib/claudeCli.ts:256-273). The list has no empty
//      element to lose, and the shell form is quoted because cmd treats a comma
//      as a parameter separator wherever a shim reads %1..%9. Probed both ways
//      in tests/golden-path/research-retrieve-argv.probe.spec.ts, the second
//      through this door's own spawn;
//   3. the STREAM — the session's `init` event names the tools it actually has,
//      and every `tool_use` names the tool it called. Either naming anything
//      outside the two is a fence breach: the run is killed mid-stream
//      (spawnTurn's onChunk) and nothing it produced is believed.
//
// ── WHY STREAM-JSON ─────────────────────────────────────────────────────────
//
// `--output-format json` (the reasoning door's) hands back the final answer
// and nothing about how it was reached. A receipt has to come from what the
// engine DID, not from what it says it did — a citation is a claim, a fetch is
// a record — and the only place the CLI shows what it did is the event stream:
// each `tool_use` (assistant) is answered by a `tool_result` (user) with the
// same id. That pair is the receipt. `--verbose` is the CLI's own precondition
// for stream-json under `--print`.
//
// Stages 3-4 of the card (phase markers lifted into the trace, the LiveResult
// chip) read this same stream and are not built here.

import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";

import { CliError, spawnTurn, USES_SHELL, type RunOptions } from "../../claudeCli";
import { MODEL } from "../../model";
import { TextError, unsupported, type TextErrorKind } from "../errors";
import type { ProbeResult, SourceReceipt, TextProvider, TextRequest, TextResult } from "../types";
import { claudeCliProvider } from "./claudeCli";

/** The whole allow-list. A tuple, so a probe can assert the exact set. */
export const RETRIEVE_TOOLS = ["WebSearch", "WebFetch"] as const;

/**
 * THE TURN CAP. Bounded, and not 1: a search is a turn and a fetch is a turn, and
 * RESEARCH-PROMPT § Phase 1 asks for 4–8 searches, each worth opening one or two
 * results — so ~20 tool turns plus the answer. 30 leaves room for a counter-case
 * search and a failed fetch or two, and caps what a runaway or a page that
 * talked the engine into crawling can cost. A run that hits it ends
 * `error_max_turns` and is refused (`settle` below), never half-accepted.
 */
export const RETRIEVE_MAX_TURNS = 30;

/** The argv. `usesShell` is a parameter so both forms are assertable on either
 *  platform; the door passes the real predicate. */
export function retrieveArgs(usesShell: boolean = USES_SHELL): string[] {
  const list = RETRIEVE_TOOLS.join(",");
  // Quoted for cmd.exe only — off-shell the quotes would be part of the value.
  const tools = usesShell ? `"${list}"` : list;
  return [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--model", MODEL,
    "--effort", "high",
    "--tools", tools,
    "--allowed-tools", tools,
    "--max-turns", String(RETRIEVE_MAX_TURNS),
    "--permission-mode", "dontAsk",
    "--safe-mode",
    "--strict-mcp-config",
    "--disable-slash-commands",
  ];
}

/* ─────────────────────────────── the stream ──────────────────────────────── */

/** One search the engine ran, and every URL its result list named. */
export interface RetrieveSearch {
  query: string;
  urls: string[];
}

export interface RetrieveRun {
  text: string;
  sessionId?: string;
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
  receipts: SourceReceipt[];
  searches: RetrieveSearch[];
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const ALLOWED: ReadonlySet<string> = new Set(RETRIEVE_TOOLS);

const breach = (what: string) =>
  new CliError(
    `The retrieval run stepped outside its fence (${what}); only ${RETRIEVE_TOOLS.join(" and ")} are allowed. ` +
      `The run was ended and nothing it produced was used.`,
    "failed",
  );

/** A tool_result's content as the text the model read: a string, or the
 *  concatenated text blocks of an array. */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((b) => (isObj(b) && typeof b.text === "string" ? b.text : ""))
      .filter(Boolean)
      .join("\n");
  return "";
}

/** Every URL a WebSearch result names — from the structured result where the
 *  CLI provides one, else from the `"url":"…"` pairs in the text it handed the
 *  model. */
function searchUrls(text: string, structured: unknown): string[] {
  const out: string[] = [];
  if (isObj(structured) && Array.isArray(structured.results))
    for (const r of structured.results)
      if (isObj(r) && Array.isArray(r.content))
        for (const c of r.content) if (isObj(c) && typeof c.url === "string") out.push(c.url);
  if (!out.length) for (const m of text.matchAll(/"url"\s*:\s*"([^"]+)"/g)) out.push(m[1]!);
  return [...new Set(out)];
}

/**
 * The stream reader. Fed stdout as it arrives (`push`), so a receipt's
 * `fetchedAt` is when its result reached this process, and so a fence breach
 * stops the run mid-stream; `finish` reads whatever line is left and returns the
 * run. `clock` is injectable so a recorded stream parses to a fixed answer.
 */
export class RetrieveStream {
  private decoder = new StringDecoder("utf8");
  private buffer = "";
  private pending = new Map<string, { name: string; input: Json }>();
  private result: Json | null = null;
  readonly receipts: SourceReceipt[] = [];
  readonly searches: RetrieveSearch[] = [];

  constructor(private readonly clock: () => string = () => new Date().toISOString()) {}

  push(chunk: Buffer | string): void {
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      this.line(line);
    }
  }

  finish(): RetrieveRun {
    this.buffer += this.decoder.end();
    if (this.buffer.trim()) this.line(this.buffer);
    this.buffer = "";

    const r = this.result;
    if (!r) throw new CliError("The retrieval run ended without a result event.", "failed");
    if (r.is_error || r.subtype !== "success")
      throw new CliError(
        r.subtype === "error_max_turns"
          ? `The retrieval run hit its ${RETRIEVE_MAX_TURNS}-turn cap before it answered.`
          : (typeof r.result === "string" && r.result) || `The retrieval run ended as ${String(r.subtype)}.`,
        "failed",
      );
    return {
      text: String(r.result ?? ""),
      sessionId: typeof r.session_id === "string" ? r.session_id : undefined,
      costUsd: typeof r.total_cost_usd === "number" ? r.total_cost_usd : undefined,
      durationMs: typeof r.duration_ms === "number" ? r.duration_ms : undefined,
      numTurns: typeof r.num_turns === "number" ? r.num_turns : undefined,
      receipts: [...this.receipts],
      searches: [...this.searches],
    };
  }

  private line(raw: string): void {
    const s = raw.trim();
    if (!s) return;
    let e: unknown;
    try {
      e = JSON.parse(s);
    } catch {
      // A line that is not an event (a stray banner) carries nothing a receipt
      // could be built from. It is skipped, not believed.
      return;
    }
    if (!isObj(e)) return;

    if (e.type === "system" && e.subtype === "init" && Array.isArray(e.tools)) {
      const extra = e.tools.filter((t) => typeof t === "string" && !ALLOWED.has(t));
      if (extra.length) throw breach(`the session started with ${extra.join(", ")}`);
      return;
    }
    if (e.type === "result") {
      this.result = e;
      return;
    }

    const content = isObj(e.message) && Array.isArray(e.message.content) ? e.message.content : [];
    if (e.type === "assistant") {
      for (const b of content) {
        if (!isObj(b) || b.type !== "tool_use") continue;
        const name = String(b.name ?? "");
        if (!ALLOWED.has(name)) throw breach(`it called ${name || "an unnamed tool"}`);
        this.pending.set(String(b.id ?? ""), { name, input: isObj(b.input) ? b.input : {} });
      }
      return;
    }
    if (e.type === "user") {
      for (const b of content) {
        if (!isObj(b) || b.type !== "tool_result") continue;
        const call = this.pending.get(String(b.tool_use_id ?? ""));
        if (!call) continue;
        this.pending.delete(String(b.tool_use_id));
        if (b.is_error) continue; // a failed call is not evidence of anything
        const text = resultText(b.content);
        const structured = e.tool_use_result;

        if (call.name === "WebSearch") {
          const query = typeof call.input.query === "string" ? call.input.query : "";
          this.searches.push({ query, urls: searchUrls(text, structured) });
          continue;
        }
        // WebFetch. A page the CLI reports as an HTTP error was not read.
        const url = typeof call.input.url === "string" ? call.input.url : "";
        if (!url) continue;
        if (isObj(structured) && typeof structured.code === "number" && structured.code >= 400) continue;
        const bytes =
          isObj(structured) && typeof structured.bytes === "number" ? structured.bytes : Buffer.byteLength(text, "utf8");
        const from = this.searches.find((x) => x.urls.includes(url));
        this.receipts.push({
          url,
          query: from ? from.query : null,
          fetchedAt: this.clock(),
          bytes,
          excerptHash: createHash("sha256").update(text, "utf8").digest("hex"),
        });
      }
    }
  }
}

/** Parse a whole recorded stream at once. */
export function parseRetrieveStream(stdout: string, clock?: () => string): RetrieveRun {
  const s = new RetrieveStream(clock);
  s.push(stdout);
  return s.finish();
}

/** One retrieval turn through the shared door (lib/claudeCli.ts::spawnTurn):
 *  the same seat-only environment, ceiling, tree kill and cancel as every other
 *  turn, with this rung's argv and a stream reader in place of the envelope
 *  parse. */
export function runClaudeRetrieve(prompt: string, opts: RunOptions = {}): Promise<RetrieveRun> {
  const stream = new RetrieveStream();
  return spawnTurn(prompt, retrieveArgs(), opts, () => stream.finish(), (c) => stream.push(c));
}

/* ─────────────────────────────── the adapter ─────────────────────────────── */

const KIND_OF: Record<CliError["kind"], TextErrorKind> = {
  "not-installed": "not-installed",
  "not-logged-in": "not-logged-in",
  timeout: "timeout",
  cancelled: "cancelled",
  failed: "failed",
};

function asTextError(e: CliError): TextError {
  const err = new TextError(e.message, KIND_OF[e.kind], "claude-cli-retrieve");
  // Same evidence rule as providers/claudeCli.ts: a process that ran reached
  // the engine and may have been billed; a missing binary never did.
  err.dispatched = e.kind === "failed" || e.kind === "timeout" || (e.kind === "cancelled" && e.spawned);
  return err;
}

export function claudeCliRetrieveProvider(): TextProvider {
  return {
    id: "claude-cli-retrieve",
    capabilities: ["retrieve"],
    transport: "local-subprocess",
    // claude 2.1.247, verified 2026-08-27 — providers/claudeCli.ts's header.
    // stream-json constrains the event envelope, not the answer inside it.
    enforcesSchema: false,

    // The same binary on the same seat: its probe is the reasoning adapter's,
    // posture first, `--version` second, zero-token.
    probe(): Promise<ProbeResult> {
      return claudeCliProvider().probe();
    },

    // Not this door's job. The router never asks (it checks `capabilities`),
    // and a direct caller is told so rather than served a reasoning turn
    // through a tool-carrying argv.
    async reason(): Promise<TextResult> {
      throw unsupported("claude-cli-retrieve", "reason");
    },

    async retrieve(req: TextRequest, timeoutMs: number): Promise<TextResult> {
      const started = Date.now();
      try {
        const run = await runClaudeRetrieve(req.prompt, { timeoutMs, signal: req.signal });
        return {
          text: run.text,
          receipts: run.receipts,
          provenance: {
            provider: "claude-cli-retrieve",
            model: MODEL,
            transport: "local-subprocess",
            rung: "preferred", // overwritten by the router
            turn: req.turn,
            schemaEnforcement: "none", // decided by the router
            durationMs: run.durationMs ?? Date.now() - started,
            // Vendor-reported, and for a multi-turn run it is the WHOLE run —
            // every search, every fetch, the answer.
            costUsd: run.costUsd,
            costBasis: run.costUsd === undefined ? "unpriced" : "vendor-reported",
            promptChars: req.prompt.length,
            sessionId: run.sessionId,
          },
        };
      } catch (e) {
        if (e instanceof CliError) throw asTextError(e);
        throw e;
      }
    },
  };
}
