"use client";

// THE SONG LAB'S ISLAND (spark yue2-song-lab S2, the contest winner "Knockout"): the director's band
// over the desk; the draw tabs and the bracket on the left, the match booth and the queue under it on
// the right; the field sheet over all of it when the URL says so. The server's read is the whole
// state of the work - after any press the island refreshes it - and the island holds only what is
// the operator's own: which detail is open, the answers being chosen, the press in flight.
//
// The URL carries the desk (./url.ts): a tab is a link, a match pressed in the bracket opens in the
// booth, the field sheet is `f=1`. The presses are the server's acts, handed in by the section: the
// live ones (acts.ts, book.ts) or the fixture's (fixtureActs.ts) - the same four presses either way.
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { AbAnswer, AbQuestion } from "@gt/domain/audio.yue2";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { BlindMatch, type VoteInput } from "@gt/ui/components/songlab/BlindMatch.tsx";
import { Bracket } from "@gt/ui/components/songlab/Bracket.tsx";
import { DirectorBand } from "@gt/ui/components/songlab/DirectorBand.tsx";
import { DrawTabs } from "@gt/ui/components/songlab/DrawTabs.tsx";
import { FieldSheet } from "@gt/ui/components/songlab/FieldSheet.tsx";
import { Queue } from "@gt/ui/components/songlab/Queue.tsx";
import type { ProposalView } from "@gt/ui/components/songlab/songlab.ts";

import type { ActionResult } from "../../../_server/actionCore.ts";
import type { SongLabRead, SongLabUrl } from "./_port/port.ts";
import { songLabHref } from "./url.ts";
import s from "./SongLab.module.css";

type Act<I> = (input: I) => Promise<ActionResult<unknown>>;
type Vote = { readonly pairId: string; readonly answers: Readonly<Record<AbQuestion, AbAnswer>>; readonly defect?: string };
type Decision = { readonly turnId: string; readonly proposalId: string };

/** The live desk's acts: S1's vote, WP-B's relay, and the draw's booking. */
export type LiveActs = {
  readonly kind: "live";
  readonly vote: Act<Vote>;
  readonly say: Act<{ readonly text: string }>;
  readonly keep: Act<Decision>;
  readonly drop: Act<Decision>;
  readonly draw: () => Promise<ActionResult<unknown>>;
  readonly book: Act<{ readonly drawId: string }>;
};

/** The fixture's acts: the same presses over the script. */
export type FixtureActs = {
  readonly kind: "fixture";
  readonly vote: Act<Vote>;
  readonly say: Act<{ readonly text: string; readonly listening: boolean }>;
  readonly keep: Act<Decision>;
  readonly drop: Act<Decision>;
};

export type SongLabProps = { readonly read: SongLabRead; readonly url: SongLabUrl; readonly acts: LiveActs | FixtureActs };

const DIRECTIONS = ["less chorus looping", "clearer lyrics", "darker beat", "master it like my reference", "shorter takes"];
const refusal = (r: ActionResult<unknown>): string | null => (r.ok ? null : r.error.error);

