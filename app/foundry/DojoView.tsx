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
// Drawn from the kit (components/kit), like the rest of /foundry.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Button,
  ConfirmDialog,
  Count,
  Dock,
  DockAction,
  Duo,
  Entry,
  ErrorBox,
  Ghost,
  KeyRow,
  Kicker,
  Loading,
  LockNote,
  Prose,
  Report,
  SaveState,
  SideItem,
  SideList,
  StatusGlyph,
  StatusStrip,
  VerdictKeys,
  VerdictMark,
  ScoreChip,
} from "@/components/kit";
import type { CycleManifest, CycleStatus, Improvement, PairResult, TrainingCommitResult, TrainingCycleSummary, TrainingVerdict, TrainingVerdicts } from "@/lib/foundry/training/types";
import { usePolling } from "@/lib/usePolling";

import { fetchTrainingCycle, fetchTrainingCycles, saveTrainingVerdicts, commitTrainingCycle, fileUrl } from "./foundryClient";
import { DOJO_STATUS_WORD, cycleKind } from "./parts";

/** Statuses the loop is still working — the page only watches these. */
const DOJO_LIVE: CycleStatus[] = ["planning", "generating", "judging"];
/** Statuses a commit is allowed from — see commitCycle in the store. */
const GATEABLE: CycleStatus[] = ["awaiting-gate", "failed"];

type SaveKind = "idle" | "saving" | "saved" | "error";

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

/** The Dojo's verdict words are approve/reject; the kit's are keep/reject. */
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

  return (
    <>
      <div className="k-two">
        <SideList
          label="Training cycles"
          heading="Cycles"
          aside={
            <>
              {listError && (
                <ErrorBox
                  action={
                    <Button variant="ghost" size="sm" onClick={loadCycles}>
                      Retry
                    </Button>
                  }
                >
                  {listError}
                </ErrorBox>
              )}
              {cycles && cycles.length === 0 && <Ghost shape="row" count={3} label="no cycles yet" />}
            </>
          }
        >
          {cycles?.map((c) => (
            <SideItem
              key={c.id}
              glyph={<StatusGlyph kind={cycleKind(c.status)} decorative />}
              title={c.id}
              current={c.id === selected}
              onSelect={() => selectCycle(c.id)}
              meta={
                <>
                  {c.dimension} · {c.subject}
                  <br />
                  {DOJO_STATUS_WORD[c.status]} · {c.media} · <b className="k-num">{c.decided}/{c.improvements}</b> decided
                </>
              }
            />
          ))}
        </SideList>

        <div>
          {!detail && selected && <Loading />}
          {!selected && cycles && cycles.length > 0 && <Ghost shape="card" label="pick a cycle" />}
          {detail && (
            <>
              <StatusStrip
                kind={cycleKind(detail.status)}
                word={DOJO_STATUS_WORD[detail.status]}
                facts={
                  <>
                    {detail.dimension} · {detail.subject} · {detail.media} · <b>{detail.improvements.length}</b> improvement{detail.improvements.length === 1 ? "" : "s"}
                    {typeof detail.costUsd === "number" && <> · ${detail.costUsd.toFixed(2)}</>}
                    {detail.fail_streak > 0 && <> · fail streak {detail.fail_streak}</>}
                  </>
                }
                log={DOJO_LIVE.includes(detail.status) ? detail.log[detail.log.length - 1]?.msg : null}
              />
              {result && (
                <Report>
                  committed · {result.deleted} media file{result.deleted === 1 ? "" : "s"} deleted · {result.thumbs.length} thumb{result.thumbs.length === 1 ? "" : "s"} kept in git · {result.ledger_rows} ledger row
                  {result.ledger_rows === 1 ? "" : "s"}
                </Report>
              )}
              <div className="k-stack mt-5">
                {detail.improvements.length === 0 && <Ghost shape="slot" label="no improvements claimed yet" />}
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
              </div>
            </>
          )}
        </div>
      </div>

      {detail && gateable && (
        <Dock label="Decisions">
          <Count n={counts.decided} of={counts.total} label="decided" />
          <Count kind="keep" n={counts.approved} label="approved" />
          <Count kind="reject" n={counts.rejected} label="rejected" />
          <SaveState state={save} />
          <KeyRow
            label="Gate shortcuts"
            map={[
              { keys: ["↑", "↓"], does: "cards" },
              { keys: ["K"], does: "approve" },
              { keys: ["X"], does: "reject" },
              { keys: ["U"], does: "clear" },
            ]}
          />
          <DockAction>
            {counts.decided === 0 && <LockNote>decide one improvement first</LockNote>}
            <Button disabled={counts.decided === 0} onClick={() => setConfirm(true)}>
              Commit the gate
            </Button>
          </DockAction>
        </Dock>
      )}

      <ConfirmDialog
        open={confirm}
        onClose={() => {
          if (committing) return;
          setConfirm(false);
          setCommitError(null);
        }}
        title="Commit the gate?"
        eyebrow={<Kicker>{selected}</Kicker>}
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
          <div className="mt-3">
            <ErrorBox role="alert">The commit failed and nothing was deleted: {commitError}</ErrorBox>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

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
    <Entry
      id={`imp-${imp.id.replace(/[^A-Za-z0-9_-]/g, "_")}`}
      label={imp.technique}
      focused={focused}
      verdict={kit}
      onFocus={onFocus}
      title={imp.technique}
      lede={
        <>
          <div className="mt-2">
            <Prose ink>{imp.claim}</Prose>
          </div>
          <div className="k-muted mt-1">challenges: {imp.standard}</div>
        </>
      }
      aside={
        <>
          <ScoreChip label={`judge ${challengerPicks}/${(imp.pairs ?? []).length}`} value={rate} />
          {gem !== undefined && <ScoreChip label="gemini agrees" value={gem} />}
          {kit && <VerdictMark verdict={kit} keepWord="APPROVED" />}
          {!readOnly && <VerdictKeys value={kit} keepWord="Approve" subject={imp.technique} clear onVerdict={(v) => onVerdict(fromKit(v))} />}
        </>
      }
    >
      {/* The pair wall — the evidence, one seed-matched duo per pair. */}
      <div className="k-pwall">
        {(imp.pairs ?? []).map((pair) => (
          <PairDuo key={pair.id} cycleId={cycleId} pair={pair} />
        ))}
      </div>
    </Entry>
  );
}

function PairDuo({ cycleId, pair }: { cycleId: string; pair: PairResult }) {
  const disagrees = pair.gemini_pick !== undefined && pair.gemini_pick !== pair.judge_pick;
  const arm = (name: "baseline" | "challenger", ref_: PairResult["baseline"]) => ({
    name,
    alt: `${name} · ${ref_.file}`,
    // Honest absence: the commit unlinked this file; the record stays.
    src: ref_.deleted ? undefined : fileUrl(cycleId, ref_.poster ?? ref_.file, "training"),
    picked: pair.judge_pick === name,
    video: ref_.kind === "video",
  });
  return (
    <Duo
      scene={pair.scene}
      seed={pair.seed}
      arms={[arm("baseline", pair.baseline), arm("challenger", pair.challenger)]}
      judge={{ pick: pair.judge_pick, reason: pair.reason }}
      dissent={disagrees ? { who: "gemini", pick: String(pair.gemini_pick), reason: pair.gemini_reason } : undefined}
    />
  );
}
