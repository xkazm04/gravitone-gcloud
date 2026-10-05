"use client";

// V3 · EDITORIAL AGENDA — read like a magazine's running order. Across the top,
// what there is to air: every export as a poster on a shelf (the Library preset
// rail's register, app/library/PresetRail.tsx, turned on its side), each saying
// whether it is booked. Below, the slots as a dated feed in StatReel's three
// groups (apps/studio/src/routes/Calendar.tsx AgendaView; calendarModel
// slotGroups): what waits on a decision, what airs next, what already went.
//
// A poster pressed is the composer's export. A feed row pressed opens in place,
// with the move and the cancel under it — no drawer, no second panel to find.

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { usePrefersReducedMotion } from "@/components/ui/motionPreference";
import { Panel } from "@/components/ui/Primitives";
import { CHIP_CLASS, TALLY_TONE, Tally } from "@/components/ui/signal";
import { EASE } from "@/components/ui/tokens";
import type { ExportRef, ScheduleSlot } from "@/lib/publish/types";

import { CHANNEL_NAME, dayKey, fmtBytes, relWhen, slotGroups, timeLabel, type SlotGroupKey } from "./calendarModel";
import { Composer } from "./Composer";
import { Poster, aspectWord, usePoster } from "./poster";
import type { ScheduleProps } from "./ScheduleTab";
import { SlotSheet } from "./SlotSheet";
import { ChannelGlyph, CutAnExport, LOOK, OnImage, SectionHead, StatusChip, TONE_RULE, lookOf, type Tone } from "./ui";
import type { ProjectChoice } from "./useCalendar";
import { activeSlotOf, exportName, projectTitle, shortId } from "./view";
import { whenWords } from "./WhenPicker";

const SHORT_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const GROUP: Record<SlotGroupKey, { title: string; tone: Tone }> = {
  decide: { title: "Needs decision", tone: "amber" },
  upcoming: { title: "Upcoming", tone: "cyan" },
  history: { title: "History", tone: "emerald" },
};

