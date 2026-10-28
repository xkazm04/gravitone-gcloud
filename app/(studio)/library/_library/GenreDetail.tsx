"use client";

// A GENRE ITEM'S OWN BLOCKS in the detail (spark scout-vision S2): where it stands on the ladder (perfecting ->
// piece due -> publishable) as pips and the rungs' own words, its kept trials against the four a piece needs, its
// use, look and grammar (the beats, in order), its piece - played when the operator kept it - the venture it now
// produces for, and the kept storyboard and proposal it was born from, each a door to its night's packet.
// A retired genre keeps all of it, under a ghost `retired` chip: its past stays readable.

import { GENRE_RUNGS, nightOfRef, ventureItemId, type GenreExtras } from "@gt/domain/library";
import { PIECE_TRIALS } from "@gt/domain/genre";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { DetailPreview, DetailSection } from "@gt/ui/components/library/DetailPanel.tsx";
import { PipRow } from "@gt/ui/components/piprow/PipRow.tsx";
import type { Look } from "@gt/ui/components/status/status.ts";

import { boardFor } from "../../_shell/links.ts";
import s from "./library.module.css";

/** A `<night>/<c-id>` ref's door: its scout night's packet on the Board. */
export const packetOfRef = (ref: string): string => boardFor(`pkt:scout:${nightOfRef(ref)}`);

const rungWord = (r: string): string => r.replace(/-/g, " ");

/** The ladder as pips: every rung reached is done, the rest bare; a retired genre draws none lit. */
export function ladderLooks(state: GenreExtras["state"]): Look[] {
  const at = GENRE_RUNGS.indexOf(state as (typeof GENRE_RUNGS)[number]);
  return GENRE_RUNGS.map((_, i) => (at >= 0 && i <= at ? "done" : "idle"));
}

export function Retired({ at }: { readonly at: string | undefined }) {
  return at === undefined ? null : (
    <div className={s.ev}>
      <Chip label="retired" value={at.slice(0, 10)} ghost casing="lower" />
    </div>
  );
}

export function Ref({ label, refId }: { readonly label: string; readonly refId: string }) {
  return <Chip label={label} value={refId} casing="lower" href={packetOfRef(refId)} name={`${label} ${refId}, its night's packet`} />;
}

export function GenreFacts({ genre: g, onItem }: { readonly genre: GenreExtras; readonly onItem: (id: string) => void }) {
  const rung = GENRE_RUNGS.indexOf(g.state as (typeof GENRE_RUNGS)[number]);
  const kept = g.keptTrials.length;
  const p = g.piece;
  return (
    <>
      <DetailSection title="Ladder">
        <Retired at={g.retiredAt} />
        <div className={s.ev}>
          <PipRow looks={ladderLooks(g.state)} label={rung < 0 ? "retired, off the ladder" : `${rungWord(g.state)}, rung ${rung + 1} of ${GENRE_RUNGS.length}`} />
          {GENRE_RUNGS.map((r, i) => (
            <Chip key={r} label={rungWord(r)} casing="lower" tone={i === rung ? "cyan" : i < rung ? "emerald" : "neutral"} dot={i === rung} ghost={rung < 0 || i > rung} />
          ))}
        </div>
      </DetailSection>
      <DetailSection title="Trials" tally={{ value: kept, of: PIECE_TRIALS, label: "kept" }}>
        <div className={s.ev}>
          <PipRow looks={g.keptTrials.slice(0, PIECE_TRIALS).map((): Look => "done")} max={PIECE_TRIALS} label={`${kept} of ${PIECE_TRIALS} trials kept`} />
          {g.keptTrials.map((t) => (
            <Chip key={t} label={t} casing="lower" href={packetOfRef(t)} name={`kept trial ${t}, its night's packet`} />
          ))}
        </div>
      </DetailSection>
      <DetailSection title="Use">
        <p className={s.recipe}>{g.use}</p>
      </DetailSection>
      <DetailSection title="Look">
        <p className={s.recipe}>{g.look}</p>
      </DetailSection>
      {g.grammar.length > 0 && (
        <DetailSection title="Grammar" tally={{ value: g.grammar.length, label: "beats" }}>
          <ol className={s.limits}>
            {g.grammar.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ol>
        </DetailSection>
      )}
      {p !== undefined && (
        <DetailSection title="Piece">
          {p.verdict === "kept" && p.video !== undefined && <DetailPreview face={{ kind: "designed", lead: "piece", name: p.ref, tail: "" }} title={`piece ${p.ref}`} video={{ src: p.video, loop: false }} />}
          <div className={s.ev}>
            <Chip label={p.verdict} tone={p.verdict === "kept" ? "emerald" : p.verdict === "rejected" ? "rose" : "amber"} casing="lower" />
            <Ref label="piece" refId={p.ref} />
          </div>
        </DetailSection>
      )}
      {g.venture !== undefined && (
        <DetailSection title="Venture">
          <div className={s.ev}>
            <Chip label={g.venture.name} tone="cyan" casing="lower" onPress={() => onItem(ventureItemId(g.venture?.id ?? ""))} name={`venture ${g.venture.name}`} />
          </div>
        </DetailSection>
      )}
      <DetailSection title="Born from">
        <div className={s.ev}>
          <Ref label="storyboard" refId={g.bornFrom.ref} />
          <Ref label="proposal" refId={g.proposal} />
        </div>
      </DetailSection>
    </>
  );
}
