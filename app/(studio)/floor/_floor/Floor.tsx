"use client";

// THE FLOOR (prototype index.html `renderFloor`, floor.css `[data-component=Floor]`, `.lanes`,
// `.colheads`): the four media lanes under their column heads, the Calendar rail beside them,
// and the month when it is open.
//
// What lives here is what the operator is doing with the server's read: which lane is focused
// and whether the month is open (both in the URL, written with history.replaceState, which
// Next's router observes without a server round trip), and the keys.
//
// Keys, by verb (keymap/bindings.ts `floor`): 1-4 open a lane's first pile, ⇧1-4 focus a lane
// (again to show all), ⏎ the NEXT pile, C the month, B the Board (the NEXT packet), Esc shows
// all lanes. A slot - on the rail or in the month - opens its record as a level over the Floor
// (./SlotLevel.tsx, Phase 6), at `?slot=<id>` in the same URL state; the month's Schedule opens
// the schedule sheet (./ScheduleLevel.tsx, `?new=1`). Opening a pile is a client navigation to /board/<packet>, which the Board sheet
// intercepts over the Floor (COMMON decision 10); a modified click on a pile keeps the
// browser's own meaning.
//
// The Foundry cell holds each lane's COMPOSER (Phase 4, L28; ./Composers.tsx): Launch, or ⏎ in
// the sentence, opens the lane's receipt in the sheet layer, and only its confirm launches.
//
// Live, as Runs is (../../_shell/liveFeed.ts): the ledger's stream is advice to re-read, the
// re-read is router.refresh(), coalesced; a slow poll is the backstop for v1 progress that is
// not an event.

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { MediaLane } from "@gt/domain/lane";
import { CalendarColumn } from "@gt/ui/components/floor/CalendarColumn.tsx";
import { Lane } from "@gt/ui/components/floor/Lane.tsx";
import { railOf } from "@gt/ui/components/floor/calendar.ts";
import { FLOOR_LANES, laneAt, laneRows } from "@gt/ui/components/floor/floor.ts";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { StaleBadge } from "@gt/ui/components/stalebadge/StaleBadge.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { useFreshness, usePollBackstop } from "@gt/ui/freshness/useFreshness";
import { useKeys } from "@gt/ui/keymap/dispatch";
import { vars } from "@gt/ui/components/vars.ts";

import type { ComposerChoices, ProducePort } from "../../projects/_port/contract.ts";
import type { CalendarPort } from "../_calendar/contract.ts";
import { outcomeOf, useReceipt } from "../../projects/_plan/receipt.tsx";
import { nextPile } from "../../_shell/facts.ts";
import { BACKSTOP_MS, openFeed } from "../../_shell/liveFeed.ts";
import { useShell } from "../../_shell/Providers.tsx";
import { FoundryComposer, initialDrafts, inputOf, type LaneDraft } from "./Composers.tsx";
import type { FloorData } from "./load.ts";
import { Foundry, ShelfFor, Weir, pileHref, shelfCount } from "./LaneCells.tsx";
import { Month } from "./Month.tsx";
import { byLane, floorSearch, levelOver, slotHref, type FloorUrl } from "./model.ts";
import { ScheduleLevel } from "./ScheduleLevel.tsx";
import { SlotLevel, type SlotRead } from "./SlotLevel.tsx";
import s from "./Floor.module.css";

const never = (): (() => void) => () => undefined;

export type FloorProps = {
  readonly data: FloorData;
  readonly initial: FloorUrl;
  readonly produce: ProducePort;
  readonly calendar: CalendarPort;
  /** The open slot's record as the server read it with the page (`?slot=`), else null. */
  readonly slot: SlotRead | null;
  /** What the composers offer; null when the port could not say (drawn as its error). */
  readonly choices: { readonly ok: true; readonly value: ComposerChoices } | { readonly ok: false; readonly error: string };
};

