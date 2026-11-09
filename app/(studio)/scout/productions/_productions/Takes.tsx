"use client";

// A concept's real work (spark concept-casting-stages S1): Start, frames, launch, progress, compare, proven, drop. Every
// refusal is the door's sentence, verbatim. Below it, the later stages stay scripted until S2-S6: clearly marked, and
// nothing they do is written anywhere.

import { useReducer, useState } from "react";

import type { Receipt as ReceiptValue, ReceiptMode } from "@gt/domain/produce";
import type { ProductionId, ProductionTake, TakeKind } from "@gt/domain/production";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate } from "@gt/ui/components/desk/Plate.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { TextArea } from "@gt/ui/components/field/Field.tsx";
import { Fold } from "@gt/ui/components/fold/Fold.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Receipt } from "@gt/ui/components/produce/Receipt.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";

import type { ActionResult } from "../../../../_server/actionCore.ts";
import type { KeptConcept, ProductionEntry, ProductionsPort, ProductionsView, TakeLaunchView, TakeRequestInput } from "../_port/contract.ts";
import s from "./productions.module.css";
import { AudioBlock, CastingBlock, CutBlock, LessonsBlock, SourceChip, STAGE_PILL, VentureBlock } from "./Sections.tsx";
import { initialScript, scriptReducer } from "./script.ts";

type Act = (run: () => Promise<ActionResult<ProductionsView>>) => Promise<string | undefined>;

const ORDINAL = (i: number): string => (i === 0 ? "first" : "last");

function ActError({ message }: { readonly message: string | undefined }) {
  return message === undefined ? null : <ErrorLine message={message} live />;
}

export function ConceptInspector({ concept, port, act, onStarted }: { readonly concept: KeptConcept; readonly port: ProductionsPort; readonly act: Act; readonly onStarted: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const start = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const message = await act(async () => {
      const r = await port.start({ source: concept.source });
      if (r.ok) {
        const started = r.value.entries.find((e) => e.production.source.kind === concept.source.kind && e.production.source.ref === concept.source.ref);
        if (started !== undefined) onStarted(started.production.id);
      }
      return r;
    });
    setBusy(false);
    setError(message);
  };
  return (
    <div className={s.detail} data-concept={`${concept.source.kind}:${concept.source.ref}`}>
      <div className={s.detailHead}>
        <h2 className={s.title}>{concept.title}</h2>
        <Chip label="kept, not started" tone="amber" casing="lower" />
      </div>
      <div className={s.block}>
        <p className={s.words}>{concept.logline}</p>
        {concept.beats.length > 0 && (
          <ol className={s.beats}>
            {concept.beats.map((b, i) => (
              <li key={i} className={s.meta}>{b}</li>
            ))}
          </ol>
        )}
        <div className={s.row}>
          <SourceChip source={concept.source} />
          <Button label={busy ? "Starting" : "Start"} size="sm" tone="emerald" disabled={busy} onPress={() => void start()} />
          <span className={s.note}>nothing starts itself</span>
        </div>
        <ActError message={error} />
      </div>
    </div>
  );
}

function FrameRow({ entry, chosen, onToggle, disabled }: { readonly entry: ProductionEntry; readonly chosen: readonly string[]; readonly onToggle: (id: string) => void; readonly disabled: boolean }) {
  return (
    <div className={s.frames}>
      {entry.frames.map((f) => {
        const at = chosen.indexOf(f.id);
        return (
          <button type="button" key={f.id} className={s.frame} aria-pressed={at !== -1} disabled={disabled} onClick={() => onToggle(f.id)} data-frame={f.id}>
            <Plate src={f.src} alt={f.beat} className={s.plate} lazy />
            <span className={s.meta}>{f.beat}</span>
            {at !== -1 && <Chip label={ORDINAL(at)} tone="cyan" casing="lower" />}
          </button>
        );
      })}
    </div>
  );
}

const PROVEN_FROM = new Set<string>(["hero", "rough"]);

