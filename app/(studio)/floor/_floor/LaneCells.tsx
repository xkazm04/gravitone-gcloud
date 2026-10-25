"use client";

// What fills one lane's three cells (prototype index.html `RunTrack`, `WeirPiles`, `Shelf`, and
// the folded lane's `FoundrySummary`, `WeirSummary`, `ShelfSummary`). The Lane component draws
// the row; this decides what each cell says from the lane's work and its shelf.

import type { ReactNode } from "react";
import type { MediaLane } from "@gt/domain/lane";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { FloorGlyph } from "@gt/ui/components/floor/FloorGlyph.tsx";
import { LaneSummary } from "@gt/ui/components/floor/Lane.tsx";
import { Pile } from "@gt/ui/components/floor/Pile.tsx";
import { RunRow } from "@gt/ui/components/floor/RunRow.tsx";
import { ShelfCell, ShelfGrid, ShelfList, ShelfRow, ShelfStyle } from "@gt/ui/components/floor/ShelfCell.tsx";
import { modeOf, type FloorLane } from "@gt/ui/components/floor/floor.ts";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { Wave } from "@gt/ui/components/wave/Wave.tsx";

import type { WeirItem } from "../../../../lib/ledger/v1/types.ts";
import { boardFor, packetIdOf } from "../../_shell/links.ts";
import type { Unapplied } from "./load.ts";
import type { LaneWork } from "./model.ts";
import type { Shelf } from "./shelf.ts";
import s from "./Floor.module.css";

/** A pile's Board: the packet id the live read stamped (`articles` decide as `article`, `sound`
 *  as `audio` - lib/ledger/v1/packet.ts), else the projection's own spelling. */
export const pileHref = (w: Pick<WeirItem, "source" | "id" | "packetId">): string => boardFor(w.packetId ?? packetIdOf(w.source, w.id));

const dur = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

/**
 * The Foundry cell: the lane's composer beside its run track (index.html `FoundryCell` =
 * `IdeaComposer + RunTrack`, floor.css 196-232px then the track). A folded lane shows only the
 * summary - no composer, as the prototype drew it.
 */
export function Foundry({ work, folded, composer }: { readonly work: LaneWork; readonly folded: boolean; readonly composer?: ReactNode }) {
  if (folded) {
    return (
      <LaneSummary>
        {work.jobs.length > 0 ? <Tally value={work.jobs.length} label="running" /> : <span className={s.idle}>idle</span>}
      </LaneSummary>
    );
  }
  const track = (
    <div className={s.track} data-component="RunTrack">
      {work.jobs.length === 0 ? (
        <span className={s.foldRow}>
          <Tally value={0} label="runs" />
        </span>
      ) : (
        work.jobs.map((j) => (
          <RunRow
            key={`${j.source}:${j.id}`}
            title={j.title}
            media={j.media}
            state={j.state}
            href={j.href}
            {...(j.progress === undefined ? {} : { progress: j.progress })}
            {...(j.attempt === undefined ? {} : { attempt: j.attempt })}
            {...(j.error === undefined ? {} : { error: j.error })}
          />
        ))
      )}
    </div>
  );
  if (composer === undefined) return track;
  return (
    <div className={s.foundryCell} data-component="FoundryCell">
      {composer}
      {track}
    </div>
  );
}

export type WeirProps = {
  readonly work: LaneWork;
  readonly folded: boolean;
  readonly next: WeirItem | null;
  readonly onOpen: (href: string) => void;
  /** This lane's decided packets whose v1 apply has not landed (./load.ts Unapplied). */
  readonly unapplied?: readonly Unapplied[];
};

/** A decided packet v1 has not taken: its state, v1's sentence verbatim, and its Board (where the redrive is). */
function Owed({ u }: { readonly u: Unapplied }) {
  return (
    <div className={s.unapplied} data-component="Unapplied" data-packet={u.packetId}>
      <Chip label={`v1 apply · ${u.apply.state}`} value={u.apply.attempts} tone={u.apply.state === "stuck" ? "rose" : "amber"} dot href={boardFor(u.packetId)} />
      <span className={s.unappliedTitle}>{u.title}</span>
      {u.apply.lastError !== undefined && <ErrorLine message={u.apply.lastError} />}
    </div>
  );
}

