"use client";

// THE PART EDITOR ISLAND: holds the part's view, sends every edit as an op at the view's rev, and
// routes to the editor the part's kind calls for. One door for writes (registry draft-editing/
// draft-model): an op, an undo and an act each answer the view as the server now reads it, which
// REPLACES this copy - so the verdict chip, the tabs, the rail and the inspector move together
// with the edit that moved them, and nothing here derives a verdict.
//
//   · A stale rev answers `conflict` with the current view: the editor redraws from it, says so on
//     the error line, and the operator decides again - never a silent re-apply.
//   · One write in flight (a ref, disarmed synchronously - registry async-ui-states/action-busy-
//     states): a second X pressed before the first answers is declined, not queued against a rev
//     that is about to be stale.
//   · Acts go through the ONE receipt flow the Plan uses (../../../_plan/receipt.tsx): read the
//     price, ⏎ confirms with the token, a stale confirm shows the fresh receipt.

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { Receipt } from "@gt/domain/produce";
import type { PartActKind, PartOp, PartReceipt, PartView } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { stepTab } from "@gt/ui/components/part/part.ts";
import type { PartWorkspaceProps } from "@gt/ui/components/part/PartWorkspace.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import { useShell } from "../../../../_shell/Providers.tsx";
import { outcomeOf, useReceipt } from "../../../_plan/receipt.tsx";
import type { PartPort } from "../../_part/contract.ts";
import { ResearchEditor } from "./Research.tsx";
import { ScriptEditor } from "./Script.tsx";
import { LaterEditor } from "./editors.tsx";

/** The frame every editor hands to PartWorkspace; the editor adds its rail, primary, inspector. */
export type Frame = Omit<PartWorkspaceProps, "rail" | "primary" | "inspector" | "mode" | "facts">;
/** Send an op at the view's rev; `then` runs once it APPLIED (not on a refusal or a conflict) -
 *  the voice editor's ask-then-act (an op that must land before the act that reads it). */
export type Send = (op: PartOp, then?: () => void) => void;
/** Launch an act through the receipt flow; `target` names one unit for a per-unit act. */
export type Launch = (act: PartActKind, label: string, target?: string) => void;
export type EditorProps<V> = { readonly view: V; readonly frame: Frame; readonly send: Send; readonly busy: boolean; readonly error: string | null; readonly act: Launch };

/** A part receipt drawn by the produce Receipt: the same lines, about this project at this rev.
 *  (Asked of the Director: a `part` ReceiptSubject in @gt/domain/produce retires this.) */
const asReceipt = (r: PartReceipt): Receipt => ({ ...r, subject: { kind: "project", id: r.subject.projectId, rev: r.subject.rev } });

const hrefOf = (projectId: string, key: string): string => `/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(key)}`;

export function PartEditor({ first, port, nowMs }: { readonly first: PartView; readonly port: PartPort; readonly nowMs: number }) {
  const router = useRouter();
  const { toast } = useShell();
  const [view, setView] = useState(first);
  const [seen, setSeen] = useState(first);
  if (seen !== first) {
    // The server read again (a navigation between parts): its copy is the truth.
    setSeen(first);
    setView(first);
  }
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);
  const flow = useReceipt(nowMs);
  const at = { projectId: view.projectId, key: view.key };

  const write = async (run: () => ReturnType<PartPort["opPart"]>): Promise<boolean> => {
    if (inflight.current) return false;
    inflight.current = true;
    setBusy(true);
    try {
      const r = await run();
      if (!r.ok) {
        setError(r.error.error);
        return false;
      }
      if (r.value.kind === "conflict") {
        setView(r.value.current);
        setError("changed elsewhere — redrawn as it is now");
        return false;
      }
      setView(r.value.view);
      setError(null);
      return true;
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  };

  const send: Send = (op, then) =>
    void write(() => port.opPart({ ...at, baseRev: view.rev, op })).then((applied) => {
      if (applied) then?.();
    });
  const undo = (): void | false => {
    if (view.ops.length === 0 || inflight.current) return false;
    void write(() => port.undoPart({ ...at, baseRev: view.rev }));
  };

  const trail = [
    { label: "Projects", href: "/projects/runs" },
    { label: view.project.title, href: `/projects/${encodeURIComponent(view.projectId)}` },
  ];

  const launch: Launch = (act, label, target) => {
    void flow.open({
      trail,
      here: `${view.key} · ${label}`,
      read: async () => {
        const r = await port.actReceipt({ ...at, act, ...(target === undefined ? {} : { target }) });
        return r.ok ? { ok: true, value: asReceipt(r.value) } : r;
      },
      confirm: async (token) =>
        outcomeOf(await port.act({ ...at, act, token, ...(target === undefined ? {} : { target }) }), (v) => {
          if (v.kind === "stale") return { kind: "stale", fresh: asReceipt(v.fresh) };
          setView(v.view);
          return { kind: "done", note: `${label} · ${v.jobId}`, ledger: { href: `/ledger?q=${encodeURIComponent(v.jobId)}`, subject: v.jobId } };
        }),
      done: (note, ledger) => toast(note, ledger),
      failed: (m) => setError(m),
    });
  };

  const frame: Frame = {
    trail,
    here: view.tabs.find((t) => t.key === view.key)?.label ?? view.key,
    verdict: view.verdict,
    acts: (
      <>
        {/* A disarmed act is not a control: it is drawn as the state it waits on (what it
            needs), and becomes a button when it can run. */}
        {view.acts.map((a) =>
          a.needs.length > 0 ? (
            <Chip key={a.act} label={a.label} value={`needs ${a.needs.join(" · ")}`} tone="amber" casing="lower" />
          ) : (
            <Button key={a.act} label={a.label} size="sm" tone="cyan" onPress={() => launch(a.act, a.label)} />
          ),
        )}
      </>
    ),
    undo: { last: view.ops[0]?.label ?? null, busy, onUndo: () => void undo() },
    tabs: view.tabs,
    current: view.key,
    href: (key) => hrefOf(view.projectId, key),
    upstream: view.upstream.missing.map((m) => m.label),
  };

  return (
    <>
      <PartKeys
        onTab={(dir) => {
          const t = stepTab(view.tabs, view.key, dir);
          if (t === null) return false;
          router.push(hrefOf(view.projectId, t.key));
        }}
        onUndo={undo}
      />
      {view.kind === "research" ? (
        <ResearchEditor key={view.partId} view={view} frame={frame} send={send} busy={busy} error={error} act={launch} />
      ) : view.kind === "script" ? (
        <ScriptEditor key={view.partId} view={view} frame={frame} send={send} busy={busy} error={error} act={launch} />
      ) : (
        <LaterEditor key={view.partId} view={view} frame={frame} send={send} busy={busy} error={error} act={launch} />
      )}
      {flow.sheet}
    </>
  );
}

/** The frame's own keys. Rendered BEFORE the editor so the editor's mode mounts last and is the
 *  page's mode (keymap/route.ts `pageMode`: the most recent scope); these rows are still reached
 *  through it, `part` being its parent mode. */
function PartKeys({ onTab, onUndo }: { readonly onTab: (dir: 1 | -1) => void | false; readonly onUndo: () => void | false }) {
  const blur = (): void => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };
  useKeys("part", {
    tab: ({ index }) => onTab(index === 0 ? -1 : 1),
    undo: () => onUndo(),
    "leave-field": blur,
    "commit-field": blur,
  });
  return null;
}
