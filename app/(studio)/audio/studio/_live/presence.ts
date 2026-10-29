import "server-only";

// IS AN AGENT LISTENING? (spark audio-agent-studio, stage S2). The outside agent (Claude Code's
// `/studio-agent`) calls the MCP door with an act-scope CLI token, and every call stamps that
// token's `lastUsedAt` (lib/principal.ts resolveCliToken; at most once a minute, @gt/kernel/token
// TOUCH_EVERY_MS). So the studio reads presence from the store, writes nothing for it, and the
// client only ever sees the answer: "listening" when the named token was used within the window,
// else "nobody" - and a message sent then waits in the inbox for the agent's next poll.
import { listTokens, type TokenRecord } from "@gt/kernel/token";

import { kernel } from "../../../../../lib/kernelStore.ts";

export type Presence = "listening" | "nobody";

/** A used token's stamp moves at most every 60 s and the agent long-polls every <= 25 s, so 90 s
 *  covers one missed stamp without calling a gone agent present for long. */
export const PRESENCE_WINDOW_MS = 90_000;
export const DEFAULT_AGENT_TOKEN_NAME = "studio-agent";

/** The name of the agent's token: GRAVITONE_STUDIO_AGENT_TOKEN_NAME, else `studio-agent`. */
export function agentTokenName(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const v = env["GRAVITONE_STUDIO_AGENT_TOKEN_NAME"]?.trim();
  return v === undefined || v === "" ? DEFAULT_AGENT_TOKEN_NAME : v;
}

/** Pure: listening when a live act-scope token of that name was used within the window. */
export function presenceOf(tokens: readonly TokenRecord[], name: string, nowMs: number): Presence {
  for (const t of tokens) {
    if (t.name !== name || t.scope !== "act" || t.revokedAt !== undefined || Date.parse(t.expiresAt) <= nowMs || t.lastUsedAt === undefined) continue;
    const used = Date.parse(t.lastUsedAt);
    if (Number.isFinite(used) && nowMs - used < PRESENCE_WINDOW_MS) return "listening";
  }
  return "nobody";
}

/** The store's answer now. A store that cannot be read reads as nobody listening (sending stays possible). */
export function readPresence(nowMs: number = Date.now()): Presence {
  const k = kernel();
  if (!k.ok) return "nobody";
  const r = k.value.store.read((x) => listTokens(x));
  return r.ok ? presenceOf(r.value, agentTokenName(), nowMs) : "nobody";
}
