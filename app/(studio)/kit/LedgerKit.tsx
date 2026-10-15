"use client";

// THE LEDGER'S PARTS, live (Phase 2, lot 16): the time strip, the event row, the JSON views,
// the stale badge, and the features the Ledger added to existing controls (an actor Seg with
// glyphs and counts, a Toggle with a glyph, a count or a keycap, a SourceTag with its
// figure, a Button with a stamp or a trailing glyph, a nested FacetRow). A client island
// because each takes callbacks and does what it shows: the strip's drag sets a range, a
// row selects, a toggle toggles. The acts are shaped like the v1 projection's real ones
// (lib/ledger/v1/sources), so a specimen shows the length and shape of real work.

import { useState } from "react";

import type { ActorKind, Event } from "@gt/domain/event";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { EventRow } from "@gt/ui/components/eventrow/EventRow.tsx";
import { FacetRow } from "@gt/ui/components/facet/FacetRow.tsx";
import { JsonBlock, JsonLine } from "@gt/ui/components/jsonl/Json.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { StaleBadge } from "@gt/ui/components/stalebadge/StaleBadge.tsx";
import { TimeStrip } from "@gt/ui/components/timestrip/TimeStrip.tsx";
import { daysBetween, type DayCount, type Range } from "@gt/ui/components/timestrip/strip.ts";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import { Row, Section, Spec } from "./Spec.tsx";
import k from "./kit.module.css";

// A fixed NOW, so the sheet draws the same strip on every load.
const NOW = Date.parse("2026-10-15T09:12:00.000Z");
const DAYS: readonly DayCount[] = daysBetween("2026-09-10", "2026-10-22").map((day, i) => {
  if (day > "2026-10-15") return { day, operator: 0, agent: 0, machine: 0 };
  const wave = Math.round(Math.abs(Math.sin(i / 3)) * 30);
  return { day, operator: i % 5 === 0 ? 0 : (i * 7) % 11, agent: i % 4 === 0 ? (i * 3) % 13 : 0, machine: i % 9 === 4 ? 0 : wave };
});

const ev = (seq: number, over: Partial<Event> & Pick<Event, "type" | "actor" | "subject">): Event => ({
  seq,
  at: "2026-10-15T09:10:00.000Z",
  occurredAt: "2026-08-26T12:04:11.000Z",
  atSrc: "recorded",
  data: { runId: "2026-08-26-sweep-01", src: "real" },
  key: `forge:2026-08-26-sweep-01:f${seq}`,
  prevHash: "0".repeat(64),
  hash: "1".repeat(64),
  ...over,
});

const ROWS: readonly { readonly e: Event; readonly tone: "cyan" | "emerald" | "violet" | "rose"; readonly trail?: { text: string; error: boolean }; readonly derived?: boolean }[] = [
  { e: ev(512, { type: "run.start", actor: { kind: "machine", id: "forge" }, subject: { kind: "run", id: "2026-08-26-sweep-01" }, lane: "gpu.local" }), tone: "cyan" },
  { e: ev(513, { type: "verdict.keep", actor: { kind: "operator", id: "operator" }, subject: { kind: "candidate", id: "2026-08-26-sweep-01/s03-ink-wash" } }), tone: "emerald", trail: { text: "the wash holds at plate scale", error: false } },
  { e: ev(514, { type: "judge.pick", actor: { kind: "agent", id: "dojo-judge" }, subject: { kind: "pair", id: "2026-08-30-what-stays-dark/p2" }, cost: { usd: 0.42, src: "model" } }), tone: "violet", derived: true },
  { e: ev(515, { type: "run.end", actor: { kind: "machine", id: "forge" }, subject: { kind: "run", id: "2026-09-01-nb-counted-beats" }, cost: { usd: 1.2, src: "real" } }), tone: "rose", trail: { text: "CUDA out of memory. Tried to allocate 2.00 GiB (GPU 0; 23.99 GiB total capacity)", error: true } },
];

type Who = "all" | ActorKind;