export function EditorialAgenda(p: ScheduleProps) {
  const { slots, now, selectedId, select } = p;
  const reduced = usePrefersReducedMotion();
  const [pick, setPick] = useState<string | null>(null);
  const exports = p.cal.exports?.ok ? p.cal.exports.data.exports : null;
  const groups = slotGroups(slots);

  const chosen = pick ?? p.preset?.exportId ?? exports?.find((e) => !activeSlotOf(slots, e.id))?.id ?? exports?.[0]?.id ?? null;

  return (
    <div className="space-y-7">
      <section aria-labelledby="shelf-h" className="space-y-3" data-testid="calendar-shelf">
        <SectionHead id="shelf-h" title="Ready to air">
          {exports && (
            <Tally
              value={exports.filter((e) => !activeSlotOf(slots, e.id)).length}
              of={exports.length}
              label="unbooked"
              tone="cyan"
            />
          )}
        </SectionHead>
        <div className="scroll-x -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pt-1 pb-3 [mask-image:linear-gradient(to_right,black_94%,transparent)]" role="radiogroup" aria-label="Export to schedule">
          {exports === null
            ? [0, 1, 2, 3, 4].map((i) => <ShelfGhost key={i} />)
            : exports.length === 0
              ? (
                  <div className="relative flex gap-4">
                    <span className="sr-only">No exports yet</span>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <ShelfGhost key={i} />
                    ))}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <CutAnExport />
                    </div>
                  </div>
                )
              : exports.map((e, i) => (
                  <ShelfPoster
                    key={e.id}
                    exp={e}
                    index={i}
                    reduced={reduced}
                    on={e.id === chosen}
                    booked={activeSlotOf(slots, e.id)}
                    projects={p.projects}
                    onPick={() => setPick(e.id)}
                  />
                ))}
        </div>
      </section>

      <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`grp-${g.key}`} className="space-y-3" data-testid={`calendar-agenda-${g.key}`}>
              <SectionHead id={`grp-${g.key}`} title={GROUP[g.key].title} accent={g.slots.length ? GROUP[g.key].tone : undefined}>
                <Tally value={g.slots.length} tone={g.slots.length ? (GROUP[g.key].tone === "emerald" ? "emerald" : GROUP[g.key].tone === "amber" ? "amber" : "cyan") : "neutral"} />
              </SectionHead>
              {g.slots.length === 0 ? (
                <EmptyGroup kind={g.key} />
              ) : (
                <ol className="space-y-5">
                  {byDate(g.slots).map(([k, list]) => (
                    <li key={k} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4">
                      <DateBlock iso={list[0].publishAt} today={dayKey(new Date(now))} />
                      <ul className="space-y-2">
                        {list.map((s, i) => (
                          <FeedRow
                            key={s.id}
                            slot={s}
                            index={i}
                            reduced={reduced}
                            open={s.id === selectedId}
                            onToggle={() => select(s.id === selectedId ? null : s.id)}
                            {...p}
                          />
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>

        <Panel as="aside" className="space-y-5 p-5 xl:sticky xl:top-4">
          <h2 className="font-instrument text-2xl leading-none text-white">Schedule</h2>
          <Composer
            preset={chosen ? { nonce: hashNonce(chosen) + (p.preset?.nonce ?? 0), exportId: chosen, channelId: p.preset?.channelId, when: p.preset?.when } : p.preset}
            exportPicker="header"
            exports={p.cal.exports}
            channels={p.cal.channels}
            slots={slots}
            now={now}
            projects={p.projects}
            onCreate={p.cal.create}
            onDone={(s) => {
              setPick(null);
              p.created(s);
            }}
          />
        </Panel>
      </div>
    </div>
  );
}

/** A stable small number per export id, so picking another poster is a new
 *  preset (a fresh form) and re-rendering the same one is not. */
function hashNonce(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) * 1000;
}

function byDate(list: ScheduleSlot[]): [string, ScheduleSlot[]][] {
  const out = new Map<string, ScheduleSlot[]>();
  for (const s of list) {
    const d = new Date(s.publishAt);
    const k = Number.isNaN(d.getTime()) ? "?" : dayKey(d);
    out.set(k, [...(out.get(k) ?? []), s]);
  }
  return [...out.entries()];
}

function DateBlock({ iso, today }: { iso: string; today: string }) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <span className="font-jetbrains text-white/40">—</span>;
  const isToday = dayKey(d) === today;
  return (
    <div className="pt-1 text-right">
      <span className={`font-instrument block text-5xl leading-none ${isToday ? "text-cyan-200 [text-shadow:0_0_18px_var(--gt-glow-cyan)]" : "text-white/90"}`}>
        {d.getDate()}
      </span>
      <span className={`font-jetbrains mt-1 block text-label leading-tight tracking-[0.14em] uppercase ${isToday ? "text-cyan-200/85" : "text-white/45"}`}>
        {isToday ? "today" : SHORT_DOW[d.getDay()]}
      </span>
      <span className="font-jetbrains block text-label leading-tight tracking-[0.14em] text-white/30 uppercase">{SHORT_MON[d.getMonth()]}</span>
    </div>
  );
}

function FeedRow({
  slot: s,
  index,
  reduced,
  open,
  onToggle,
  now,
  projects,
  move,
  cancel,
  publicationOf,
}: ScheduleProps & { slot: ScheduleSlot; index: number; reduced: boolean; open: boolean; onToggle: () => void }) {
  const look = lookOf(s);
  const l = LOOK[look];
  const project = projectTitle(s.projectId, projects);
  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, delay: reduced ? 0 : Math.min(index, 8) * 0.04, ease: EASE }}
      className={`overflow-hidden rounded-2xl border transition ${
        open
          ? "border-cyan-300/35 bg-white/[0.045] shadow-[0_18px_50px_-24px_var(--gt-glow-cyan)]"
          : l.tone === "amber"
            ? "border-amber-300/25 bg-amber-400/[0.03] hover:border-amber-300/45"
            : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
      } ${s.status === "cancelled" ? "opacity-60" : ""}`}
      data-testid={`calendar-agenda-row-${s.id}`}
    >
      <button type="button" onClick={onToggle} aria-expanded={open} className="group flex w-full items-stretch gap-4 p-2.5 text-left">
        <span className="relative aspect-video w-48 shrink-0 overflow-hidden rounded-xl">
          <Poster exportId={s.exportId} fit="contain" dim={s.status === "cancelled"} className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]" />
          <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${TONE_RULE[l.tone]}`} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-1">
          <span className="font-jetbrains flex items-center gap-2 text-label">
            <span className="text-white/90">{timeLabel(s.publishAt)}</span>
            <span className="text-white/35">{relWhen(s.publishAt, now)}</span>
          </span>
          <span className={`font-instrument truncate text-2xl leading-tight text-white ${s.status === "cancelled" ? "line-through decoration-white/40" : ""}`}>
            {s.title || s.id}
          </span>
          <span className="font-hanken flex min-w-0 items-center gap-2 text-label text-white/55">
            <ChannelGlyph id={s.channelId} className="h-4 w-4 shrink-0 text-white/70" />
            <span className="shrink-0">{CHANNEL_NAME[s.channelId]}</span>
            {project && <span className="truncate">· {project}</span>}
            {s.tags.length > 0 && <span className="font-jetbrains truncate text-white/35">{s.tags.map((t) => `#${t}`).join(" ")}</span>}
          </span>
          {s.error && <span className={`font-jetbrains truncate text-label ${look === "failed" ? "text-rose-200/85" : "text-amber-200/85"}`}>{s.error}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end justify-between gap-2 py-1 pr-1">
          <StatusChip slot={s} />
          <ChevronDown aria-hidden className={`h-4 w-4 text-white/40 transition-transform duration-200 ${open ? "rotate-180 text-cyan-300" : ""}`} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="sheet"
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/8 px-4 pt-4 pb-4 sm:pl-[13.5rem]">
              <SlotSheet slot={s} now={now} projects={projects} publication={publicationOf(s)} onMove={move} onCancel={cancel} compact align="left" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function ShelfPoster({
  exp,
  index,
  reduced,
  on,
  booked,
  projects,
  onPick,
}: {
  exp: ExportRef;
  index: number;
  reduced: boolean;
  on: boolean;
  booked: ScheduleSlot | undefined;
  projects: ProjectChoice[] | null;
  onPick: () => void;
}) {
  const poster = usePoster(exp.id);
  const aspect = aspectWord(poster);
  const name = exportName(exp, projects);
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={`${name}, ${shortId(exp.id)}${booked ? `, ${booked.status} ${whenWords(new Date(booked.publishAt))}` : ", unbooked"}`}
      onClick={onPick}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: reduced ? 0 : Math.min(index, 10) * 0.04, ease: EASE }}
      className={`group w-[17rem] shrink-0 snap-start overflow-hidden rounded-2xl border text-left transition ${
        on
          ? "border-cyan-300/55 bg-cyan-400/[0.05] shadow-[0_0_0_1px_var(--gt-ring-cyan),0_18px_44px_-18px_var(--gt-glow-cyan)]"
          : "border-white/8 bg-white/[0.02] hover:border-white/20"
      }`}
    >
      <span className="relative block aspect-video overflow-hidden">
        <Poster exportId={exp.id} fit="contain" className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]" />
        {aspect && (
          <span className="font-jetbrains absolute top-2 right-2 rounded-md border border-white/10 bg-[var(--gt-ink)]/70 px-1.5 text-label text-white/70 backdrop-blur">
            {aspect}
          </span>
        )}
        <span className="absolute bottom-2 left-2">
          {booked ? (
            <OnImage>
              <span className={`${CHIP_CLASS} ${booked.status === "published" ? TALLY_TONE.emerald : TALLY_TONE.cyan}`}>
                <ChannelGlyph id={booked.channelId} className="h-3.5 w-3.5" />
                {booked.status === "published" ? "aired" : whenWords(new Date(booked.publishAt))}
              </span>
            </OnImage>
          ) : (
            <OnImage>
              <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral} uppercase`}>unbooked</span>
            </OnImage>
          )}
        </span>
      </span>
      <span className="block px-3.5 pt-2.5 pb-3">
        <span className={`font-instrument block truncate text-xl leading-tight ${on ? "text-white" : "text-white/85 group-hover:text-white"}`}>{name}</span>
        <span className="font-jetbrains block truncate text-label text-white/40">
          {shortId(exp.id)} · {fmtBytes(exp.bytes)}
          {poster?.durationS ? ` · ${Math.round(poster.durationS)}s` : ""}
        </span>
      </span>
    </motion.button>
  );
}

function ShelfGhost() {
  return (
    <span aria-hidden className="w-[17rem] shrink-0 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
      <span className="block aspect-video bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-transparent" />
      <span className="mx-3.5 mt-3 block h-3 w-32 rounded-full bg-white/[0.08]" />
      <span className="mx-3.5 mt-2 mb-3.5 block h-2 w-20 rounded-full bg-white/[0.05]" />
    </span>
  );
}

/** A group with nothing in it keeps its row's shape, faint, so the feed's
 *  rhythm reads before it fills. */
function EmptyGroup({ kind }: { kind: SlotGroupKey }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4">
      <span className="sr-only">{kind === "decide" ? "Nothing waits on a decision" : kind === "upcoming" ? "Nothing upcoming" : "Nothing published yet"}</span>
      <span aria-hidden className="mt-1 ml-auto block h-10 w-9 rounded-lg bg-white/[0.05]" />
      <span aria-hidden className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-2.5">
        <span className="aspect-video w-48 shrink-0 rounded-xl bg-gradient-to-br from-white/[0.05] to-transparent" />
        <span className="space-y-2">
          <span className="block h-2.5 w-16 rounded-full bg-white/[0.08]" />
          <span className="block h-3.5 w-56 rounded-full bg-white/[0.06]" />
          <span className="block h-2.5 w-32 rounded-full bg-white/[0.05]" />
        </span>
      </span>
    </div>
  );
}
