"use client";

// /foundry — where art styles and shot grammar are forged in bulk and culled
// by hand.
//
// Two phases, two halves of this page:
//
//   FORGE   (not here) pipeline/foundry/forge.py runs for hours on the local
//           GPU: reference frames → craft annotation → N styles × M mechanisms
//           of candidates → automatic pre-grade. This page only WATCHES it, by
//           polling the manifest it rewrites after every step.
//   CULL    (here) the human reads the grid, keeps the good, and commits.
//           A commit deletes the rejected files and writes the judgement into
//           the versioned indices — that is the "training" step: the style
//           catalogue and the ledger learn what held, and the findings draft
//           is what the knowledge write-up starts from.
//
// Why a separate module and not a Library tab: the Library holds RATIFIED
// things a project stands on. The foundry is upstream of ratification — most
// of what it produces is meant to be deleted.
//
// VERDICTS ARE IMMEDIATE AND IDEMPOTENT. A keep is a keep however many times
// it is pressed; clearing is its own action (U). The state is applied
// synchronously from a ref — not inside a React updater — so a burst of
// keystrokes cannot read a stale map, and the tile/lightbox re-render before
// the (debounced) save leaves. A COMMITTED run is read-only: its rejected
// files are gone and its rows are in the ledger, so the controls are removed
// rather than left to fail quietly.
//
// THE PAGE IS DRAWN FROM THE KIT ALONE (components/kit): the header and its
// figure, the run list, the strip, the matrix, the dock, the confirm and the
// two full-screen sheets are all kit parts. What is left in this file is
// state: which run, which candidate, which verdicts, and when a save leaves.
//
// OBSIDIAN, NOT ALMANAC (2026-10-04 revert). StudioFrame keeps its plain,
// default Obsidian header; only the kit-built BODY opts into a `WorldRoot`
// (`world="obsidian"`, not the default "almanac") so the same kit parts above
// render in this app's legacy palette instead — `components/ui/tokens.ts`'s
// `WORLD_OBSIDIAN_KIT` and `kit.css`'s widened selectors are what make that
// true. The landing page and /kit's own docs stay Almanac; this route was the
// pilot for recomposing a route from the kit, and it still is — just no
// longer the pilot for the Almanac SKIN specifically.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Button,
  ConfirmDialog,
  Command,
  Count,
  Doc,
  DocLede,
  DocSection,
  Dock,
  DockAction,
  ErrorBox,
  Final,
  Ghost,
  KeyRow,
  Kicker,
  Loading,
  LockNote,
  OpenLink,
  PageHead,
  Report,
  SaveState,
  Sheet,
  SideItem,
  SideList,
  StatusGlyph,
  StatusStrip,
  Tag,
  TabRail,
  Verbatim,
  WorldRoot,
  type Crumb,
  type TabDef,
} from "@/components/kit";
import StudioFrame from "@/components/ui/StudioFrame";
import type { CommitResult, ForgeCommitPlan, RunDetail, RunSummary, Verdict, Verdicts } from "@/lib/foundry/types";
import { usePolling } from "@/lib/usePolling";

import { CullGrid } from "./CullGrid";
import { DojoView } from "./DojoView";
import { ExtractView } from "./ExtractView";
import { Fornax } from "./Fornax";
import { Lightbox } from "./Lightbox";
import { StylesShelf } from "./StylesShelf";
import { fetchExtractRuns } from "./extractClient";
import { commitRun, fetchCatalogue, fetchRun, fetchRuns, fetchTrainingCycles, previewCommit, saveVerdicts } from "./foundryClient";
import { COMMITTABLE, LIVE, STATUS_WORD, runKind } from "./parts";

