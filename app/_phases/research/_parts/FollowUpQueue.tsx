"use client";

// The follow-up queue — what sits below the triage board.
//
// Two ways in, and they are the same queue on purpose: a card marked `deepen` and
// a typed question both mean "the research is not finished here". Keeping them in
// one list is what makes the next run a single dispatch rather than a scatter.
//
// ONE CLOCK. The dispatch is a DRIVEN job (lib/jobs.tsx): the job is `running`
// from the click until this file settles it, and this file settles it in the same
// tick it writes the results. Nothing schedules it and nothing draws a fraction
// over it. Started on the mocked timer instead, the job ran for seven seconds in
// front of a dispatch that takes under one — so for six of them the surface
// showed the returned answer AND "a follow-up is already running", with the run
// button disabled and no way for the user to resolve the disagreement. Two clocks
// in front of unmeasured work is the same defect the script step had; the driven
// job exists so nobody has to invent a third lifecycle to avoid it.

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Primitives";
import { useJobs } from "@/lib/jobs";
import { resultFor, suggestedReason, type FollowUpRequest } from "../followup";
import { stateOf } from "../scope";
import { useFollowUps } from "../useFollowUps";
import type { ScopeApi } from "../useScope";
import FollowUpResult, { VERDICT_TONE } from "./FollowUpResult";

/** How long the MOCK dispatch takes. Not a schedule anything trusts: the job is
 *  driven, so it is `running` for exactly this long and not a millisecond more.
 *  A real dispatch replaces this timeout and nothing else in this file changes. */
const DISPATCH_MS = 700;

const STATUS_TONE: Record<FollowUpRequest["status"], string> = {
  queued: "text-white/35",
  running: "text-cyan-200/70",
  returned: "text-cyan-200",
  unanswered: "text-amber-200",
};

