"use client";

// THE SHEET'S MIDDLE PAGES (variant "sheet"): AI & rights - the track being read, its AI credits beside its rights
// record - and Sleeve - the picture as it is, its measured facts, and the prompt it is generated from.
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";

import type { PageProps } from "./PagesRelease.tsx";
import { SheetLines, SheetSection, TrackTabs, Value } from "./Sheet.tsx";
import { aiLyrics, aiMusic, aiPersona, LICENCE_LABEL, RECORD_FIELDS, SOURCE_LABEL } from "./words.ts";
import s from "./sheet.module.css";

export function RightsPage({ props, onEdit }: PageProps) {
  const { release: r, track, setTrack } = props;
  const t = r.tracks[track];
  if (t === undefined) return <SheetLines lines={[{ k: "tracks", v: null }]} />;
  return (
    <div className={s.page}>
      <TrackTabs titles={r.tracks.map((x) => x.title)} current={track} onPick={setTrack} />
      <div className={s.cols}>
        <SheetSection id="ai" title="AI credits" onEdit={() => onEdit("ai")}>
          <SheetLines
            cols={2}
            lines={[
              { k: "lyrics", v: aiLyrics(t.ai) },
              { k: "music", v: aiMusic(t.ai) },
              { k: "audio", v: t.ai.audio },
              ...(t.ai.audio === "all" ? [{ k: "artist is", v: aiPersona(t.ai) }] : []),
            ]}
          />
        </SheetSection>
        <SheetSection id="record" title="Rights record" onEdit={() => onEdit("record")}>
          <SheetLines cols={2} lines={[...RECORD_FIELDS.map((f) => ({ k: f.label, v: t.rights[f.key], code: f.code === true })), { k: "licence", v: LICENCE_LABEL[t.rights.licence] }]} />
        </SheetSection>
      </div>
    </div>
  );
}

export function SleevePage({ props, onEdit }: PageProps) {
  const { release: r } = props;
  const sl = r.sleeve;
  return (
    <div className={s.page}>
      <div className={s.cols} data-lead="art">
        {sl !== null && sl.href !== null ? (
          <Plate src={sl.href} alt={`sleeve of ${r.title}`} className={s.art} width={280} aspect={sl.widthPx > 0 && sl.heightPx > 0 ? sl.widthPx / sl.heightPx : 1} />
        ) : (
          <PlateMissing label="no sleeve" className={s.art} aspect={1} />
        )}
        <SheetSection id="sleeve" title="Sleeve" onEdit={() => onEdit("sleeve")}>
          <SheetLines
            cols={2}
            lines={[
              { k: "size", v: sl === null ? null : `${sl.widthPx} × ${sl.heightPx} px`, code: true },
              { k: "shape", v: sl === null ? null : sl.widthPx === sl.heightPx ? "square" : "not square" },
              { k: "colour", v: sl === null ? null : sl.rgb ? "RGB" : "not RGB" },
              { k: "source", v: sl === null ? null : SOURCE_LABEL[sl.source] },
            ]}
          />
        </SheetSection>
      </div>
      <SheetSection id="prompt" title="Prompt" onEdit={() => onEdit("prompt")}>
        <p className={s.prose}>
          <Value v={r.sleevePrompt} />
        </p>
      </SheetSection>
    </div>
  );
}