export function Floor({ data, initial, produce, calendar, slot, choices }: FloorProps) {
  const router = useRouter();
  // true only once hydrated (the server snapshot is false): the keys are bound from then on, and
  // the live lane waits for it rather than for a timer.
  const hydrated = useSyncExternalStore(never, () => true, () => false);
  const { toast } = useShell();
  const [url, setUrl] = useState<FloorUrl>(initial);

  const lanes = useMemo(() => byLane(data.jobs, data.weir), [data.jobs, data.weir]);
  const [drafts, setDrafts] = useState<Readonly<Record<MediaLane, LaneDraft>> | null>(() => (choices.ok ? initialDrafts(choices.value) : null));
  const [active, setActive] = useState<MediaLane | null>(null);
  const flow = useReceipt(data.now);

  const launch = (lane: MediaLane): void | false => {
    const d = drafts?.[lane];
    if (d === undefined || flow.reading) return false;
    const name = FLOOR_LANES.find((l) => l.id === lane)?.name ?? lane;
    if (d.text.trim() === "") {
      toast(`${name} · first sentence`);
      return;
    }
    const input = inputOf(lane, d.choice, d.text);
    void flow.open({
      trail: [{ label: "Floor", href: "/floor" }],
      here: `${name} · launch`,
      read: (mode) => produce.composerReceipt({ input, mode }),
      armable: true,
      confirm: async (token, ceilingUsd, mode) =>
        outcomeOf(await produce.launchRun({ input, token, mode, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }), (v) => (v.kind === "stale" ? { kind: "stale", fresh: v.fresh } : { kind: "done", note: `${name} · launched · ${v.runId}`, ledger: { href: `/ledger?q=${encodeURIComponent(v.jobId)}`, subject: v.runId } })),
      done: (note, ledger) => {
        toast(note, ledger);
        setDrafts((cur) => (cur === null ? cur : { ...cur, [lane]: { ...cur[lane], text: "" } }));
        router.refresh();
      },
      failed: (message) => toast(message),
    });
  };
  const next = useMemo(() => nextPile(data.weir), [data.weir]);
  const rail = useMemo(() => railOf(data.slots, data.now), [data.slots, data.now]);
  const waiting = FLOOR_LANES.reduce((n, l) => n + lanes[l.id].piles.length, 0);

  // Live: the feed's lifetime starts from the FIRST render's head (a ref, so a refresh does not
  // reopen it); every render confirms freshness.
  const [fresh, feed] = useFreshness<number>();
  const firstHead = useRef(data.head);
  useEffect(() => {
    feed({ kind: "value", value: data.now, at: Date.now() });
  }, [data.now, feed]);
  usePollBackstop(() => router.refresh(), BACKSTOP_MS);
  useEffect(() => openFeed({ head: firstHead.current, refresh: () => router.refresh(), fail: () => feed({ kind: "fail", at: Date.now() }) }), [router, feed]);

  useEffect(() => {
    const target = `${window.location.pathname}${floorSearch(url)}`;
    if (target !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", target);
  }, [url]);

  const open = (href: string): void => router.push(href);
  const focus = (lane: MediaLane | null): void => setUrl((u) => ({ ...u, lane: u.lane === lane ? null : lane }));
  const openNext = (): void | false => {
    if (next === null) return false;
    open(pileHref(next));
  };
  const setCal = (on: boolean): void => {
    setUrl((u) => ({ ...u, cal: on, day: on ? u.day : null }));
  };
  const openSlot = (id: string): void => setUrl((u) => ({ ...u, slot: id }));

  useKeys(
    "floor",
    {
      "open-lane": ({ index }) => {
        const l = laneAt(index + 1);
        if (l === undefined) return false;
        const first = lanes[l.id].piles[0];
        if (first === undefined) toast(`${l.name} · weir clear`);
        else open(pileHref(first));
      },
      "focus-lane": ({ index }) => {
        const l = laneAt(index + 1);
        if (l === undefined) return false;
        focus(l.id);
      },
      "open-next": () => openNext(),
      calendar: () => setCal(true),
      board: () => {
        if (next === null) toast("weir clear");
        else open(pileHref(next));
      },
      unfocus: () => focus(null),
      launch: () => (active === null ? false : launch(active)),
    },
    { facts: url.lane === null ? [] : ["lane-focused"], enabled: !levelOver(url, data.calendar !== null) },
  );

  const rows = laneRows(url.lane, (l) => (shelfCount(l, data.shelf) ?? 0) > 0);

  return (
    <div className={s.floor} data-component="Floor" data-hydrated={hydrated ? "" : undefined}>
      <div className={s.lanes} style={vars({ "--rows": rows })} aria-label="Studio floor" role="region">
        <div className={s.colheads} role="presentation">
          <div className={s.corner} />
          <div className={`${s.colhead} ${s.cFoundry}`}>
            Foundry <span className={s.sub}>running</span>
            <Tally value={data.jobs.length} label="running" />
            <span className={s.push}>
              {data.produce === "fixture" && <Chip label="produce · fixture" casing="lower" />}
              <Chip label="runs ›" tone="cyan" href="/projects/runs" />
            </span>
          </div>
          <div className={`${s.colhead} ${s.cWeir}`}>
            <span className={s.weirTitle}>WEIR</span>
            <Tally value={waiting} label="waiting" />
          </div>
          <div className={`${s.colhead} ${s.cShelf}`}>
            Library · Projects <span className={s.sub}>ratified</span>
            <span className={s.push}>
              {/* Solid, not the dashed ghost rim: a dashed hairline reads under the 3:1 mark floor (the Ledger's toolbar learned the same). */}
              {data.universe === "fixture" && <Chip label="fixture" casing="lower" />}
              <StaleBadge edge={fresh.edge} feed="floor" {...(fresh.ageMs === undefined ? {} : { ageMs: fresh.ageMs })} />
            </span>
          </div>
        </div>
        {FLOOR_LANES.map((l) => {
          const state = url.lane === null ? "open" : url.lane === l.id ? "focused" : "folded";
          const folded = state === "folded";
          return (
            <Lane
              key={l.id}
              lane={l}
              state={state}
              onFocus={() => focus(l.id)}
              foundry={
                <Foundry
                  work={lanes[l.id]}
                  folded={folded}
                  composer={
                    drafts === null || !choices.ok ? (
                      <ErrorLine message={choices.ok ? "no choices" : `composer · ${choices.error}`} />
                    ) : (
                      <FoundryComposer
                        lane={l.id}
                        name={l.name}
                        choices={choices.value}
                        draft={drafts[l.id]}
                        onDraft={(d) => setDrafts((cur) => (cur === null ? cur : { ...cur, [l.id]: d }))}
                        port={produce}
                        epoch={data.now}
                        busy={flow.reading && active === l.id}
                        onLaunch={() => {
                          setActive(l.id);
                          launch(l.id);
                        }}
                        onFocus={() => setActive(l.id)}
                      />
                    )
                  }
                />
              }
              weir={<Weir work={lanes[l.id]} folded={folded} next={next} onOpen={open} unapplied={data.unapplied.filter((u) => u.lane === l.id)} />}
              shelf={<ShelfFor lane={l} shelf={data.shelf} folded={folded} />}
            />
          );
        })}
        {data.problems.length > 0 && (
          <div className={s.problems} role="status">
            {data.problems.map((p) => (
              <ErrorLine key={`${p.source}:${p.error}`} message={`${p.source} · ${p.error}`} />
            ))}
          </div>
        )}
      </div>
      <CalendarColumn rail={rail} nowMs={data.now} open={url.cal} onOpen={() => setCal(!url.cal)} slotHref={(id) => slotHref(id, false)} onOpenSlot={openSlot} />
      {flow.sheet}
      {url.cal && (
        <Month
          slots={data.slots}
          nowMs={data.now}
          day={url.day}
          onDay={(day) => setUrl((u) => ({ ...u, day }))}
          onClose={() => setCal(false)}
          onBoard={() => {
            setCal(false);
            return openNext();
          }}
          off={url.off}
          onOff={(off) => setUrl((u) => ({ ...u, off: [...off].sort() }))}
          onOpenSlot={openSlot}
          {...(data.calendar === null ? {} : { channels: data.calendar.channels, mode: data.calendar.mode, ...(data.calendar.tick === undefined ? {} : { tick: data.calendar.tick }), onSchedule: () => setUrl((u) => ({ ...u, schedule: { item: null } })) })}
        />
      )}
      {url.schedule !== null && data.calendar !== null && (
        <ScheduleLevel
          port={calendar}
          facts={data.calendar}
          slots={data.slots}
          nowMs={data.now}
          day={url.day}
          item={url.schedule.item}
          onClose={() => setUrl((u) => ({ ...u, schedule: null }))}
          onFloor={() => setUrl((u) => ({ ...u, schedule: null, cal: false, day: null }))}
          onMade={(id) => {
            setUrl((u) => ({ ...u, schedule: null, slot: id }));
            router.refresh();
          }}
        />
      )}
      {url.slot !== null && (
        <SlotLevel
          key={url.slot}
          id={url.slot}
          port={calendar}
          nowMs={data.now}
          initial={slot}
          cal={url.cal}
          onClose={() => setUrl((u) => ({ ...u, slot: null }))}
          onFloor={() => setUrl((u) => ({ ...u, slot: null, cal: false, day: null }))}
          onLanded={() => router.refresh()}
        />
      )}
    </div>
  );
}
