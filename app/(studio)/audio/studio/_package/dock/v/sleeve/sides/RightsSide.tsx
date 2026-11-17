"use client";

// Side A3, AI & rights: per track a provenance stamp, printed the way a pressing plant stamps the run-out - which parts
// were generated (lyrics, music, audio, who the artist is) and the record of where the take came from (generator,
// model, plan tier, when, licence). A blank is a dashed cell; a rose cell blocks, an amber one warns. A track opens
// its card.
import { useState } from "react";

import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import type { ReleaseTrack } from "@gt/domain/release";
import { rightsWarnings } from "@gt/domain/release.problems";

import { pendingIn } from "../../../../../../_release/pending.ts";
import { problemsOnTrack } from "../../../../../../_release/wizard/steps.ts";
import { worst, type SideProps } from "../liner.ts";
import { PencilMark, Printed, ProblemDot } from "../Print.tsx";
import { RightsCard } from "./RightsCard.tsx";
import { LICENCE_LABEL, PERSONA_LABEL } from "./rights.ts";
import s from "./side.module.css";

/** A cell of the stamp: its term over its value, toned by what it costs the release. */
function Cell({ term, value, level }: { readonly term: string; readonly value: string | null; readonly level?: "block" | "warn" | "ok" }) {
  return (
    <span className={s.cell} data-level={level} data-blank={value === null ? "" : undefined}>
      <span className={s.cellTerm}>{term}</span>
      <span className={s.cellValue}>{value ?? "—"}</span>
    </span>
  );
}

/** The provenance stamp of one track. Kit candidate: `ProvenanceStamp` (cells of term/value with a level each). */
function Stamp({ t }: { readonly t: ReleaseTrack }) {
  const warns = new Set(rightsWarnings(t.rights));
  const unstated = t.ai.audio === "all" && t.ai.persona === null;
  return (
    <span className={s.stamp}>
      <span className={s.stampRow}>
        <span className={s.stampMark} aria-hidden="true">
          AI
        </span>
        <Cell term="lyrics" value={t.ai.lyrics ? "AI" : "human"} />
        <Cell term="music" value={t.ai.music ? "AI" : "human"} />
        <Cell term="audio" value={t.ai.audio} />
        {t.ai.audio === "all" && <Cell term="artist is" value={t.ai.persona === null ? "unstated" : PERSONA_LABEL[t.ai.persona]} level={unstated ? "block" : "ok"} />}
      </span>
      <span className={s.stampRow}>
        <span className={s.stampMark} aria-hidden="true">
          REC
        </span>
        <Cell term="generator" value={t.rights.vendor} {...(warns.has("rights-unknown-vendor") ? { level: "warn" as const } : {})} />
        <Cell term="model" value={t.rights.model} />
        <Cell term="tier" value={t.rights.planTier} {...(warns.has("rights-unknown-tier") ? { level: "warn" as const } : {})} />
        <Cell term="generated" value={t.rights.generatedAt} />
        <Cell term="licence" value={LICENCE_LABEL[t.rights.licence]} level={t.rights.licence === "commercial" ? "ok" : "warn"} />
      </span>
    </span>
  );
}

export function RightsSide(side: SideProps) {
  const { release: r, problems, session } = side;
  const [open, setOpen] = useState<number | null>(null);
  const notes = pendingIn(session.pending, "rights");
  if (r.tracks.length === 0) return <Chip label="no tracks" ghost />;
  return (
    <div className={s.side}>
      <ol className={s.plates} aria-label="provenance per track">
        {r.tracks.map((t, i) => {
          const pencilled = notes.filter((p) => p.path.startsWith(`track:${i + 1}.`)).length;
          return (
            <li key={t.takeId}>
              <button type="button" className={s.plate} onClick={() => setOpen(i)}>
                <span className={s.plateHead}>
                  <span className={s.no}>{i + 1}</span>
                  <Printed text={t.title.trim() === "" ? `track ${i + 1}` : t.title} />
                  <ProblemDot level={worst(problemsOnTrack(problems, "rights", i))} />
                  {pencilled > 0 && <PencilMark say={`${pencilled} pencilled`} />}
                </span>
                <Stamp t={t} />
              </button>
            </li>
          );
        })}
      </ol>
      <RightsCard index={open} onClose={() => setOpen(null)} side={side} />
    </div>
  );
}
