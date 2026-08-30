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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Primitives";
import type { CycleManifest, CycleStatus, Improvement, MediaRef, PairResult, TrainingCommitResult, TrainingCycleSummary, TrainingVerdict, TrainingVerdicts } from "@/lib/foundry/training/types";
import { usePolling } from "@/lib/usePolling";

import { fetchTrainingCycle, fetchTrainingCycles, saveTrainingVerdicts, commitTrainingCycle, fileUrl } from "./foundryClient";

const DOJO_STATUS_WORD: Record<CycleStatus, string> = {
  planning: "planning",
  generating: "generating",
  judging: "judging",
  "awaiting-gate": "awaiting your gate",
  committed: "committed",
  failed: "failed",
};

/** Statuses the loop is still working — the page only watches these. */
const DOJO_LIVE: CycleStatus[] = ["planning", "generating", "judging"];
/** Statuses a commit is allowed from — see commitCycle in the store. */
const GATEABLE: CycleStatus[] = ["awaiting-gate", "failed"];

type SaveState = "idle" | "saving" | "saved" | "error";

const pct = (x: number) => `${Math.round(100 * x)}%`;

/** Fraction of an improvement's pairs where the chokepoint picked the
 *  challenger. Mirror of the store's judgePickRate — the numbers on the card
 *  must be the numbers the ledger row will carry. */
function judgePickRate(imp: Improvement): number {
  if (!imp.pairs.length) return 0;
  return imp.pairs.filter((p) => p.judge_pick === "challenger").length / imp.pairs.length;
}

/** Fraction of Gemini-judged pairs where Gemini agreed with the chokepoint;
 *  undefined when Gemini judged none. Mirror of the store's geminiAgreement. */
function geminiAgreement(imp: Improvement): number | undefined {
  const judged = imp.pairs.filter((p) => p.gemini_pick !== undefined);
  if (!judged.length) return undefined;
  return judged.filter((p) => p.gemini_pick === p.judge_pick).length / judged.length;
}