// THE TABS CARRIED A BLURB AND SO THE BLURB GOT WRITTEN — up to 45 words per
// tab, printed as a paragraph under the row. <TabRail> has no slot for one, on
// purpose (components/ui/signal/README.md). What each blurb was reaching for
// was the STATE behind its tab, and that rides as a <Tally> on the tab itself:
//
//   Cull    how many forge runs there are to read
//   Extract how many extraction runs exist
//   Styles  how big the catalogue is
//   Dojo    how many cycles are parked waiting for a human verdict
//
// The facts the blurbs also carried are recorded where they are enforced
// rather than where they were narrated: a cull DELETES the files it rejects
// (the commit dialog says so, over a rail that draws it), an extraction's kept
// styles join pipeline/foundry/styles.json (the Extract dialog), and a Dojo
// commit deletes decided media keeping one thumbnail per approved improvement
// (the Dojo dialog). Each is a consequence stated at the moment it is ordered.
type Tab = "cull" | "extract" | "styles" | "dojo";

const TAB_LABEL: Record<Tab, string> = { cull: "Cull", extract: "Extract", styles: "Styles", dojo: "Dojo" };

/** The three counts the rail cannot derive from this component's own state.
 *
 *  Each tab's view loads its own list when it opens; this asks for the same
 *  three lists once, at mount, so the rail is honest before anything is
 *  clicked. A list that cannot be read leaves its tally OFF rather than
 *  showing a zero — a zero meaning "we could not ask" is worse than no chip,
 *  and the failure already has a home in each view's own error line. */
function useShelfCounts() {
  const [counts, setCounts] = useState<{ extract?: number; styles?: number; parked?: number }>({});
  useEffect(() => {
    // NO `alive` GUARD, deliberately. Each list is asked for exactly once for
    // the life of the page, so there is no newer response for a late one to
    // overwrite — the race app/_phases/_shared/useLoadFor.ts exists to close
    // cannot arise, and a setState after unmount is a no-op. A REJECTION
    // handler there must be: an unhandled one is picked up by
    // GlobalErrorBridge and announced as the user's work failing to save (the
    // same reasoning as `loadDetail` below).
    const put = (patch: { extract?: number; styles?: number; parked?: number }) => setCounts((c) => ({ ...c, ...patch }));
    const drop = () => undefined;
    fetchExtractRuns().then((r) => put({ extract: r.length }), drop);
    fetchCatalogue().then((c) => put({ styles: c.styles.length }), drop);
    fetchTrainingCycles().then((c) => put({ parked: c.filter((x) => x.status === "awaiting-gate").length }), drop);
  }, []);
  return counts;
}

type SaveKind = "idle" | "saving" | "saved" | "error";

