"use client";

// THE FLOOR PARTS (prototype index.html Lane, RunRow, Pile, Shelf, CalendarColumn, SlotRow,
// renderMonth, and shell.js header's next-btn/spend/ledger chips; Phase 3 lot 20): each in its
// states, over literal data and a fixed clock, so the sheet draws the same every time. The
// focus control and the month's controls are live here; nothing they do leaves the specimen.

import { useState } from "react";

import { CalendarColumn } from "@gt/ui/components/floor/CalendarColumn.tsx";
import { ChannelReadiness } from "@gt/ui/components/floor/ChannelReadiness.tsx";
import { FloorGlyph } from "@gt/ui/components/floor/FloorGlyph.tsx";
import { Lane, LaneSummary } from "@gt/ui/components/floor/Lane.tsx";
import { MonthCalendar } from "@gt/ui/components/floor/MonthCalendar.tsx";
import { Pile } from "@gt/ui/components/floor/Pile.tsx";
import { RunRow } from "@gt/ui/components/floor/RunRow.tsx";
import { ScheduleForm } from "@gt/ui/components/floor/ScheduleForm.tsx";
import type { ChannelReady, ScheduleItem } from "@gt/ui/components/floor/schedule.ts";
import { ShelfCell, ShelfGrid, ShelfList, ShelfRow, ShelfStyle } from "@gt/ui/components/floor/ShelfCell.tsx";
import { SlotConfirm } from "@gt/ui/components/floor/SlotConfirm.tsx";
import { SlotDetail, type SlotView } from "@gt/ui/components/floor/SlotDetail.tsx";
import { SlotMark, SlotRow } from "@gt/ui/components/floor/SlotRow.tsx";
import { railOf, type RailSlot } from "@gt/ui/components/floor/calendar.ts";
import { FLOOR_LANES, type FloorLane } from "@gt/ui/components/floor/floor.ts";
import { LedgerDelta, NextButton, SpendChip } from "@gt/ui/components/header/HeaderChips.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { Wave } from "@gt/ui/components/wave/Wave.tsx";

import { Row, Section, Spec } from "./Spec.tsx";
import k from "./kit.module.css";

const NOW = Date.UTC(2026, 9, 15, 9, 12);
const PEAKS = [0.2, 0.5, 0.8, 0.6, 0.9, 0.4, 0.7, 0.3, 0.6, 0.8, 0.5, 0.2, 0.4, 0.7, 0.9, 0.6, 0.3, 0.5];
const LANE: FloorLane = FLOOR_LANES[0];

const slot = (id: string, title: string, publishAt: string, status: RailSlot["status"], channel = "youtube", error?: string): RailSlot => ({ id, title, channel, publishAt, status, ...(error === undefined ? {} : { error }) });

const SLOTS: readonly RailSlot[] = [
  slot("s1", "Radar sweep · cut A", "2026-10-15T07:00:00.000Z", "scheduled"),
  slot("s2", "Why the Bitcoin price does not rise", "2026-10-15T16:00:00.000Z", "publishing", "tiktok"),
  slot("s3", "Aqueduct, three angles", "2026-10-17T11:30:00.000Z", "scheduled", "instagram"),
  slot("s4", "Agent run budgeting", "2026-10-16T09:00:00.000Z", "scheduled", "blog"),
  slot("s5", "Chokepoint explainer", "2026-10-13T18:00:00.000Z", "failed", "youtube", "upload: 403 quotaExceeded - the channel's daily upload quota is spent"),
  slot("s6", "Radar sweep · teaser", "2026-10-12T18:00:00.000Z", "missed", "tiktok", "missed: the window closed at 18:15 with the export still rendering"),
  slot("s7", "Edu radar · long", "2026-10-10T15:00:00.000Z", "published"),
  { ...slot("s8", "Signal Room · square", "2026-10-16T13:00:00.000Z", "scheduled", "instagram"), drift: "channel_not_wired" },
  slot("s9", "The quiet tariff · square", "2026-10-14T08:00:00.000Z", "cancelled", "instagram", "upload: 400 invalid_container - The video container is not supported; re-export as MP4 (H.264)."),
];