export function DojoView() {
  const [cycles, setCycles] = useState<TrainingCycleSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CycleManifest | null>(null);
  const [verdicts, setVerdicts] = useState<TrainingVerdicts>({});
  const [save, setSave] = useState<SaveState>("idle");
  const [focused, setFocused] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<TrainingCommitResult | null>(null);
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
    const decided = ids.filter((id) => verdicts[id] === "approve" || verdicts[id] === "reject").length;
    return { total: ids.length, decided };
  }, [detail, verdicts]);

  const doCommit = async () => {
    if (!selected) return;
    setCommitting(true);
    try {
      const r = await commitTrainingCycle(selected);
      setResult(r);
      setConfirm(false);
      loadDetail(selected, false);
      loadCycles();
    } catch (e) {
      setListError(e instanceof Error ? e.message : "commit failed");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside>
          <div className="font-jetbrains text-[11px] tracking-[0.14em] text-white/45 uppercase">cycles</div>
          {listError && <p className="font-jetbrains mt-2 text-[11px] text-rose-200">{listError}</p>}
          {cycles && cycles.length === 0 && (
            <p className="font-hanken mt-2 text-[12px] text-slate-400">No cycles yet — the dojo trains while you&rsquo;re away.</p>
          )}
          <ul className="mt-2 flex flex-col gap-1">
            {cycles?.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => selectCycle(c.id)}
                  className={`w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition ${
                    c.id === selected ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/8 hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="font-jetbrains truncate text-[12px] text-white/90">{c.id}</div>
                  <div className="font-jetbrains mt-0.5 text-[10px] text-white/45">
                    {c.dimension} · {c.subject}
                  </div>
                  <div className="font-jetbrains mt-0.5 text-[10px] text-white/45">
                    {DOJO_STATUS_WORD[c.status]} · {c.media} · {c.decided}/{c.improvements} decided
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div>
          {!detail && selected && <p className="font-jetbrains text-[12px] text-white/40">loading…</p>}
          {!selected && cycles && cycles.length > 0 && (
            <p className="font-hanken text-[13px] text-slate-400">Pick a cycle to gate.</p>
          )}
          {detail && (
            <>
              <CycleStrip cycle={detail} />
              {result && (
                <div className="font-jetbrains mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] px-4 py-2 text-[11px] text-emerald-200">
                  committed · {result.deleted} media file{result.deleted === 1 ? "" : "s"} deleted · {result.thumbs.length} thumb{result.thumbs.length === 1 ? "" : "s"} kept in git ·{" "}
                  {result.ledger_rows} ledger row{result.ledger_rows === 1 ? "" : "s"}
                </div>
              )}
              <div className="mt-5 flex flex-col gap-6">
                {detail.improvements.length === 0 && (
                  <p className="font-hanken text-[13px] text-slate-400">This cycle claims no improvements yet.</p>
                )}
                {detail.improvements.map((imp) => (
                  <ImprovementCard
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
              </div>
            </>
          )}
        </div>
      </div>

      {detail && gateable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[var(--gt-ink)]/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
            <div className="font-jetbrains flex flex-wrap items-center gap-4 text-[11px] text-white/60">
              <span>
                <span className="text-white/90">{counts.decided}</span>/{counts.total} decided
              </span>
              <span className={save === "error" ? "text-rose-200" : "text-white/35"}>
                {save === "saving" ? "saving…" : save === "saved" ? "saved" : save === "error" ? "save failed — retry a verdict" : ""}
              </span>
              <span className="text-amber-200/80">Commit deletes decided media; one thumbnail per approved improvement survives in git.</span>
              <span className="hidden text-white/30 md:inline">↑↓ cards · K approve · X reject · U clear</span>
            </div>
            <Button
              disabled={counts.decided === 0}
              onClick={() => setConfirm(true)}
              className="cursor-pointer px-5 py-2 text-[12px] disabled:cursor-not-allowed"
              title={counts.decided === 0 ? "Decide at least one improvement first" : "Delete the decided media and write the ledger"}
            >
              Commit the gate
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={confirm}
        onClose={() => !committing && setConfirm(false)}
        title="Commit the gate?"
        className="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="cursor-pointer px-4 py-2" onClick={() => setConfirm(false)} disabled={committing}>
              Not yet
            </Button>
            <button
              onClick={doCommit}
              disabled={committing}
              className="font-jetbrains cursor-pointer rounded-full border border-rose-400/40 bg-rose-400/10 px-5 py-2 text-[12px] text-rose-200 transition hover:bg-rose-400/20 disabled:opacity-50"
            >
              {committing ? "committing…" : `Commit ${counts.decided} decided`}
            </button>
          </div>
        }
      >
        <p className="font-hanken text-sm text-slate-300">
          Every decided improvement&rsquo;s media — both arms of every pair, posters included — is deleted from this machine. One thumbnail per approved
          improvement is copied into git, and one row per decided improvement joins{" "}
          <code className="font-jetbrains text-[11px] text-white/70">pipeline/foundry/training-ledger.json</code> for the loop to reflect. Undecided
          improvements keep their media. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

function CycleStrip({ cycle }: { cycle: CycleManifest }) {
  const live = DOJO_LIVE.includes(cycle.status);
  const last = cycle.log[cycle.log.length - 1];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5">
      <span
        className={`font-jetbrains rounded-full border px-2 py-0.5 text-[10px] tracking-[0.14em] uppercase ${
          cycle.status === "committed"
            ? "border-emerald-400/40 text-emerald-200"
            : cycle.status === "failed"
              ? "border-rose-400/40 text-rose-200"
              : live
                ? "border-amber-400/40 text-amber-200"
                : "border-cyan-400/40 text-cyan-200"
        }`}
      >
        {DOJO_STATUS_WORD[cycle.status]}
      </span>
      <span className="font-jetbrains text-[11px] text-white/50">
        {cycle.dimension} · {cycle.subject} · {cycle.media} · {cycle.improvements.length} improvement{cycle.improvements.length === 1 ? "" : "s"}
      </span>
      {typeof cycle.costUsd === "number" && <span className="font-jetbrains text-[11px] text-white/50">${cycle.costUsd.toFixed(2)}</span>}
      {cycle.fail_streak > 0 && <span className="font-jetbrains text-[11px] text-rose-200/80">fail streak {cycle.fail_streak}</span>}
      {live && last && <span className="font-jetbrains ml-auto truncate text-[10px] text-white/35">{last.msg}</span>}
    </div>
  );
}

function ImprovementCard({
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
  const challengerPicks = imp.pairs.filter((p) => p.judge_pick === "challenger").length;
  const ring = verdict === "approve" ? "border-emerald-300/50" : verdict === "reject" ? "border-rose-400/40 opacity-70" : "border-white/10";
  return (
    <section
      id={`imp-${imp.id.replace(/[^A-Za-z0-9_-]/g, "_")}`}
      onClick={onFocus}
      className={`rounded-2xl border bg-white/[0.02] p-4 transition ${ring} ${focused ? "ring-2 ring-cyan-300/70" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-jetbrains text-[13px] text-white/90">{imp.technique}</div>
          <p className="font-hanken mt-1 max-w-2xl text-[13px] leading-snug text-slate-300">{imp.claim}</p>
          <p className="font-jetbrains mt-1 text-[10px] text-white/40">challenges: {imp.standard}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`font-jetbrains rounded border bg-black/50 px-1.5 py-0.5 text-[10px] tracking-wide ${
              rate >= 0.75 ? "border-emerald-400/30 text-emerald-200" : rate >= 0.5 ? "border-white/15 text-white/70" : "border-rose-400/30 text-rose-200/90"
            }`}
            title={`Judge picked the challenger on ${challengerPicks} of ${imp.pairs.length} pair(s)`}
          >
            judge {challengerPicks}/{imp.pairs.length} · {pct(rate)}
          </span>
          {gem !== undefined && (
            <span
              className={`font-jetbrains rounded border bg-black/50 px-1.5 py-0.5 text-[10px] tracking-wide ${
                gem >= 0.75 ? "border-emerald-400/30 text-emerald-200" : "border-amber-400/30 text-amber-200/90"
              }`}
              title="How often Gemini agreed with the chokepoint judge"
            >
              gemini agrees {pct(gem)}
            </span>
          )}
          {verdict && (
            <span
              className={`font-jetbrains rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-950 ${
                verdict === "approve" ? "bg-emerald-300/90" : "bg-rose-400/90"
              }`}
            >
              {verdict === "approve" ? "APPROVED" : "REJECTED"}
            </span>
          )}
          {!readOnly && (
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onVerdict("approve");
                }}
                title="Approve (K)"
                className={`font-jetbrains cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                  verdict === "approve" ? "bg-emerald-300 text-slate-950 ring-2 ring-emerald-200/70" : "bg-emerald-300/80 text-slate-950 hover:bg-emerald-300"
                }`}
              >
                K
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onVerdict("reject");
                }}
                title="Reject (X)"
                className={`font-jetbrains cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                  verdict === "reject" ? "bg-rose-400 text-slate-950 ring-2 ring-rose-200/70" : "bg-rose-400/80 text-slate-950 hover:bg-rose-400"
                }`}
              >
                X
              </button>
              {verdict && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onVerdict(null);
                  }}
                  title="Clear (U)"
                  className="font-jetbrains cursor-pointer rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-white/60 transition hover:text-white/90"
                >
                  U
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* The pair wall — the evidence, one seed-matched duo per pair. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {imp.pairs.map((pair) => (
          <PairDuo key={pair.id} cycleId={cycleId} pair={pair} />
        ))}
      </div>
    </section>
  );
}

