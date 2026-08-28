// THE CHOKEPOINT — every reasoning call in the app enters here.
//
// lib/imaging/router.ts's sibling, and it keeps that file's invariant word for
// word: **no elimination is silent.** A candidate can drop out of the chain five
// ways — it lacks the capability, this deployment forbids its transport, its
// binary is absent, it has no key, or it failed when called — and every one of
// them lands in `trail`, which reaches the caller three ways: as the error
// thrown at the end, as `provenance.reroutedFrom` when a later engine served,
// and as one line on the server log either way.
//
// ── WHAT THIS FILE IS FOR, WHICH IS NOT WHAT IMAGING'S IS FOR ───────────────
//
// The image router exists to cross a POLICY edge: Google refuses recognisable
// public figures, and only another vendor's policy can clear that. Quality and
// cost decide the order.
//
// This one exists to cross a PLATFORM edge. The local `claude` engine cannot
// exist on Cloud Run — no binary, no interactive login, and no configuration
// that changes either — so the same product needs a different engine depending
// on where it is running, with the same callers, the same prompts and the same
// validated output. That is the registry's fallback-ladder technique
// (agent-cli-transport), and this file is its implementation:
//
//   rung 1  preferred   the local CLI on the operator's seat
//   rung 2  alternate   a metered cloud API behind the same contract
//   rung 3  floor       — DELIBERATELY ABSENT. See NO FLOOR below.
//   rung 4  refusal     an error naming every candidate and why each dropped out
//
// TWO PROPERTIES MAKE IT A LADDER RATHER THAN A PILE, and both are enforced
// here rather than left to callers:
//   · SELECTION IS INSPECTABLE. `provenance.rung` and `provenance.transport`
//     travel with every answer to every surface that shows it. A cloud answer
//     that rendered indistinguishably from a local one would be the ladder's
//     cardinal sin — "the model was unavailable, here is the other engine" and
//     "the engine you configured answered" are different findings.
//   · DESCENT HAS A REASON. Every step down records WHY, in the trail's own
//     vocabulary, so a fleet quietly living on rung 2 is diagnosable from its
//     descent reasons rather than from a hunch.
//
// ── NO FLOOR, AND WHY THAT IS THE HONEST ANSWER ─────────────────────────────
//
// The technique's rung 3 is a deterministic stand-in that keeps a product
// demonstrable with no model at all. Neither of this app's turns has one. There
// is no heuristic that writes an edit plan over a creator's notebook, and there
// is no rule-based art direction — the /api/frames header records that the FIRST
// version of that step was exactly such a table ("nine roles, nine canned
// compositions") and that it produced "a narrated slide deck", which is the
// defect the model was brought in to fix. Shipping that table back as a silent
// floor would reintroduce the original failure with a fresh coat of paint.
//
// So this engine takes the technique's rung 4 instead: honest refusal, with the
// whole descent record in the message. That is a deliberate choice against a
// floor, not an omission of one, and `LadderRung` has no `floor` member so that
// nothing can quietly claim otherwise.

import { canSpawnLocalBinaries, describePosture, localPosture } from "../deployment";
import { currentTextEnv, isConfigured, KEY_VAR, type TextEnv } from "./env";
import { noAlternative, noEngine, TextError, unsupported } from "./errors";
import { parseAgainstSchema, schemaInstruction } from "./json";
import { logTurn } from "./log";
import { claudeCliProvider } from "./providers/claudeCli";
import { googleProvider } from "./providers/google";
import type {
  LadderRung,
  RerouteStep,
  TextProvider,
  TextProviderId,
  TextRequest,
  TextResult,
  TurnClass,
} from "./types";

/**
 * WHO ANSWERS WHICH TURN, IN WHICH POSTURE. The whole local/cloud split is this
 * one table, and changing it is a one-line edit rather than a search across
 * surfaces.
 *
 * `local` — the CLI first, the cloud behind it. The second entry is not
 *   decoration: an operator who has set GOOGLE_AI_API_KEY gets a working studio
 *   on the day their `claude` login expires, with the receipt saying so.
 * `cloud` — Google alone. The CLI is not listed because on a managed platform it
 *   cannot exist, and listing a candidate that is structurally impossible would
 *   put a guaranteed elimination in every trail — noise that teaches a reader to
 *   stop reading trails.
 *
 * `probe` is single-entry in both postures on purpose: a health check that walks
 * a chain reports the chain's health, not the engine's, and is therefore useless
 * for deciding whether the engine is up.
 */
