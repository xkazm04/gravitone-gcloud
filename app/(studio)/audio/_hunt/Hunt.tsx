"use client";

// THE HUNT ON THE AUDIO DESK (owner ruling 2026-10-17: every Sound lab tool is absorbed into
// /audio). An idea -> the text engine drafts a map of axes and leaves -> the operator picks the
// leaves worth paying for -> the receipt prices their seconds of audio -> one job renders them ->
// the heard ones are auditioned side by side on the one transport -> the crown keeps the winner
// (it lands pending on the Arrange board) -> the lesson is signed. v1 app/playground/hunt/
// {index,useHunt,Board,Audition,Lesson}.tsx absorbed; the rules are @gt/ui audio/{hunt,lesson}.ts,
// the writes lib/sound/{huntDesk,huntRender,lessons}.ts.
//
// THE REQUEST POSTURE. Every write is the server's, through one Server Action per gesture, and
// the page re-reads after it (router.refresh): the island holds only what is not the store's - the
// selection, the open lesson draft, which crowns are in flight. v1 held the hunt's whole node list
// here and PATCHed it back per gesture, which is how two gestures overwrote each other.
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { carryFrom, HuntAudition, stepTake } from "@gt/ui/components/audio/HuntAudition.tsx";
import { HuntMap, type PickMods } from "@gt/ui/components/audio/HuntMap.tsx";
import { HuntRenderBar } from "@gt/ui/components/audio/HuntRenderBar.tsx";
import { HuntIdea, HuntShelf } from "@gt/ui/components/audio/HuntShelf.tsx";
import { buildTree, clickSelect, EMPTY_SELECTION, renderPlan, toggleGroup, type AuditionTake, type HuntLeafView, type HuntOpenView, type Selection } from "@gt/ui/components/audio/hunt.ts";
import { evidenceOf, huntLessonBlock, type LessonProposal } from "@gt/ui/components/audio/lesson.ts";
import { LessonForm } from "@gt/ui/components/audio/LessonForm.tsx";
import { LessonList } from "@gt/ui/components/audio/LessonList.tsx";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { useShell } from "../../_shell/Providers.tsx";
import { outcomeOf, useReceipt } from "../../projects/_plan/receipt.tsx";
import { useTransport } from "../_audio/useTransport.ts";
import type { confirmLessonAct } from "../_lessons/acts.ts";
import type { crownTake, draftHuntLesson, draftHuntMap, renderLeaves } from "./acts.ts";
import type { HuntDeskView } from "./read.ts";
import { uploadLeafReturn } from "./returnClient.ts";
import { huntHref } from "./url.ts";
import s from "./hunt.module.css";

export type HuntActs = {
  readonly draftHuntMap: typeof draftHuntMap;
  readonly renderLeaves: typeof renderLeaves;
  readonly crownTake: typeof crownTake;
  readonly draftHuntLesson: typeof draftHuntLesson;
  readonly confirmLessonAct: typeof confirmLessonAct;
};

const opId = (): string => crypto.randomUUID().replace(/-/g, "").slice(0, 20);

type Draft = { readonly proposal: LessonProposal; readonly key: string; readonly draftedBy: string | null; readonly engineError: string | null };

