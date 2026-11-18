// /reels/<slug> - one reel (spark reel-studio WP3): its question and figures at the head, the review (the two
// faces on one clock, the strip, the open stop's verdict, the verdicts given) and, in a column of their own, the
// steps that move the reel on (./_steps, WP4). The context column's walk lights the reel's stage. Before a film
// exists the review's place holds the reel's question and, while a render runs, how far it got.
//
// A Server Component: the reel is read here through ../_port, and the one act the review performs - a film or
// release verdict - is WP4's Server Action, handed down as a prop.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Filmstrip } from "@gt/ui/components/filmstrip/Filmstrip.tsx";
import { RoomLight, type RoomKind } from "@gt/ui/components/roomlight/RoomLight.tsx";

import type { FilmStage } from "@/lib/reel/film";

import { ContextColumn } from "../../_shell/ContextColumn.tsx";
import { decideAction } from "../_actions/decide.ts";
import { lengths, sizes } from "../_overview/facts.ts";
import { RenderReach, StageChip, VerdictChip } from "../_overview/Marks.tsx";
import { reelsRooms } from "../_overview/rooms.ts";
import o from "../_overview/overview.module.css";
import { serverReels } from "../_port/port.ts";
import type { ReelDetail } from "../_port/types.ts";
import { Review } from "../_review/Review.tsx";
import r from "../_review/review.module.css";
import { Steps } from "./_steps/Steps.tsx";

export const metadata: Metadata = { title: "Gravitone · Reel" };

const LIGHT: Readonly<Record<FilmStage, RoomKind>> = { idea: "neutral", data: "agent", authoring: "agent", rendering: "clear", review: "warn", redo: "block", sound: "warn", release: "warn", released: "ready", dropped: "neutral" };

export default async function ReelPage({ params }: { readonly params: Promise<{ readonly slug: string }> }) {
  await connection();
  const { slug } = await params;
  let detail: ReelDetail | undefined;
  let failure: string | undefined;
  try {
    detail = await serverReels().reel(decodeURIComponent(slug));
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  if (failure !== undefined) {
    return (
      <div className={o.desk}>
        <ContextColumn rooms={reelsRooms("all")} />
        <div className={o.work}>
          <ErrorLine message={`reel ${slug}: ${failure}`} live />
        </div>
      </div>
    );
  }
  if (detail === undefined) notFound();
  const d = detail;
  const hasFilm = d.media.desktop !== undefined || d.media.phone !== undefined || d.media.releaseDesktop !== undefined;
  return (
    <div className={o.desk}>
      <ContextColumn rooms={reelsRooms({ slug: d.slug, title: d.title, stage: d.stage })} />
      <div className={o.work}>
        <div className={r.page} data-stage={d.stage}>
          <RoomLight kind={LIGHT[d.stage]} sleeve={d.poster ?? null} />
          <Head d={d} />
          <div className={r.layout}>
            <section id="review" className={r.main} aria-label="review">
              {hasFilm ? <Review detail={d} actions={{ decide: decideAction }} /> : <BeforeFilm d={d} />}
            </section>
            <aside id="steps" className={r.steps} aria-label="steps">
              <Steps detail={d} />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function Head({ d }: { readonly d: ReelDetail }) {
  const len = lengths(d);
  const size = sizes(d);
  const vmaf = d.film?.copies.desktop?.vmaf;
  const bed = d.film?.bed;
  const figures: readonly (readonly [string, string])[] = [
    ...(len === undefined ? [] : [["length", len] as const]),
    ...(size === undefined ? [] : [["size", size] as const]),
    ...(vmaf === undefined ? [] : [["vmaf", `${vmaf.mean.toFixed(1)} · min ${vmaf.min.toFixed(1)}`] as const]),
    ...(bed === undefined ? [] : [["bed", `${Math.round(bed.seconds)} s${bed.lufs === undefined ? "" : ` · ${bed.lufs.toFixed(1)} LUFS`}`] as const]),
    ...(d.table === undefined ? [] : [["table", `${d.table.periods} ${d.table.granularity}s · ${d.table.entities}`] as const]),
  ];
  return (
    <header className={r.head}>
      <div className={r.headTop}>
        <h1 className={r.title}>{d.title}</h1>
        <StageChip stage={d.stage} />
        <VerdictChip last={d.last} />
        {d.film?.imported !== undefined && <span className={r.imported}>imported</span>}
      </div>
      <p className={r.hook}>{d.hook}</p>
      {figures.length > 0 && (
        <dl className={r.figures}>
          {figures.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

/** Before a film: the reel's path to its answer, set large, the empty strip it will fill, a render's reach. */
function BeforeFilm({ d }: { readonly d: ReelDetail }) {
  const p = d.progress;
  return (
    <div className={r.before}>
      <div className={r.stage}>
        <p className={r.path}>{d.idea.path}</p>
        {p !== undefined && <RenderReach progress={p} />}
        {d.table !== undefined && (
          <p className={r.source}>
            {d.table.source.name} · {d.table.source.licence}
            {d.table.continuity.failures.map((f) => (
              <span key={f} className={r.fail}>
                {f}
              </span>
            ))}
          </p>
        )}
      </div>
      <Filmstrip frames={[]} label={`${d.title}, no frames yet`} size="rail" />
    </div>
  );
}