const PLAN: Record<TextEnv, Record<TurnClass, TextProviderId[]>> = {
  local: {
    "edit-plan": ["claude-cli", "google"],
    "scene-direction": ["claude-cli", "google"],
    "style-synthesis": ["claude-cli", "google"],
    probe: ["claude-cli"],
  },
  cloud: {
    "edit-plan": ["google"],
    "scene-direction": ["google"],
    "style-synthesis": ["google"],
    probe: ["google"],
  },
};

const PROVIDERS: Record<TextProviderId, () => TextProvider> = {
  "claude-cli": claudeCliProvider,
  google: googleProvider,
};

/** Per-turn wall-clock ceilings. The application's, always — no tool in this
 *  class ships one, and a cloud endpoint's own timeout is its business. These
 *  sit under each route's `maxDuration` so the engine gives up before the
 *  platform kills the handler and the creator gets a sentence instead of a
 *  dropped connection. */
const DEFAULT_TIMEOUT_MS: Record<TurnClass, number> = {
  "edit-plan": 600_000,
  "scene-direction": 600_000,
  "style-synthesis": 300_000,
  probe: 30_000,
};

/** The floor under a caller-supplied ceiling. A nonsensical value is
 *  MISCONFIGURATION and is floored, never read as "immediately" — the subtlest
 *  route to a product's bottom rung is a knob, not an outage. */
const MIN_TIMEOUT_MS = 30_000;

function resolveTimeout(req: TextRequest): number {
  const fallback = DEFAULT_TIMEOUT_MS[req.turn];
  const ms = req.timeoutMs;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < MIN_TIMEOUT_MS) return fallback;
  return ms;
}

/** Who would answer this turn right now, in order. Exported so a diagnostics
 *  surface reports the truth the router acts on rather than restating it. */
export function planFor(turn: TurnClass, env: TextEnv = currentTextEnv()): TextProviderId[] {
  return PLAN[env][turn];
}

/**
 * The chain this request will actually walk: the plan, steered.
 *
 * Identical rules to lib/imaging/router.ts::orderFor, and identical for a
 * reason — a caller who has learned that `avoid` removes and `prefer` only
 * reorders should not have to learn a second dialect for the other engine.
 *
 * `avoid` REMOVES, and empties the chain rather than serving the avoided engine.
 * `prefer` only REORDERS, and only when it can be honoured; a preference that
 * cannot be is dropped rather than raised, because the caller asked for a better
 * first try, not for a failure. Which engine actually served is in
 * `provenance.provider`, so a dropped preference is visible after the fact.
 */
export function orderFor(
  turn: TurnClass,
  steer: { prefer?: TextProviderId; avoid?: TextProviderId } = {},
  env: TextEnv = currentTextEnv(),
): TextProviderId[] {
  const chain = planFor(turn, env);
  const kept = steer.avoid ? chain.filter((id) => id !== steer.avoid) : chain;
  if (!kept.length) throw noAlternative(steer.avoid as TextProviderId, turn);

  const p = steer.prefer;
  if (p && p !== steer.avoid && kept.includes(p) && isConfigured(p))
    return [p, ...kept.filter((id) => id !== p)];
  return kept;
}

/** Why a provider cannot even be attempted, without spending anything to find
 *  out — or `null` when it can. The cheap gate; the adapter's own `probe()` is
 *  the expensive one and runs only for the local transport, which is the only
 *  one whose availability a config lookup cannot settle. */
function cheapBlock(id: TextProviderId): RerouteStep["why"] | null {
  const keyVar = KEY_VAR[id];
  if (keyVar) return isConfigured(id) ? null : "no-key";
  // A keyless (local) provider. Whether this deployment may spawn at all is
  // lib/deployment.ts's answer, reused rather than re-derived — the technique's
  // "one predicate, shared", with this gate as defence in depth.
  if (!canSpawnLocalBinaries())
    return localPosture() === "policy-forbidden" ? "policy-forbidden" : "managed-platform";
  return null;
}

/**
 * RUN ONE REASONING TURN. The only entry point; nothing else in the app may
 * import a provider directly.
 */
