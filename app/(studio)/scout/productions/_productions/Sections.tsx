"use client";

// The stage pill, the source chip, and the two panels of a finished concept: lessons (spark concept-casting-stages S6: the
// seat's proposal for each dimension, edited or accepted by the operator, each naming what it was drawn from) and the venture
// the production starts or joins. Every refusal is the door's sentence, verbatim. The audio and final-cut panels are ./AudioCut.tsx.

import { useState } from "react";

import type { Receipt as ReceiptValue, ReceiptMode } from "@gt/domain/produce";
import type { ProductionId, ProductionSource } from "@gt/domain/production";
import { productionMachine, type ProductionStage } from "@gt/domain/production.machine";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { Fold } from "@gt/ui/components/fold/Fold.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Receipt } from "@gt/ui/components/produce/Receipt.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import type { StatusEntry } from "@gt/ui/components/status/status.ts";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";

import type { ActionResult } from "../../../../_server/actionCore.ts";
import type { CastLaunchInput, ProductionEntry, ProductionsPort, ProductionsView, VentureWordsInput } from "../_port/contract.ts";
import s from "./productions.module.css";

export type Act = (run: () => Promise<ActionResult<ProductionsView>>) => Promise<string | undefined>;

export const STAGE_PILL: Readonly<Record<ProductionStage, StatusEntry>> = {
  accepted: { look: "idle", label: "accepted" },
  hero: { look: "running", label: "hero shots" },
  rough: { look: "running", label: "rough cut" },
  proven: { look: "candidate", label: "proven" },
  casting: { look: "awaiting", label: "casting" },
  audio: { look: "awaiting", label: "audio" },
  cutting: { look: "running", label: "final cut" },
  done: { look: "done", label: "done" },
  dropped: { look: "failed", label: "dropped" },
};

const STAGES: readonly ProductionStage[] = productionMachine.states.filter((x) => x !== "dropped");
export const reached = (stage: ProductionStage, at: ProductionStage): boolean => stage !== "dropped" && STAGES.indexOf(stage) >= STAGES.indexOf(at);

const SOURCE_WORDS: Readonly<Record<ProductionSource["kind"], string>> = { episode: "episode", "codex-board": "codex board", outline: "outline" };

export function SourceChip({ source }: { readonly source: ProductionSource }) {
  const { kind, ref } = source;
  return <Chip label={SOURCE_WORDS[kind]} value={ref} casing="lower" name={`source: ${SOURCE_WORDS[kind]} ${ref}`} />;
}

type Lesson = ProductionEntry["lessons"][number];

