"use client";

// The follow-up queue — what sits below the triage board.
//
// Two ways in, and they are the same queue on purpose: a card marked `deepen` and
// a typed question both mean "the research is not finished here". Keeping them in
// one list is what makes the next run a single dispatch rather than a scatter.

import { useState } from "react";

import { Button } from "@/components/ui/Primitives";
import { useJobs } from "@/lib/jobs";
import { CANNED, matchQuestion, suggestedReason, type FollowUpRequest } from "../followup";
import { stateOf } from "../scope";
import type { ScopeApi } from "../useScope";
import FollowUpResult, { VERDICT_TONE } from "./FollowUpResult";

export default function FollowUpQueue({ api, projectId }: { api: ScopeApi; projectId: string }) {
  const jobs = useJobs();
  // One follow-up per project at a time. A follow-up REVISES the notebook it was
  // launched from; two in flight would race to rewrite the same document, and
  // the second would be reasoning about a notebook already made stale by the
  // first. Research runs have no such coupling, so those stay parallel.
  const busy = jobs.followupBusy(projectId);
  const [asked, setAsked] = useState<FollowUpRequest[]>([]);
  const [q, setQ] = useState("");
  const [running, setRunning] = useState(false);

  // Cards the creator marked `deepen`, with the reason the system can infer.
  const deepened: FollowUpRequest[] = api.cards
    .filter((c) => stateOf(api.scope, c.id).deepen)
    .map((c) => {
      const existing = asked.find((a) => a.cardId === c.id);
      return (
        existing ?? {
          id: `deepen-${c.id}`,
          kind: "deepen-card" as const,
          cardId: c.id,
          prompt: c.title,
          systemReason: suggestedReason(c),
          status: "queued" as const,
        }
      );
    });

  const all = [...deepened, ...asked.filter((a) => a.kind === "question")];
  const pending = all.filter((r) => r.status === "queued");

  const ask = () => {
    const text = q.trim();
    if (!text) return;
    setAsked((a) => [...a, { id: `q-${a.length}`, kind: "question", prompt: text, status: "queued" }]);
    setQ("");
  };

  /** Mocked dispatch. Resolves anything we have a real canned answer for and is
   *  honest about the rest — an unanswered request stays queued rather than
   *  inventing a result. */
  const runFollowUp = () => {
    const j = jobs.start("followup", projectId, `${pending.length} follow-up${pending.length === 1 ? "" : "s"}`);
    if (!j) return; // refused — one already in flight
    setRunning(true);
    setTimeout(() => {
      setAsked((prev) => {
        const next = [...prev];
        for (const r of deepened) {
          const canned = r.cardId ? CANNED[r.cardId] : undefined;
          if (canned && !next.some((n) => n.id === r.id)) next.push({ ...r, status: "returned", result: canned });
        }
        return next.map((r) => {
          if (r.status !== "queued") return r;
          const key = r.kind === "question" ? matchQuestion(r.prompt) : r.cardId ?? null;
          const canned = key ? CANNED[key] : undefined;
          return canned ? { ...r, status: "returned" as const, result: canned } : r;
        });
      });
      setRunning(false);
    }, 700);
  };

  const returned = all.filter(
    (r) => r.status === "returned" || asked.find((a) => a.id === r.id)?.status === "returned",
  );

  return (
    <section data-testid="followup" className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-jetbrains text-[11px] tracking-[0.16em] text-white/55 uppercase">
            follow-up research
          </p>
          <p className="font-hanken mt-1.5 max-w-2xl text-sm text-slate-400">
            Cards you marked <span className="text-cyan-200/80">deepen</span>, plus anything you want
            to ask. This routes to the <em>next</em> run — it does not change the script you are about
            to write.
          </p>
        </div>
        {pending.length > 0 && (
          <div className="flex flex-col items-end gap-1.5">
            <Button data-testid="run-followup" onClick={runFollowUp} disabled={running || busy} className="shrink-0">
              {running || busy ? "Researching…" : `Run ${pending.length} follow-up${pending.length === 1 ? "" : "s"}`}
            </Button>
            {busy && !running && (
              <p data-testid="followup-busy" className="font-jetbrains max-w-[16rem] text-right text-[10px] leading-snug text-amber-200/80">
                a follow-up is already running for this project — it revises the same notebook, so it
                finishes before another starts
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          data-testid="followup-question"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="ask the research something — “what about on-chain data on whales?”"
          className="font-hanken min-w-[20rem] flex-1 rounded-xl border border-white/12 bg-white/[0.03] px-3.5 py-2 text-sm text-slate-200 placeholder:text-white/25 focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <button
          data-testid="followup-ask"
          onClick={ask}
          disabled={!q.trim()}
          className="font-jetbrains rounded-full border border-white/15 px-3.5 py-2 text-[11px] text-white/70 transition hover:bg-white/5 disabled:opacity-30"
        >
          queue question
        </button>
      </div>

      {all.length === 0 ? (
        <p className="font-jetbrains mt-4 text-[11px] text-white/30">
          Nothing queued. Mark a card <span className="text-cyan-200/70">deepen</span> on the board, or
          ask a question above.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {all.map((r) => {
            const live = asked.find((a) => a.id === r.id) ?? r;
            return (
              <li
                key={r.id}
                data-testid={`followup-item-${r.cardId ?? r.id}`}
                className={`rounded-xl border px-4 py-3 ${
                  live.status === "returned" ? "border-cyan-400/25 bg-cyan-400/[0.03]" : "border-white/8 bg-white/[0.02]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-jetbrains rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] tracking-[0.1em] text-white/45">
                    {r.kind === "question" ? "question" : `deepen · ${r.cardId}`}
                  </span>
                  <span
                    className={`font-jetbrains text-[10px] tracking-[0.12em] ${
                      live.status === "returned" ? "text-cyan-200" : "text-white/35"
                    }`}
                  >
                    {live.status}
                  </span>
                  {live.result && (
                    <span className={`font-jetbrains text-[10px] tracking-[0.12em] ${VERDICT_TONE[live.result.verdict]}`}>
                      · {live.result.verdict}
                    </span>
                  )}
                </div>

                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300">{r.prompt}</p>
                {r.systemReason && !live.result && (
                  <p className="font-jetbrains mt-1.5 text-[10px] leading-relaxed text-amber-200/75">
                    {r.systemReason}
                  </p>
                )}

                {live.result && <FollowUpResult result={live.result} />}
              </li>
            );
          })}
        </ul>
      )}

      {returned.length > 0 && (
        <p className="font-jetbrains mt-4 text-[11px] text-white/35">
          A follow-up can weaken the notebook as well as strengthen it. Both results above changed
          something: one killed a fact, one resolved an open contradiction.
        </p>
      )}
    </section>
  );
}