const CHANNELS: readonly ChannelReady[] = [
  { channel: "youtube", state: "dry", env: [{ name: "YT_CLIENT", present: true }, { name: "YT_REFRESH", present: false }], note: "dry: publishing writes a request plan, no upload", command: "npx tsx pipeline/publish.mts channels --json", lastOut: "2026-10-10T15:00:04.000Z", lastFailure: { at: "2026-10-13T18:00:05.000Z", error: "upload: 403 quotaExceeded - the channel's daily upload quota is spent", inARow: 2 } },
  { channel: "instagram", state: "not_wired", env: [{ name: "IG_TOKEN", present: false }], note: "Graph API adapter not built", command: "npx tsx pipeline/publish.mts channels --json" },
  { channel: "blog", state: "act", env: [], command: "node pipeline/article.mts status" },
];

const ITEMS: readonly ScheduleItem[] = [
  { id: "video:export:chokepoint", title: "Chokepoint explainer", meta: "film · 63.5 MB", poster: "/clips/presets/blueprint.jpg" },
  { id: "video:export:quiet-tariff", title: "The quiet tariff", meta: "ad · 9.1 MB", poster: "/clips/presets/chalk-argument.jpg" },
  { id: "video:export:river-steps", title: "Two hundred days of rain", meta: "music-video · 54.0 MB" },
];

const FAILED: SlotView = {
  slot: SLOTS[4] ?? slot("s5", "Chokepoint explainer", "2026-10-13T18:00:00.000Z", "failed"),
  libraryItemId: "video:export:chokepoint",
  description: "Every shipping lane has one strait it cannot route around.",
  tags: ["geography", "trade"],
  media: { kind: "video", src: "/clips/presets/blueprint.webm", poster: "/clips/presets/blueprint.jpg" },
  project: { title: "The quiet tariff", href: "#floor", runs: "#floor", steps: ["done", "done", "failed", "idle", "done", "idle"] },
  ledger: "#floor",
  source: "fixture",
  mode: "dry",
};

const POST: SlotView = {
  slot: { ...slot("s10", "Faceting without a second index", "2026-10-13T03:00:00.000Z", "published", "blog") },
  libraryItemId: "article:run:art-2026-10-14-faceting",
  description: "",
  tags: ["software-engineering"],
  publicationId: "pub-sl-faceting-blog-out",
  media: { kind: "post", pr: "https://github.com/xkazm04/ai-registry/pull/41" },
  metrics: { at: "2026-10-15T00:00:00.000Z", views: { value: 52000, floor: true }, likes: { value: 3100 }, comments: { value: null }, shares: { value: null }, avgViewDurationS: null, subsDelta: null },
  ledger: "#floor",
  source: "fixture",
  mode: "dry",
};

