"use client";

// THE SHEET'S LAST PAGES (variant "sheet"): Channels - what is picked and how each route stands; Extras - the splits
// and what is drawn around the release; Review - the release as Schedule would commit it and the Calendar slots it
// would create. The review's every problem and proposal lives in the lead's list, not on the page.
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { CHANNEL_NAMES, RELEASE_CHANNELS, releaseKind, type ChannelRow, type ReleaseChannelId } from "@gt/domain/release";

import { plannedSlots } from "../../../../../_release/draft.ts";
import { CHANNEL_ENTRY } from "../../../../../_release/wizard/status.ts";
import { clock, day, KIND_LABEL } from "../../../../../_release/wizard/fmt.ts";
import type { PageProps } from "./PagesRelease.tsx";
import { SheetLines, SheetSection, SheetTable, Value } from "./Sheet.tsx";
import s from "./sheet.module.css";

const isDirect = (id: ChannelRow["id"]): id is ReleaseChannelId => (RELEASE_CHANNELS as readonly string[]).includes(id);

function Picked({ on }: { readonly on: boolean }) {
  return on ? <span aria-label="picked">✓</span> : <span aria-label="not picked" />;
}

export function ChannelsPage({ props, onEdit }: PageProps) {
  const { release: r, read } = props;
  const direct = read.channels.filter((c) => c.kind === "direct");
  const dsps = read.channels.filter((c) => c.kind === "dsp");
  return (
    <div className={s.page}>
      <SheetSection id="channels" title="Direct" aside={`${r.channels.length} of ${direct.length}`} onEdit={() => onEdit("channels")}>
        <SheetTable
          label="direct channels"
          head={["", "channel", "state"]}
          rows={direct.flatMap((c) => (isDirect(c.id) ? [{ key: c.id, cells: [<Picked key="p" on={r.channels.includes(c.id)} />, CHANNEL_NAMES[c.id], CHANNEL_ENTRY[c.state].label] }] : []))}
        />
      </SheetSection>
      <SheetSection id="stores" title="Stores" aside={`${dsps.length}`}>
        <SheetTable label="stores" head={["", "store", "state"]} rows={dsps.map((c) => ({ key: c.id, cells: ["", CHANNEL_NAMES[c.id], CHANNEL_ENTRY[c.state].label] }))} />
      </SheetSection>
    </div>
  );
}

export function ExtrasPage({ props, onEdit }: PageProps) {
  const { release: r } = props;
  const sum = Math.round(r.splits.reduce((a, x) => a + x.share, 0) * 100) / 100;
  return (
    <div className={s.page}>
      <SheetSection id="splits" title="Splits" {...(r.splits.length > 0 ? { aside: `sum ${sum}%` } : {})} onEdit={() => onEdit("splits")}>
        {r.splits.length === 0 ? (
          <SheetLines lines={[{ k: "shares", v: null }]} />
        ) : (
          <SheetTable label="splits" head={["#", "name", "share"]} rows={r.splits.map((x, i) => ({ key: `${i}`, cells: [i + 1, <Value key="n" v={x.name} />, `${x.share}%`] }))} />
        )}
      </SheetSection>
      <SheetSection id="previews" title="Around the release" edit="View" onEdit={() => onEdit("previews")}>
        <SheetLines
          lines={[
            { k: "smart link", v: `${r.channels.length} ${r.channels.length === 1 ? "door" : "doors"}` },
            { k: "canvas", v: "9:16 · 8 s" },
            { k: "promo", v: "1:1 · 9:16" },
          ]}
        />
      </SheetSection>
    </div>
  );
}

export function ReviewPage({ props, onEdit }: PageProps) {
  const { release: r, read } = props;
  const slots = plannedSlots(r, read.channels);
  const total = r.tracks.reduce((a, t) => a + t.durationS, 0);
  return (
    <div className={s.cols}>
      <SheetSection id="summary" title="Release" onEdit={() => onEdit("release")}>
        {r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt={`sleeve of ${r.title}`} className={s.artSmall} width={160} aspect={1} /> : <PlateMissing label="no sleeve" className={s.artSmall} aspect={1} />}
        <SheetLines
          cols={2}
          lines={[
            { k: "title", v: r.version === null ? r.title : `${r.title} (${r.version})`, wide: true },
            { k: "artist", v: r.artist },
            { k: "kind", v: `${KIND_LABEL[releaseKind(r.tracks)]} · ${r.tracks.length} · ${clock(total)}` },
            { k: "date", v: r.releaseDate === null ? "when processed" : day(r.releaseDate) },
            { k: "genre", v: [r.genre.primary, r.genre.secondary].filter((g) => g !== null).join(" / ") },
            { k: "UPC", v: r.upc, code: true },
          ]}
        />
      </SheetSection>
      <SheetSection id="calendar" title="Calendar" aside={`${slots.length}`} onEdit={() => onEdit("channels")}>
        {slots.length === 0 ? (
          <SheetLines lines={[{ k: "slots", v: null }]} />
        ) : (
          <SheetTable label="calendar slots" head={["#", "channel", "date", "state"]} rows={slots.map((sl, i) => ({ key: sl.channel, cells: [i + 1, CHANNEL_NAMES[sl.channel], sl.at === null ? "when processed" : day(sl.at), CHANNEL_ENTRY[sl.state].label] }))} />
        )}
      </SheetSection>
    </div>
  );
}