export function LedgerSections() {
  const [range, setRange] = useState<Range | null>({ from: "2026-10-01", to: "2026-10-05" });
  const [sel, setSel] = useState(513);
  const [who, setWho] = useState<Who>("all");
  const [facets, setFacets] = useState(true);
  const [newest, setNewest] = useState(true);
  const [detail, setDetail] = useState(false);
  const [nested, setNested] = useState<ReadonlySet<string>>(new Set(["verdict.keep"]));
  return (
    <Section id="ledger">
      <Spec names={["TimeStrip"]} source="timestrip/TimeStrip.tsx" wide>
        <TimeStrip days={DAYS} today="2026-10-15" nowMs={NOW} range={range} inRange={212} onRange={setRange} />
      </Spec>
      <Spec names={["EventRow"]} source="eventrow/EventRow.tsx" wide>
        <div className={k.frame} role="grid" aria-label="events" aria-rowcount={ROWS.length}>
          {ROWS.map(({ e, tone, trail, derived }, i) => (
            <EventRow
              key={e.seq}
              seq={e.seq}
              time="08-26 12:04"
              derived={derived === true}
              actor={e.actor}
              type={e.type}
              tone={tone}
              subject={{ kind: e.subject.kind, label: e.subject.id.slice(e.subject.id.lastIndexOf("/") + 1), href: "#ledger" }}
              {...(trail === undefined ? {} : { trail })}
              {...(e.cost === undefined ? {} : { cost: e.cost })}
              source={i === 2 ? "dojo" : "forge"}
              selected={sel === e.seq}
              index={i + 1}
              onSelect={() => setSel(e.seq)}
              onOpen={() => setSel(e.seq)}
            />
          ))}
        </div>
      </Spec>
      <Spec names={["JsonLine", "JsonBlock"]} source="jsonl/Json.tsx" wide>
        <div className={k.frame} style={{ overflow: "auto" }} role="grid" aria-label="events as JSON Lines" aria-rowcount={2}>
          {ROWS.slice(0, 2).map(({ e }, i) => (
            <JsonLine key={e.seq} n={e.seq} text={JSON.stringify(e)} selected={sel === e.seq} index={i + 1} onSelect={() => setSel(e.seq)} />
          ))}
        </div>
        <JsonBlock text={JSON.stringify({ seq: 513, type: "verdict.keep", note: "<b>not markup</b>", cost: null, ok: true }, null, 2)} label="event 513 as JSON" />
      </Spec>
      <Spec names={["StaleBadge"]} source="stalebadge/StaleBadge.tsx">
        <Row label="stale">
          <StaleBadge edge="stale" ageMs={42_000} feed="ledger feed" />
        </Row>
        <Row label="down">
          <StaleBadge edge="down" ageMs={540_000} feed="ledger feed" />
        </Row>
        <Row label="live">
          <StaleBadge edge="live" ageMs={1_000} feed="ledger feed" />
        </Row>
      </Spec>
      <Spec names={["Seg", "Toggle", "SourceTag", "Button", "FacetRow"]} source="the Ledger's additions" wide>
        <Row label="actors">
          <Seg<Who>
            label="actor"
            value={who}
            onChange={setWho}
            options={[
              { value: "all", label: "All", count: 688 },
              { value: "operator", label: "Operator", glyph: "operator", accent: "operator", count: 303 },
              { value: "agent", label: "Agent", glyph: "agent", accent: "agent", count: 131 },
              { value: "machine", label: "Machine", glyph: "machine", accent: "machine", count: 254 },
            ]}
          />
        </Row>
        <Row label="toggles">
          <Toggle label="facets" glyph="grid" count={2} on={facets} onToggle={setFacets} name="facets, 2 active" />
          <Toggle label={newest ? "newest" : "oldest"} glyph={newest ? "down" : "up"} on={!newest} onToggle={() => setNewest((n) => !n)} name={newest ? "newest first" : "oldest first"} />
          <Toggle label="detail" on={detail} onToggle={setDetail} shortcut={{ mode: "library", verb: "detail" }} />
        </Row>
        <Row label="figures">
          <SourceTag kind="model" value="$417" />
          <SourceTag kind="illustrative" value="$0.90" />
          <SourceTag kind="real" value={254} />
        </Row>
        <Row label="acts">
          <Button size="sm" tone="cyan" label="Open record" glyphAfter="chevR" href="#ledger" />
          <Button size="sm" label="history" tally={{ value: 9 }} onPress={() => setSel(512)} />
        </Row>
        <div className={k.frame}>
          <FacetRow mark="rail" label="verdict" count={178} share={0.75} pressed={false} onToggle={() => undefined} />
          {(["verdict.keep", "verdict.reject"] as const).map((t) => (
            <FacetRow
              key={t}
              mark="rail"
              nested={{ tone: t === "verdict.keep" ? "emerald" : "rose" }}
              label={t}
              count={t === "verdict.keep" ? 83 : 95}
              pressed={nested.has(t)}
              onToggle={(on) =>
                setNested((s) => {
                  const n = new Set(s);
                  if (on) n.add(t);
                  else n.delete(t);
                  return n;
                })
              }
            />
          ))}
        </div>
      </Spec>
    </Section>
  );
}