function OpenHunt({ hunt, view, acts, nowMs }: { readonly hunt: HuntOpenView; readonly view: HuntDeskView; readonly acts: HuntActs; readonly nowMs: number }) {
  const router = useRouter();
  const { toast } = useShell();
  const [sel, setSel] = useState<Selection>(EMPTY_SELECTION);
  const [crowning, setCrowning] = useState<ReadonlySet<string>>(new Set());
  const [returning, setReturning] = useState<ReadonlySet<string>>(new Set());
  const [linked, setLinked] = useState(true);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [asking, setAsking] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const transport = useTransport((w) => setRefusal(w));
  const flow = useReceipt(nowMs);

  const tree = useMemo(() => buildTree(hunt.nodes), [hunt.nodes]);
  const order = useMemo(() => tree.leaves.map((l) => l.id), [tree]);
  const plan = useMemo(() => renderPlan(hunt.nodes, sel.ids, (p) => view.reach[p] ?? "none"), [hunt.nodes, sel.ids, view.reach]);
  const heard = useMemo(() => tree.leaves.filter((l) => l.state === "rendered"), [tree]);
  const ev = useMemo(() => evidenceOf(hunt.nodes), [hunt.nodes]);
  const block = huntLessonBlock(hunt.nodes);

  const play = (t: AuditionTake): void => {
    if (t.src !== null) transport.toggle(t.id, t.src);
  };
  const step = (by: -1 | 1): void => {
    const id = stepTake(heard, transport.playing, by);
    const t = id === undefined ? undefined : hunt.takes[id];
    if (t !== undefined && t.src !== null) transport.toggle(t.id, t.src, carryFrom(linked, transport.playing, t.id, transport.position()));
  };

  const fileBack = (leaf: HuntLeafView, file: File): void => {
    if (returning.has(leaf.id)) return;
    setReturning((c) => new Set(c).add(leaf.id));
    void uploadLeafReturn({ hunt: hunt.id, node: leaf.id, file, op: opId() }).then((r) => {
      setReturning((c) => {
        const n = new Set(c);
        n.delete(leaf.id);
        return n;
      });
      if (!r.ok) {
        setRefusal(`${leaf.label} · ${r.error}`);
        return;
      }
      setRefusal(null);
      toast(`${leaf.label} · returned${r.value.created ? "" : " · already filed"}`);
      router.refresh();
    });
  };

  const render = (): void => {
    if (flow.reading || plan.render.length === 0) return;
    const op = opId();
    const leafIds = plan.render.map((l) => l.id);
    void flow.open({
      trail: [{ label: "Audio", href: "/audio" }],
      here: "render hunt leaves",
      armable: true,
      read: async (mode) => {
        const r = await acts.renderLeaves({ huntId: hunt.id, leafIds, mode, opId: op });
        if (!r.ok) return r;
        return r.value.kind === "receipt" ? { ok: true, value: r.value.receipt } : { ok: false, error: { error: "a hunt receipt read answered a confirm", code: "internal" } };
      },
      confirm: async (token, _ceiling, mode) =>
        outcomeOf(await acts.renderLeaves({ huntId: hunt.id, leafIds, mode, opId: op, token }), (v) =>
          v.kind === "stale" ? { kind: "stale", fresh: v.fresh } : v.kind === "receipt" ? { kind: "error", message: "a hunt confirm answered a receipt" } : { kind: "done", note: `hunt · ${v.leaves} leaves · ${v.outcome}${v.reason === undefined ? "" : ` · ${v.reason}`}`, ledger: { href: `/ledger?q=${encodeURIComponent(v.jobId)}`, subject: v.jobId } },
        ),
      done: (note, ledger) => {
        setSel(EMPTY_SELECTION);
        toast(note, ledger);
        router.refresh();
      },
      failed: (message) => toast(message),
    });
  };

  const crown = (leaf: HuntLeafView, takeId: string, on: boolean): void => {
    if (crowning.has(leaf.id)) return;
    setCrowning((c) => new Set(c).add(leaf.id));
    void acts.crownTake({ huntId: hunt.id, nodeId: leaf.id, takeId, on, opId: opId() }).then((r) => {
      setCrowning((c) => {
        const n = new Set(c);
        n.delete(leaf.id);
        return n;
      });
      if (!r.ok) {
        setRefusal(`${leaf.label} · ${r.error.error}`);
        return;
      }
      setRefusal(null);
      toast(on ? `${leaf.label} · crowned${r.value.kept ? " · kept, pending in arrange" : ""}` : `${leaf.label} · crown off${r.value.unkept ? " · unjudged again" : ""}`);
      router.refresh();
    });
  };

  const askLesson = (engine: boolean): void => {
    if (asking) return;
    setAsking(true);
    setSignError(null);
    void acts.draftHuntLesson({ huntId: hunt.id, engine }).then((r) => {
      setAsking(false);
      if (r.ok) setDraft(r.value);
      else setRefusal(r.error.error);
    });
  };

  const sign = (d: Draft, claim: string, technique: readonly string[]): void => {
    if (signing) return;
    setSigning(true);
    const p = d.proposal;
    void acts.confirmLessonAct({ kind: p.kind, source: p.source, provider: p.provider, huntId: p.huntId, claim, technique: [...technique], evidence: { ...p.evidence, takeIds: [...p.evidence.takeIds] }, opId: opId(), key: d.key }).then((r) => {
      setSigning(false);
      if (!r.ok) {
        setSignError(r.error.error);
        return;
      }
      setDraft(null);
      toast(`lesson signed · ${r.value.lesson.id}`);
      router.refresh();
    });
  };

  return (
    <section className={s.hunt} aria-label={hunt.idea}>
      <CapsHeading text={hunt.idea} variant="section" level={2} />
      {refusal !== null && <ErrorLine message={refusal} live />}
      {hunt.measures !== null && <ErrorLine message={`measures: ${hunt.measures}`} />}
      <HuntMap
        nodes={hunt.nodes}
        takes={hunt.takes}
        selection={sel}
        reach={view.reach}
        playing={transport.playing}
        crowning={crowning}
        onPick={(id, mods: PickMods) => setSel((cur) => clickSelect(cur, order, id, mods))}
        onBranch={(ids) => setSel((cur) => toggleGroup(cur, order, ids))}
        onPlay={play}
        onCrown={crown}
        returning={returning}
        onReturn={fileBack}
        onCopy={(text) => void navigator.clipboard.writeText(text).then(() => toast("prompt copied"), (e: unknown) => toast(`clipboard refused: ${e instanceof Error ? e.message : String(e)}`))}
      />
      <HuntRenderBar plan={plan} picked={sel.ids.length} busy={flow.reading || hunt.inFlight} liveBlock={view.liveBlock} onRender={render} onClear={() => setSel(EMPTY_SELECTION)} />
      {heard.length > 0 && (
        <section className={s.huntPart} aria-label="audition">
          <div className={s.huntHead}>
            <CapsHeading text="audition" tally={{ value: heard.length, label: "heard" }} level={3} />
            <Button label="Previous" size="sm" onPress={() => step(-1)} />
            <Button label="Next" size="sm" onPress={() => step(1)} />
            <Chip label="one playhead" pressed={linked} onPress={() => setLinked((v) => !v)} />
          </div>
          <HuntAudition heard={heard} takes={hunt.takes} playing={transport.playing} crowning={crowning} onPlay={play} onCrown={crown} />
        </section>
      )}
      <section className={s.huntPart} aria-label="lesson">
        <CapsHeading text="lesson" level={3} />
        {hunt.lesson !== null ? (
          <LessonList lessons={[{ id: hunt.lesson.id, claim: hunt.lesson.claim, source: "hunt", provider: null, technique: hunt.lesson.technique, n: hunt.lesson.n, keepRate: hunt.lesson.keepRate, meanScore: null, confirmedAt: hunt.lesson.confirmedAt }]} huntHref={(id) => huntHref(view.kind, id)} />
        ) : draft !== null ? (
          <LessonForm key={draft.key + (draft.draftedBy ?? "hand")} proposal={draft.proposal} axes={ev.axes} techniques={ev.techniques} known={view.known} draftedBy={draft.draftedBy} engineError={draft.engineError} busy={signing} error={signError} onSign={(c, t) => sign(draft, c, t)} onDiscard={() => setDraft(null)} />
        ) : block !== null ? (
          <p className={s.wait}>{block}</p>
        ) : (
          <div className={s.huntHead}>
            <Button label={asking ? "Drafting…" : "Draft the lesson"} tone="violet" disabled={asking} onPress={() => askLesson(true)} />
            <Button label="Write it myself" size="sm" disabled={asking} onPress={() => askLesson(false)} />
          </div>
        )}
      </section>
      {flow.sheet}
    </section>
  );
}

