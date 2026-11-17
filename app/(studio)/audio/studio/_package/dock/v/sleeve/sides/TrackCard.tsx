"use client";

// One track's card (side A1): its own name for itself - title, version, ISRC, explicit - fully in this direction's
// design; what was measured on it; the store's rules it breaks; its order on the record and its removal.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import type { TrackFields } from "../../../../../../_release/draft.ts";
import { pendingIn } from "../../../../../../_release/pending.ts";
import { clock, db, orNull } from "../../../../../../_release/wizard/fmt.ts";
import { problemsOnTrack } from "../../../../../../_release/wizard/steps.ts";
import type { SideProps } from "../liner.ts";
import { Margin } from "../Margin.tsx";
import { Errata } from "../Print.tsx";
import { FormCell, FormRule, PrintedCard } from "../PrintedCard.tsx";
import c from "../card.module.css";

export function TrackCard({ index, onClose, side }: { readonly index: number | null; readonly onClose: () => void; readonly side: SideProps }) {
  const { release: r, read, problems, dispatch, session } = side;
  const t = index === null ? undefined : r.tracks[index];
  const i = index ?? 0;
  const n = r.tracks.length;
  const patch = (fields: TrackFields) => dispatch({ type: "patchTrack", id: r.id, index: i, fields });
  const take = t === undefined ? undefined : read.shelf.find((x) => x.takeId === t.takeId);
  const notes = pendingIn(session.pending, "tracks").filter((p) => p.path.startsWith(`track:${i + 1}.`));
  return (
    <PrintedCard
      open={t !== undefined}
      onClose={onClose}
      title={t === undefined || t.title.trim() === "" ? `track ${i + 1}` : t.title}
      mark={`A1 · track ${i + 1} of ${n}`}
      foot={
        <span className={c.acts}>
          <Button label="Move up" size="sm" glyph="up" disabled={i === 0} onPress={() => dispatch({ type: "moveTrack", id: r.id, from: i, to: i - 1 })} />
          <Button label="Move down" size="sm" glyph="down" disabled={i >= n - 1} onPress={() => dispatch({ type: "moveTrack", id: r.id, from: i, to: i + 1 })} />
          <Button
            label="Remove"
            size="sm"
            tone="rose"
            onPress={() => {
              onClose();
              dispatch({ type: "removeTrack", id: r.id, index: i });
            }}
          />
          <Button label="Done" size="sm" tone="cyan" onPress={onClose} />
        </span>
      }
    >
      {t !== undefined && (
        <>
          <FormRule title="the track">
            <FormCell term="title" w="wide">
              <Field label={`track ${i + 1} title`} value={t.title} onChange={(v) => patch({ title: v })} />
            </FormCell>
            <FormCell term="version">
              <Field label={`track ${i + 1} version`} value={t.version ?? ""} placeholder="Radio Edit" onChange={(v) => patch({ version: orNull(v) })} />
            </FormCell>
            <FormCell term="ISRC">
              <Field label={`track ${i + 1} ISRC`} value={t.isrc ?? ""} placeholder="CC-XXX-YY-NNNNN" maxLength={15} onChange={(v) => patch({ isrc: orNull(v) })} />
            </FormCell>
            <FormCell term="explicit">
              <Toggle label={t.explicit ? "explicit" : "clean"} on={t.explicit} onToggle={(v) => patch({ explicit: v })} name={`track ${i + 1} explicit`} />
            </FormCell>
          </FormRule>
          <Margin notes={notes} session={session} side={`track ${i + 1}`} />
          <FormRule title="measured">
            <FormCell w="full">
              <span className={c.facts}>
                <Chip label="length" value={clock(t.durationS)} casing="lower" />
                {take !== undefined && take.lufs !== null && <Chip label="LUFS" value={db(take.lufs)} casing="lower" />}
                {take !== undefined && take.truePeakDb !== null && <Chip label="dBTP" value={db(take.truePeakDb)} casing="lower" />}
                {t.rights.vendor !== null && <Chip label={t.rights.vendor} casing="lower" tone="violet" />}
                {t.audioHref === null && <Chip label="no audio" ghost />}
              </span>
            </FormCell>
          </FormRule>
          <Errata problems={problemsOnTrack(problems, "tracks", i)} label={`track ${i + 1} problems`} />
        </>
      )}
    </PrintedCard>
  );
}
