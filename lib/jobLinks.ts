// Linking background work and notifications to studio workspace steps.
//
// The bell tray reports work, but without doors into the steps, creators are
// left navigating manually to inspect their results or restart interrupted work.
// This module provides the mapping from JobKind to PhaseKey, standard deep-links
// into the studio stepper, and a pure trayModel projection for the notification UI.

import type { Job, JobEvent, JobKind } from "@/lib/jobs";
import type { PhaseKey } from "@/lib/projects";

export const KIND_STEP: Record<JobKind, PhaseKey> = {
  research: "research",
  followup: "research",
  recalibrate: "script",
  "poster-generate": "frames",
  "video-export": "cut",
  "ad-ideas": "research",
  "ad-scenarios": "script",
  "video-clip": "frames",
  "ad-render": "cut",
};

export function studioHref(projectId: string, step: PhaseKey): string {
  return `/studio/${projectId}?step=${step}`;
}

export function jobHref(item: { projectId?: string; kind: JobKind }): string | null {
  if (!item.projectId) return null;
  const step = KIND_STEP[item.kind];
  if (!step) return null;
  return studioHref(item.projectId, step);
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
