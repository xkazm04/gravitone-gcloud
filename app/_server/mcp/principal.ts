import { AppError } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { scopeAdmits, type TokenScope } from "@gt/kernel/token";

import type { Principal } from "../../../lib/principal.ts";
import type { Who } from "../../(studio)/projects/_port/port.ts";

// WHO MAY SPEAK ON /api/mcp (spark athena-control-mcp). route({guard: "access"}) has already
// resolved one principal; this door narrows it to the one kind an agent is: a presented CLI token
// (`Authorization: Bearer gt_...`, lib/principal.ts `cli-token`). A session cookie, the legacy
// shared secret, the dev fixture and the local owner are people or postures, not a named agent,
// so the ledger could not say who acted: each is refused by name, 403, before any JSON-RPC is read.
//
// THE SCOPE IS JUDGED PER OP, NOT AT THE DOOR. route() resolves the bearer with key use `read`
// (KeyUse was not widened, WP1), so a read token is admitted here and reads; a write op asks
// `scopeAdmits(scope, "act")` itself and answers a read token in-band. A `money` token admits
// `act` and behaves exactly as one: the surface, not the scope, holds "an agent never spends".
//
// DNS REBINDING (MCP transport security): a browser page on another origin can be made to POST to
// a loopback server. Origin is a browser's header; when one is present it must name this machine.

export type Agent = {
  /** The token's name, as minted (`pipeline/token.mts mint --name athena`). */
  readonly name: string;
  readonly scope: TokenScope;
  /** The produce and part ports' actor words. */
  readonly who: Who;
  /** What the ledger records. */
  readonly actor: Actor;
};

export const NEEDS_TOKEN = "mcp needs a bearer token (pipeline/token.mts mint --scope act)";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** A refusal when the request carries an Origin that is not this machine; undefined otherwise. */
export function originRefusal(req: Request): AppError | undefined {
  const origin = req.headers.get("origin");
  if (origin === null) return undefined;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    host = "";
  }
  return LOOPBACK.has(host) ? undefined : new AppError("refused", `mcp: origin ${origin} is not this machine`, { detail: "origin" });
}

/** The agent behind a principal, or the refusal: only a presented CLI token speaks here. */
export function agentOf(p: Principal | null): { readonly ok: true; readonly agent: Agent } | { readonly ok: false; readonly error: AppError } {
  if (p === null || p.kind !== "cli-token") return { ok: false, error: new AppError("refused", NEEDS_TOKEN, { detail: "mcp-needs-token" }) };
  return { ok: true, agent: { name: p.name, scope: p.scope, who: { who: p.name, kind: "agent" }, actor: { kind: "agent", id: p.name } } };
}

/** May this agent write (compose, launch, act on a job)? `act` and `money` may; `read` may not. */
export const mayAct = (a: Agent): boolean => scopeAdmits(a.scope, "act");
