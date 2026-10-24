"use client";

// ALBUM · WORDS (STEPS-DESIGN §2 "album parts"): the platform's title, description and tags,
// each counted against its limit as the platform counts it. The mv-metadata turn writes a draft
// (the header's act, priced); every edit after it is an op, and the draft's own text stays on
// the record so an edited field shows as edited. RAIL: the track the words are about.
import { useState } from "react";

import { WORDS_LIMITS, type PartView, type WordsData } from "@gt/domain/partView";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { cx } from "@gt/ui/components/cx.ts";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { clock } from "@gt/ui/components/part/part.ts";
import { Provenance } from "@gt/ui/components/provenance/Provenance.tsx";
import { FIELD_ATTR } from "@gt/ui/keymap/target";

import type { EditorProps } from "./PartEditor.tsx";
import s from "./Cut.module.css";

// The platform's counts (lib/publish/youtube.ts `snippetProblem`, API-NOTES "Video resource"): a
// title in characters, a description in UTF-8 bytes, the tags with a comma between each and
// quotes around a tag holding a space. The tags are counted as the op will land them (trimmed,
// empties dropped, repeats once - the words kind's apply), not as the draft spells them.
const tagsOf = (v: string): readonly string[] => [...new Set(v.split(",").map((t) => t.trim()).filter((t) => t !== ""))];
const BYTES = new TextEncoder();
const COUNT = {
  title: (v: string): number => [...v].length,
  description: (v: string): number => BYTES.encode(v).length,
  tags: (v: string): number => {
    const tags = tagsOf(v);
    return tags.reduce((n, t) => n + t.length + (t.includes(" ") ? 2 : 0), 0) + Math.max(0, tags.length - 1);
  },
} as const;

function Counted({ label, value, limit, count: measure, area = false, commit }: { readonly label: string; readonly value: string; readonly limit: number; readonly count: (v: string) => number; readonly area?: boolean; readonly commit: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [base, setBase] = useState(value);
  if (base !== value) {
    setBase(value);
    setV(value);
  }
  const done = (): void => {
    if (v !== value) commit(v);
  };
  const n = measure(v);
  const count = <span className={cx(s.count, n > limit && s.over)}>{`${n} / ${limit}`}</span>;
  return (
    <label className={s.field}>
      <span className={s.row}>
        <span className={s.grow}>{label}</span>
        {count}
      </span>
      {area ? (
        <textarea className={s.area} value={v} onChange={(e) => setV(e.currentTarget.value)} onBlur={done} {...{ [FIELD_ATTR]: "part-text" }} />
      ) : (
        <input className={s.input} value={v} onChange={(e) => setV(e.currentTarget.value)} onBlur={done} {...{ [FIELD_ATTR]: "part-field" }} />
      )}
    </label>
  );
}

export function WordsEditor({ frame, send, error, view }: EditorProps<PartView<"words">>) {
  const d: WordsData = view.data;
  const e = d.engine;
  // A respelling of the same list (spaces, a trailing comma) is no edit: the kind refuses an
  // unchanged list, and that refusal would stand on the error line.
  const commitTags = (v: string): void => {
    const tags = tagsOf(v);
    if (tags.join(",") !== d.tags.join(",")) send({ op: "words-tags", tags });
  };
  return (
    <PartWorkspace
      {...frame}
      mode="part.words"
      rail={{
        label: "track",
        children: (
          <div className={s.railHead}>
            {d.track === null ? (
              <Empty label="no track on this project" />
            ) : (
              <div className={s.sect}>
                <h2 className={s.h}>track</h2>
                <p className={s.work}>{d.track.title}</p>
                {d.track.durationS !== null && <span className={s.mono}>{clock(d.track.durationS)}</span>}
                {e !== undefined && <Provenance model={e.model} vendor={e.provider} cost={e.usd === null ? (e.mode === "dry" ? "dry" : "unpriced") : `$${e.usd.toFixed(2)}`} />}
                {d.edited && <Chip label="edited since the draft" tone="amber" casing="lower" />}
              </div>
            )}
          </div>
        ),
      }}
      primary={{
        label: "words",
        children: (
          <>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            <div className={s.form}>
              <Counted label="title" value={d.title} limit={WORDS_LIMITS.title} count={COUNT.title} commit={(value) => send({ op: "words-field", field: "title", value })} />
              <Counted label="description" value={d.description} limit={WORDS_LIMITS.description} count={COUNT.description} area commit={(value) => send({ op: "words-field", field: "description", value })} />
              <Counted label="tags · comma separated" value={d.tags.join(", ")} limit={WORDS_LIMITS.tags} count={COUNT.tags} commit={commitTags} />
              <div className={s.row}>
                {d.tags.map((t) => (
                  <Chip key={t} label={t} casing="lower" />
                ))}
              </div>
            </div>
          </>
        ),
      }}
      inspector={null}
    />
  );
}
