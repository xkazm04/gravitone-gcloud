"use client";

// THE DOJO TAB — where the autonomous training loop's A/B cycles meet the
// only judge that counts.
//
// The loop (pipeline, usually on the GPU machine) plans an improvement,
// renders seed-matched baseline-vs-challenger pairs, has its chokepoint model
// pick a winner per pair, and parks the cycle at `awaiting-gate`. This page is
// the gate: the human reads each improvement's pair wall, approves or rejects
// the CLAIM — not the pixels — and commits. A commit is destructive by design:
// one thumbnail per approved improvement survives into git, everything else
// decided is deleted, and the ledger row is what teaches the loop.
//
// Same discipline as the Cull and Extract tabs: verdicts are immediate and
// idempotent, applied from a ref so a burst of keystrokes cannot read a stale
// map, debounced 400ms to disk; a committed cycle is read-only — the controls
// are removed rather than left to fail quietly. The loop's live statuses are
// only WATCHED here, on the same 4s visible-tab poll the other tabs use.
//
// Drawn in the app's own idiom (./ui.tsx) since the round-2 UI pass
// (2026-10-05). Round 3 drew what the loop writes and the gate had never
// shown: the recipe edit itself (RecipeDiff), each judge's agreement with the
// human, and the second judge's model and failures per pair.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Keycaps, Tally } from "@/components/ui/signal";
import type { CycleManifest, CycleStatus, Improvement, PairResult, TrainingCommitResult, TrainingCycleSummary, TrainingVerdict, TrainingVerdicts } from "@/lib/foundry/training/types";
import { usePolling } from "@/lib/usePolling";

import { RailFrame, RailItem, Wash } from "./RunCards";
import { fetchTrainingCycle, fetchTrainingCycles, saveTrainingVerdicts, commitTrainingCycle, fileUrl } from "./foundryClient";
import { DOJO_STATUS_WORD, cycleKind } from "./parts";
import { Art, BarCount, CommitDialog, DecisionBar, ErrorNote, Glass, Label, Loading, LockNote, PrimaryAction, SaveNote, StatusChip, VerdictButtons, VerdictStamp, ScorePill, type SaveKind } from "./ui";

/** Statuses the loop is still working — the page only watches these. */
const DOJO_LIVE: CycleStatus[] = ["planning", "generating", "judging"];
/** Statuses a commit is allowed from — see commitCycle in the store. */
const GATEABLE: CycleStatus[] = ["awaiting-gate", "failed"];

/** Fraction of an improvement's pairs where the chokepoint picked the
 *  challenger. Mirror of the store's judgePickRate — the numbers on the card
 *  must be the numbers the ledger row will carry. */
function judgePickRate(imp: Improvement): number {
  if (!(imp.pairs ?? []).length) return 0;
  return (imp.pairs ?? []).filter((p) => p.judge_pick === "challenger").length / (imp.pairs ?? []).length;
}

/** Fraction of Gemini-judged pairs where Gemini agreed with the chokepoint;
 *  undefined when Gemini judged none. Mirror of the store's geminiAgreement. */
function geminiAgreement(imp: Improvement): number | undefined {
  const judged = (imp.pairs ?? []).filter((p) => p.gemini_pick !== undefined);
  if (!judged.length) return undefined;
  return judged.filter((p) => p.gemini_pick === p.judge_pick).length / judged.length;
}

/** The Dojo's verdict words are approve/reject; the verdict buttons' are keep/reject. */
const toKit = (v: TrainingVerdict | null | undefined) => (v === "approve" ? "keep" : v === "reject" ? "reject" : null);
const fromKit = (v: "keep" | "reject" | null): TrainingVerdict | null => (v === "keep" ? "approve" : v);

