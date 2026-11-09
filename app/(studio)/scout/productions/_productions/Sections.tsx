"use client";

// The later-stage panels (audio, final cut, lessons, ventures), scripted until S5-S6: each draws the scripted
// entry and what the operator did on this page (./script.ts), which is never written anywhere.

import { useState } from "react";

import type { ProductionSource } from "@gt/domain/production";
import { MUSIC_ROUTES, VOICE_ROUTES, type MusicRoute, type ProductionStage, type VoiceRoute } from "@gt/domain/production.machine";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import type { StatusEntry } from "@gt/ui/components/status/status.ts";

import type { ProductionEntry, ProductionsView } from "../_port/contract.ts";
import s from "./productions.module.css";
import { stageOf, type Dispatch, type ScriptState } from "./script.ts";

export type SectionProps = {
  readonly entry: ProductionEntry;
  readonly script: ScriptState;
  readonly dispatch: Dispatch;
  readonly view: ProductionsView;
};

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

const SOURCE_WORDS: Readonly<Record<ProductionSource["kind"], string>> = { episode: "episode", "codex-board": "codex board", outline: "outline" };

export function SourceChip({ source }: { readonly source: ProductionSource }) {
  const { kind, ref } = source;
  return <Chip label={SOURCE_WORDS[kind]} value={ref} casing="lower" name={`source: ${SOURCE_WORDS[kind]} ${ref}`} />;
}

const VOICE_WORDS: Readonly<Record<VoiceRoute, string>> = { "ref-audio": "voice in the picture (reference audio)", dub: "dub over the picture", none: "no voices" };
const MUSIC_WORDS: Readonly<Record<MusicRoute, string>> = { score: "score", track: "a song track", none: "no music" };

export function AudioBlock({ entry, script, dispatch }: SectionProps) {
  const stage = stageOf(entry, script);
  const pick = script.audio[entry.production.id] ?? (entry.production.audio === undefined ? { voice: "dub" as const, music: "score" as const } : { voice: entry.production.audio.voice, music: entry.production.audio.music });
  return (
    <div className={s.block}>
      <CapsHeading text="audio decision" variant="section" />
      {stage === "audio" ? (
        <>
          <div className={s.row}>
            <Select label="voice route" options={VOICE_ROUTES.map((value) => ({ value, label: VOICE_WORDS[value] }))} value={pick.voice} onChange={(voice) => dispatch({ type: "audio", id: entry.production.id, audio: { ...pick, voice } })} />
            <Select label="music route" options={MUSIC_ROUTES.map((value) => ({ value, label: MUSIC_WORDS[value] }))} value={pick.music} onChange={(music) => dispatch({ type: "audio", id: entry.production.id, audio: { ...pick, music } })} />
          </div>
          <Button label="Decide and go to final cut" size="sm" tone="cyan" onPress={() => dispatch({ type: "move", id: entry.production.id, from: "audio", to: "cutting" })} />
        </>
      ) : entry.production.audio !== undefined ? (
        <Facts facts={[{ term: "voice", value: VOICE_WORDS[entry.production.audio.voice] }, { term: "music", value: MUSIC_WORDS[entry.production.audio.music] }]} />
      ) : (
        <Empty label="no audio decision yet" />
      )}
    </div>
  );
}

export function CutBlock({ entry, script, dispatch }: SectionProps) {
  const stage = stageOf(entry, script);
  const cut = entry.production.cut;
  if (cut === undefined) return <div className={s.block}><CapsHeading text="final cut" variant="section" /><Empty label="no cut assembled yet" /></div>;
  return (
    <div className={s.block}>
      <CapsHeading text="final cut" variant="section" />
      <Facts facts={[{ term: "format", value: cut.format }, { term: "receipt", value: cut.receipt ?? "none" }, { term: "Board gate", value: cut.packetId ?? "not on the Board" }]} />
      <div className={s.row}>
        <EntryPill entry={cut.state === "on-board" ? { look: "awaiting", label: "on the Board" } : cut.state === "approved" ? { look: "done", label: "approved" } : { look: "idle", label: cut.state }} />
        <Button label="open on Board" size="sm" disabled glyphAfter="chevR" />
        <span className={s.note}>scripted: no packet exists</span>
        {stage === "cutting" && <Button label="Board approved: done" size="sm" tone="emerald" onPress={() => dispatch({ type: "move", id: entry.production.id, from: "cutting", to: "done" })} />}
      </div>
    </div>
  );
}

