// /local-draws — frames and clips from GRAVITONE_LOCAL_DRAWS, read at request time.
import { connection } from "next/server";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { listRuns, type DrawCard, type DrawRun } from "../../../lib/foundry/local-draws/read.ts";
import { boardFor } from "../_shell/links.ts";
import s from "./Draws.module.css";

export const metadata = { title: "Draws" };

function src(run: string, rel: string): string {
  return `/api/local-draws/file?run=${encodeURIComponent(run)}&path=${encodeURIComponent(rel)}`;
}

const VERDICT = {
  landed: s["v-landed"],
  short: s["v-short"],
  over: s["v-over"],
  "gen-failed": s["v-gen-failed"],
  blocked: s["v-blocked"],
  "eye-refused": s["v-eye-refused"],
} as const;

function Card({ run, card }: { readonly run: string; readonly card: DrawCard }) {
  const tone = VERDICT[card.verdict as keyof typeof VERDICT] ?? "";
  return (
    <article className={s.card}>
      {card.frame ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local draw served by its own route; nothing for next/image to optimise
        <img className={s.shot} src={src(run, card.frame)} alt={`${card.title}, ${card.via}, ${card.verdict}`} />
      ) : (
        <p className={s.missing}>{card.notes || card.verdict}</p>
      )}
      <h2>{card.title}</h2>
      <p className={s.meta}>
        {card.via} <span className={`${s.verdict} ${tone}`}>{card.verdict}</span>
      </p>
      {(card.follow || card.anatomy) && (
        <p className={s.meta}>{[card.follow && `follow ${card.follow}`, card.anatomy && `anatomy ${card.anatomy}`].filter(Boolean).join(" · ")}</p>
      )}
      {card.notes && card.frame ? <p className={s.notes}>{card.notes}</p> : null}
      {card.clip ? <video src={src(run, card.clip)} poster={card.frame ? src(run, card.frame) : undefined} controls preload="none" /> : null}
      {card.prompt ? (
        <details>
          <summary>prompt</summary>
          <pre className={s.prompt}>{card.prompt}</pre>
        </details>
      ) : null}
    </article>
  );
}

function Run({ run }: { readonly run: DrawRun }) {
  return (
    <section className={s.run}>
      <header className={s.head}>
        <h1>{run.id}</h1>
        {run.engine ? <p>{run.engine}</p> : null}
        {run.at ? <p>{run.at}</p> : null}
        {run.packet ? <a className={s.packet} href={boardFor(`pkt:scout:${run.packet}`)}>{`pkt:scout:${run.packet}`}</a> : null}
      </header>
      <div className={s.grid}>
        {run.cards.map((card) => (
          <Card key={card.key} run={run.id} card={card} />
        ))}
      </div>
    </section>
  );
}

export default async function LocalDraws() {
  await connection();
  const listed = await listRuns();
  if (listed.kind === "unset") return <ErrorLine message="GRAVITONE_LOCAL_DRAWS is unset" />;
  if (listed.kind === "missing") return <ErrorLine message="GRAVITONE_LOCAL_DRAWS does not exist" />;
  if (listed.runs.length === 0) return <ErrorLine message="no draws on disk" />;
  return (
    <div className={s.page}>
      {listed.runs.map((run) => (
        <Run key={run.id} run={run} />
      ))}
    </div>
  );
}
