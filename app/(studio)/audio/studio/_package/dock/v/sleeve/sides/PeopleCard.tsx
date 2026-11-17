"use client";

// The people on one track (side A2): songwriters by legal name, credits by role, the lyric sheet - fully in this
// direction's design. Each list is the track's own field, patched whole (the wizard's `patchTrack`).
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { CREDIT_ROLES, type CreditRole } from "@gt/domain/release";

import type { TrackFields } from "../../../../../../_release/draft.ts";
import { pendingIn } from "../../../../../../_release/pending.ts";
import { orNull } from "../../../../../../_release/wizard/fmt.ts";
import { problemsOnTrack } from "../../../../../../_release/wizard/steps.ts";
import type { SideProps } from "../liner.ts";
import { Margin } from "../Margin.tsx";
import { Errata } from "../Print.tsx";
import { FormCell, FormRule, PrintedCard } from "../PrintedCard.tsx";
import c from "../card.module.css";

const ROLE_OPTIONS = CREDIT_ROLES.map((r) => ({ value: r, label: r }));

function Remove({ what, onPress }: { readonly what: string; readonly onPress: () => void }) {
  return (
    <button type="button" className={c.remove} aria-label={`remove ${what}`} onClick={onPress}>
      <span aria-hidden="true">×</span>
    </button>
  );
}

export function PeopleCard({ index, onClose, side }: { readonly index: number | null; readonly onClose: () => void; readonly side: SideProps }) {
  const { release: r, problems, dispatch, session } = side;
  const t = index === null ? undefined : r.tracks[index];
  const i = index ?? 0;
  const patch = (fields: TrackFields) => dispatch({ type: "patchTrack", id: r.id, index: i, fields });
  const writers = t?.songwriters ?? [];
  const credits = t?.credits ?? [];
  const setCredit = (k: number, f: Partial<{ name: string; role: CreditRole }>) => patch({ credits: credits.map((x, j) => (j === k ? { ...x, ...f } : x)) });
  const notes = pendingIn(session.pending, "details").filter((p) => p.path.startsWith(`track:${i + 1}.`));
  return (
    <PrintedCard open={t !== undefined} onClose={onClose} title={t === undefined || t.title.trim() === "" ? `track ${i + 1}` : t.title} mark={`A2 · people on track ${i + 1}`} wide foot={<Button label="Done" size="sm" tone="cyan" onPress={onClose} />}>
      {t !== undefined && (
        <>
          <FormRule title="written by" aside={<Tally value={writers.filter((w) => w.trim() !== "").length} />}>
            <FormCell w="full">
              <ul className={c.list}>
                {writers.map((w, k) => (
                  <li key={k} className={c.row}>
                    <Field label={`songwriter ${k + 1}`} value={w} placeholder="Jane Doe" onChange={(v) => patch({ songwriters: writers.map((x, j) => (j === k ? v : x)) })} />
                    <Remove what={`songwriter ${w.trim() === "" ? k + 1 : w}`} onPress={() => patch({ songwriters: writers.filter((_, j) => j !== k) })} />
                  </li>
                ))}
              </ul>
              <span className={c.acts}>
                <Button label="Add songwriter" size="sm" onPress={() => patch({ songwriters: [...writers, ""] })} />
              </span>
            </FormCell>
          </FormRule>
          <FormRule title="credits" aside={<Tally value={credits.length} />}>
            <FormCell w="full">
              <ul className={c.list}>
                {credits.map((x, k) => (
                  <li key={k} className={c.row}>
                    <Field label={`credit ${k + 1} name`} value={x.name} onChange={(v) => setCredit(k, { name: v })} />
                    <Select label={`credit ${k + 1} role`} options={ROLE_OPTIONS} value={x.role} onChange={(v) => setCredit(k, { role: v })} />
                    <Remove what={`credit ${x.name.trim() === "" ? k + 1 : x.name}`} onPress={() => patch({ credits: credits.filter((_, j) => j !== k) })} />
                  </li>
                ))}
              </ul>
              <span className={c.acts}>
                <Button label="Add credit" size="sm" onPress={() => patch({ credits: [...credits, { name: "", role: "performer" }] })} />
              </span>
            </FormCell>
          </FormRule>
          <FormRule title="lyrics">
            <FormCell w="full">
              <TextArea label={`track ${i + 1} lyrics`} value={t.lyrics ?? ""} rows={8} onChange={(v) => patch({ lyrics: orNull(v) })} />
            </FormCell>
          </FormRule>
          <Margin notes={notes} session={session} side={`track ${i + 1} people`} />
          <Errata problems={problemsOnTrack(problems, "details", i)} label={`track ${i + 1} problems`} />
        </>
      )}
    </PrintedCard>
  );
}