function TakeCard({ take, entry, onProve, busy }: { readonly take: ProductionTake; readonly entry: ProductionEntry; readonly onProve: () => void; readonly busy: boolean }) {
  const progress = entry.progress[take.id];
  const canProve = PROVEN_FROM.has(entry.production.stage) && take.state === "ready" && take.provenAt === undefined && take.stale !== true;
  return (
    <div className={s.take} data-take={take.id}>
      {take.state === "ready" && take.dry !== true && take.video !== undefined ? (
        <video className={s.plate} src={take.video} poster={take.poster} controls preload="metadata" />
      ) : (
        <Plate src={take.poster} alt={`${take.kind} take`} className={s.plate} lazy />
      )}
      <div className={s.row}>
        <Chip label={take.id} casing="lower" />
        <Chip label={take.kind === "hero" ? "hero" : "rough cut"} tone={take.kind === "hero" ? "cyan" : "violet"} />
        {take.provenAt !== undefined && <Chip label="proven" tone="emerald" dot />}
        {take.dry === true && <Chip label="dry stand-in" ghost casing="lower" name="dry run: no render happened" />}
        {take.state !== "ready" && <EntryPill entry={take.state === "failed" ? { look: "failed", label: "failed" } : { look: "running", label: "rendering" }} />}
      </div>
      {take.state === "rendering" && (
        <span className={s.meta} data-progress={take.id}>
          {progress === undefined ? "the job is not readable yet" : progress.jobState === "queued" ? "queued for the worker on gpu.local" : `${progress.step ?? progress.jobState} · ${progress.done}/${progress.total || "?"}`}
        </span>
      )}
      <span className={s.meta}>{take.beats.join(" · ")}</span>
      {take.error !== undefined && <ErrorLine message={take.error} />}
      <Facts facts={[{ term: "seed", value: take.seed }, { term: "engine", value: take.engine }, { term: "frames", value: take.frames.join(", ") }, ...(take.durationS === undefined ? [] : [{ term: "length", value: `${take.durationS.toFixed(1)} s` }]), ...(take.gpuSeconds === undefined ? [] : [{ term: "gpu", value: take.dry === true ? "0 s (dry)" : `${Math.round(take.gpuSeconds)} s` }])]} />
      <details className={s.promptOf}>
        <summary className={s.meta}>prompt</summary>
        <span className={s.script}>{take.prompt}</span>
      </details>
      {canProve && <Button label="Mark proven" size="sm" tone="emerald" disabled={busy} onPress={onProve} />}
    </div>
  );
}

type Launching = { readonly receipt: ReceiptValue; readonly kind: TakeKind; readonly frames: readonly string[]; readonly prompt?: string; readonly mode: ReceiptMode };

