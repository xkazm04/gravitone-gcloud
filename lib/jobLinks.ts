// The bell tray's model: which cards it draws, with which doors, and which empty it is.
//
// The doors used to be studio deep-links (`/studio/<project>?step=<step>`, by a JobKind -> step
// table). The studio retired (Phase 4 wave D) and the bell's jobs are the server's: each carries
// its own door, its row in Runs (`Job.href`, app/(studio)/_shell/bell.ts), so the table went too.

import type { Job, JobEvent } from "@/lib/jobs";
import type { PhaseKey } from "@/lib/projects";

/** A v1 production's address, for rows read from the browser's v1 store (the palette, a storage
 *  failure's card). The client cannot know the kernel id such a row became, so it links the old
 *  address and the server's redirect resolves it: the imported Project's part, or the one-click
 *  import when the row has not been imported yet (app/studio/[projectId]/redirect.ts). */
export function studioHref(projectId: string, step: PhaseKey): string {
  return `/studio/${encodeURIComponent(projectId)}?step=${step}`;
}

/** The door a card opens: the job's (or the event's job's) row in Runs. */
export function jobHref(item: { readonly href?: string }): string | null {
  return item.href === undefined || item.href === "" ? null : item.href;
}

export type CardAction =
  | { kind: "open"; href: string; marksRead?: string }
  | { kind: "clear"; jobId: string }
  | { kind: "dismiss"; eventId: string };

export interface RunningCard extends Job {
  job: Job;
  actions: CardAction[];
}

export interface InterruptedCard extends Job {
  job: Job;
  actions: CardAction[];
}

export interface EventCard extends JobEvent {
  event: JobEvent;
  actions: CardAction[];
}

export type AnyCard = RunningCard | InterruptedCard | EventCard;

export type EmptyTone = "trouble" | "running" | "interrupted" | "idle";

export interface TrayModelInput {
  jobs?: Job[];
  unread?: JobEvent[];
  trouble?: unknown | null;
}

export interface TrayModel {
  badge: number;
  pulse: boolean;
  emptyTone: EmptyTone;
  runningCards: RunningCard[];
  interruptedCards: InterruptedCard[];
  eventCards: EventCard[];
  cards: AnyCard[];
}

export function trayModel({
  jobs = [],
  unread = [],
  trouble = null,
}: TrayModelInput): TrayModel {
  const runningJobs = jobs.filter((j) => j.status === "running" && !j.clearedAt);
  const interruptedJobs = jobs.filter((j) => j.status === "interrupted" && !j.clearedAt);

  const runningCards: RunningCard[] = runningJobs.map((j) => {
    const href = jobHref(j);
    const actions: CardAction[] = href ? [{ kind: "open", href }] : [];
    return {
      ...j,
      job: j,
      actions,
    };
  });

  const interruptedCards: InterruptedCard[] = interruptedJobs.map((j) => {
    const href = jobHref(j);
    const actions: CardAction[] = [];
    if (href) actions.push({ kind: "open", href });
    actions.push({ kind: "clear", jobId: j.id });
    return {
      ...j,
      job: j,
      actions,
    };
  });

  const eventCards: EventCard[] = unread.map((e) => {
    const href = jobHref(e);
    const actions: CardAction[] = [];
    if (href) actions.push({ kind: "open", href, marksRead: e.id });
    actions.push({ kind: "dismiss", eventId: e.id });
    return {
      ...e,
      event: e,
      actions,
    };
  });

  const count = unread.length;
  const badge = count + (trouble ? 1 : 0);
  const pulse = (runningCards.length > 0 || interruptedCards.length > 0) && badge === 0;

  const emptyTone: EmptyTone = trouble
    ? "trouble"
    : runningCards.length > 0
      ? "running"
      : interruptedCards.length > 0
        ? "interrupted"
        : "idle";

  return {
    badge,
    pulse,
    emptyTone,
    runningCards,
    interruptedCards,
    eventCards,
    cards: [...runningCards, ...interruptedCards, ...eventCards],
  };
}
