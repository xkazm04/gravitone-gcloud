"use client";

// AI credits and provenance, per track: DistroKid's AI Credits step (lyrics, music, how much of the
// audio, and - when all of it - who the artist is) beside the rights record written when the take
// was kept. Rights warnings are loud and never block.
import { AI_AUDIO, LICENCES, type AiAudio, type AiCredits, type Licence, type RightsRecord } from "@gt/domain/release";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { Field, Select } from "@gt/ui/components/field/Field.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import { orNull, sectionOf, trackNo, type SectionProps } from "./board.ts";
import { Cell, ProblemLine } from "./Sheet.tsx";
import s from "./sheet.module.css";

type Persona = "human" | "ai" | "unset";
const AUDIO_OPTS = AI_AUDIO.map((a) => ({ value: a, label: a }));
const PERSONA_OPTS: readonly { readonly value: Persona; readonly label: string }[] = [
  { value: "human", label: "human" },
  { value: "ai", label: "AI persona" },
];
const LICENCE_OPTS = LICENCES.map((l) => ({ value: l, label: l === "cc-by-nc" ? "CC BY-NC" : l }));

export function Rights({ release: r, problems, dispatch, jump }: SectionProps) {
  const here = problems.filter((p) => sectionOf(p) === "rights");
  if (r.tracks.length === 0) return null;
  return (
    <ol className={s.rights}>
      {r.tracks.map((t, i) => {
        const n = i + 1;
        const ai = (fields: Partial<AiCredits>) => dispatch({ type: "patchTrack", id: r.id, index: i, fields: { ai: { ...t.ai, ...fields } } });
        const rights = (fields: Partial<RightsRecord>) => dispatch({ type: "patchTrack", id: r.id, index: i, fields: { rights: { ...t.rights, ...fields } } });
        const mine = here.filter((p) => trackNo(p) === n);
        return (
          <li key={t.takeId} className={s.rightsRow} data-jump={`rights:${n}`} data-sev={mine.some((p) => p.severity === "block") ? "block" : mine.length > 0 ? "warn" : undefined}>
            <div className={s.rightsHead}>
              <span className={s.trackNo} aria-hidden="true">
                {String(n).padStart(2, "0")}
              </span>
              <span className={s.rightsTitle}>{t.title}</span>
            </div>
            <div className={s.aiGrid} role="group" aria-label={`track ${n} AI credits`}>
              <Toggle label="AI lyrics" name={`track ${n} AI lyrics`} on={t.ai.lyrics} onToggle={(v) => ai({ lyrics: v })} />
              <Toggle label="AI music" name={`track ${n} AI music`} on={t.ai.music} onToggle={(v) => ai({ music: v })} />
              <span className={s.cellLabel} aria-hidden="true">
                audio
              </span>
              <Seg<AiAudio> label={`track ${n} AI audio`} options={AUDIO_OPTS} value={t.ai.audio} onChange={(v) => ai({ audio: v, persona: v === "all" ? t.ai.persona : null })} />
              {t.ai.audio === "all" && (
                <span className={s.cellLabel} aria-hidden="true">
                  artist
                </span>
              )}
              {t.ai.audio === "all" && <Seg<Persona> label={`track ${n} persona`} options={PERSONA_OPTS} value={t.ai.persona ?? "unset"} onChange={(v) => ai({ persona: v === "unset" ? null : v })} />}
            </div>
            <div className={s.rightsGrid}>
              <Cell label="generator">
                <Field label={`track ${n} generator`} value={t.rights.vendor ?? ""} onChange={(v) => rights({ vendor: orNull(v) })} />
              </Cell>
              <Cell label="plan tier">
                <Field label={`track ${n} plan tier`} value={t.rights.planTier ?? ""} onChange={(v) => rights({ planTier: orNull(v) })} />
              </Cell>
              <Cell label="licence">
                <Select<Licence> label={`track ${n} licence`} options={LICENCE_OPTS} value={t.rights.licence} onChange={(v) => rights({ licence: v })} />
              </Cell>
              <div className={s.rightsFacts}>
                <Facts
                  facts={[
                    { term: "model", value: t.rights.model ?? "—" },
                    { term: "generated", value: t.rights.generatedAt ?? "—" },
                    { term: "brief", value: t.rights.briefDigest ?? "—" },
                    { term: "reference", value: t.rights.reference ?? "—" },
                  ]}
                />
              </div>
            </div>
            {mine.length > 0 && (
              <div className={s.lines}>
                {mine.map((p) => (
                  <ProblemLine key={p.code} problem={p} onJump={p.code === "persona-unstated" ? () => jump(p) : undefined} />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
