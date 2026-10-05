"use client";

// /articles — every article run on this machine, newest first: its state, its
// topic, what it has cost and when it started. A row opens the run.

import Link from "next/link";
import { FileWarning, Plus, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/Primitives";
import { Ghost, Tally } from "@/components/ui/signal";
import { SURFACE } from "@/components/ui/tokens";
import { relTime } from "@/app/_projects/parts";

import { PhaseChip } from "./parts";
import { costOf, fmtUsd, phaseOf, topicLine } from "./runModel";
import { useArticleRuns, START_GRACE_MS } from "./useArticles";

const NEW_HREF = "/articles/new";

function NewLink() {
  return (
    <Link
      href={NEW_HREF}
      data-testid="articles-new"
      className="gt-glow inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-cyan-200 px-5 py-2.5 text-label font-semibold text-slate-950 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Plus aria-hidden className="h-4 w-4" />
      New article
    </Link>
  );
}

export default function ArticlesView() {
  const { state, reload } = useArticleRuns();
  const load = state?.load ?? null;
  const at = state?.at ?? 0;

  const runs = load?.ok ? load.data.runs : null;
  const driving = new Set(load?.ok ? load.data.driving : []);
  const live = (id: string, updatedAt: string) => driving.has(id) || at - Date.parse(updatedAt) < START_GRACE_MS;
  const phases = runs?.map((r) => ({ r, phase: phaseOf(r, live(r.id, r.updatedAt)) })) ?? null;
  const atGate = phases?.filter((p) => p.phase === "gate").length ?? 0;
  const working = phases?.filter((p) => p.phase === "running" || p.phase === "landing").length ?? 0;

  return (
    <main tabIndex={-1} className="space-y-5 pt-1 pb-28" data-testid="articles-list">
      <h1 className="sr-only">Articles</h1>
      <div className="flex flex-wrap items-center gap-3">
        {phases && phases.length > 0 && (
          <>
            <Tally value={atGate} label="at the gate" tone={atGate ? "amber" : "neutral"} />
            <Tally value={working} label="running" tone={working ? "cyan" : "neutral"} />
            <Tally value={phases.length} label="runs" />
          </>
        )}
        <span className="ml-auto">
          <NewLink />
        </span>
      </div>

      {load === null ? (
        <div className="space-y-2" aria-busy="true" data-testid="articles-loading">
          <span className="sr-only">loading runs</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${SURFACE} h-16 animate-pulse rounded-2xl`} />
          ))}
        </div>
      ) : !load.ok ? (
        <div role="alert" className={`${SURFACE} flex flex-wrap items-center gap-3 rounded-2xl border-rose-400/30 p-5`} data-testid="articles-error">
          <FileWarning aria-hidden className="h-5 w-5 text-rose-300" />
          <p className="font-jetbrains min-w-0 flex-1 text-label break-words text-rose-100">{load.error}</p>
          <Button variant="ghost" size="sm" onClick={reload}>
            <RotateCw aria-hidden className="mr-1.5 inline h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      ) : phases && phases.length === 0 ? (
        <Ghost shape="row" count={3} label="no articles yet" action={<NewLink />} className="pt-4" />
      ) : (
        <ul className="space-y-2" data-testid="articles-rows">
          {phases!.map(({ r, phase }) => {
            const topic = topicLine(r);
            const cost = costOf(r);
            const started = Date.parse(r.createdAt);
            return (
              <li key={r.id}>
                <Link
                  href={`/articles/${encodeURIComponent(r.id)}`}
                  data-testid={`articles-row-${r.id}`}
                  className={`${SURFACE} grid grid-cols-[15rem_1fr_auto_auto] items-center gap-4 rounded-2xl px-5 py-3.5 transition hover:border-white/20`}
                >
                  <PhaseChip phase={phase} />
                  <span className="min-w-0">
                    <span className="block truncate text-content text-white/90">{topic.text}</span>
                    <span className="font-jetbrains block truncate text-label text-white/45">
                      {[topic.address, r.topic.angle].filter(Boolean).join(" · ") || r.id}
                    </span>
                  </span>
                  <span className="font-jetbrains text-right text-label text-white/70">
                    {cost.usd === null ? <span className="text-white/40">unpriced</span> : fmtUsd(cost.usd)}
                  </span>
                  <time dateTime={r.createdAt} title={r.createdAt} className="font-jetbrains w-24 text-right text-label text-white/50">
                    {Number.isFinite(started) && at ? relTime(started, at) : r.createdAt.slice(0, 10)}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {load?.ok && load.data.damaged.length > 0 && (
        <p role="status" className="font-jetbrains text-label text-rose-200/85" data-testid="articles-damaged">
          unreadable run.json: {load.data.damaged.join(", ")}
        </p>
      )}
    </main>
  );
}