export async function reason(req: TextRequest): Promise<TextResult> {
  const started = Date.now();
  const env = currentTextEnv();
  const timeoutMs = resolveTimeout(req);
  const steer = { prefer: req.prefer, avoid: req.avoid };
  /** Every candidate that dropped out, and why. The same record twice over: it
   *  settles into `provenance.reroutedFrom` when a later engine served, and into
   *  the settle log either way. */
  const trail: RerouteStep[] = [];

  try {
    const out = await walk();
    logTurn({
      turn: req.turn,
      env,
      ms: Date.now() - started,
      promptChars: out.provenance.promptChars,
      steer,
      tried: trail,
      provider: out.provenance.provider,
      model: out.provenance.model,
      rung: out.provenance.rung,
      costUsd: out.provenance.costUsd,
      schema: out.provenance.schemaEnforcement,
    });
    return out;
  } catch (e) {
    const err = e instanceof TextError ? e : null;
    logTurn({
      turn: req.turn,
      env,
      ms: Date.now() - started,
      promptChars: req.prompt.length,
      steer,
      tried: trail,
      kind: err?.kind ?? "failed",
      provider: err?.provider,
      message: err?.message ?? String(e),
    });
    throw e;
  }

  async function walk(): Promise<TextResult> {
    const chain = orderFor(req.turn, steer, env);
    /** The first thing that went wrong. It describes the engine we MEANT to
     *  use, which is the honest headline when the whole chain comes up empty. */
    let first: TextError | null = null;

    for (let i = 0; i < chain.length; i++) {
      const id = chain[i];
      const provider = PROVIDERS[id]();

      // A plan entry that cannot do the job is a bug in the table above, not a
      // runtime condition. As the FIRST choice it throws — nothing else was
      // asked for, so there is no result to hide it behind.
      if (!provider.capabilities.includes("reason")) {
        if (i === 0) throw unsupported(id, "reason");
        first ??= unsupported(id, "reason");
        trail.push({ provider: id, why: "unsupported" });
        continue;
      }

      // The cheap gate. Stepping over instead of calling is not just an
      // optimisation for the local engine: spawning a process to discover that
      // this is Cloud Run would cost a spawn and produce a worse message.
      const blocked = cheapBlock(id);
      if (blocked) {
        first ??= blockError(id, blocked);
        trail.push({ provider: id, why: blocked });
        continue;
      }

      // THE EXPENSIVE GATE, and only where a config lookup cannot settle it. A
      // keyless local transport can be present-and-broken in ways the
      // environment cannot show — no binary, or a binary nobody logged into —
      // and finding that out by dispatching a minutes-long turn is the wrong
      // trade. A key-holding provider skips this: its 401 arrives fast, is
      // classified `no-key`, and walks the chain from the catch below.
      if (!KEY_VAR[id]) {
        const p = await provider.probe();
        if (!p.ok) {
          const why = p.why ?? "not-installed";
          first ??= new TextError(p.detail, why === "no-key" ? "no-key" : why, id);
          trail.push({ provider: id, why });
          continue;
        }
      }

      // The schema, enforced the best way this provider can. A provider that
      // enforces natively is handed the schema untouched and decides for itself
      // (providers/google.ts may still fall back to prompted, and says so in the
      // receipt). A provider that cannot gets the instruction appended here, in
      // ONE place, so two adapters cannot word the same demand differently.
      const prompt =
        req.schema && !provider.enforcesSchema
          ? `${req.prompt}\n${schemaInstruction(req.schema)}`
          : req.prompt;

      try {
        const served = await provider.reason({ ...req, prompt }, timeoutMs);
        const rung: LadderRung = i === 0 ? "preferred" : "alternate";

        // VALIDATE, whichever way enforcement happened — including natively.
        // See json.ts: native enforcement constrains the answer against the
        // schema the VENDOR was given, which for Gemini is a translated subset,
        // so a `required` this app depends on can be dropped in translation and
        // enforced away. Re-checking costs microseconds and closes that gap.
        const json = req.schema ? parseAgainstSchema(id, served.text, req.schema) : undefined;

        return {
          ...served,
          json,
          provenance: {
            ...served.provenance,
            rung,
            // The descent is kept WITH the result, not only in the log: a staged
            // version outlives the process that made it, and "which engine
            // wrote this plan" is a question asked long after the log rotated.
            ...(trail.length ? { reroutedFrom: [...trail] } : {}),
            // A provider that appended nothing reports `none`; the router is the
            // only one that knows it appended, so it is the one that says so.
            schemaEnforcement:
              req.schema && !provider.enforcesSchema ? "prompted" : served.provenance.schemaEnforcement,
          },
        };
      } catch (e) {
        const err = e instanceof TextError ? e : new TextError(String(e), "failed", id);
        first ??= err;
        trail.push({ provider: id, why: trailReason(err) });
        // Only a reroutable failure walks. Everything else stops here: a
        // minutes-long metered turn is not something to repeat on a hunch, and
        // `bad-response` in particular usually means our own prompt or parser is
        // wrong — which a second engine reproduces, more expensively.
        if (!err.reroutable) throw err;
      }
    }

    // THE BOTTOM OF THE LADDER. There is no floor for these turns (see the
    // header), so this is rung 4: honest refusal, carrying the whole descent
    // record. The message names every candidate and why each dropped out,
    // because "the model could not be reached" is precisely the sentence that
    // sends an operator to look in the one place the fault is not.
    const why = trail.map((t) => `${t.provider} (${t.why})`).join(", ") || "no candidates were planned";
    throw noEngine(
      `No reasoning engine could serve this ${req.turn} turn. Tried: ${why}. ` +
        // `first` describes the engine we MEANT to use, and its message already
        // names that engine's remedy. Appending describePosture() as well
        // printed the same sentence twice in the 2026-08-27 pass, because when
        // the first candidate is the local one the two say the same thing — so
        // the posture is added only when it is not already implied.
        `${first ? first.message : `This deployment is in ${env} posture — ${describePosture()}.`} ` +
        `Nothing was changed.`,
      // The kind of the engine we meant to use, NOT a hardcoded "not-installed".
      // See errors.ts::noEngine for the measured defect this replaces.
      first?.kind,
    );
  }
}

