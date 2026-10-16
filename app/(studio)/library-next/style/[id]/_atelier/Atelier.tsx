"use client";

// THE ATELIER ISLAND: holds one style's view, sends every edit as an op at the view's rev, and
// launches the two acts that call out through the ONE receipt flow the Plan and the part editors
// use (../../../../projects/_plan/receipt.tsx). One door for writes (registry draft-editing/
// draft-model): an op and an act each answer the view as the server now reads it, which REPLACES
// this copy - the ratchet, the gate's sentence, the matrix and the sheet move together with the
// write that moved them, and nothing here derives a gate.
//
//   · A stale rev answers `conflict` with the current view: redrawn from it, said on the error
//     line, and the operator decides again - never a silent re-apply.
//   · A `refused` op is the ratchet's own sentence (a lock is one-way; a locked block is frozen;
//     the gate does not hold yet), drawn verbatim on the error line, with the view as it is.
//   · One write in flight (a ref, disarmed synchronously - registry async-ui-states/action-busy-
//     states): a second A pressed before the first answers is declined, not queued against a rev
//     that is about to be stale.
//   · Reject asks for its reason first (visual-style-locking/rejections-as-negative-evidence):
//     R opens the plate's note, ⏎ lands the rejection with it, Esc leaves it undecided.
//   · A duplicate answers the new style's id; the atelier moves to it (the only way to change a
//     locked look - v1 SpecEditor: "the move is to duplicate, not to edit history").
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { ProofState, StyleAct, StyleOp, StyleView } from "@gt/domain/styleView";
import { STYLE_TRIALS } from "@gt/domain/style.ratchet";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Crumbs } from "@gt/ui/components/crumbs/Crumbs.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Keycaps } from "@gt/ui/components/keycaps/Keycaps.tsx";
import { StatusPill } from "@gt/ui/components/status/StatusPill.tsx";
import { ProofSheet, type ProofNoting } from "@gt/ui/components/style/ProofSheet.tsx";
import { EvidenceTable, PlateStrip } from "@gt/ui/components/style/StyleFacts.tsx";
import { TrialMatrix } from "@gt/ui/components/style/TrialMatrix.tsx";
import { stepProof } from "@gt/ui/components/style/style.ts";
import { useKeys } from "@gt/ui/keymap/dispatch";

import { useShell } from "../../../../_shell/Providers.tsx";
import { outcomeOf, useReceipt } from "../../../../projects/_plan/receipt.tsx";
import type { StylePort } from "../../_port/contract.ts";
import { Dossier } from "./Dossier.tsx";
import { srcOf } from "./src.ts";
import s from "./Atelier.module.css";

const hrefOf = (id: string): string => `/library-next/style/${encodeURIComponent(id)}`;
const TRAIL = [{ label: "Library", href: "/library-next" }, { label: "Styles", href: "/library-next?kind=style" }];