export function ProductionInspector({ entry, port, act, onView }: { readonly entry: ProductionEntry; readonly port: ProductionsPort; readonly act: Act; readonly onView: (v: ProductionsView) => void }) {
  const p = entry.production;
  const id = p.id as ProductionId;
  const [frames, setFrames] = useState<readonly string[]>(entry.frames[0] === undefined ? [] : [entry.frames[0].id]);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<ReceiptMode>("dry");
  const [launching, setLaunching] = useState<Launching | undefined>();
  const [ceiling, setCeiling] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const stage = p.stage;
  const live = stage === "accepted" || stage === "hero" || stage === "rough";
  const heroReady = p.takes.some((t) => t.kind === "hero" && t.state === "ready");

  const toggleFrame = (f: string): void => {
    setFrames((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : cur.length >= 2 ? [cur[0] ?? f, f] : [...cur, f]));
  };

  const ask = async (input: TakeRequestInput, label: Omit<Launching, "receipt">): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const r = await port.launch(input);
    setBusy(false);
    if (!r.ok) {
      setError(r.error.error);
      return;
    }
    const v: TakeLaunchView = r.value;
    onView(v.view);
    if (v.launch.kind === "launched") setLaunching(undefined);
    else setLaunching({ receipt: v.launch.receipt, ...label });
  };

  const request = (kind: TakeKind): void => {
    const input: TakeRequestInput = { id, kind, frames: kind === "hero" ? frames : [], ...(prompt.trim() === "" ? {} : { prompt: prompt.trim() }), mode };
    void ask(input, { kind, frames: input.frames, ...(input.prompt === undefined ? {} : { prompt: input.prompt }), mode });
  };

  const confirm = (): void => {
    if (launching === undefined) return;
    const { receipt, kind, frames: f, prompt: pr, mode: m } = launching;
    void ask({ id, kind, frames: f, ...(pr === undefined ? {} : { prompt: pr }), mode: m, token: receipt.token }, { kind, frames: f, ...(pr === undefined ? {} : { prompt: pr }), mode: m });
  };

  const prove = (takeId: string): void => {
    setBusy(true);
    setError(undefined);
    void act(() => port.proven({ id, takeId })).then((m) => {
      setBusy(false);
      setError(m);
    });
  };

  const drop = (): void => {
    setBusy(true);
    setError(undefined);
    void act(() => port.drop({ id })).then((m) => {
      setBusy(false);
      setError(m);
    });
  };

  const casting = (): void => {
    setBusy(true);
    setError(undefined);
    void act(() => port.move({ id, to: "casting" })).then((m) => {
      setBusy(false);
      setError(m);
    });
  };

  return (
    <div className={s.detail} data-production={p.id}>
      <div className={s.detailHead}>
        <h2 className={s.title}>{p.title}</h2>
        <EntryPill entry={STAGE_PILL[stage]} />
        <SourceChip source={p.source} />
      </div>
      <p className={s.words}>{entry.logline}</p>
      <ActError message={error} />

      {live && (
        <div className={s.block}>
          <CapsHeading text="choose hero frames" variant="section" tally={{ value: frames.length, label: "of 2" }} />
          {entry.frames.length === 0 ? <Empty label="no frames on the board" /> : <FrameRow entry={entry} chosen={frames} onToggle={toggleFrame} disabled={launching !== undefined} />}
          <TextArea label="motion line (optional)" value={prompt} rows={2} onChange={setPrompt} placeholder="left empty: each frame's own prompt" />
          <div className={s.row}>
            <Seg label="mode" options={[{ value: "dry", label: "dry" }, { value: "live", label: "live" }]} value={mode} onChange={(m) => setMode(m as ReceiptMode)} />
            <Button label={busy ? "Reading receipt" : "Launch hero"} size="sm" tone="cyan" disabled={busy || frames.length === 0 || launching !== undefined} onPress={() => request("hero")} />
            <Button label="Render rough cut" size="sm" disabled={busy || !heroReady || launching !== undefined} onPress={() => request("rough")} />
            {!heroReady && <span className={s.note}>a rough cut comes only after a hero take lands</span>}
          </div>
          {launching !== undefined && (
            <div className={s.block}>
              <Receipt receipt={launching.receipt} ceiling={ceiling} onCeiling={setCeiling} onConfirm={confirm} busy={busy} nowMs={Date.parse(launching.receipt.readAt)} />
              <Button label="Back" size="sm" disabled={busy} onPress={() => setLaunching(undefined)} />
            </div>
          )}
        </div>
      )}

      <div className={s.block}>
        <CapsHeading text="takes" variant="section" tally={{ value: p.takes.length, label: p.takes.length === 1 ? "take" : "takes" }} />
        {p.takes.length === 0 ? (
          <Empty label="no takes rendered yet" />
        ) : (
          <div className={s.takes}>
            {p.takes.map((t) => (
              <TakeCard key={t.id} take={t} entry={entry} busy={busy} onProve={() => prove(t.id)} />
            ))}
          </div>
        )}
      </div>

      <div className={s.row}>
        {stage === "proven" && <Button label="Start casting" size="sm" tone="cyan" disabled={busy} onPress={casting} />}
        {stage !== "dropped" && stage !== "done" && <Button label="Drop" size="sm" tone="rose" disabled={busy} onPress={drop} />}
      </div>
    </div>
  );
}

/** The stages S2-S6 build, as they will read, drawn from the scripted slate. Nothing here reaches a record. */
export function ScriptedPanels({ entry, view }: { readonly entry: ProductionEntry; readonly view: ProductionsView }) {
  const [open, setOpen] = useState(false);
  const [script, dispatch] = useReducer(scriptReducer, initialScript);
  const props = { entry, script, dispatch, view };
  return (
    <div className={s.scripted} data-scripted="later-stages">
      <Fold title="Later stages, scripted" open={open} onToggle={setOpen} level={3}>
        <p className={s.note}>casting, audio, final cut, lessons and ventures stay scripted until S2-S6. Nothing here is real or written; acts reset on reload.</p>
        <div className={s.journey}>
          <section className={s.block} aria-label="casting, scripted">
            <Chip label="scripted · S2-S4" ghost casing="lower" />
            <CastingBlock {...props} />
          </section>
          <section className={s.block} aria-label="audio, scripted">
            <Chip label="scripted · S5" ghost casing="lower" />
            <AudioBlock {...props} />
          </section>
          <section className={s.block} aria-label="final cut, scripted">
            <Chip label="scripted · S5" ghost casing="lower" />
            <CutBlock {...props} />
          </section>
          <section className={s.block} aria-label="lessons, scripted">
            <Chip label="scripted · S6" ghost casing="lower" />
            <LessonsBlock {...props} />
          </section>
          <section className={s.block} aria-label="ventures, scripted">
            <Chip label="scripted · S6" ghost casing="lower" />
            <VentureBlock {...props} />
          </section>
        </div>
      </Fold>
    </div>
  );
}
