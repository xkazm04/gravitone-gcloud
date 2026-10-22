// THE LEAD QUEUE - server only. What the operator's verdicts EARNED for the ai-registry
// (spark registry-feedback-loop, 2026-10-22), waiting for a night to put it into words.
//
// A lead originates a finding in the registry; it never authorizes one (the registry's
// own rule). So nothing lands here on a night's say-so: an event is queued only by the
// Board's commit of a scout packet, and only for four things a human verdict made -
//
//   style-proven        a catalogue style promoted by a keep (the ratchet's second cell)
//   genre-publishable   a genre's finished piece kept (spark genre-forge)
//   finding-restated    a kept finding that says again what an earlier night kept (n=2)
//   source-rich         a keep from a source the skill marked as teaching a mechanism
//
// The next night's step 0 phrases each queued event as one claim and files it with
// `scout.mts lead`, which appends one line to .ai/registry-leads.jsonl (the registry's
// leads-collect reads it) and marks the event filed. A weekly drain on this box carries
// the lines into the registry by pull request.
//
// APPEND-ONLY BY KEY. `<kind>:<ref>` names an event once: a redelivered apply queues
// nothing, a second `lead` of a filed key writes nothing. The file sits beside the
// nights (`<scoutRoot>/leads.json`) and is written under its own lock file.

import { mkdir } from "node:fs/promises";
import path from "node:path";

import { FoundryError, readManifestFile, writeJsonAtomic } from "../runStore";
import { withRunLock } from "../verdictLog";
import { scoutRoot } from "./store";
import type { NightId } from "./types";

export const LEAD_EVENT_KINDS = ["style-proven", "genre-publishable", "finding-restated", "source-rich"] as const;
export type LeadEventKind = (typeof LEAD_EVENT_KINDS)[number];

/** The registry bundle every scout lead is filed against. */
export const LEAD_BUNDLE = "media-generation";
export const LEAD_KINDS = ["technique", "application", "subject"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];
export const LEAD_CONFIDENCE = ["low", "medium", "high"] as const;
export type LeadConfidence = (typeof LEAD_CONFIDENCE)[number];
/** The registry collector drops a claim under 12 characters; past 400 it is a paragraph. */
export const CLAIM_MIN = 12;
export const CLAIM_MAX = 400;

export type LeadEvent = {
  /** `<kind>:<ref>` - the event's one name. */
  readonly key: string;
  readonly kind: LeadEventKind;
  /** The night whose commit queued it. */
  readonly night: NightId;
  /** What it is about: a style id, a genre id, `<night>/<candidate>` pairs, a source URL. */
  readonly refs: readonly string[];
  /** The evidence a claim may cite, one line each: kept cells, quotes, the recipe's first clause. */
  readonly evidence: readonly string[];
  /** From a MATURE genre: the filed claim may carry craft only, never the genre's content or rating. */
  readonly mature?: true;
  readonly queuedAt: string;
  /** Set once `lead` wrote the line. */
  readonly filed?: { readonly at: string; readonly claim: string };
};

export type LeadQueue = { readonly events: readonly LeadEvent[] };

/** The marker the filed line's `because` ends with: our dedupe is exact, the collector's is claim text only. */
export const leadMark = (key: string): string => `[scout:${key}]`;

export const leadKey = (kind: LeadEventKind, ref: string): string => `${kind}:${ref}`;

export function leadsFile(): string {
  return path.join(scoutRoot(), "leads.json");
}

/** The queue, or an empty one when no commit has queued anything yet. */
export async function readQueue(): Promise<LeadQueue> {
  const q = await readManifestFile<LeadQueue>(leadsFile(), "leads", "lead queue");
  if (q === null) return { events: [] };
  // Unparseable is not empty: an empty queue would let the next commit write over what was queued.
  if (q === undefined || !Array.isArray(q.events)) throw new FoundryError(`${leadsFile()} is not a lead queue; repair or move it before the next commit.`, 500);
  return q;
}

async function mutateQueue(fn: (q: LeadQueue) => LeadQueue): Promise<LeadQueue> {
  // The lock is a file in the root, so the root must exist before it is taken.
  await mkdir(scoutRoot(), { recursive: true });
  return withRunLock(scoutRoot(), async () => {
    const before = await readQueue();
    const after = fn(before);
    if (after !== before) await writeJsonAtomic(leadsFile(), after);
    return after;
  });
}

/** Queue what is not queued yet; returns the events this call added (none on a redelivery). */
export async function queueEvents(events: readonly Omit<LeadEvent, "queuedAt" | "filed">[], now = new Date()): Promise<LeadEvent[]> {
  const added: LeadEvent[] = [];
  await mutateQueue((q) => {
    const have = new Set(q.events.map((e) => e.key));
    for (const e of events) {
      if (have.has(e.key)) continue;
      have.add(e.key);
      added.push({ ...e, queuedAt: now.toISOString() });
    }
    return added.length === 0 ? q : { events: [...q.events, ...added] };
  });
  return added;
}

/** Events queued and not yet filed, oldest first. */
export const pendingOf = (q: LeadQueue): LeadEvent[] => q.events.filter((e) => e.filed === undefined);

/** Mark one event filed with the claim that went out; false when it was already filed or is unknown. */
export async function markFiled(key: string, claim: string, now = new Date()): Promise<boolean> {
  let changed = false;
  await mutateQueue((q) => {
    const at = q.events.findIndex((e) => e.key === key && e.filed === undefined);
    if (at < 0) return q;
    changed = true;
    const events = [...q.events];
    events[at] = { ...events[at]!, filed: { at: now.toISOString(), claim } };
    return { events };
  });
  return changed;
}