export function Hunt({ view, acts, nowMs }: { readonly view: HuntDeskView; readonly acts: HuntActs; readonly nowMs: number }) {
  const router = useRouter();
  const { toast } = useShell();
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = view.open !== null && view.open.ok ? view.open.value.id : null;

  const draft = (idea: string): void => {
    if (drafting) return;
    setDrafting(true);
    setError(null);
    void acts.draftHuntMap({ kind: view.kind, idea, opId: opId() }).then((r) => {
      setDrafting(false);
      if (!r.ok) {
        setError(r.error.error);
        return;
      }
      toast(`map drafted · ${r.value.leaves} leaves`);
      router.push(huntHref(view.kind, r.value.id));
    });
  };

  return (
    <div className={s.section}>
      <HuntIdea kind={view.kind} busy={drafting} error={error} onDraft={draft} />
      {view.open !== null && !view.open.ok && <ErrorLine message={view.open.error} />}
      {view.open !== null && view.open.ok && <OpenHunt key={view.open.value.id} hunt={view.open.value} view={view} acts={acts} nowMs={nowMs} />}
      <section className={s.huntPart} aria-label="hunts">
        <CapsHeading text="hunts" tally={{ value: view.hunts.ok ? view.hunts.value.length : 0 }} level={2} />
        {view.hunts.ok ? view.hunts.value.length === 0 ? <Empty label="no hunts yet" /> : <HuntShelf hunts={view.hunts.value} open={open} hrefOf={(id) => huntHref(view.kind, id)} /> : <ErrorLine message={view.hunts.error} />}
      </section>
    </div>
  );
}
