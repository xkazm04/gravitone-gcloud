// THE LOCAL ENGINE, behind the router's contract.
//
// A thin adapter on purpose. The transport itself — spawning, the seat-only
// environment, stdin delivery, envelope parsing, the timeout floor — already
// lives in lib/claudeCli.ts and is not moved here: that module is imported by a
// pipeline script (pipeline/direct-frames.mts) that is not part of the app's
// module graph and must keep working without lib/text/. What this file adds is
// the three things the ROUTER needs and the transport has no opinion about: the
// capability declaration, the dated schema-enforcement flag, and the mapping
// from `CliError.kind` into the one error taxonomy every provider shares.
//
// ── THE DATED CAPABILITY, STATED WHERE IT IS READ ───────────────────────────
//
// `enforcesSchema: false`. Verified 2026-08-27 against `claude` CLI 2.1.247 by
// reading its flag surface: the headless mode exposes `--output-format json`,
// which constrains the ENVELOPE, and nothing that constrains the answer INSIDE
// it. /api/recalibrate's header has recorded the consequence since it was
// written: "No `output_config.format`, so the plan's shape is a REQUEST, not a
// guarantee — `parseEditPlan` validates and rejects rather than trusting."
//
// That is a version-and-date fact, not a property of the tool forever. These
// CLIs ship weekly. When a release adds schema-constrained output, this flag
// flips, the router stops appending `schemaInstruction`, and `provenance`
// starts reporting `native` — one edit, and every surface that shows the receipt
// tells the truth about it without being touched.

import { CliError, probeClaude, runClaude } from "../../claudeCli";
import { MODEL } from "../../model";
import { localPosture, describePosture } from "../../deployment";
import { TextError } from "../errors";
import type { ProbeResult, TextProvider, TextRequest, TextResult } from "../types";

/** CliError's four kinds into the shared taxonomy. A total mapping, so a new
 *  CliError kind is a type error here rather than a silent `failed`. */
function asTextError(e: CliError): TextError {
  const kind =
    e.kind === "not-installed"
      ? "not-installed"
      : e.kind === "not-logged-in"
        ? "not-logged-in"
        : e.kind === "timeout"
          ? "timeout"
          : "failed";
  const err = new TextError(e.message, kind, "claude-cli");
  // A process that ran and exited non-zero, or one we killed mid-run, reached
  // the engine — the operator's seat may well have been charged for the work.
  // A missing binary never did. Evidence, not inference, exactly as
  // ImagingError.dispatched is set.
  err.dispatched = e.kind === "failed" || e.kind === "timeout";
  return err;
}

export function claudeCliProvider(): TextProvider {
  return {
    id: "claude-cli",
    capabilities: ["reason"],
    transport: "local-subprocess",
    enforcesSchema: false, // claude 2.1.247, verified 2026-08-27 — see header

    async probe(): Promise<ProbeResult> {
      // The deployment posture is asked FIRST and separately. A managed platform
      // has no binary, and spawning one to discover that would be both slow and
      // misleading: the report must say "there is no local binary here at all",
      // not "the binary is missing", because those send an operator to two
      // different remedies. lib/deployment.ts owns the distinction; this reuses
      // it rather than re-deriving it.
      const posture = localPosture();
      if (posture !== "available")
        return {
          ok: false,
          detail: `The local Claude engine is unavailable: ${describePosture(posture)}.`,
          why: posture === "policy-forbidden" ? "policy-forbidden" : "managed-platform",
          freeToRun: true,
        };

      const p = await probeClaude();
      return {
        ok: p.ok,
        detail: p.detail,
        why: p.ok ? undefined : "not-installed",
        version: p.version,
        // Zero-token: `--version` runs the binary and starts no session. The
        // ceiling — that it cannot prove login state — is in `detail`, per the
        // availability-probe rule that a probe which cannot prove something says
        // so rather than implying it did.
        freeToRun: true,
      };
    },

    async reason(req: TextRequest, timeoutMs: number): Promise<TextResult> {
      const started = Date.now();
      try {
        const run = await runClaude(req.prompt, timeoutMs);
        return {
          text: run.text,
          provenance: {
            provider: "claude-cli",
            model: MODEL,
            transport: "local-subprocess",
            // Overwritten by the router with the rung this candidate actually
            // occupied in the chain it walked. Stated here so the object is
            // complete at construction rather than half-built.
            rung: "preferred",
            turn: req.turn,
            // The router decides this: it knows whether it appended the schema
            // instruction, and an adapter that guessed could disagree with it.
            schemaEnforcement: "none",
            durationMs: run.durationMs ?? Date.now() - started,
            // VENDOR-REPORTED, and the reason lib/text/pricing.ts has no rate
            // row for this model: the CLI hands us the real figure for the run
            // it just did, which is better than any table.
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