async function uploadReference(file: File): Promise<string | null> {
  const body = new FormData();
  body.set("file", file);
  try {
    const res = await fetch("/audio/songlab/reference", { method: "POST", body });
    if (res.ok) return null;
    const j: unknown = await res.json().catch(() => null);
    const said = typeof j === "object" && j !== null && "error" in j && typeof j.error === "string" ? j.error : null;
    return said ?? `the upload was refused (${res.status})`;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export function SongLab({ read, url, acts }: SongLabProps) {
  const router = useRouter();
  const [, start] = useTransition();
  const go = (patch: { readonly [K in keyof SongLabUrl]?: SongLabUrl[K] | undefined }) => {
    const next = { ...url, ...patch };
    router.push(
      songLabHref({
        source: next.source ?? url.source,
        field: next.field ?? false,
        ...(next.draw === undefined ? {} : { draw: next.draw }),
        ...(next.match === undefined ? {} : { match: next.match }),
        ...(next.away === true ? { away: true } : {}),
      }),
      { scroll: false },
    );
  };
  const refresh = () => start(() => router.refresh());
  const after = async (r: Promise<ActionResult<unknown>>): Promise<string | null> => {
    const why = refusal(await r);
    if (why === null) refresh();
    return why;
  };

  const vote = async (v: VoteInput): Promise<string | null> => {
    const why = refusal(await acts.vote(v));
    if (why !== null) return why;
    // The winner advances into a match nobody has booked yet: the live desk books it now.
    if (acts.kind === "live" && read.drawId !== undefined) {
      const booked = refusal(await acts.book({ drawId: read.drawId }));
      if (booked !== null) return `the vote is kept; the next match was not booked: ${booked}`;
    }
    if (read.match !== undefined) go({ match: read.match.matchId });
    else refresh();
    return null;
  };
  const say = (text: string) => after(acts.kind === "fixture" ? acts.say({ text, listening: read.director.presence === "listening" }) : acts.say({ text }));
  const keep = (p: ProposalView) => after(acts.keep({ turnId: p.turnId, proposalId: p.id }));
  const drop = (p: ProposalView) => after(acts.drop({ turnId: p.turnId, proposalId: p.id }));
  const scripted = read.source === "fixture";

  return (
    <div className={s.lab} data-role="sl-lab">
      <DirectorBand view={read.director} scripted={scripted} directions={DIRECTIONS} onSay={say} onKeep={keep} onDrop={drop} />
      {read.unavailable.length > 0 && (
        <div className={s.gaps}>
          {read.unavailable.map((g) => (
            <ErrorLine key={`${g.part}-${g.message}`} message={`${g.part} · ${g.message}`} />
          ))}
        </div>
      )}
      <main className={s.main}>
        <section className={s.bcol} aria-label="bracket">
          {read.bracket === undefined || read.drawId === undefined || read.head === undefined ? (
            <div className={s.empty}>
              <Empty label="no draw yet" {...(acts.kind === "live" ? { action: { label: "Draw the main field", tone: "cyan" as const, onPress: () => void after(acts.draw()) } } : {})} />
              <Chip label="field" casing="lower" href={songLabHref({ ...url, field: true })} />
            </div>
          ) : (
            <>
              <DrawTabs
                tabs={read.draws}
                current={read.drawId}
                hrefOf={(d) => songLabHref({ source: url.source, draw: d, field: false, ...(url.away === true ? { away: true } : {}) })}
                head={read.head}
                decided={read.bracket.decided}
                total={read.bracket.total}
                upsets={read.bracket.upsets}
                fieldHref={songLabHref({ ...url, field: true })}
              />
              <Bracket bracket={read.bracket} {...(read.glow === undefined ? {} : { glow: read.glow })} {...(read.selected === undefined ? {} : { selected: read.selected })} onOpen={(m) => go({ match: m })} />
            </>
          )}
        </section>
        <aside className={s.boothcol} aria-label="match">
          {read.match !== undefined || read.reveal !== undefined ? (
            <BlindMatch
              key={read.reveal?.matchId ?? read.match?.pairId}
              {...(read.reveal === undefined && read.match !== undefined ? { match: read.match } : {})}
              {...(read.reveal === undefined ? {} : { reveal: read.reveal })}
              defects={read.defects}
              onVote={vote}
              onNext={() => go({ match: undefined })}
            />
          ) : (
            <div className={s.empty}>
              {read.bracket?.champion !== undefined ? (
                <>
                  <Chip label="decided" ghost casing="lower" />
                  <span className={s.big}>{read.bracket.champion.entrant.label} takes it</span>
                </>
              ) : (
                <Empty label="no match waiting for the ear" />
              )}
            </div>
          )}
          <Queue next={read.next} jobs={read.jobs} onOpen={(n) => go({ draw: n.drawId, match: n.matchId })} />
        </aside>
      </main>
      {url.field && read.field !== undefined && (
        <FieldSheet takes={read.field.takes} references={read.field.references} onClose={() => go({ field: false })} onUpload={read.source === "fixture" ? async () => "fixture: no store to file a reference into" : async (f) => {
          const why = await uploadReference(f);
          if (why === null) refresh();
          return why;
        }} />
      )}
    </div>
  );
}