export default function FoundryView() {
  const [tab, setTab] = useState<Tab>("cull");
  const shelf = useShelfCounts();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [verdicts, setVerdicts] = useState<Verdicts>({});
  const [save, setSave] = useState<SaveKind>("idle");
  const [focused, setFocused] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitPlan, setCommitPlan] = useState<ForgeCommitPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [findingsOpen, setFindingsOpen] = useState(false);
  /** A commit that FAILED, shown inside the dialog that asked for it.
   *
   *  The catch used to write `runsError`, which renders beside the run list —
   *  and the confirm dialog is `fixed inset-0 z-50` over a backdrop at 80%
   *  with a blur, carrying `aria-modal="true"`. So the message landed
   *  somewhere the reader could not see it and a screen reader would not
   *  reach: aria-modal removes the rest of the page from the accessibility
   *  tree. The dialog meanwhile went from "committing…" back to its button,
   *  which is indistinguishable from a click that never registered.
   *
   *  This repo has already written the rule down, in
   *  tests/golden-path/dialog-closes-on-success.probe.spec.ts: "closing a
   *  confirmation over work that was not done is the same small lie as a
   *  button that does nothing." Staying open was right; saying nothing was
   *  not. */
  const [commitError, setCommitError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  /** The latest verdict map, readable synchronously — see the header. */
  const verdictsRef = useRef<Verdicts>({});

  const adoptVerdicts = useCallback((v: Verdicts) => {
    verdictsRef.current = v;
    setVerdicts(v);
  }, []);

  /** The newest detail request. A response holding an older ticket is dropped.
   *
   *  THIS USED TO WRITE ONE RUN'S HUMAN VERDICTS ONTO ANOTHER RUN. `loadDetail`
   *  awaited `fetchRun(id)` and applied the result with no check that `id` was
   *  still the selected run. Two paths reach it — `selectRun`, and the 4s poll —
   *  so: click run A, click run B before A's fetch lands, and A's response calls
   *  `adoptVerdicts(A.verdicts)` while `selected` is B. The next verdict edit then
   *  autosaves that map to B (`setVerdict` reads `verdictsRef.current`), and B's
   *  manifest now carries judgements a human made about A. Silent, and the poll
   *  makes the window recur every four seconds rather than once.
   *
   *  A monotonic ticket rather than an `id === selected` comparison, because the
   *  poll re-requests the SAME id: two in-flight loads for one run must still
   *  resolve latest-wins, and comparing ids cannot express that. Same shape as
   *  `claimSaveSlot` in app/_phases/_shared/stepStore.ts, for the same reason —
   *  arrival order is not issue order. The ticket is taken at CALL time and
   *  checked before anything is applied. */
  const detailTicket = useRef(0);

  const loadDetail = useCallback(
    (id: string, keepVerdicts: boolean) => {
      const ticket = ++detailTicket.current;
      // AND A REJECTION PATH, because in this app an unhandled one is not
      // silence -- it is a WRONG MESSAGE. GlobalErrorBridge listens on
      // `unhandledrejection` and reports what it catches as
      // `reportStorageTrouble("write", ...)`, so a failed READ of a run surfaces
      // in the bell as the user's work failing to SAVE, and NotificationBell
      // announces that one assertively (it is the app's only assertive case).
      // On a 4s poll, a foundry that cannot be reached tells a screen-reader
      // user their studio is not saving. `loadRuns` in this same file has
      // always had its handler; this one did not.
      fetchRun(id).then(
        (d) => {
          if (ticket !== detailTicket.current) return;
          setDetail(d);
          if (!keepVerdicts) adoptVerdicts(d.verdicts);
          setRunsError(null);
        },
        (e) => {
          if (ticket !== detailTicket.current) return;
          setRunsError(e instanceof Error ? e.message : "could not load that run");
        },
      );
    },
    [adoptVerdicts],
  );

  // Selecting a run is an event, not a derived state: the reset of the
  // per-run UI happens here, once, in the handler that chose it.
  const selectRun = useCallback(
    (id: string) => {
      setSelected(id);
      setDetail(null);
      setResult(null);
      setFocused(null);
      setOpen(null);
      setFindingsOpen(false);
      setCommitPlan(null);
      setSave("idle");
      loadDetail(id, false);
    },
    [loadDetail],
  );

  const loadRuns = useCallback(() => {
    fetchRuns().then(
      (r) => {
        setRuns(r);
        setRunsError(null);
        setSelected((s) => {
          if (s || !r[0]) return s;
          loadDetail(r[0].id, false);
          return r[0].id;
        });
      },
      (e) => setRunsError(e instanceof Error ? e.message : "failed"),
    );
  }, [loadDetail]);
  useEffect(loadRuns, [loadRuns]);

  // A live run rewrites its manifest after every candidate; poll it — but
  // keep the local verdicts, which are the human's and never the forge's.
  //
  // Through `usePolling`, which pauses while the tab is hidden. This ran every
  // four seconds against a backgrounded tab before, for a run nobody could see —
  // half the load lib/apiAuth.ts sizes its limiter against.
  const live = detail ? LIVE.includes(detail.run.status) : false;
  usePolling(
    () => {
      if (!selected) return;
      loadDetail(selected, true);
      loadRuns();
    },
    4000,
    Boolean(selected) && live,
  );

  const readOnly = detail?.run.status === "committed";

  /** Apply one verdict to one or many candidates. Idempotent; null clears. */
  const setVerdict = useCallback(
    (ids: string | string[], v: Verdict | null) => {
      if (!selected || readOnly) return;
      const list = Array.isArray(ids) ? ids : [ids];
      const at = new Date().toISOString();
      const next = { ...verdictsRef.current };
      for (const id of list) {
        if (v) next[id] = { verdict: v, at };
        else delete next[id];
      }
      adoptVerdicts(next);
      setSave("saving");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      const runId = selected;
      saveTimer.current = window.setTimeout(() => {
        saveVerdicts(runId, next).then(
          () => setSave("saved"),
          () => setSave("error"),
        );
      }, 400);
    },
    [selected, readOnly, adoptVerdicts],
  );

  const order = useMemo(() => detail?.run.candidates.map((c) => c.id) ?? [], [detail]);
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
    const cs = detail?.run.candidates.filter((c) => c.status !== "pending" && c.status !== "failed" && !c.deleted) ?? [];
    const kept = cs.filter((c) => verdicts[c.id]?.verdict === "keep").length;
    const rejected = cs.filter((c) => verdicts[c.id]?.verdict === "reject").length;
    return { total: cs.length, kept, rejected, undecided: cs.length - kept - rejected };
  }, [detail, verdicts]);

  const openConfirm = () => {
    if (!selected) return;
    setConfirm(true);
    setCommitError(null);
    setLoadingPlan(true);
    previewCommit(selected, "reject")
      .then(
        (p) => setCommitPlan(p),
        (e) => setCommitError(e instanceof Error ? e.message : "could not prepare commit plan"),
      )
      .finally(() => setLoadingPlan(false));
  };

  const doCommit = async () => {
    if (!selected) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const r = await commitRun(selected, "reject", commitPlan?.token);
      setResult(r);
      setConfirm(false);
      setCommitPlan(null);
      setOpen(null);
      loadDetail(selected, false);
      loadRuns();
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : "commit failed");
    } finally {
      setCommitting(false);
    }
  };

  const run = detail?.run ?? null;

  /** Why Commit will not go, in one clause — null when it will. The status
   *  half is read from COMMITTABLE, never from an inline status comparison:
   *  tests/golden-path/commit-gate-parity.probe.spec.ts holds that constant
   *  equal to the server's own guard. */
  const blocked = !run
    ? null
    : !COMMITTABLE.includes(run.status)
      ? `run is ${STATUS_WORD[run.status]}`
      : counts.kept === 0
        ? "keep at least one candidate first"
        : null;

  // A tally is left OFF while its count is unknown; `undefined` is not zero.
  // The tone is news, not decoration: amber where something is running or
  // waiting on the human, neutral where it is only an inventory.
  const anyLive = Boolean(runs?.some((r) => LIVE.includes(r.status)));
  const tally = (value: number | undefined, tone: "neutral" | "amber") => (value === undefined ? undefined : { value, tone });
  const tabs: TabDef<Tab>[] = [
    { id: "cull", label: "Cull", testId: "foundry-tab-cull", tally: tally(runs?.length, anyLive ? "amber" : "neutral") },
    { id: "extract", label: "Extract", testId: "foundry-tab-extract", tally: tally(shelf.extract, "neutral") },
    { id: "styles", label: "Styles", testId: "foundry-tab-styles", tally: tally(shelf.styles, "neutral") },
    { id: "dojo", label: "Dojo", testId: "foundry-tab-dojo", tally: tally(shelf.parked, shelf.parked ? "amber" : "neutral") },
  ];

  // WHERE THE READER IS, as a path. Each level but the last steps back: to the
  // module, or out of the candidate / the findings to the run beneath.
  const openCandidate = open && run ? run.candidates.find((c) => c.id === open) : null;
  const closeLevels = () => {
    setOpen(null);
    setFindingsOpen(false);
  };
  const crumbs: Crumb[] = [
    { label: "Door", href: "/" },
    { label: "Foundry", onSelect: closeLevels },
    { label: TAB_LABEL[tab], onSelect: closeLevels },
  ];
  if (tab === "cull" && selected) crumbs.push({ label: selected, onSelect: closeLevels });
  if (tab === "cull" && openCandidate && run)
    crumbs.push({ label: `${run.styles[openCandidate.style]?.name ?? openCandidate.style} · ${openCandidate.mechanism}` });
  if (tab === "cull" && findingsOpen) crumbs.push({ label: "findings.md" });

  const selectTab = (t: Tab) => {
    closeLevels();
    setTab(t);
  };

  return (
    <StudioFrame crumbs={crumbs}>
      <WorldRoot world="obsidian">
      <main tabIndex={-1}>
        <PageHead
          eyebrow="Working surface"
          title="Foundry"
          figure={<Fornax active={tab} onSelect={selectTab} />}
          caption={
            <>
              <span>Fornax · the furnace</span>
              <Tag>stylised</Tag>
            </>
          }
        />
        <TabRail label="foundry modules" tabs={tabs} active={tab} onSelect={selectTab} />

        <section>
          {tab === "styles" ? (
            <StylesShelf />
          ) : tab === "extract" ? (
            <ExtractView />
          ) : tab === "dojo" ? (
            <DojoView />
          ) : (
            <div className="k-two">
              <SideList
                label="Forge runs"
                heading="Runs"
                aside={
                  <>
                    {runsError && (
                      <ErrorBox
                        action={
                          <Button variant="ghost" size="sm" onClick={loadRuns}>
                            Retry
                          </Button>
                        }
                      >
                        {runsError}
                      </ErrorBox>
                    )}
                    {runs && runs.length === 0 && (
                      <>
                        <Command label="none yet — forge one">{`cd pipeline/foundry\npython forge.py plans/dry-run.json`}</Command>
                        <Ghost className="mt-3" shape="row" count={3} label="no runs yet" />
                      </>
                    )}
                  </>
                }
              >
                {runs?.map((r) => (
                  <SideItem
                    key={r.id}
                    glyph={<StatusGlyph kind={runKind(r.status)} decorative />}
                    title={r.id}
                    current={r.id === selected}
                    onSelect={() => selectRun(r.id)}
                    meta={
                      <>
                        {STATUS_WORD[r.status]}
                        {LIVE.includes(r.status) && r.progress.total > 0 ? (
                          <>
                            {" "}
                            <b className="k-num">
                              {r.progress.done}/{r.progress.total}
                            </b>
                          </>
                        ) : null}
                        {" · "}
                        <b className="k-num">
                          {r.kept}/{r.candidates}
                        </b>{" "}
                        kept
                      </>
                    }
                  />
                ))}
              </SideList>

              <div>
                {!run && selected && <Loading />}
                {run && (
                  <>
                    <StatusStrip
                      kind={runKind(run.status)}
                      word={STATUS_WORD[run.status]}
                      progress={LIVE.includes(run.status) ? run.progress : undefined}
                      facts={
                        <>
                          <b>{run.scenes.length}</b> scene{run.scenes.length === 1 ? "" : "s"} · <b>{run.plan.styles.length}</b> styles · <b>{run.plan.mechanisms.length}</b> mechanisms ·{" "}
                          <b>{run.candidates.length}</b> candidates
                          {run.committed && (
                            <>
                              {" "}
                              · committed: <b>{run.committed.kept}</b> kept, <b>{run.committed.deleted}</b> deleted
                            </>
                          )}
                        </>
                      }
                      error={run.error}
                      log={LIVE.includes(run.status) ? run.log[run.log.length - 1]?.msg : null}
                    />
                    {result && (
                      <Report action={<OpenLink onClick={() => setFindingsOpen(true)}>Read findings.md →</OpenLink>}>
                        committed · {result.kept} kept · {result.deleted} deleted · findings.md written
                      </Report>
                    )}
                    <div className="mt-2">
                      <CullGrid
                        run={run}
                        verdicts={verdicts}
                        focused={focused}
                        readOnly={readOnly}
                        onFocus={setFocused}
                        onVerdict={setVerdict}
                        onOpen={setOpen}
                        keysEnabled={!open && !confirm && !findingsOpen}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {run && tab === "cull" && (
          <Dock label="Decisions">
            <Count kind="keep" n={counts.kept} label="kept" />
            <Count kind="reject" n={counts.rejected} label="rejected" />
            <Count kind="undecided" n={counts.undecided} label="undecided" />
            <SaveState state={save} final={readOnly} />
            {!readOnly && (
              <KeyRow
                label="Cull shortcuts"
                map={[
                  { keys: ["←", "→", "↑", "↓"], does: "move" },
                  { keys: ["K"], does: "keep" },
                  { keys: ["X"], does: "reject" },
                  { keys: ["U"], does: "clear" },
                  { keys: ["Enter"], does: "compare" },
                ]}
              />
            )}
            <DockAction>
              {readOnly ? (
                <Final>committed</Final>
              ) : (
                // A DISABLED BUTTON'S REASON IS NOT A HOVER ESSAY. It used to be
                // three sentences of `title=` re-teaching what a failed or
                // incomplete run is — which the status pill on the strip above
                // already says in one word. What is left is the one clause the
                // reader cannot see anywhere else: why THIS button will not go.
                <>
                  {blocked && <LockNote>{blocked}</LockNote>}
                  <Button disabled={Boolean(blocked)} onClick={openConfirm}>
                    Commit the cull
                  </Button>
                </>
              )}
            </DockAction>
          </Dock>
        )}

        {run && (
          <Lightbox
            run={run}
            candidate={open ? (run.candidates.find((c) => c.id === open) ?? null) : null}
            verdict={open ? verdicts[open]?.verdict : undefined}
            readOnly={readOnly}
            onClose={() => setOpen(null)}
            onVerdict={(v) => open && setVerdict(open, v)}
            onStep={stepOpen}
            index={open ? order.indexOf(open) : 0}
            count={order.length}
          />
        )}

        <Sheet open={findingsOpen && Boolean(result)} onClose={() => setFindingsOpen(false)} title="Findings" eyebrow={<Kicker>{selected}</Kicker>}>
          {result && (
            <Doc>
              <DocLede>
                <StatusGlyph kind="committed" decorative />
                {result.kept} kept · {result.deleted} deleted
              </DocLede>
              <DocSection label="findings.md">
                <Verbatim>{result.findings}</Verbatim>
              </DocSection>
            </Doc>
          )}
        </Sheet>

        <ConfirmDialog
          open={confirm}
          onClose={() => {
            if (committing) return;
            setConfirm(false);
            setCommitError(null);
            setCommitPlan(null);
          }}
          title="Commit the cull?"
          eyebrow={<Kicker>{selected}</Kicker>}
          railLabel="commit"
          rail={[
            { n: commitPlan ? commitPlan.counts.kept : counts.kept, tone: "emerald", label: "kept" },
            { n: commitPlan ? commitPlan.counts.deleted : counts.rejected, tone: "rose", label: "rejected" },
            { n: commitPlan ? commitPlan.counts.undecided : counts.undecided, tone: "rose", label: "undecided", hatched: true },
          ]}
          consequence={
            <>
              Everything not kept is deleted from disk. Every decided candidate is written to <code>pipeline/foundry/ledger.json</code> and the style catalogue. This cannot be undone.
              {commitPlan && commitPlan.promotions.length > 0 && (
                <div className="mt-2 text-xs">
                  Promoted to proven: <b>{commitPlan.promotions.join(", ")}</b>
                </div>
              )}
            </>
          }
          busy={committing || loadingPlan}
          confirmLabel={
            loadingPlan
              ? "Preparing..."
              : `Delete ${(commitPlan ? commitPlan.counts.deleted + commitPlan.counts.undecided : counts.rejected + counts.undecided)}, keep ${commitPlan ? commitPlan.counts.kept : counts.kept}`
          }
          onConfirm={doCommit}
          onCancel={() => {
            setConfirm(false);
            setCommitError(null);
            setCommitPlan(null);
          }}
        >
          {commitError && (
            <div className="mt-3">
              <ErrorBox role="alert">The commit failed and nothing was deleted: {commitError}</ErrorBox>
            </div>
          )}
        </ConfirmDialog>
      </main>
      </WorldRoot>
    </StudioFrame>
  );
}