export function FloorSection() {
  const [focus, setFocus] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  const rail = railOf(SLOTS, NOW);
  return (
    <Section id="floor">
      <Spec names={["Lane", "LaneSummary", "FloorGlyph"]} source="floor/Lane.tsx · index.html Lane" wide>
        <div className={k.floorLanes}>
          <Lane
            lane={LANE}
            state={focus ? "focused" : "open"}
            onFocus={() => setFocus((f) => !f)}
            foundry={<RunRow title="forge sweep-01" media="image" state="running" progress={{ done: 7, total: 20, stage: "plates" }} />}
            weir={<Pile title="extract ghibli-watercolour" media="image" mode="matrix-cull" source="extract" runId="2026-10-14-ghibli" decided={3} pending={9} href="#floor" next />}
            shelf={
              <ShelfCell title="Library · styles" tallies={[{ value: 2, label: "proven" }]}>
                <ShelfGrid>
                  <ShelfStyle name="Teal-orange blockbuster" />
                  <ShelfStyle name="Ink wash" />
                </ShelfGrid>
              </ShelfCell>
            }
          />
          <Lane
            lane={FLOOR_LANES[2]}
            state="folded"
            onFocus={() => undefined}
            foundry={
              <LaneSummary>
                <Tally value={1} label="running" />
              </LaneSummary>
            }
            weir={
              <LaneSummary>
                <Tally value={1} label="piles" />
                <Tally value={14} label="items" />
              </LaneSummary>
            }
            shelf={
              <LaneSummary>
                <Tally value={6} label="kept takes" />
              </LaneSummary>
            }
          />
        </div>
        <Row label="marks">
          {(["image", "article", "audio", "video", "matrix-cull", "blind-pair", "packet-review", "lock", "expand", "collapse", "chevL", "chevR"] as const).map((n) => (
            <span key={n} className={k.glyphCell} title={n}>
              <FloorGlyph name={n} className={k.glyph} />
            </span>
          ))}
        </Row>
      </Spec>

      <Spec names={["RunRow"]} source="floor/RunRow.tsx · STATUS.job">
        <div className={k.stack}>
          <RunRow title="forge sweep-01" media="image" state="running" progress={{ done: 7, total: 20, stage: "plates" }} />
          <RunRow title="article agent-run-budgeting" media="article" state="running" />
          <RunRow title="suno · 4 prompts" media="audio" state="queued" />
          <RunRow title="mv · Neon drift" media="video" state="interrupted" error="the render box restarted mid-encode; the lease holder pid 4410 is gone" />
        </div>
      </Spec>

      <Spec names={["Pile"]} source="floor/Pile.tsx · index.html PileFace" wide>
        <div className={k.piles}>
          <Pile title="extract ghibli-watercolour" media="image" mode="matrix-cull" source="extract" runId="2026-10-14-ghibli" decided={3} pending={9} href="#floor" next />
          <Pile title="dojo craft · cycle 7" media="image" mode="blind-pair" source="dojo" runId="2026-10-13-c7" decided={0} pending={6} href="#floor" />
          <Pile title="Agent run budgeting" media="article" mode="packet-review" source="articles" runId="2026-10-14-budget" decided={0} pending={1} href="#floor" />
          <Pile title="suno clips to judge" media="audio" mode="matrix-cull" source="suno" runId="suno/triage" decided={2} pending={8} href="#floor" peaks={[PEAKS, PEAKS.slice().reverse(), PEAKS]} />
          <Pile title="strips edu-radar" media="video" mode="matrix-cull" source="strips" runId="2026-10-12-radar" decided={5} pending={5} href="#floor" />
        </div>
      </Spec>

      <Spec names={["ShelfCell", "ShelfGrid", "ShelfStyle", "ShelfList", "ShelfRow"]} source="floor/ShelfCell.tsx · index.html Shelf">
        <div className={k.stack}>
          <ShelfCell title="Library · posts" tallies={[{ value: 1, label: "landed" }]}>
            <ShelfList>
              <ShelfRow href="#floor" lead={<FloorGlyph name="article" className={k.glyph} />} title="Agent run budgeting" trail={<Chip label="PR · ai-registry" tone="emerald" casing="lower" />} />
            </ShelfList>
          </ShelfCell>
          <ShelfCell title="Library · kept takes" href="#floor" tallies={[{ value: 2, label: "kept" }]}>
            <ShelfList>
              <ShelfRow lead={<Wave peaks={PEAKS} width={74} height={20} tone="violet" />} title="Neon drift" fact="2:41" trail={<Chip label="music" casing="lower" />} />
              <ShelfRow lead={<Wave peaks={[]} width={74} height={20} tone="cyan" />} title="Door slam, wet" fact="0:02" trail={<Chip label="sfx" casing="lower" />} />
            </ShelfList>
          </ShelfCell>
          <ShelfCell title="Projects" href="#floor" />
        </div>
      </Spec>

      <Spec names={["CalendarColumn", "SlotRow", "SlotMark"]} source="floor/CalendarColumn.tsx · UTC">
        <div className={k.calRail}>
          <CalendarColumn rail={rail} nowMs={NOW} open={false} onOpen={() => undefined} />
        </div>
        <Row label="channels">
          {["youtube", "tiktok", "instagram", "blog", "mastodon"].map((c) => (
            <SlotMark key={c} channel={c} />
          ))}
        </Row>
        <SlotRow slot={slot("x", "Chokepoint explainer", "2026-10-13T18:00:00.000Z", "cancelled")} />
      </Spec>

      <Spec names={["SlotDetail"]} source="floor/SlotDetail.tsx · index.html SlotDetail" wide>
        <div className={k.stack}>
          <SlotDetail view={FAILED} nowMs={NOW} busy={null} onMove={() => undefined} onCancel={() => undefined} onPublishNow={() => undefined} specimen />
          <SlotDetail view={POST} nowMs={NOW} busy={null} onMove={() => undefined} onCancel={() => undefined} onPublishNow={() => undefined} specimen />
        </div>
      </Spec>

      <Spec names={["SlotConfirm"]} source="floor/SlotConfirm.tsx · consequence vocabulary">
        <SlotConfirm verb="Cancel slot" object="Chokepoint explainer · youtube · Tue 13 Oct · 18:00 UTC" consequences={["cancelled · stays in the calendar, struck", "final · it never publishes"]} tone="rose" busy={false} onConfirm={() => undefined} onCancel={() => undefined} specimen />
      </Spec>

      <Spec names={["ScheduleForm"]} source="floor/ScheduleForm.tsx · v1 app/calendar/Composer.tsx" wide>
        <ScheduleForm items={{ kind: "read", items: ITEMS }} channels={CHANNELS} slots={SLOTS} nowMs={NOW} day="2026-10-16" item={null} lastChannel="youtube" busy={false} refusal="video:export:chokepoint is already on youtube (slot s5, scheduled for 2026-10-16T12:00:00.000Z)" onSchedule={() => undefined} />
      </Spec>

      <Spec names={["ChannelReadiness"]} source="floor/ChannelReadiness.tsx · v1 app/calendar/ChannelsTab.tsx">
        <ChannelReadiness channels={CHANNELS} />
      </Spec>

      <Spec names={["MonthCalendar"]} source="floor/MonthCalendar.tsx · index.html renderMonth" wide>
        <div className={k.month}>
          <MonthCalendar
            slots={SLOTS}
            nowMs={NOW}
            month={{ y: 2026, m: 9 }}
            day={day}
            channelsOff={off}
            onMonth={() => undefined}
            onToday={() => setDay("2026-10-15")}
            onDay={setDay}
            onChannel={(c) =>
              setOff((cur) => {
                const nx = new Set(cur);
                if (nx.has(c)) nx.delete(c);
                else nx.add(c);
                return nx;
              })
            }
            onClose={() => setDay(null)}
            channels={CHANNELS}
            mode="dry"
            tick={{ running: true, lastRunAt: "2026-10-15T09:11:30.000Z", nextDueAt: "2026-10-15T09:12:00.000Z" }}
            onSchedule={() => undefined}
          />
        </div>
      </Spec>

      <Spec names={["NextButton", "SpendChip", "LedgerDelta"]} source="header/HeaderChips.tsx · shell.js header" wide>
        <Row label="waiting">
          <NextButton next={{ title: "extract ghibli-watercolour", count: 9, href: "#floor" }} />
          <SpendChip spend={{ total: 4.2, bySrc: { real: 1, model: 3.2 }, priced: 3, capped: false }} />
          <LedgerDelta delta={12} href="#floor" />
        </Row>
        <Row label="clear">
          <NextButton next={null} />
          <SpendChip spend={{ total: 0, bySrc: {}, priced: 0, capped: false }} />
          <LedgerDelta delta={0} href="#floor" />
        </Row>
      </Spec>
    </Section>
  );
}
