"use client";

// THE STRIPS TAB — code-rendered strips (pipeline/strips/run.mts) meet the
// operator's eye. Plan: docs/code-rendered-strips-plan.md, "The /foundry
// surface: a fifth tab, `Strips`".
//
// Same discipline as the Cull, Extract and Dojo tabs: verdicts are immediate
// and idempotent, applied synchronously from a ref so a burst of keystrokes
// cannot read a stale map, and the whole map is saved 400 ms after the last
// change. A strip verdict also carries up to three reason chips and a note —
// the chips are the learning signal (free notes cannot be aggregated) — and
// they ride the same save. A committed run is read-only: its rejected media
// are gone and its rows are in strips-ledger.json, so the controls are removed
// rather than left to fail quietly. A run still rendering is only watched, on
// the same 4 s visible-tab poll the other tabs use.
//
// The grid is ./StripGrid.tsx, the lightbox ./StripLightbox.tsx; this file owns
// the run list, the verdicts and the commit.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Modal from "@/components/ui/Modal";
import { CHIP_CLASS, Keycaps, TALLY_TONE, Tally } from "@/components/ui/signal";
import { STRIP_CHIPS_MAX, STRIP_COMMITTABLE, type StripCommitPlan, type StripCommitResult, type StripRunSummary } from "@/lib/foundry/strips/triage";
import type { StripChip, StripRun, StripVerdict, StripVerdicts } from "@/lib/foundry/strips/types";
import { politenessFor, useAnnounce } from "@/lib/announcer";
import { usePolling } from "@/lib/usePolling";

import { RunsError } from "./RunCards";
import { StripGrid, judgeable, stripOrder, type StripVerdictValue } from "./StripGrid";
import { StripLightbox } from "./StripLightbox";
import { commitStripRun, fetchStripRun, fetchStripRuns, previewStripCommit, saveStripVerdicts } from "./foundryClient";
import { STRIP_STATUS_WORD, stripKind } from "./parts";
import {
  BarCount,
  CommitDialog,
  DecisionBar,
  ErrorNote,
  Glass,
  Label,
  Loading,
  LockNote,
  PlanFact,
  PrimaryAction,
  SaveNote,
  StatusChip,
  useCommitPlan,
  type SaveKind,
} from "./ui";

const STRIP_KEYS = [
  { keys: ["←", "→", "↑", "↓"], does: "move" },
  { keys: ["K"], does: "keep" },
  { keys: ["X"], does: "reject" },
  { keys: ["U"], does: "clear" },
  { keys: ["1–8"], does: "reason chip" },
  { keys: ["Enter"], does: "open" },
];

