// PUBLISH — schedule slots that missed or failed, waiting on a human.
//
// The HTTP contract is the brief's (WP4 builds it in parallel): GET
// /api/publish/schedule → `{ slots, now }`; approve = PATCH `{ status:
// "scheduled", publishAt: now + 1h }` (put it back on the calendar), reject =
// DELETE (status cancelled — the route never hard-deletes). A route that is
// not there yet, or a failed fetch, is the source being UNAVAILABLE, never an
// error page.
//
// NOTHING HERE IS UNDOABLE TO "MISSED". The PATCH accepts only `scheduled |
// cancelled`, so a decided slot cannot return to waiting: clear is refused, and
// the undo stack is told so by the refusal rather than by a write that would
// quietly reschedule a cancelled slot.

import { accessHeader } from "@/lib/imagingClient";
import type { ScheduleSlot } from "@/lib/publish/types";

import type { BoardEntry, BoardSourceExt } from "../source";
import { countEntries, itemId, itemsOf, keyOfItem, SourceUnavailable, VerdictRefused } from "../source";
import type { BoardVerdict } from "../types";
import { fromSlot, rescheduleAt } from "../verdicts";

export const PUBLISH_CLEAR_REFUSAL = "a decided slot cannot return to missed";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...accessHeader(), ...(init.headers ?? {}) } });
  } catch {
    throw new SourceUnavailable("the studio could not be reached");
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
  if (res.status === 404 && !json.error) throw new SourceUnavailable("/api/publish/schedule is not built here");
  if (res.status === 401 || res.status === 403) throw new SourceUnavailable(json.error ?? json.detail ?? `HTTP ${res.status}`);
  if (!res.ok) throw new Error(json.error ?? json.detail ?? `HTTP ${res.status}`);
  return json as T;
}

export function slotEntries(slots: readonly ScheduleSlot[]): BoardEntry[] {
  const out: BoardEntry[] = [];
  for (const s of slots) {
    const verdict = fromSlot(s);
    if (verdict === undefined) continue;
    out.push({
      item: {
        id: itemId("publish", s.id),
        source: "publish",
        title: s.title,
        projectId: s.projectId,
        group: s.channelId,
        media: [{ kind: "text", text: s.error ?? s.description }],
        machinePick: null,
        verdict,
        reasons: [],
        note: null,
        createdAt: s.createdAt,
      },
      href: "/calendar",
      facts: [
        { name: "status", value: s.status },
        { name: "publish at", value: s.publishAt },
        { name: "channel", value: s.channelId },
        ...(s.missedAt ? [{ name: "missed", value: s.missedAt }] : []),
      ],
      refuse: { clear: PUBLISH_CLEAR_REFUSAL },
    });
  }
  return out;
}

export function makePublishSource(): BoardSourceExt {
  const loadEntries = async () => slotEntries((await call<{ slots: ScheduleSlot[] }>("/api/publish/schedule")).slots ?? []);
  return {
    id: "publish",
    label: "Publish",
    reasonAxes: [],
    native: { href: "/calendar", label: "Calendar" },
    exclusive: false,
    commitsOn: null,
    count: async () => countEntries(await loadEntries()),
    loadEntries,
    load: () => itemsOf(loadEntries()),
    async decide(id: string, verdict: BoardVerdict) {
      const slot = encodeURIComponent(keyOfItem(id));
      if (verdict === null) throw new VerdictRefused(PUBLISH_CLEAR_REFUSAL);
      if (verdict === "approve") {
        await call(`/api/publish/schedule/${slot}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "scheduled", publishAt: rescheduleAt() }),
        });
        return;
      }
      await call(`/api/publish/schedule/${slot}`, { method: "DELETE" });
    },
  };
}