function LessonRow({ entry, lesson, script, dispatch }: { readonly entry: ProductionEntry; readonly lesson: ProductionEntry["lessons"][number]; readonly script: ScriptState; readonly dispatch: Dispatch }) {
  const [editing, setEditing] = useState(false);
  const edit = script.lessons[lesson.id] ?? { text: lesson.text, accepted: lesson.state === "accepted" };
  return (
    <div className={s.lesson} data-lesson={lesson.dimension}>
      <Chip label={lesson.dimension === "art-style" ? "art style" : lesson.dimension} tone={lesson.dimension === "beats" ? "cyan" : lesson.dimension === "art-style" ? "violet" : "amber"} />
      {editing ? (
        <TextArea label={`${lesson.dimension} lesson`} value={edit.text} rows={2} onChange={(text) => dispatch({ type: "lesson", id: lesson.id, edit: { ...edit, text } })} />
      ) : (
        <p className={s.words}>{edit.text}</p>
      )}
      <div className={s.row}>
        {edit.accepted ? <Chip label="accepted" tone="emerald" dot /> : <Chip label="proposed" tone="amber" casing="lower" />}
        <Button label={editing ? "Done" : "Edit"} size="sm" onPress={() => setEditing(!editing)} />
        {!edit.accepted && <Button label="Accept" size="sm" tone="emerald" onPress={() => dispatch({ type: "lesson", id: lesson.id, edit: { ...edit, accepted: true } })} />}
      </div>
      <span className={s.meta}>feeds the project&apos;s planning once accepted ({entry.production.title})</span>
    </div>
  );
}

export function LessonsBlock({ entry, script, dispatch }: SectionProps) {
  if (entry.lessons.length === 0) return <div className={s.block}><CapsHeading text="lessons" variant="section" /><Empty label="no lessons proposed yet" /></div>;
  return (
    <div className={s.block}>
      <CapsHeading text="lessons proposed" variant="section" tally={{ value: entry.lessons.length, label: "lessons" }} />
      {entry.lessons.map((l) => (
        <LessonRow key={l.id} entry={entry} lesson={l} script={script} dispatch={dispatch} />
      ))}
    </div>
  );
}

export function VentureBlock({ entry, script, dispatch, view }: SectionProps) {
  const [join, setJoin] = useState(view.ventures[0]?.id ?? "");
  const [name, setName] = useState("");
  const joined = script.venture[entry.production.id];
  if (joined !== undefined) return <div className={s.block}><CapsHeading text="venture" variant="section" /><Chip label="venture" value={joined} tone="emerald" casing="lower" /></div>;
  return (
    <div className={s.block}>
      <CapsHeading text="start or join a venture" variant="section" />
      <div className={s.row}>
        <Select label="join a venture" options={view.ventures.map((v) => ({ value: v.id, label: v.name }))} value={join} onChange={setJoin} />
        <Button label="Join" size="sm" tone="cyan" onPress={() => dispatch({ type: "venture", id: entry.production.id, name: view.ventures.find((v) => v.id === join)?.name ?? join })} />
      </div>
      <div className={s.row}>
        <Field label="new venture name" value={name} onChange={setName} placeholder="future channel" />
        <Button label="Start a venture" size="sm" disabled={name.trim() === ""} onPress={() => dispatch({ type: "venture", id: entry.production.id, name: name.trim() })} />
      </div>
    </div>
  );
}