function LessonRow({ entry, lesson, port, act }: { readonly entry: ProductionEntry; readonly lesson: Lesson; readonly port: ProductionsPort; readonly act: Act }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(lesson.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const id = entry.production.id as ProductionId;
  const run = (work: () => Promise<ActionResult<ProductionsView>>): void => {
    setBusy(true);
    setError(undefined);
    void act(work).then((m) => {
      setBusy(false);
      setError(m);
      if (m === undefined) setEditing(false);
    });
  };
  const accepted = lesson.state === "accepted";
  const nothing = lesson.state === "nothing";
  const changed = text.trim() !== lesson.text;
  const save = (): void => run(() => port.editLesson({ id, lessonId: lesson.id, text: text.trim() }));
  const accept = (): void => run(() => port.acceptLesson({ id, lessonId: lesson.id, ...(changed ? { text: text.trim() } : {}) }));
  return (
    <div className={s.lesson} data-lesson={lesson.dimension} data-state={lesson.state}>
      <Chip label={lesson.dimension === "art-style" ? "art style" : lesson.dimension} tone={lesson.dimension === "beats" ? "cyan" : lesson.dimension === "art-style" ? "violet" : "amber"} />
      {editing ? <TextArea label={`${lesson.dimension} lesson`} value={text} rows={3} onChange={setText} /> : <p className={s.words}>{lesson.text}</p>}
      <div className={s.row}>
        {accepted ? <Chip label="accepted" tone="emerald" dot /> : nothing ? <Chip label="nothing to draw from" ghost casing="lower" /> : <Chip label="proposed" tone="amber" casing="lower" />}
        {lesson.dry === true && <Chip label="dry stand-in" ghost casing="lower" name="a dry run wrote this; it cannot be accepted" />}
        {!accepted && !nothing && <Button label={editing ? "Save words" : "Edit"} size="sm" disabled={busy || (editing && (!changed || text.trim() === ""))} onPress={() => (editing ? save() : setEditing(true))} />}
        {!accepted && !nothing && lesson.dry !== true && <Button label="Accept" size="sm" tone="emerald" disabled={busy || text.trim() === ""} onPress={accept} />}
      </div>
      {error !== undefined && <ErrorLine message={error} live />}
      {lesson.proposedText !== undefined && <span className={s.meta}>edited; the seat wrote: {lesson.proposedText}</span>}
      {!nothing && (
        <div className={s.row}>
          <span className={s.meta}>drawn from {lesson.drawnFrom.length} {lesson.drawnFrom.length === 1 ? "piece" : "pieces"} of this production&apos;s record:</span>
          <ul className={s.used}>
            {lesson.drawnFrom.map((d) => (
              <li key={d.ref}>
                {d.ref}: {d.words}
              </li>
            ))}
          </ul>
        </div>
      )}
      {accepted && <span className={s.meta}>feeds this project&apos;s planning and the registry leads</span>}
    </div>
  );
}

const jobLive = (j: { readonly state: string } | undefined): boolean => j?.state === "queued" || j?.state === "running";

/** The operator's "Propose lessons" with its receipt: when the Board-enqueued job failed, or for a dry rehearsal. */
function ProposeLessons({ entry, port, onView }: { readonly entry: ProductionEntry; readonly port: ProductionsPort; readonly onView: (v: ProductionsView) => void }) {
  const [mode, setMode] = useState<ReceiptMode>("dry");
  const [launching, setLaunching] = useState<{ readonly receipt: ReceiptValue; readonly input: CastLaunchInput } | undefined>();
  const [ceiling, setCeiling] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const ask = (input: CastLaunchInput): void => {
    setBusy(true);
    setError(undefined);
    void port.castLaunch(input).then((r) => {
      setBusy(false);
      if (!r.ok) {
        setError(r.error.error);
        return;
      }
      onView(r.value.view);
      if (r.value.launch.kind === "launched") setLaunching(undefined);
      else setLaunching({ receipt: r.value.launch.receipt, input });
    });
  };
  return (
    <div className={s.block}>
      <div className={s.row}>
        <Seg label="mode" options={[{ value: "dry", label: "dry" }, { value: "live", label: "live" }]} value={mode} onChange={(m) => setMode(m as ReceiptMode)} />
        <Button label={busy ? "Reading receipt" : "Propose lessons"} size="sm" tone="cyan" disabled={busy || launching !== undefined} onPress={() => ask({ kind: "lessons", id: entry.production.id as ProductionId, mode })} />
      </div>
      {error !== undefined && <ErrorLine message={error} live />}
      {launching !== undefined && (
        <div className={s.block}>
          <Receipt receipt={launching.receipt} ceiling={ceiling} onCeiling={setCeiling} onConfirm={() => ask({ ...launching.input, token: launching.receipt.token })} busy={busy} nowMs={Date.parse(launching.receipt.readAt)} />
          <Button label="Back" size="sm" disabled={busy} onPress={() => setLaunching(undefined)} />
        </div>
      )}
    </div>
  );
}

export function LessonsPanel({ entry, port, act, onView }: { readonly entry: ProductionEntry; readonly port: ProductionsPort; readonly act: Act; readonly onView: (v: ProductionsView) => void }) {
  if (entry.production.stage !== "done") return null;
  const job = entry.castJobs["lessons"];
  const failed = job !== undefined && (job.state === "failed" || job.state === "interrupted");
  return (
    <div className={s.block} data-lessons={entry.lessons.length}>
      <CapsHeading text="lessons" variant="section" tally={{ value: entry.lessons.filter((l) => l.state === "accepted").length, label: "accepted" }} />
      {entry.lessons.length === 0 ? (
        jobLive(job) ? (
          <div className={s.row} data-job-state={job?.state}>
            <EntryPill entry={{ look: "running", label: job?.step ?? job?.state ?? "running" }} />
            <span className={s.note}>the text seat is reading this production&apos;s record</span>
          </div>
        ) : (
          <>
            {failed && <ErrorLine message={`the lessons job ${job.state}: ${job.error ?? "no sentence"}`} />}
            {!failed && job === undefined && <Empty label="no lessons proposed yet" />}
            <ProposeLessons entry={entry} port={port} onView={onView} />
          </>
        )
      ) : (
        entry.lessons.map((l) => <LessonRow key={l.id} entry={entry} lesson={l} port={port} act={act} />)
      )}
    </div>
  );
}

const WORD_FIELDS: readonly { readonly key: keyof Omit<VentureWordsInput, "name">; readonly label: string; readonly hint: string }[] = [
  { key: "tone", label: "tone", hint: "deadpan, dark" },
  { key: "audience", label: "audience", hint: "who it is for" },
  { key: "format", label: "format", hint: "a 30 s vertical Short" },
  { key: "look", label: "look", hint: "the look in words" },
];

const EMPTY_WORDS: VentureWordsInput = { name: "", tone: "", audience: "", format: "", look: "" };

export function VentureWordsForm({ words, onChange, busy, submit, submitLabel }: { readonly words: VentureWordsInput; readonly onChange: (w: VentureWordsInput) => void; readonly busy: boolean; readonly submit: () => void; readonly submitLabel: string }) {
  const complete = Object.values(words).every((v) => v.trim() !== "");
  return (
    <div className={s.block}>
      <Field label="new venture name" value={words.name} onChange={(name) => onChange({ ...words, name })} placeholder="future channel" />
      {WORD_FIELDS.map((f) => (
        <Field key={f.key} label={f.label} value={words[f.key]} onChange={(v) => onChange({ ...words, [f.key]: v })} placeholder={f.hint} />
      ))}
      <Button label={submitLabel} size="sm" tone="cyan" disabled={busy || !complete} onPress={submit} />
    </div>
  );
}

export function VenturePanel({ entry, view, port, act }: { readonly entry: ProductionEntry; readonly view: ProductionsView; readonly port: ProductionsPort; readonly act: Act }) {
  const p = entry.production;
  const proven = p.takes.some((t) => t.provenAt !== undefined);
  const [join, setJoin] = useState(view.ventures[0]?.id ?? "");
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState<VentureWordsInput>({ ...EMPTY_WORDS, format: `a ${p.board.aspect} video` });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  if (!proven || p.stage === "dropped") return null;
  const id = p.id as ProductionId;
  const run = (work: () => Promise<ActionResult<ProductionsView>>): void => {
    setBusy(true);
    setError(undefined);
    void act(work).then((m) => {
      setBusy(false);
      setError(m);
    });
  };
  if (p.ventureId !== undefined) {
    const name = view.ventures.find((v) => v.id === p.ventureId)?.name ?? p.ventureId;
    return (
      <div className={s.block} data-venture={p.ventureId}>
        <CapsHeading text="venture" variant="section" />
        <Chip label="venture" value={name} tone="emerald" casing="lower" name={`in venture ${name}`} />
      </div>
    );
  }
  return (
    <div className={s.block} data-venture="none">
      <CapsHeading text="start or join a venture" variant="section" />
      {error !== undefined && <ErrorLine message={error} live />}
      {view.ventures.length === 0 ? (
        <Empty label="no live venture to join" />
      ) : (
        <div className={s.row}>
          <Select label="join a venture" options={view.ventures.map((v) => ({ value: v.id, label: v.name }))} value={join} onChange={setJoin} />
          <Button label="Join" size="sm" tone="cyan" disabled={busy || join === ""} onPress={() => run(() => port.joinVenture({ id, ventureId: join }))} />
        </div>
      )}
      <Fold title="Start a new venture from this video" open={open} onToggle={setOpen} level={3}>
        <VentureWordsForm words={words} onChange={setWords} busy={busy} submit={() => run(() => port.startVenture({ id, words: { name: words.name.trim(), tone: words.tone.trim(), audience: words.audience.trim(), format: words.format.trim(), look: words.look.trim() } }))} submitLabel="Start a venture" />
      </Fold>
    </div>
  );
}