export default function FollowUpQueue({ api, projectId }: { api: ScopeApi; projectId: string }) {
  const jobs = useJobs();
  // THE clock — the job's own state, not a local mirror of it. One follow-up per
  // project at a time (lib/jobs.tsx serialises the kind): a follow-up REVISES the
  // notebook it was launched from, and two in flight would race to rewrite the
  // same document. Research runs have no such coupling, so those stay parallel.
  const busy = jobs.followupBusy(projectId);
  // Stable across renders (useCallback with no deps in the provider) — safe to
  // capture in an effect that must not re-run when some other job ticks.
  const settle = jobs.settle;
  // The record lives above React (see ../useFollowUps). What is left here is
  // the DRAFT — a half-typed question is worth nothing to anyone but the mount
  // that is showing the field.
  const [asked, setAsked] = useFollowUps(projectId);
  const [q, setQ] = useState("");
  // A result reports where each of its effects stands against the notebook ON
  // SCREEN, so it is handed the live card set rather than reasoning off the
  // transcript it was written from.
  const cardIds = useMemo(() => new Set(api.cards.map((c) => c.id)), [api.cards]);
  // Follow-ups this project has actually completed, read off the PERSISTED job
  // record rather than the session-lived queue — the whole point is that the
  // two can disagree, and only one of them survives a reload.
  const landedFollowUps = jobs.jobs.filter(
    (j) => j.projectId === projectId && j.kind === "followup" && j.status === "done",
  ).length;

  // THE UNMOUNT NO LONGER KILLS THE DISPATCH. There used to be a cleanup here
  // that cleared the timer and settled the job `interrupted`, on the reasoning
  // that the results land in this component's state and a departed component
  // cannot receive them. That reasoning was correct and the premise is now
  // false: the record is a module store, `settle` is stable and its provider is
  // mounted above the router, so the timeout lands wherever the user has gone.
  // Navigating off the Board tab is not "closing the queue" — it is the thing
  // the header explicitly says you may do.

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

  // A DISPATCHED DEEPEN KEEPS ITS ROW after the card is un-flagged. Un-marking
  // `deepen` is the natural gesture once the answer is in — the question is
  // settled — and it used to take the answer off the screen with it, because
  // the only route a deepen row had into the list was the card's live flag.
  // The record was never lost (it is still in `asked`, and re-flagging the card
  // brought it back), but nothing said so, on the one surface whose job is
  // reporting what the research came back with. Only DISPATCHED rows are kept:
  // a still-queued deepen that the creator un-flagged is a request withdrawn
  // before it ran, and that one should disappear.
  const liveDeepenIds = new Set(deepened.map((d) => d.cardId));
  const dispatchedDeepens = asked.filter(
    (a) => a.kind === "deepen-card" && a.status !== "queued" && a.cardId && !liveDeepenIds.has(a.cardId),
  );

  // Every entry here is already the live record — `deepened` resolves to the
  // stored request the moment one exists, and questions come straight off it.
  const all = [...deepened, ...dispatchedDeepens, ...asked.filter((a) => a.kind === "question")];
  const pending = all.filter((r) => r.status === "queued");
  const returned = all.filter((r) => r.status === "returned");

  const ask = () => {
    const text = q.trim();
    if (!text) return;
    setAsked((a) => [...a, { id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, kind: "question", prompt: text, status: "queued" }]);
    setQ("");
  };

  /** Mocked dispatch. Resolves anything we have a real transcribed answer for and
   *  is honest about the rest — no match is a RESULT, not a queue that never
   *  empties. */
  const runFollowUp = () => {
    if (busy || !pending.length) return;
    const job = jobs.start(
      "followup",
      projectId,
      `${pending.length} follow-up${pending.length === 1 ? "" : "s"}`,
      { driven: true },
    );
    if (!job) return; // refused — one already in flight

    // Frozen at click time: what was dispatched cannot change under the run.
    const dispatched = pending;
    const answered = dispatched.filter((r) => resultFor(r)).length;

    setAsked((prev) => {
      const next = [...prev];
      for (const r of dispatched) {
        const i = next.findIndex((n) => n.id === r.id);
        if (i >= 0) next[i] = { ...next[i], status: "running" };
        else next.push({ ...r, status: "running" });
      }
      return next;
    });

    setTimeout(() => {
      setAsked((prev) =>
        prev.map((r) => {
          if (r.status !== "running") return r;
          const result = resultFor(r);
          return result
            ? { ...r, status: "returned" as const, result }
            : { ...r, status: "unanswered" as const };
        }),
      );
      settle(
        job.id,
        "done",
        answered === dispatched.length
          ? "Results are staged against the notebook — nothing applied yet."
          : `${answered} of ${dispatched.length} came back. The rest have no transcribed answer in this prototype.`,
      );
    }, DISPATCH_MS);
  };

  return (
    <section data-testid="followup" className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-jetbrains text-content tracking-[0.16em] text-white/55 uppercase">
            follow-up research
          </p>
          <p className="font-hanken mt-1.5 max-w-2xl text-content text-slate-400">
            Cards you marked <span className="text-cyan-200/80">deepen</span>, plus anything you want
            to ask. This routes to the <em>next</em> run — it does not change the script you are about
            to write.
          </p>
        </div>
        {(pending.length > 0 || busy) && (
          <div className="flex flex-col items-end gap-1.5">
            <Button data-testid="run-followup" onClick={runFollowUp} disabled={busy || pending.length === 0} className="shrink-0">
              {busy ? "Researching…" : `Run ${pending.length} follow-up${pending.length === 1 ? "" : "s"}`}
            </Button>
            {busy && (
              <p data-testid="followup-busy" className="font-jetbrains max-w-[16rem] text-right text-content leading-snug text-amber-200/80">
                one follow-up at a time — it revises the same notebook, so this one finishes before
                another can start
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
          className="font-hanken min-w-[20rem] flex-1 rounded-xl border border-white/12 bg-white/[0.03] px-3.5 py-2 text-content text-slate-200 placeholder:text-white/25 focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <button
          data-testid="followup-ask"
          onClick={ask}
          disabled={!q.trim()}
          className="font-jetbrains rounded-full border border-white/15 px-3.5 py-2 text-label text-white/70 transition hover:bg-white/5 disabled:opacity-30"
        >
          queue question
        </button>
      </div>

      {all.length === 0 ? (
        <>
          <p className="font-jetbrains mt-4 text-content text-white/30">
            Nothing queued. Mark a card <span className="text-cyan-200/70">deepen</span> on the board, or
            ask a question above.
          </p>
          {/* AN EMPTY QUEUE WITH A SETTLED JOB BEHIND IT IS NOT AN EMPTY QUEUE.
              The record is session-lived by design (../useFollowUps) — but the
              JOB is persisted to localStorage, so after a reload the bell still
              carries "done · Results are staged against the notebook" pointing
              at a queue that no longer has them. useFollowUps' own header said
              this case was already covered, because `lib/jobs` writes
              `interrupted` over a reload. It writes that over a job still
              RUNNING; a follow-up that returned settled itself `done` and is
              therefore never corrected. So the one disagreement the user can
              actually see was the one nothing spoke to.

              THE CAUSE IS NOT NAMED, because this surface cannot tell which one
              it was: a reload drops the record, and so does clearing the
              research (ResearchStep's doClear). Both leave a settled job with no
              results beside it, and guessing between them out loud would put a
              wrong sentence on the one screen this notice exists to make honest
              — the same rule the triage board's empty columns already follow. */}
          {landedFollowUps > 0 && (
            <p data-testid="followup-none-here" className="font-jetbrains mt-2 text-content leading-relaxed text-amber-200/80">
              the bell still records {landedFollowUps} completed follow-up
              {landedFollowUps === 1 ? "" : "s"} for this project, and their results are not here.
              This queue is held for the session — reloading, or clearing the research, starts it
              clean. Nothing was ever applied to the notebook, so nothing is inconsistent; the
              answers would simply have to be asked for again.
            </p>
          )}
        </>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {all.map((r) => (
            <li
              key={r.id}
              data-testid={`followup-item-${r.cardId ?? r.id}`}
              className={`rounded-xl border px-4 py-3 ${
                r.status === "returned"
                  ? "border-cyan-400/25 bg-cyan-400/[0.03]"
                  : r.status === "unanswered"
                    ? "border-amber-400/25 bg-amber-400/[0.02]"
                    : "border-white/8 bg-white/[0.02]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-jetbrains rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-label tracking-[0.1em] text-white/45">
                  {r.kind === "question" ? "question" : `deepen · ${r.cardId}`}
                </span>
                <span className={`font-jetbrains text-label tracking-[0.12em] ${STATUS_TONE[r.status]}`}>
                  {r.status === "unanswered" ? "no answer" : r.status}
                </span>
                {r.result && (
                  <span className={`font-jetbrains text-label tracking-[0.12em] ${VERDICT_TONE[r.result.verdict]}`}>
                    · {r.result.verdict}
                  </span>
                )}
              </div>

              <p className="mt-1.5 text-content leading-relaxed text-slate-300">{r.prompt}</p>
              {r.systemReason && !r.result && (
                <p className="font-jetbrains mt-1.5 text-content leading-relaxed text-amber-200/75">
                  {r.systemReason}
                </p>
              )}

              {/* The dispatch ran and returned nothing. Said once, in terms of the
                  actual limit, rather than left to look like a queue still moving. */}
              {r.status === "unanswered" && (
                <p data-testid={`followup-unanswered-${r.cardId ?? r.id}`} className="font-jetbrains mt-2 text-content leading-relaxed text-amber-200/80">
                  the dispatch returned nothing. This prototype answers from two follow-ups
                  transcribed from a real terminal run — a question about on-chain whale cohorts, and
                  a deepen on the vendor liquidity stat. There is no research process behind this
                  field yet, so anything else comes back empty rather than invented.
                </p>
              )}

              {r.result && <FollowUpResult result={r.result} cardIds={cardIds} />}
            </li>
          ))}
        </ul>
      )}

      {returned.length > 0 && (
        <p className="font-jetbrains mt-4 text-content text-white/35">
          A follow-up can weaken the notebook as well as strengthen it. Read the verdict on each
          result — “weakened” is as valid an outcome as “strengthened”.
        </p>
      )}
    </section>
  );
}