export function StripsView() {
  const [runs, setRuns] = useState<StripRunSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [run, setRun] = useState<StripRun | null>(null);
  const [verdicts, setVerdicts] = useState<StripVerdicts>({});
  const [save, setSave] = useState<SaveKind>("idle");
  const [focused, setFocused] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [result, setResult] = useState<StripCommitResult | null>(null);
  const [findingsOpen, setFindingsOpen] = useState(false);
  const plan = useCommitPlan<StripCommitPlan>();
  // The commit's outcome and the dialog's errors are SPOKEN through the one
  // announcer (lib/announcer.tsx rule 2), not through inline live regions of
  // this tab's own; tests/golden-path/live-region-budget.probe.spec.ts holds
  // the count of those and it may only fall.
  const announce = useAnnounce();
  const planError = plan.error;
  useEffect(() => {
    if (planError) announce({ key: `strips-plan-failed-${planError}`, text: `Could not prepare the commit: ${planError}`, assertive: politenessFor("failure") });
  }, [planError, announce]);
  const clearPlan = plan.clear;
  const saveTimer = useRef<number | null>(null);
  const verdictsRef = useRef<StripVerdicts>({});
  /** The newest detail request; an older response is dropped (the Cull's
   *  monotonic ticket, for the Cull's reason: the poll re-requests one id). */
  const detailTicket = useRef(0);

  const adoptVerdicts = useCallback((v: StripVerdicts) => {
    verdictsRef.current = v;
    setVerdicts(v);
  }, []);

  const loadDetail = useCallback(
    (id: string, keepVerdicts: boolean) => {
      const ticket = ++detailTicket.current;
      // With a rejection path: an unhandled one is reported by
      // GlobalErrorBridge as a SAVE failure (FoundryView.loadDetail).
      fetchStripRun(id).then(
        (d) => {
          if (ticket !== detailTicket.current) return;
          setRun(d.run);
          if (!keepVerdicts) adoptVerdicts(d.verdicts);
          setListError(null);
        },
        (e) => {
          if (ticket !== detailTicket.current) return;
          setListError(e instanceof Error ? e.message : "could not load that strip run");
        },
      );
    },
    [adoptVerdicts],
  );

  const loadRuns = useCallback(() => {
    fetchStripRuns().then(
      (r) => {
        setRuns(r);
        setListError(null);
        setSelected((s) => {
          if (s || !r[0]) return s;
          loadDetail(r[0].id, false);
          return r[0].id;
        });
      },
      (e) => setListError(e instanceof Error ? e.message : "failed"),
    );
  }, [loadDetail]);
  useEffect(loadRuns, [loadRuns]);

  const selectRun = useCallback(
    (id: string) => {
      setSelected(id);
      setRun(null);
      setResult(null);
      setFocused(null);
      setOpen(null);
      setFindingsOpen(false);
      clearPlan();
      setSave("idle");
      loadDetail(id, false);
    },
    [loadDetail, clearPlan],
  );

  usePolling(
    () => {
      if (!selected) return;
      loadDetail(selected, true);
      loadRuns();
    },
    4000,
    Boolean(selected) && run?.status === "running",
  );

  const readOnly = run?.status === "committed";

  /** Replace the map, then save it 400 ms after the last change. */
  const apply = useCallback(
    (next: StripVerdicts) => {
      if (!selected || readOnly) return;
      adoptVerdicts(next);
      setSave("saving");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      const runId = selected;
      saveTimer.current = window.setTimeout(() => {
        saveStripVerdicts(runId, next).then(
          () => setSave("saved"),
          () => setSave("error"),
        );
      }, 400);
    },
    [selected, readOnly, adoptVerdicts],
  );

  /** Keep / reject / clear one strip. Idempotent; a changed verdict keeps its
   *  chips and note, a cleared one drops them. */
  const setVerdict = useCallback(
    (id: string, v: StripVerdictValue | null) => {
      const next = { ...verdictsRef.current };
      if (!v) delete next[id];
      else next[id] = { ...next[id], verdict: v, at: new Date().toISOString() };
      apply(next);
    },
    [apply],
  );

  /** Toggle one reason chip on a decided strip; a fourth is refused. */
  const toggleChip = useCallback(
    (id: string, chip: StripChip) => {
      const cur = verdictsRef.current[id];
      if (!cur) return;
      const chips = cur.chips ?? [];
      const on = chips.includes(chip);
      if (!on && chips.length >= STRIP_CHIPS_MAX) return;
      const nextChips = on ? chips.filter((c) => c !== chip) : [...chips, chip];
      const rec: StripVerdict = { ...cur, chips: nextChips };
      if (!nextChips.length) delete rec.chips;
      apply({ ...verdictsRef.current, [id]: rec });
    },
    [apply],
  );

  const setNote = useCallback(
    (id: string, note: string) => {
      const cur = verdictsRef.current[id];
      if (!cur) return;
      apply({ ...verdictsRef.current, [id]: { ...cur, note } });
    },
    [apply],
  );

  const order = useMemo(() => (run ? stripOrder(run).map((c) => c.id) : []), [run]);
  const stepOpen = useCallback(
    (d: 1 | -1) => {
      if (!open) return;
      const i = order.indexOf(open);
      const n = Math.min(order.length - 1, Math.max(0, i + d));
      setOpen(order[n]);
      setFocused(order[n]);
    },
    [open, order],
  );

  const counts = useMemo(() => {
    const cs = run?.cards.filter((c) => judgeable(c)) ?? [];
    const kept = cs.filter((c) => verdicts[c.id]?.verdict === "keep").length;
    const rejected = cs.filter((c) => verdicts[c.id]?.verdict === "reject").length;
    return { total: cs.length, kept, rejected, undecided: (run?.cards.length ?? 0) - kept - rejected };
  }, [run, verdicts]);

  const openConfirm = () => {
    if (!selected) return;
    const id = selected;
    setConfirm(true);
    setCommitError(null);
    plan.prepare(() => previewStripCommit(id));
  };
  const closeConfirm = () => {
    if (committing) return;
    setConfirm(false);
    setCommitError(null);
    clearPlan();
  };
  const doCommit = async () => {
    if (!selected) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const r = await commitStripRun(selected, plan.plan?.token);
      setResult(r);
      announce({ key: `strips-commit-${selected}-${Date.now()}`, text: `Committed: ${r.kept} kept, ${r.rejected} rejected, ${r.deleted} media files deleted.`, assertive: politenessFor("ok") });
      setConfirm(false);
      clearPlan();
      setOpen(null);
      loadDetail(selected, false);
      loadRuns();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "commit failed";
      setCommitError(msg);
      announce({ key: `strips-commit-failed-${Date.now()}`, text: `The commit failed and nothing was deleted: ${msg}`, assertive: politenessFor("failure") });
    } finally {
      setCommitting(false);
    }
  };

  const blocked = !run
    ? null
    : !STRIP_COMMITTABLE.includes(run.status)
      ? `run is ${STRIP_STATUS_WORD[run.status]}`
      : counts.kept + counts.rejected === 0
        ? "decide one first"
        : null;

  if (runs && runs.length === 0 && !listError) return <StripsEmpty />;

  const openCard = run && open ? (run.cards.find((c) => c.id === open) ?? null) : null;
  const p = plan.plan;

  return (
    <div className="flex flex-col gap-4">
      {listError && <RunsError error={listError} onRetry={loadRuns} />}
      {runs && runs.length > 1 && (
        <nav aria-label="Strip runs" className="flex flex-wrap gap-2">
          {runs.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-current={r.id === selected ? "true" : undefined}
              onClick={() => selectRun(r.id)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
                r.id === selected ? "border-cyan-400/45 bg-cyan-400/[0.07] shadow-[0_0_0_1px_var(--gt-ring-cyan)]" : "border-white/8 bg-white/[0.02] hover:border-white/15"
              }`}
            >
              <span className="font-hanken text-content text-white/90">{r.id}</span>
              <StatusChip kind={stripKind(r.status)} word={STRIP_STATUS_WORD[r.status]} />
              <span className="font-jetbrains text-label text-white/45 tabular-nums">
                {r.decided}/{r.lanes.edu.rendered + r.lanes.stat.rendered}
              </span>
            </button>
          ))}
        </nav>
      )}
      {runs === null && !listError && <Loading label="reading the strip runs" />}
      {selected && !run && !listError && <Loading label="reading the run" />}

      {run && (
        <Glass className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="font-instrument truncate text-3xl text-white">{run.id}</h2>
              <StatusChip kind={stripKind(run.status)} word={STRIP_STATUS_WORD[run.status]} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Tally label="edu" value={run.cards.filter((c) => c.lane === "edu").length} />
              <Tally label="stat" value={run.cards.filter((c) => c.lane === "stat").length} />
              <Tally label="rendered" value={counts.total} of={run.cards.length} tone={counts.total < run.cards.length ? "amber" : "neutral"} />
              <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>
                {run.fps} fps · {run.frames} f
              </span>
            </div>
          </div>
        </Glass>
      )}

      {result && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3">
          <span className="font-jetbrains text-label text-emerald-100/90">
            committed · {result.kept} kept into motion-styles · {result.rejected} rejected · {result.deleted} media file{result.deleted === 1 ? "" : "s"} deleted · {result.ledgerRows} ledger row
            {result.ledgerRows === 1 ? "" : "s"}
          </span>
          <button type="button" onClick={() => setFindingsOpen(true)} className="font-jetbrains cursor-pointer text-label text-emerald-200 underline-offset-4 hover:underline">
            Read findings.md →
          </button>
        </div>
      )}

      {run && (
        <StripGrid
          run={run}
          verdicts={verdicts}
          focused={focused}
          readOnly={readOnly}
          onFocus={setFocused}
          onVerdict={setVerdict}
          onToggleChip={toggleChip}
          onOpen={setOpen}
          keysEnabled={!open && !confirm && !findingsOpen}
        />
      )}

      {run && (
        <DecisionBar label="Strip decisions">
          <BarCount tone="emerald" n={counts.kept} label="kept" />
          <BarCount tone="rose" n={counts.rejected} label="rejected" />
          <BarCount tone="neutral" n={counts.undecided} label="undecided" />
          <SaveNote state={save} final={readOnly} />
          {!readOnly && <Keycaps label="Strip shortcuts" map={STRIP_KEYS} />}
          <span className="ml-auto flex items-center gap-3">
            {readOnly ? (
              <StatusChip kind="committed" word="committed" />
            ) : (
              <>
                {blocked && <LockNote>{blocked}</LockNote>}
                <PrimaryAction disabled={Boolean(blocked)} onClick={openConfirm}>
                  Commit the triage
                </PrimaryAction>
              </>
            )}
          </span>
        </DecisionBar>
      )}

      {run && (
        <StripLightbox
          run={run}
          card={openCard}
          verdict={open ? verdicts[open] : undefined}
          readOnly={readOnly}
          onClose={() => setOpen(null)}
          onVerdict={(v) => open && setVerdict(open, v)}
          onToggleChip={(c) => open && toggleChip(open, c)}
          onNote={(n) => open && setNote(open, n)}
          onStep={stepOpen}
          index={open ? order.indexOf(open) : 0}
          count={order.length}
        />
      )}

      <Modal open={findingsOpen && Boolean(result)} onClose={() => setFindingsOpen(false)} title="findings.md" eyebrow={<Label>{selected}</Label>} className="max-w-3xl">
        {result && (
          <Glass className="p-4">
            <pre className="font-jetbrains text-label leading-7 whitespace-pre-wrap text-white/80">{result.findings}</pre>
          </Glass>
        )}
      </Modal>

      <CommitDialog
        open={confirm}
        onClose={closeConfirm}
        title="Commit the triage?"
        eyebrow={<Label>{selected}</Label>}
        railLabel="triage"
        // Undecided is a third outcome here, not a hatch on "rejected": a
        // strip commit leaves an undecided card's files and rows alone.
        rail={[
          { n: p ? p.counts.kept : counts.kept, tone: "emerald", label: "kept" },
          { n: p ? p.counts.rejected : counts.rejected, tone: "rose", label: "rejected" },
          { n: p ? p.counts.undecided : counts.undecided, tone: "neutral", label: "untouched" },
        ]}
        consequence={
          <>
            Every kept strip&rsquo;s page, style module, poster and sheet are copied into <code>pipeline/foundry/motion-styles/</code> as a candidate. Every rejected strip&rsquo;s video, poster and
            sheet are deleted from disk. Every decided strip gets a row in <code>pipeline/foundry/strips-ledger.json</code>. This cannot be undone.
          </>
        }
        busy={committing}
        preparing={plan.loading}
        confirmLabel={`Keep ${p ? p.counts.kept : counts.kept}, delete ${p ? p.counts.rejected : counts.rejected}`}
        onConfirm={doCommit}
        onCancel={closeConfirm}
      >
        {p && p.delete.length > 0 && <PlanFact label="Media deleted">{p.delete.length} files</PlanFact>}
        {p && p.styles.length > 0 && <PlanFact label="Motion styles">{p.styles.join(", ")}</PlanFact>}
        {plan.error && (
          <div className="mt-4">
            <ErrorNote>Could not prepare the commit: {plan.error}</ErrorNote>
          </div>
        )}
        {commitError && (
          <div className="mt-4">
            <ErrorNote>The commit failed and nothing was deleted: {commitError}</ErrorNote>
          </div>
        )}
      </CommitDialog>
    </div>
  );
}

/** No strip runs at all: where they come from, as the paths themselves. */
function StripsEmpty() {
  return (
    <Glass className="p-8">
      <div className="flex flex-col gap-4">
        <Label>strips</Label>
        <h2 className="font-instrument text-4xl leading-tight text-white">No strip runs yet</h2>
        <div className="flex flex-wrap gap-1.5" aria-hidden>
          <span className="font-jetbrains rounded-full border border-white/10 px-2.5 py-0.5 text-label text-white/45">pipeline/strips/run.mts</span>
          <span className="font-jetbrains rounded-full border border-white/10 px-2.5 py-0.5 text-label text-white/45">foundry-out/strips</span>
        </div>
        <p className="sr-only">No code-rendered strip runs yet.</p>
      </div>
    </Glass>
  );
}