export function DojoView() {
  const [cycles, setCycles] = useState<TrainingCycleSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CycleManifest | null>(null);
  const [verdicts, setVerdicts] = useState<TrainingVerdicts>({});
  const [save, setSave] = useState<SaveKind>("idle");
  const [focused, setFocused] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<TrainingCommitResult | null>(null);
  /** A commit that FAILED, shown inside the dialog that asked for it — the same
   *  rule as the Cull and Extract dialogs: aria-modal hides the page behind it,
   *  so a failure written beside the list would land where nobody can see it. */
  const [commitError, setCommitError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  /** The latest verdict map, readable synchronously — same law as the Cull
   *  tab: a burst of keystrokes must never read a stale map. */
  const verdictsRef = useRef<TrainingVerdicts>({});

  const adoptVerdicts = useCallback((v: TrainingVerdicts) => {
    verdictsRef.current = v;
    setVerdicts(v);
  }, []);

  /** The newest detail request; an older response is dropped. Same monotonic
   *  ticket as FoundryView/ExtractView, for the same reason: the 4s poll
   *  re-requests the SAME id, so latest-wins cannot be an id comparison. */
  const detailTicket = useRef(0);

  const loadDetail = useCallback(
    (id: string, keepVerdicts: boolean) => {
      const ticket = ++detailTicket.current;
      // With a rejection path — an unhandled rejection here is not silence,
      // GlobalErrorBridge reports it as a SAVE failure (see the twin comment
      // in ExtractView.loadDetail).
      fetchTrainingCycle(id).then(
        (d) => {
          if (ticket !== detailTicket.current) return;
          setDetail(d.cycle);
          if (!keepVerdicts) adoptVerdicts(d.verdicts);
          setListError(null);
        },
        (e) => {
          if (ticket !== detailTicket.current) return;
          setListError(e instanceof Error ? e.message : "could not load that cycle");
        },
      );
    },
    [adoptVerdicts],
  );

  const loadCycles = useCallback(() => {
    fetchTrainingCycles().then(
      (r) => {
        setCycles(r);
        setListError(null);
      },
      (e) => setListError(e instanceof Error ? e.message : "failed"),
    );
  }, []);
  useEffect(loadCycles, [loadCycles]);

  const selectCycle = useCallback(
    (id: string) => {
      setSelected(id);
      setDetail(null);
      setResult(null);
      setFocused(null);
      setSave("idle");
      loadDetail(id, false);
    },
    [loadDetail],
  );

  // The loop rewrites the manifest while it works; watch it, keeping the
  // local verdicts, which are the human's and never the loop's.
  const live = detail ? DOJO_LIVE.includes(detail.status) : false;
  usePolling(
    () => {
      if (!selected) return;
      loadDetail(selected, true);
      loadCycles();
    },
    4000,
    Boolean(selected) && live,
  );

  const readOnly = detail?.status === "committed";
  const gateable = detail ? GATEABLE.includes(detail.status) : false;

  /** Apply one verdict to one improvement. Idempotent; null clears. */
  const setVerdict = useCallback(
    (id: string, v: TrainingVerdict | null) => {
      if (!selected || readOnly) return;
      const next = { ...verdictsRef.current };
      if (v) next[id] = v;
      else delete next[id];
      adoptVerdicts(next);
      setSave("saving");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      const cycleId = selected;
      saveTimer.current = window.setTimeout(() => {
        saveTrainingVerdicts(cycleId, next).then(
          () => setSave("saved"),
          () => setSave("error"),
        );
      }, 400);
    },
    [selected, readOnly, adoptVerdicts],
  );

  /* ── Keyboard — the CullGrid law, one card at a time ─────────────────── */

  const order = useMemo(() => detail?.improvements.map((i) => i.id) ?? [], [detail]);

  useEffect(() => {
    // A committed cycle is read-only: no key handling at all.
    if (!detail || readOnly || confirm) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const i = focused ? order.indexOf(focused) : -1;
      const step = (d: number) => {
        const n = Math.min(order.length - 1, Math.max(0, (i < 0 ? 0 : i) + d));
        setFocused(order[n]);
      };
      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
          e.preventDefault();
          step(1);
          break;
        case "ArrowUp":
        case "ArrowLeft":
          e.preventDefault();
          step(-1);
          break;
        case "k":
        case "K":
          if (focused) setVerdict(focused, "approve");
          break;
        case "x":
        case "X":
          if (focused) setVerdict(focused, "reject");
          break;
        case "u":
        case "U":
          if (focused) setVerdict(focused, null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, readOnly, confirm, focused, order, setVerdict]);

  useEffect(() => {
    if (!focused) return;
    document.getElementById(`imp-${focused.replace(/[^A-Za-z0-9_-]/g, "_")}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);

  const counts = useMemo(() => {
    const ids = detail?.improvements.map((i) => i.id) ?? [];
    const approved = ids.filter((id) => verdicts[id] === "approve").length;
    const rejected = ids.filter((id) => verdicts[id] === "reject").length;
    return { total: ids.length, decided: approved + rejected, approved, rejected, undecided: ids.length - approved - rejected };
  }, [detail, verdicts]);

  const doCommit = async () => {
    if (!selected) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const r = await commitTrainingCycle(selected);
      setResult(r);
      setConfirm(false);
      loadDetail(selected, false);
      loadCycles();
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : "commit failed");
    } finally {
      setCommitting(false);
    }
  };

  if (cycles && cycles.length === 0 && !listError) return <DojoEmpty />;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <RailFrame label="Cycles" count={cycles?.length} error={listError} onRetry={loadCycles}>
          {cycles?.map((c) => (
            <RailItem
              key={c.id}
              kind={cycleKind(c.status)}
              word={DOJO_STATUS_WORD[c.status]}
              title={c.id}
              current={c.id === selected}
              onSelect={() => selectCycle(c.id)}
              meta={
                <span className="flex flex-col gap-0.5">
                  <span className="truncate text-white/60">
                    {c.dimension} · {c.subject}
                  </span>
                  <span>
                    {c.media} · <span className="text-white/80 tabular-nums">{c.decided}/{c.improvements}</span> decided
                  </span>
                </span>
              }
            />
          ))}
        </RailFrame>

        <div className="flex min-w-0 flex-col gap-5">
          {!detail && selected && <Loading label="reading the cycle" />}
          {!selected && cycles && cycles.length > 0 && <PickACycle cycles={cycles} onPick={selectCycle} />}
          {detail && (
            <>
              <Glass className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                    <h2 className="font-instrument truncate text-3xl text-white">{detail.id}</h2>
                    <StatusChip kind={cycleKind(detail.status)} word={DOJO_STATUS_WORD[detail.status]} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-jetbrains rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-label text-white/70">
                      {detail.dimension} · {detail.subject}
                    </span>
                    <Tally label={detail.media} value={detail.improvements.length} />
                    {typeof detail.costUsd === "number" && <span className="font-jetbrains rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-label text-white/70">${detail.costUsd.toFixed(2)}</span>}
                    {detail.fail_streak > 0 && <Tally label="fail streak" value={detail.fail_streak} tone="rose" />}
                  </div>
                </div>
                {/* HOW FAR EACH JUDGE CAN BE TRUSTED, measured against this
                    human's past gates — the loop writes it, no surface read it.
                    It is the one number that says whether "judge 4/5" on the
                    cards below is evidence or noise. Absent until the loop has
                    gates to measure against, and then left off, not zeroed. */}
                {detail.judge_agreement && (detail.judge_agreement.chokepoint_vs_human !== undefined || detail.judge_agreement.gemini_vs_human !== undefined) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Label>agreement with human</Label>
                    {detail.judge_agreement.chokepoint_vs_human !== undefined && <ScorePill label="chokepoint" value={detail.judge_agreement.chokepoint_vs_human} />}
                    {detail.judge_agreement.gemini_vs_human !== undefined && <ScorePill label="gemini" value={detail.judge_agreement.gemini_vs_human} />}
                  </div>
                )}
                {DOJO_LIVE.includes(detail.status) && detail.log.length > 0 && (
                  <p className="font-jetbrains mt-3 truncate text-label text-white/45">{detail.log[detail.log.length - 1]?.msg}</p>
                )}
              </Glass>
              {result && (
                <div role="status" className="font-jetbrains rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3 text-label text-emerald-100/90">
                  committed · {result.deleted} media file{result.deleted === 1 ? "" : "s"} deleted · {result.thumbs.length} thumb{result.thumbs.length === 1 ? "" : "s"} kept in git · {result.ledger_rows} ledger row
                  {result.ledger_rows === 1 ? "" : "s"}
                </div>
              )}
              {detail.improvements.length === 0 && <Art alt="no improvements claimed yet" state="queued" className="aspect-[5/1]" />}
              {detail.improvements.map((imp) => (
                <ImprovementEntry
                  key={imp.id}
                  cycleId={detail.id}
                  imp={imp}
                  verdict={verdicts[imp.id] ?? null}
                  focused={focused === imp.id}
                  readOnly={readOnly}
                  onFocus={() => setFocused(imp.id)}
                  onVerdict={(v) => {
                    setFocused(imp.id);
                    setVerdict(imp.id, v);
                  }}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {detail && gateable && (
        <DecisionBar label="Decisions">
          <BarCount tone="neutral" n={counts.decided} of={counts.total} label="decided" />
          <BarCount tone="emerald" n={counts.approved} label="approved" />
          <BarCount tone="rose" n={counts.rejected} label="rejected" />
          <SaveNote state={save} />
          <Keycaps
            label="Gate shortcuts"
            map={[
              { keys: ["↑", "↓"], does: "cards" },
              { keys: ["K"], does: "approve" },
              { keys: ["X"], does: "reject" },
              { keys: ["U"], does: "clear" },
            ]}
          />
          <span className="ml-auto flex items-center gap-3">
            {counts.decided === 0 && <LockNote>decide one first</LockNote>}
            <PrimaryAction disabled={counts.decided === 0} onClick={() => setConfirm(true)}>
              Commit the gate
            </PrimaryAction>
          </span>
        </DecisionBar>
      )}

      <CommitDialog
        open={confirm}
        onClose={() => {
          if (committing) return;
          setConfirm(false);
          setCommitError(null);
        }}
        title="Commit the gate?"
        eyebrow={<Label>{selected}</Label>}
        railLabel="gate"
        // THE RAIL, and here undecided is genuinely a THIRD outcome rather
        // than a hatch on the rejected side: a Dojo commit leaves undecided
        // media alone and writes no ledger row for it, so drawing it as a
        // stand-in for "rejected" — the way the Cull and Extract dialogs
        // do — would be a lie about what the button is going to do.
        rail={[
          { n: counts.approved, tone: "emerald", label: "approved" },
          { n: counts.rejected, tone: "rose", label: "rejected" },
          { n: counts.undecided, tone: "neutral", label: "untouched" },
        ]}
        consequence={
          <>
            Every decided improvement&rsquo;s media — both arms of every pair, posters included — is deleted from this machine. One thumbnail per approved improvement is copied into git, and one
            row per decided improvement joins <code>pipeline/foundry/training-ledger.json</code>. This cannot be undone.
          </>
        }
        busy={committing}
        confirmLabel={`Commit ${counts.decided} decided`}
        onConfirm={doCommit}
        onCancel={() => {
          setConfirm(false);
          setCommitError(null);
        }}
      >
        {commitError && (
          <div className="mt-4">
            <ErrorNote role="alert">The commit failed and nothing was deleted: {commitError}</ErrorNote>
          </div>
        )}
      </CommitDialog>
    </>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

/** No cycles at all: the shape a gate takes — a claim over a wall of
 *  seed-matched pairs, one arm picked — washed in under the one true sentence.
 *  No command is offered: a cycle is planned by the training loop on the GPU
 *  machine, not by anything this page could hand the reader to paste. */
function DojoEmpty() {
  return (
    <Glass className="overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col justify-center gap-4 p-8">
          <Label>dojo</Label>
          <h2 className="font-instrument text-4xl leading-tight text-white">No cycles yet</h2>
          <div className="flex flex-wrap gap-1.5" aria-hidden>
            <span className="font-jetbrains rounded-full border border-white/10 px-2.5 py-0.5 text-label text-white/45">foundry-out/training</span>
            <span className="font-jetbrains rounded-full border border-white/10 px-2.5 py-0.5 text-label text-white/45">training-ledger.json</span>
          </div>
        </div>
        <div aria-hidden className="flex flex-col gap-4 border-t border-white/6 bg-black/20 p-8 lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between gap-4">
            <span className="flex w-1/2 flex-col gap-2">
              <span className="h-3 w-3/4 rounded-full bg-white/12" />
              <span className="h-2 w-full rounded-full bg-white/[0.07]" />
            </span>
            <span className="flex gap-1.5">
              <span className="h-7 w-7 rounded-full border border-emerald-300/30" />
              <span className="h-7 w-7 rounded-full border border-rose-300/30" />
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <span key={i} className="flex flex-col gap-2 rounded-xl border border-white/8 bg-black/20 p-2.5">
                <span className="grid grid-cols-2 gap-1.5">
                  <Wash className={`aspect-video ${i === 2 ? "ring-1 ring-cyan-300/50" : ""}`} />
                  <Wash className={`aspect-video ${i !== 2 ? "ring-1 ring-cyan-300/50" : ""}`} />
                </span>
                <span className="h-2 w-4/5 rounded-full bg-white/[0.07]" />
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="sr-only">No training cycles yet.</p>
    </Glass>
  );
}

/** No cycle chosen yet: the parked ones, large, as the way in. A "pick a
 *  cycle" ghost was the old drawing — absence where the work was one click
 *  away. */
function PickACycle({ cycles, onPick }: { cycles: TrainingCycleSummary[]; onPick: (id: string) => void }) {
  const first = cycles.filter((c) => c.status === "awaiting-gate").concat(cycles.filter((c) => c.status !== "awaiting-gate")).slice(0, 4);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {first.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c.id)}
          className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-5 text-left backdrop-blur-[14px] transition hover:border-cyan-400/35"
        >
          <span className="flex items-center justify-between gap-3">
            <span className="font-instrument truncate text-2xl text-white">{c.id}</span>
            <StatusChip kind={cycleKind(c.status)} word={DOJO_STATUS_WORD[c.status]} />
          </span>
          <span className="font-jetbrains text-label text-white/50">
            {c.dimension} · {c.subject} · {c.media}
          </span>
          <span className="font-jetbrains text-label text-white/45">
            <span className="text-white/85 tabular-nums">{c.decided}</span>/{c.improvements} decided
          </span>
        </button>
      ))}
    </div>
  );
}

function ImprovementEntry({
  cycleId,
  imp,
  verdict,
  focused,
  readOnly,
  onFocus,
  onVerdict,
}: {
  cycleId: string;
  imp: Improvement;
  verdict: TrainingVerdict | null;
  focused: boolean;
  readOnly: boolean;
  onFocus: () => void;
  onVerdict: (v: TrainingVerdict | null) => void;
}) {
  const rate = judgePickRate(imp);
  const gem = geminiAgreement(imp);
  const challengerPicks = (imp.pairs ?? []).filter((p) => p.judge_pick === "challenger").length;
  const kit = toKit(verdict);
  return (
    <section
      id={`imp-${imp.id.replace(/[^A-Za-z0-9_-]/g, "_")}`}
      aria-label={`${imp.technique}${kit ? (kit === "keep" ? ", approved" : ", rejected") : ""}`}
      onClick={onFocus}
      className={`rounded-2xl border bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-5 backdrop-blur-[14px] transition ${
        focused ? "border-cyan-400/45 shadow-[0_0_0_1px_var(--gt-ring-cyan)]" : kit === "keep" ? "border-emerald-400/30" : kit === "reject" ? "border-rose-400/25" : "border-white/8 hover:border-white/15"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-instrument text-3xl text-white">{imp.technique}</h3>
            {kit && <VerdictStamp verdict={kit} keepWord="approved" />}
          </div>
          <p className="font-hanken max-w-[80ch] text-content leading-relaxed text-white/85">{imp.claim}</p>
          <span className="font-jetbrains text-label text-white/40">challenges · {imp.standard}</span>
          <RecipeDiff baseline={imp.baseline_recipe} challenger={imp.challenger_recipe} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScorePill label={`judge ${challengerPicks}/${(imp.pairs ?? []).length}`} value={rate} />
          {gem !== undefined && <ScorePill label="gemini agrees" value={gem} />}
          {!readOnly && <VerdictButtons value={kit} keepWord="Approve" subject={imp.technique} clear onVerdict={(v) => onVerdict(fromKit(v))} />}
        </div>
      </div>
      {/* The pair wall — the evidence, one seed-matched duo per pair. */}
      <div className="mt-5 grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        {(imp.pairs ?? []).map((pair) => (
          <PairDuo key={pair.id} cycleId={cycleId} pair={pair} />
        ))}
      </div>
    </section>
  );
}

function PairDuo({ cycleId, pair }: { cycleId: string; pair: PairResult }) {
  const disagrees = pair.gemini_pick !== undefined && pair.gemini_pick !== pair.judge_pick;
  const arm = (name: "baseline" | "challenger", ref_: PairResult["baseline"]) => {
    const picked = pair.judge_pick === name;
    // Honest absence: the commit unlinked this file; the record stays.
    const src = ref_.deleted ? undefined : fileUrl(cycleId, ref_.poster ?? ref_.file, "training");
    return (
      <figure key={name} className="flex min-w-0 flex-col gap-1.5">
        <div className={`rounded-xl ${picked ? "ring-2 ring-cyan-300/70" : "ring-1 ring-white/10"}`}>
          <Art src={src} state={ref_.deleted ? "deleted" : "ready"} alt={`${name} · ${ref_.file}`} className="aspect-video">
            {picked && (
              <span className="font-jetbrains pointer-events-none absolute top-2 left-2 rounded-md bg-cyan-300/95 px-1.5 py-0.5 text-label font-semibold tracking-[0.12em] text-slate-950 uppercase">
                pick
              </span>
            )}
            {ref_.kind === "video" && (
              <span className="font-jetbrains pointer-events-none absolute top-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-label text-white/80">video · poster</span>
            )}
          </Art>
        </div>
        <figcaption className={`font-jetbrains px-0.5 text-label ${picked ? "text-cyan-200" : "text-white/45"}`}>{name}</figcaption>
      </figure>
    );
  };
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
      <div className="font-jetbrains flex items-center justify-between gap-3 text-label text-white/45">
        <span className="truncate">{pair.scene}</span>
        <span className="shrink-0">seed {pair.seed}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {arm("baseline", pair.baseline)}
        {arm("challenger", pair.challenger)}
      </div>
      <p className="font-hanken text-label leading-snug text-white/70">
        <span className={`font-jetbrains ${pair.judge_pick === "tie" ? "text-white/55" : "text-cyan-200"}`}>judge: {pair.judge_pick}</span> — {pair.reason}
      </p>
      {/* THE SECOND JUDGE, all three of its outcomes. Round 2 drew only a
          disagreement, so an agreeing Gemini and an absent one read the same,
          and a FAILED call — an outage, which the type keeps out of agreement
          on purpose — was invisible: the reader could not tell "Gemini saw
          this and concurred" from "Gemini never saw it". The model rides on
          each, because the retry ladder can change it from pair to pair. */}
      {pair.gemini_error ? (
        <p className="font-hanken rounded-lg border border-rose-400/25 bg-rose-400/[0.06] px-2.5 py-1.5 text-label leading-snug text-rose-100/90">
          <span className="font-jetbrains">gemini failed{pair.gemini_model ? ` · ${pair.gemini_model}` : ""}</span> — {pair.gemini_error}
        </p>
      ) : disagrees ? (
        <p className="font-hanken rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-1.5 text-label leading-snug text-amber-100/90">
          <span className="font-jetbrains">
            gemini disagrees: {String(pair.gemini_pick)}
            {pair.gemini_model ? ` · ${pair.gemini_model}` : ""}
          </span>
          {pair.gemini_reason ? ` — ${pair.gemini_reason}` : ""}
        </p>
      ) : pair.gemini_pick !== undefined ? (
        <p className="font-jetbrains text-label text-white/40">
          gemini agrees{pair.gemini_model ? ` · ${pair.gemini_model}` : ""}
        </p>
      ) : null}
    </div>
  );
}

/* ── The recipe change ────────────────────────────────────────────────────── */

type Run = { op: "same" | "del" | "add"; text: string };

/** A word-level diff, longest common subsequence over whitespace tokens.
 *  Recipes are 60–110 words (lib/foundry/extract/types.ts names the class), so
 *  the quadratic table is a few thousand cells — no library earns its weight
 *  here. Adjacent tokens of one kind are merged into a single run. */
export function wordDiff(a: string, b: string): Run[] {
  const x = a.split(/\s+/).filter(Boolean);
  const y = b.split(/\s+/).filter(Boolean);
  const n = x.length;
  const m = y.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: Run[] = [];
  const push = (op: Run["op"], t: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += ` ${t}`;
    else out.push({ op, text: t });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push("same", x[i]);
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) push("del", x[i++]);
    else push("add", y[j++]);
  }
  while (i < n) push("del", x[i++]);
  while (j < m) push("add", y[j++]);
  return out;
}

