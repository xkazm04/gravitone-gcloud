import "server-only";

// WHAT EACH CHANNEL CAN DO ON THIS DEPLOYMENT, NOW - the real side's readiness, from the seams
// that know: lib/publish/channels.ts channelReadiness (env presence by name, PUBLISH_MODE, the
// deployment posture) and WIRED_CHANNELS (the channels an adapter exists for; `blog` is always
// wired - its slot goes out by the article approve's act), plus what the store says:
//   standing  @gt/producers/publish/standing (L62): a channel's publish attempts from the ledger -
//             when it last went out, and a failure still standing with how many in a row
//             (outbound-notifications channel-health-tracking). A failure of this machine's (a
//             dead claimant) is not the channel's and is not counted there.
//   the tick  @gt/producers/publish/timers timerStatusIn (L62): when the worker's publish timer
//             last ticked, when it is next due, and a failure still standing - read, never
//             written, and said plainly when nothing runs it.
// `windowMs` (PUBLISH_MISSED_MIN) is the missed window a move is checked against. A PUBLISH_MODE
// typo is a refusal in its own words, never read as either mode (v1 publishModeFromEnv's rule).
//
// GRAVITONE_DRY_ONLY=1 (the kernel's dry run, packages/kernel/src/dryrun.ts) holds every channel
// dry whatever PUBLISH_MODE asks: the one switch that means "nothing here spends or sends".

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import { CHANNELS, type Channel } from "@gt/domain/slot";
import { pidAlive, processHolder } from "@gt/kernel/lease";
import type { SlotRow } from "@gt/kernel/slots/schema";
import type { Reader } from "@gt/kernel/store";
import { standingIn, type Standing } from "@gt/producers/publish/standing";
import { PUBLISH_TICK, timerStatusIn } from "@gt/producers/publish/timers";
import type { ChannelReady, PublishTick } from "@gt/ui/components/floor/schedule.ts";

import { channelReadiness, missedWindowMs, WIRED_CHANNELS } from "../../../../lib/publish/channels.ts";
import type { CalendarFacts } from "./contract.ts";

const PUBLISH_CLI = "npx tsx pipeline/publish.mts channels --json";
const ARTICLE_CLI = "node pipeline/article.mts status";

export type Readiness = CalendarFacts & {
  readonly wired: ReadonlySet<Channel>;
  readonly windowMs: number;
};

/** What the store says beside the env: each channel's standing and the publish timer. */
export type StoreFacts = { readonly standing: ReadonlyMap<string, Standing>; readonly tick: PublishTick | null };

export const NO_STORE_FACTS: StoreFacts = { standing: new Map(), tick: null };

/** Read inside one read transaction (the caller's), never a write. */
export function storeFactsIn(r: Reader): StoreFacts {
  const standing = new Map<string, Standing>(CHANNELS.map((c) => [c, standingIn(r, c)]));
  const t = timerStatusIn(r, PUBLISH_TICK, processHolder(), pidAlive);
  const tick: PublishTick = {
    running: t.holder !== undefined && !t.stale,
    lastRunAt: t.lastRunAt,
    nextDueAt: t.nextDueAt,
    ...(t.failing === null ? {} : { failing: { since: t.failing.since, error: t.failing.error } }),
  };
  return { standing, tick };
}

/** A channel's standing as the readiness row draws it: out, and a failure only while it stands. */
export function standingWords(s: Standing | undefined): Pick<ChannelReady, "lastOut" | "lastFailure"> {
  if (s === undefined) return {};
  const failing = s.failuresSinceSuccess > 0 && s.lastError !== null && s.lastAttemptAt !== null;
  return {
    ...(s.lastSuccessAt === null ? {} : { lastOut: s.lastSuccessAt }),
    ...(failing ? { lastFailure: { at: s.lastAttemptAt ?? "", error: s.lastError ?? "", inARow: s.failuresSinceSuccess } } : {}),
  };
}

/** The channel the calendar last scheduled on (newest created, blog aside: no form makes one). */
export function lastChannelOf(rows: readonly SlotRow[]): string | null {
  let best: SlotRow | undefined;
  for (const r of rows) if (r.slot.channel !== "blog" && (best === undefined || r.createdAt > best.createdAt)) best = r;
  return best?.slot.channel ?? null;
}

export function readinessOf(rows: readonly SlotRow[], store: StoreFacts, env: NodeJS.ProcessEnv = process.env): Result<Readiness> {
  let seam: ReturnType<typeof channelReadiness>;
  let windowMs: number;
  try {
    seam = channelReadiness(env);
    windowMs = missedWindowMs(env);
  } catch (e) {
    return err("invalid", errorMessage(e), { cause: e });
  }
  const dryOnly = env["GRAVITONE_DRY_ONLY"] === "1";
  const channels: ChannelReady[] = seam.channels.map((c) => {
    const state = c.status === "live" && dryOnly ? "dry" : c.status;
    return { channel: c.id, state, env: c.env, ...(c.note === undefined ? {} : { note: c.note }), command: PUBLISH_CLI, ...standingWords(store.standing.get(c.id)) };
  });
  channels.push({ channel: "blog", state: "act", env: [], command: ARTICLE_CLI, ...standingWords(store.standing.get("blog")) });
  const wired = new Set<Channel>([...WIRED_CHANNELS, "blog"]);
  const mode = channels.some((c) => c.state === "live") ? "live" : "dry";
  return ok({ channels, mode, lastChannel: lastChannelOf(rows), ...(store.tick === null ? {} : { tick: store.tick }), wired, windowMs });
}