export function Weir({ work, folded, next, onOpen, unapplied = [] }: WeirProps) {
  const items = work.piles.reduce((n, p) => n + p.decided + p.pending, 0);
  const owed = unapplied.map((u) => <Owed key={u.packetId} u={u} />);
  if (folded) {
    return (
      <LaneSummary>
        <Tally value={work.piles.length} label="piles" />
        <Tally value={items} label="items" />
        {unapplied.some((u) => u.apply.state === "stuck") && <Chip label="v1 apply · stuck" tone="rose" dot />}
      </LaneSummary>
    );
  }
  if (work.piles.length === 0) {
    return (
      <div className={s.weirCell}>
        {owed.length === 0 ? <Chip label="clear" tone="emerald" dot /> : owed}
      </div>
    );
  }
  return (
    <div className={s.weirCell}>
      <div className={s.piles}>
        {work.piles.map((p, i) => (
          <Pile
            key={`${p.source}:${p.id}`}
            title={p.title}
            media={p.media}
            mode={modeOf(p.kind, p.media)}
            source={p.source}
            runId={p.id}
            decided={p.decided}
            pending={p.pending}
            href={pileHref(p)}
            next={next !== null && next.source === p.source && next.id === p.id}
            onOpen={onOpen}
            index={i}
          />
        ))}
      </div>
      {owed}
    </div>
  );
}

/** How much a lane's ratified column holds (0 where its read failed: the column draws the error). */
export function shelfCount(lane: MediaLane, shelf: Shelf): number {
  if (lane === "image") return shelf.styles.ok ? shelf.styles.value.proven.length : 0;
  if (lane === "article") return shelf.posts.ok ? shelf.posts.value.length : 0;
  if (lane === "audio") return shelf.takes.ok ? shelf.takes.value.total : 0;
  return shelf.projects.ok ? shelf.projects.value.total : 0;
}

export function ShelfFor({ lane, shelf, folded }: { readonly lane: FloorLane; readonly shelf: Shelf; readonly folded: boolean }) {
  const n = shelfCount(lane.id, shelf);
  if (folded) {
    return <LaneSummary><Tally value={n} label={lane.shelf.replace("Library · ", "")} /></LaneSummary>;
  }
  return <ShelfBody lane={lane} shelf={shelf} />;
}

function failed(lane: FloorLane, error: string): ReactNode {
  return (
    <ShelfCell title={lane.shelf}>
      <ErrorLine message={error} />
    </ShelfCell>
  );
}

function ShelfBody({ lane, shelf }: { readonly lane: FloorLane; readonly shelf: Shelf }) {
  if (lane.id === "image") {
    if (!shelf.styles.ok) return failed(lane, shelf.styles.error);
    const { proven, candidates } = shelf.styles.value;
    return (
      <ShelfCell title={lane.shelf} href="/library" tallies={[{ value: proven.length, label: "proven" }, { value: candidates, label: "candidates" }]}>
        {proven.length > 0 && (
          <ShelfGrid>
            {proven.map((st) => (
              <ShelfStyle key={st.id} name={st.name} {...(st.plate === undefined ? {} : { plate: st.plate })} />
            ))}
          </ShelfGrid>
        )}
      </ShelfCell>
    );
  }
  if (lane.id === "article") {
    if (!shelf.posts.ok) return failed(lane, shelf.posts.error);
    const posts = shelf.posts.value;
    return (
      <ShelfCell title={lane.shelf} tallies={[{ value: posts.length, label: "landed" }]}>
        {posts.length > 0 && (
          <ShelfList>
            {posts.map((p) => (
              <ShelfRow key={p.id} href={p.href} lead={<FloorGlyph name="article" className={s.rowMark} />} title={p.title} {...(p.pr === undefined ? {} : { trail: <Chip label="PR · ai-registry" tone="emerald" casing="lower" /> })} />
            ))}
          </ShelfList>
        )}
      </ShelfCell>
    );
  }
  if (lane.id === "audio") {
    if (!shelf.takes.ok) return failed(lane, shelf.takes.error);
    const { kept, total } = shelf.takes.value;
    return (
      <ShelfCell title={lane.shelf} href="/library" tallies={[{ value: total, label: "kept" }]}>
        {kept.length > 0 && (
          <ShelfList>
            {kept.map((t) => (
              <ShelfRow
                key={t.id}
                lead={<Wave peaks={t.peaks} width={74} height={20} tone={t.kind === "music" ? "violet" : "cyan"} />}
                title={t.title}
                {...(t.durationS === undefined ? {} : { fact: dur(t.durationS) })}
                trail={<Chip label={t.kind} casing="lower" />}
              />
            ))}
          </ShelfList>
        )}
      </ShelfCell>
    );
  }
  if (!shelf.projects.ok) return failed(lane, shelf.projects.error);
  const { rows, total } = shelf.projects.value;
  return (
    <ShelfCell title={lane.shelf} href="/projects" tallies={[{ value: total, label: "projects" }]} extra={<Chip label="runs ›" tone="cyan" href="/projects/runs" />}>
      {rows.length > 0 && (
        <ShelfList>
          {rows.map((p) => (
            <ShelfRow key={p.id} href={p.href} lead={<FloorGlyph name="video" className={s.rowMark} />} title={p.title} trail={<Chip label={p.recipe} casing="lower" />} />
          ))}
        </ShelfList>
      )}
    </ShelfCell>
  );
}