function PairDuo({ cycleId, pair }: { cycleId: string; pair: PairResult }) {
  const disagrees = pair.gemini_pick !== undefined && pair.gemini_pick !== pair.judge_pick;
  return (
    <div className="rounded-xl border border-white/8 bg-black/30 p-2">
      <div className="font-jetbrains mb-1.5 flex items-center gap-2 text-[10px] text-white/45">
        <span className="truncate">{pair.scene}</span>
        <span className="ml-auto shrink-0">seed {pair.seed}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <PairArm cycleId={cycleId} arm="baseline" ref_={pair.baseline} picked={pair.judge_pick === "baseline"} />
        <PairArm cycleId={cycleId} arm="challenger" ref_={pair.challenger} picked={pair.judge_pick === "challenger"} />
      </div>
      <p className="font-hanken mt-1.5 text-[11px] leading-snug text-slate-400">
        <span className={pair.judge_pick === "tie" ? "text-white/60" : "text-cyan-200/90"}>
          judge: {pair.judge_pick}
        </span>{" "}
        — {pair.reason}
      </p>
      {disagrees && (
        <p className="font-hanken mt-1 text-[11px] leading-snug text-amber-200/80">
          gemini disagrees: {pair.gemini_pick}
          {pair.gemini_reason ? ` — ${pair.gemini_reason}` : ""}
        </p>
      )}
    </div>
  );
}

function PairArm({ cycleId, arm, ref_, picked }: { cycleId: string; arm: "baseline" | "challenger"; ref_: MediaRef; picked: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-lg border ${picked ? "border-cyan-300/60" : "border-white/10"}`}>
      {ref_.deleted ? (
        // Honest absence: the commit unlinked this file; the record stays.
        <div className="font-jetbrains flex aspect-video items-center justify-center bg-black/40 text-[10px] text-white/35">culled</div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam
        <img src={fileUrl(cycleId, ref_.poster ?? ref_.file, "training")} alt={`${arm} · ${ref_.file}`} className="aspect-video w-full object-cover" loading="lazy" />
      )}
      <span className="font-jetbrains pointer-events-none absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white/70">{arm}</span>
      {ref_.kind === "video" && (
        <span className="font-jetbrains pointer-events-none absolute top-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white/60">video · poster</span>
      )}
      {picked && (
        <span className="font-jetbrains pointer-events-none absolute top-1 left-1 rounded bg-cyan-300/90 px-1 py-0.5 text-[9px] font-semibold text-slate-950">PICK</span>
      )}
    </div>
  );
}