/**
 * WHAT IS BEING APPROVED. A gate approves a CLAIM, and the claim is a recipe
 * edit: `baseline_recipe` → `challenger_recipe` is the change that lands in the
 * prompt surface if this is approved. Neither had ever been drawn — the human
 * gated a sentence about a change and a wall of its results, never the change.
 *
 * One paragraph, the challenger as it reads, with what it dropped struck in
 * rose and what it added in emerald: the edit in place, where a two-column
 * before/after would make the reader find it themselves. The colour is never
 * the only signal — `del` and `ins` carry it to a screen reader, and the
 * strike-through and underline to a sighted one.
 */
function RecipeDiff({ baseline, challenger }: { baseline?: string; challenger?: string }) {
  const runs = useMemo(() => (baseline && challenger ? wordDiff(baseline, challenger) : []), [baseline, challenger]);
  if (!baseline && !challenger) return null;
  const changed = runs.some((r) => r.op !== "same");
  return (
    <section aria-label="Recipe change" className="mt-1 max-w-[80ch] rounded-xl border border-white/8 bg-black/20 px-4 py-3">
      <div className="mb-1.5 flex items-center gap-3">
        <Label as="h4">recipe</Label>
        {baseline && challenger && !changed && <span className="font-jetbrains text-label text-amber-200/80">unchanged from baseline</span>}
        {(!baseline || !challenger) && <span className="font-jetbrains text-label text-amber-200/80">{baseline ? "no challenger recipe" : "no baseline recipe"}</span>}
      </div>
      <p className="font-hanken text-content leading-relaxed text-white/75">
        {runs.length
          ? runs.map((r, k) => (
              <Fragment key={k}>
                {r.op === "same" ? (
                  r.text
                ) : r.op === "del" ? (
                  <del className="rounded bg-rose-400/[0.10] px-0.5 text-rose-200/80 decoration-rose-300/70">{r.text}</del>
                ) : (
                  <ins className="rounded bg-emerald-400/[0.12] px-0.5 text-emerald-100 decoration-emerald-300/70">{r.text}</ins>
                )}{" "}
              </Fragment>
            ))
          : (challenger ?? baseline)}
      </p>
    </section>
  );
}
