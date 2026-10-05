"use client";

// The calendar's data: four reads, four writes, one clock. Every tab draws
// from this one hook, so a slot moved in the week grid is the same slot the
// Metrics tab counts — there is no second copy to drift.
//
// LINT SHAPE, deliberately: every setState below runs in a promise callback or
// an event handler, never synchronously in an effect body. lint-baseline.json
// freezes `react-hooks/set-state-in-effect` at ten across the whole repo, and
// the clock is a timer for the same reason — `Date.now()` during render is a
// purity error under the React Compiler rules.

import { useCallback, useEffect, useState } from "react";

import { listProjects } from "@/lib/projects";
import type { ScheduleSlot } from "@/lib/publish/types";
import { useAuth } from "@/lib/useAuth";

import { movePatch } from "./calendarModel";
import {
  cancelSlot,
  createSlot,
  getChannels,
  getExports,
  getMetrics,
  getSchedule,
  patchSlot,
  refreshMetrics,
  type ChannelList,
  type ExportList,
  type Fetched,
  type MetricsList,
  type NewSlot,
  type RefreshResult,
  type ScheduleList,
} from "./publishClient";

/** null while the first read is in flight. */
export type Load<T> = Fetched<T> | null;

export type Failed = Extract<Fetched<unknown>, { ok: false }>;

/** Wall-clock milliseconds, ticking every 30 s; null before the first tick. */
export function useNow(periodMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, periodMs);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [periodMs]);
  return now;
}

function replaceSlot(load: Load<ScheduleList>, slot: ScheduleSlot): Load<ScheduleList> {
  if (!load?.ok) return load;
  const has = load.data.slots.some((s) => s.id === slot.id);
  const slots = has ? load.data.slots.map((s) => (s.id === slot.id ? slot : s)) : [...load.data.slots, slot];
  return { ...load, data: { ...load.data, slots } };
}

export function useCalendar() {
  const [schedule, setSchedule] = useState<Load<ScheduleList>>(null);
  const [channels, setChannels] = useState<Load<ChannelList>>(null);
  const [exports, setExports] = useState<Load<ExportList>>(null);
  const [metrics, setMetrics] = useState<Load<MetricsList>>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    void getSchedule().then((r) => live && setSchedule(r));
    void getChannels().then((r) => live && setChannels(r));
    void getExports().then((r) => live && setExports(r));
    void getMetrics().then((r) => live && setMetrics(r));
    return () => {
      live = false;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const create = useCallback(
    async (body: NewSlot): Promise<Fetched<{ slot: ScheduleSlot }>> => {
      const r = await createSlot(body);
      if (r.ok) setSchedule((cur) => replaceSlot(cur, r.data.slot));
      return r;
    },
    [],
  );

  /** Optimistic: the slot moves on screen at once, and snaps back if the engine
   *  refuses — a drag that silently did nothing is worse than one that visibly
   *  bounced. */
  const move = useCallback(
    async (slot: ScheduleSlot, publishAt: string): Promise<Fetched<{ slot: ScheduleSlot }>> => {
      const body = movePatch(slot, publishAt);
      setSchedule((cur) => replaceSlot(cur, { ...slot, ...body }));
      const r = await patchSlot(slot.id, body);
      setSchedule((cur) => replaceSlot(cur, r.ok ? r.data.slot : slot));
      return r;
    },
    [],
  );

  const cancel = useCallback(
    async (slot: ScheduleSlot): Promise<Fetched<{ slot: ScheduleSlot }>> => {
      const r = await cancelSlot(slot.id);
      if (r.ok) setSchedule((cur) => replaceSlot(cur, r.data.slot));
      return r;
    },
    [],
  );

  const refresh = useCallback(async (): Promise<Fetched<RefreshResult>> => {
    const r = await refreshMetrics();
    if (r.ok) void getMetrics().then(setMetrics);
    return r;
  }, []);

  return { schedule, channels, exports, metrics, reload, create, move, cancel, refresh };
}

export type Calendar = ReturnType<typeof useCalendar>;

export interface ProjectChoice {
  id: string;
  title: string;
}

/** The account's projects, for an export that does not name its own. Read-only
 *  (lib/projects.ts listProjects), not useProjects: that hook seeds a demo
 *  shelf on first visit, which is the Projects page's business, not this one's.
 *  An export carries no project id today (lib/publish/exports.ts header), so
 *  the engine asks the caller and the form asks the person. */
export function useProjectChoices(): ProjectChoice[] | null {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [rows, setRows] = useState<{ uid: string; list: ProjectChoice[] } | null>(null);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    listProjects(uid)
      .then((ps) => live && setRows({ uid, list: ps.map((p) => ({ id: p.id, title: p.title })) }))
      .catch(() => live && setRows({ uid, list: [] }));
    return () => {
      live = false;
    };
  }, [uid]);
  return rows && rows.uid === uid ? rows.list : null;
}