/** The error for a candidate blocked before it was called. Written once so a
 *  trail entry and the message a caller reads cannot disagree. */
function blockError(id: TextProviderId, why: RerouteStep["why"]): TextError {
  switch (why) {
    case "no-key":
      return new TextError(
        `No API key for ${id}. Set ${KEY_VAR[id]} in .env.local — see .env.example.`,
        "no-key",
        id,
      );
    case "policy-forbidden":
      return new TextError(
        `The ${id} engine is available on this machine but ${describePosture("policy-forbidden")}.`,
        "policy-forbidden",
        id,
      );
    case "managed-platform":
      return new TextError(
        `The ${id} engine cannot run here: ${describePosture("managed-platform")}. ` +
          `Configure a cloud engine instead — see .env.example.`,
        "managed-platform",
        id,
      );
    default:
      return new TextError(`${id} is unavailable (${why}).`, "failed", id);
  }
}

/** An error's kind, in the trail's vocabulary. Total over the kinds a provider
 *  call can actually raise; anything else is `failed`. */
function trailReason(e: TextError): RerouteStep["why"] {
  switch (e.kind) {
    case "no-key":
    case "not-installed":
    case "not-logged-in":
    case "policy-forbidden":
    case "managed-platform":
    case "refused":
    case "rate-limited":
    case "timeout":
    case "bad-response":
      return e.kind;
    default:
      return "failed";
  }
}

/**
 * IS ANY ENGINE AVAILABLE, and which one would answer?
 *
 * For a diagnostics surface and for a route that wants to fail fast with a good
 * sentence rather than after a minutes-long attempt. It walks the same plan the
 * router walks and asks the same two gates, so it cannot report an availability
 * the router disagrees with.
 */
export async function engineStatus(turn: TurnClass = "edit-plan"): Promise<{
  env: TextEnv;
  serving: TextProviderId | null;
  candidates: { provider: TextProviderId; ok: boolean; detail: string }[];
}> {
  const env = currentTextEnv();
  const candidates: { provider: TextProviderId; ok: boolean; detail: string }[] = [];
  let serving: TextProviderId | null = null;

  for (const id of planFor(turn, env)) {
    const blocked = cheapBlock(id);
    if (blocked) {
      candidates.push({ provider: id, ok: false, detail: blockError(id, blocked).message });
      continue;
    }
    const p = await PROVIDERS[id]().probe();
    candidates.push({ provider: id, ok: p.ok, detail: p.detail });
    if (p.ok && !serving) serving = id;
  }
  return { env, serving, candidates };
}
