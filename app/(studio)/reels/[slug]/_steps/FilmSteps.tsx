"use client";

// The author and render steps. Author: the redo verdict's pins in time order (what the next turn reads), then
// its launch. Render: each face's master as it landed, or the frame the running render is on.
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";

import { FILM_FACES, FILM_SPEC, REEL_FPS, type FilmFace } from "../../../../../lib/reel/types.ts";
import type { ReelDetail } from "../../_port/types.ts";
import { JobLine } from "./JobLine.tsx";
import { Launch, type LaunchFn } from "./Launch.tsx";
import { fmtMb, fmtSeconds, isOpenJob, jobOf, pinTime, redoPins } from "./view.ts";
import s from "./Steps.module.css";

export function AuthorStep({ detail, launch }: { readonly detail: ReelDetail; readonly launch: LaunchFn }) {
  const pins = redoPins(detail);
  const film = detail.film;
  const kept = detail.verdicts.data?.verdict === "keep";
  return (
    <>
      <JobLine job={jobOf(detail.jobs, "reel-author")} />
      {film !== undefined && (
        <div className={s.row}>
          <Chip label="frames" value={film.frames} />
          <Chip label="desktop" value={fmtSeconds(film.frames / REEL_FPS)} />
          <Chip label="phone" value={fmtSeconds(film.frames / (REEL_FPS * FILM_SPEC.phone.step))} />
          {film.imported !== undefined && <Chip label="imported" value={film.imported.at.slice(0, 10)} casing="lower" />}
        </div>
      )}
      {pins.length > 0 && (
        <ol className={s.list} aria-label="redo notes">
          {pins.map((p, i) => (
            <li key={`${p.t}:${i}`} className={s.pin}>
              <span className={s.at}>{pinTime(p.t)}</span>
              {p.reasons.map((r) => (
                <Chip key={r} label={r} tone="amber" casing="lower" />
              ))}
              <span className={s.quote}>{p.text}</span>
            </li>
          ))}
        </ol>
      )}
      <Launch kind="reel-author" slug={detail.slug} label={film === undefined ? "Author" : "Author again"} launch={launch} disabled={!kept && film === undefined} />
    </>
  );
}

function FaceRender({ face, detail }: { readonly face: FilmFace; readonly detail: ReelDetail }) {
  const job = jobOf(detail.jobs, "reel-render");
  const p = job !== undefined && isOpenJob(job) && job.progress?.face === face ? job.progress : undefined;
  const r = detail.film?.renders[face];
  return (
    <div className={s.face} data-face={face}>
      <div className={s.row}>
        <Chip label={face} tone={r !== undefined ? "emerald" : p !== undefined ? "cyan" : "neutral"} dot={r !== undefined || p !== undefined} />
        {p !== undefined && <span className={s.mono}>{`${p.frame} / ${p.frames}`}</span>}
      </div>
      {p !== undefined && (
        <div className={s.meter} role="progressbar" aria-label={`${face} frames`} aria-valuemin={0} aria-valuemax={p.frames} aria-valuenow={p.frame}>
          <span style={{ width: `${p.frames > 0 ? Math.min(100, (100 * p.frame) / p.frames) : 0}%` }} />
        </div>
      )}
      {r !== undefined && (
        <Facts
          facts={[
            { term: "length", value: fmtSeconds(r.seconds) },
            { term: "frames", value: r.frames },
            { term: "size", value: fmtMb(r.bytes) },
            { term: "rendered", value: r.renderedAt.slice(0, 16).replace("T", " ") },
          ]}
        />
      )}
    </div>
  );
}

export function RenderStep({ detail, launch }: { readonly detail: ReelDetail; readonly launch: LaunchFn }) {
  return (
    <>
      <JobLine job={jobOf(detail.jobs, "reel-render")} />
      <div className={s.faces}>
        {FILM_FACES.map((f) => (
          <FaceRender key={f} face={f} detail={detail} />
        ))}
      </div>
      <Launch kind="reel-render" slug={detail.slug} label={detail.film?.renders.desktop === undefined ? "Render" : "Render again"} launch={launch} disabled={detail.film === undefined} />
    </>
  );
}