export function Atelier({ first, port, nowMs }: { readonly first: StyleView; readonly port: StylePort; readonly nowMs: number }) {
  const router = useRouter();
  const { toast } = useShell();
  const [view, setView] = useState(first);
  const [seen, setSeen] = useState(first);
  if (seen !== first) {
    // The server read again (a navigation to another style): its copy is the truth.
    setSeen(first);
    setView(first);
  }
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState<string | null>(null);
  const [noting, setNoting] = useState<ProofNoting | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const inflight = useRef(false);
  const flow = useReceipt(nowMs);

  const locked = view.status === "locked";
  const canGenerate = view.block !== null && !view.sheet.full;

  // Focus once per opened note (keyed by the plate, not the text, so typing does not refocus).
  const notingId = noting?.id ?? null;
  useEffect(() => {
    if (notingId === null) return;
    document.querySelector<HTMLInputElement>('[data-keyfield="proof-note"]')?.focus();
  }, [notingId]);

  const send = async (op: StyleOp): Promise<boolean> => {
    if (inflight.current) return false;
    inflight.current = true;
    setBusy(true);
    try {
      const r = await port.opStyle({ styleId: view.id, baseRev: view.rev, op });
      if (!r.ok) {
        setError(r.error.error);
        return false;
      }
      const out = r.value;
      setView(out.view);
      if (out.kind === "conflict") {
        setError("changed elsewhere — redrawn as it is now");
        return false;
      }
      if (out.kind === "refused") {
        setError(out.reason);
        return false;
      }
      setError(null);
      if (out.created !== undefined) {
        toast(`duplicated · ${out.created}`);
        router.push(hrefOf(out.created));
      }
      return true;
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  };

  const judge = (id: string, state: ProofState): void => {
    if (state === "rejected") {
      setHeld(id);
      setNoting({ id, note: "" });
      return;
    }
    void send({ kind: "judge-proof", proofId: id, state });
  };

  const attach = (): void | false => {
    if (noting === null || noting.note.trim() === "") return false;
    const { id, note } = noting;
    void send({ kind: "judge-proof", proofId: id, state: "rejected", note: note.trim() }).then((done) => {
      if (done) setNoting(null);
    });
  };

  const launch = (act: StyleAct, label: string): void => {
    void flow.open({
      trail: TRAIL,
      here: `${view.name} · ${label}`,
      armable: true,
      read: (mode) => port.actReceipt({ act, mode }),
      confirm: async (token, _ceiling, mode) =>
        outcomeOf(await port.act({ act, mode, token }), (v) => {
          if (v.kind === "stale") return { kind: "stale", fresh: v.fresh };
          setView(v.view);
          setChosen(new Set());
          setError(null);
          return { kind: "done", note: `${label} · ${v.jobId}`, ledger: { href: `/ledger?q=${encodeURIComponent(v.jobId)}`, subject: v.jobId } };
        }),
      done: (note, ledger) => toast(note, ledger),
      failed: (m) => setError(m),
    });
  };

  const adopt = (): void => launch({ kind: "adopt", fromStyleId: view.id }, "adopt");

  const generate = (): void | false => {
    if (!canGenerate || chosen.size === 0) return false;
    const trialIds = STYLE_TRIALS.filter((t) => chosen.has(t.id)).map((t) => t.id);
    launch({ kind: "generate-proofs", styleId: view.id, baseRev: view.rev, trialIds }, `render ${trialIds.length}`);
  };

  const ids = view.proofs.map((p) => p.id);
  const facts = [
    ...(held !== null ? ["proof"] : []),
    ...(held !== null && !locked ? ["judge"] : []),
    ...(canGenerate && chosen.size > 0 ? ["chosen"] : []),
    ...(view.lock.can ? ["lockable"] : []),
  ];
  useKeys(
    "style",
    {
      item: ({ index }) => {
        const next = stepProof(ids, held, index === 0 ? 1 : -1);
        if (next === null) return false;
        setHeld(next);
        document.querySelector(`[data-proof="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" });
      },
      approve: () => (held === null ? false : judge(held, "approved")),
      reject: () => (held === null ? false : judge(held, "rejected")),
      undecide: () => (held === null ? false : judge(held, "pending")),
      generate,
      lock: () => void send({ kind: "lock" }),
      deselect: () => setHeld(null),
      attach,
      "leave-field": () => {
        if (noting !== null) setNoting(null);
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      },
    },
    { facts },
  );

  const choose = (trialId: string): void =>
    setChosen((cur) => {
      const next = new Set(cur);
      if (next.has(trialId)) next.delete(trialId);
      else next.add(trialId);
      return next;
    });

  return (
    <div className={s.ws} data-component="Atelier" data-style={view.id} data-rev={view.rev}>
      <header className={s.head}>
        <div className={s.crumbs}>
          <Crumbs trail={TRAIL} here={view.name} />
        </div>
        <StatusPill machine="style" state={view.status} />
        <div className={s.acts}>
          {view.status === "proven" && view.block === null && <Button label="adopt" tone="cyan" size="sm" onPress={adopt} />}
          {canGenerate && chosen.size > 0 && <Button label={`render ${chosen.size}`} tone="cyan" size="sm" onPress={() => void generate()} shortcut={{ mode: "style", verb: "generate" }} />}
          {view.lock.can ? (
            <Button label="lock" tone="emerald" size="sm" onPress={() => void send({ kind: "lock" })} disabled={busy} shortcut={{ mode: "style", verb: "lock" }} />
          ) : (
            !locked && view.block !== null && <Chip label="lock" value="held" tone="amber" name={`lock held: ${view.lock.blocker ?? ""}`} />
          )}
          {view.block !== null && <Button label="duplicate" size="sm" onPress={() => void send({ kind: "duplicate" })} disabled={busy} />}
        </div>
      </header>
      <div className={s.body}>
        <main className={s.primary}>
          {error !== null && <ErrorLine message={error} live />}
          {view.block === null ? (
            view.status === "proven" ? (
              <Empty label="no look yet" action={{ label: "adopt", tone: "cyan", onPress: adopt }} />
            ) : (
              <Empty label="no look yet — not proven at the Weir" />
            )
          ) : (
            <>
              <CapsHeading text="trials" variant="section" level={2} tally={{ value: view.coverage.filter((c) => c.covered).length, of: view.coverage.length, label: "covered" }} />
              <TrialMatrix
                trials={STYLE_TRIALS}
                coverage={view.coverage}
                proofs={view.proofs}
                srcOf={srcOf}
                onHold={setHeld}
                {...(canGenerate ? { chosen, onChoose: choose } : {})}
              />
              <CapsHeading text="proof sheet" variant="section" level={2} tally={{ value: view.proofs.length, label: "plates" }} />
              {view.proofs.length === 0 ? (
                <Empty label="no plates yet" />
              ) : (
                <ProofSheet
                  proofs={view.proofs}
                  sheet={view.sheet}
                  srcOf={srcOf}
                  held={held}
                  onHold={setHeld}
                  {...(locked ? {} : { onJudge: judge })}
                  noting={noting}
                  onNote={(note) => setNoting((cur) => (cur === null ? cur : { ...cur, note }))}
                  onAttach={() => void attach()}
                  onCancelNote={() => setNoting(null)}
                  busy={busy}
                />
              )}
            </>
          )}
          {view.evidence.length > 0 && (
            <>
              <CapsHeading text="evidence" variant="section" level={2} tally={{ value: view.keptCells, label: "kept cells" }} />
              <EvidenceTable rows={view.evidence} />
            </>
          )}
          {view.exemplars.length > 0 && (
            <>
              <CapsHeading text="exemplars" variant="section" level={2} tally={{ value: view.exemplars.length }} />
              <PlateStrip exemplars={view.exemplars} srcOf={srcOf} />
            </>
          )}
        </main>
        <Dossier view={view} busy={busy} send={(op) => void send(op)} />
      </div>
      <footer className={s.foot}>
        <Keycaps mode="style" label="atelier keys" facts={new Set(facts)} />
      </footer>
      {flow.sheet}
    </div>
  );
}
