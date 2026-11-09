"use client";

// The blocks a concept is decided in, shared by the three layouts so the comparison is about the layout, never about
// the pieces. Each block draws from the scripted entry plus what the operator did on this page (./script.ts).

import { useState } from "react";

import type { CastRound, CharacterCandidate, ProductionRole, VoiceCandidate } from "@gt/domain/production";
import { MUSIC_ROUTES, VOICE_ROUTES, voicePickRefusal, type MusicRoute, type ProductionStage, type VoiceRoute } from "@gt/domain/production.machine";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate } from "@gt/ui/components/desk/Plate.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import type { StatusEntry } from "@gt/ui/components/status/status.ts";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import type { ProductionEntry, ProductionsView } from "../_port/contract.ts";
import s from "./productions.module.css";
import { isKept, reached, stageOf, type Dispatch, type RoundPicks, type ScriptState } from "./script.ts";

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

const SOURCE_WORDS: Readonly<Record<ProductionEntry["production"]["source"]["kind"], string>> = { episode: "episode", "codex-board": "codex board", outline: "outline" };

/** `compact`: the kind as a chip and the ref on its own clipped line, for a card too narrow for both. */
export function SourceChip({ entry, compact = false }: { readonly entry: ProductionEntry; readonly compact?: boolean }) {
  const { kind, ref } = entry.production.source;
  if (compact) {
    return (
      <>
        <Chip label={SOURCE_WORDS[kind]} casing="lower" name={`source: ${SOURCE_WORDS[kind]}`} />
        <span className={s.ref} title={ref}>{ref}</span>
      </>
    );
  }
  return <Chip label={SOURCE_WORDS[kind]} value={ref} casing="lower" name={`source: ${SOURCE_WORDS[kind]} ${ref}`} />;
}

/** The kept concept and its Start button, or a line saying where it came from once started. */
export function StartBlock({ entry, script, dispatch }: SectionProps) {
  const kept = isKept(entry, script);
  return (
    <div className={s.block}>
      <CapsHeading text={kept ? "kept concept" : "concept"} variant="section" />
      <p className={s.words}>{entry.logline}</p>
      <div className={s.row}>
        <SourceChip entry={entry} />
        {kept && <Button label="Start" size="sm" tone="emerald" onPress={() => dispatch({ type: "start", id: entry.production.id })} />}
        {kept && <span className={s.note}>nothing starts itself</span>}
      </div>
    </div>
  );
}

export function TakesBlock({ entry, script, dispatch }: SectionProps) {
  const stage = stageOf(entry, script);
  const provenTake = script.proven[entry.production.id];
  const canProve = stage === "hero" || stage === "rough";
  if (entry.production.takes.length === 0) return <div className={s.block}><CapsHeading text="takes" variant="section" /><Empty label="no takes rendered yet" /></div>;
  return (
    <div className={s.block}>
      <CapsHeading text="takes" variant="section" tally={{ value: entry.production.takes.length, label: entry.production.takes.length === 1 ? "take" : "takes" }} />
      <div className={s.takes}>
        {entry.production.takes.map((t) => {
          const proven = t.provenAt !== undefined || provenTake === t.id;
          return (
            <div key={t.id} className={s.take}>
              <Plate src={t.poster} alt={`${t.kind} take: ${t.beats.join(", ")}`} className={s.plate} lazy />
              <div className={s.row}>
                <Chip label={t.kind === "hero" ? "hero" : "rough cut"} tone={t.kind === "hero" ? "cyan" : "violet"} />
                {proven && <Chip label="proven" tone="emerald" dot />}
                {t.state !== "ready" && <EntryPill entry={t.state === "failed" ? { look: "failed", label: "failed" } : { look: "running", label: "rendering" }} />}
              </div>
              <span className={s.meta}>{t.beats.join(" · ")}</span>
              {t.error !== undefined && <ErrorLine message={t.error} />}
              {canProve && t.state === "ready" && !proven && <Button label="Mark proven" size="sm" tone="emerald" onPress={() => dispatch({ type: "proven", id: entry.production.id, from: stage, takeId: t.id })} />}
            </div>
          );
        })}
      </div>
      {stage === "hero" && <Button label="Render a rough cut of all beats" size="sm" onPress={() => dispatch({ type: "move", id: entry.production.id, from: "hero", to: "rough" })} />}
      {stage === "proven" && <Button label="Start casting" size="sm" tone="cyan" onPress={() => dispatch({ type: "move", id: entry.production.id, from: "proven", to: "casting" })} />}
    </div>
  );
}

function CharacterTile({ round, c, picked, onPick }: { readonly round: string; readonly c: CharacterCandidate; readonly picked: boolean; readonly onPick: () => void }) {
  const pic = c.images[0];
  return (
    <div className={s.candidate} data-picked={picked} data-candidate={c.id}>
      {pic !== undefined ? <Plate src={pic} alt={`${c.card.name}: ${c.card.look}`} className={s.portrait} lazy /> : <div className={s.noPicture}>design rendering</div>}
      <strong className={s.name}>{c.card.name}</strong>
      <span className={s.meta}>{c.card.look}</span>
      {c.origin === "reused" ? <Chip label="reused" value={c.usedBefore.length} tone="cyan" casing="lower" name={`reused, used ${c.usedBefore.length} times before`} /> : <Chip label="new" tone="violet" casing="lower" name="new, designed for this round" />}
      {c.origin === "reused" ? (
        <ul className={s.used}>
          {c.usedBefore.map((u) => (
            <li key={`${round}/${u.label}`}>{u.label}</li>
          ))}
        </ul>
      ) : (
        <span className={s.meta}>{c.card.personality}</span>
      )}
      <Button label={picked ? "Picked" : "Pick"} size="sm" tone={picked ? "emerald" : "neutral"} onPress={onPick} disabled={pic === undefined} />
    </div>
  );
}

function VoiceTile({ voice, picked, heard, onHear, onPick }: { readonly voice: VoiceCandidate; readonly picked: boolean; readonly heard: boolean; readonly onHear: () => void; readonly onPick: () => void }) {
  const refusal = heard ? undefined : voicePickRefusal(voice);
  const stub = voice.preview === undefined;
  return (
    <div className={s.candidate} data-picked={picked} data-voice={voice.id}>
      <strong className={s.name}>{voice.label}</strong>
      <span className={s.meta}>{voice.design}</span>
      <div className={s.row}>
        <Button label={heard ? "Replay" : "Play preview"} size="sm" tone="cyan" onPress={onHear} />
        {stub && <Chip label="silent stub" ghost casing="lower" name="scripted: no audio file, this control only marks the preview heard" />}
      </div>
      {heard && <Chip label="heard" tone="emerald" dot casing="lower" />}
      <Button label={picked ? "Picked" : "Pick voice"} size="sm" tone={picked ? "emerald" : "neutral"} disabled={refusal !== undefined} onPress={onPick} />
      {refusal !== undefined && <span className={s.locked}>{refusal}</span>}
    </div>
  );
}

function RoundBlock({ round, role, script, dispatch }: { readonly round: CastRound; readonly role: ProductionRole; readonly script: ScriptState; readonly dispatch: Dispatch }) {
  const pick: RoundPicks = { ...round.picks, ...script.picks[round.id] };
  const locked = script.locked[round.id] === true;
  const save = script.saved[round.id] === true;
  const heardOf = (v: VoiceCandidate): boolean => script.heard[v.id] === true || v.heardAt !== undefined;
  const complete = pick.character !== undefined && pick.voice !== undefined;
  return (
    <div className={s.round}>
      <div className={s.row}>
        <span className={s.words}>{role.brief}</span>
      </div>
      <div className={s.row}>
        <Chip label="credits used" value={round.creditsUsed} casing="lower" name={`${round.creditsUsed} ElevenLabs credits used by this round`} />
        <span className={s.meta}>read from {round.creditsRead === "character-cost-header" ? "the character-cost header" : "the subscription delta"}</span>
      </div>
      {role.auditionScript !== undefined && <span className={s.script}>audition: {role.auditionScript}</span>}
      <CapsHeading text="5 characters" variant="section" level={4} />
      <div className={s.five}>
        {round.characters.map((c) => (
          <CharacterTile key={c.id} round={round.id} c={c} picked={pick.character === c.id} onPick={() => dispatch({ type: "pick", round: round.id, field: "character", candidate: c.id })} />
        ))}
      </div>
      <CapsHeading text="5 voices" variant="section" level={4} />
      <div className={s.five}>
        {round.voices.map((v) => (
          <VoiceTile key={v.id} voice={heardOf(v) ? { ...v, heardAt: v.heardAt ?? "now" } : v} picked={pick.voice === v.id} heard={heardOf(v)} onHear={() => dispatch({ type: "hear", voice: v.id })} onPick={() => dispatch({ type: "pick", round: round.id, field: "voice", candidate: v.id })} />
        ))}
      </div>
      <div className={s.row}>
        <Toggle label="save this character to the library" on={save} onToggle={(on) => dispatch({ type: "save", round: round.id, on })} />
        <Button label={locked ? "Cast locked" : "Lock this cast"} size="sm" tone="emerald" disabled={!complete || locked} onPress={() => dispatch({ type: "lock", round: round.id })} />
        {!complete && <span className={s.note}>pick one character and one voice</span>}
      </div>
    </div>
  );
}

export function CastingBlock({ entry, script, dispatch }: SectionProps) {
  const [current, setCurrent] = useState<string | undefined>(entry.rounds[0]?.id);
  const stage = stageOf(entry, script);
  if (entry.rounds.length === 0) {
    return (
      <div className={s.block}>
        <CapsHeading text="casting" variant="section" />
        {reached(stage, "casting") && entry.production.roles.length > 0 ? (
          <div className={s.row}>
            {entry.production.roles.map((r) => (
              <Chip key={r.id} label={r.name} value={r.cast === undefined ? "no pick" : "cast"} tone={r.cast === undefined ? "neutral" : "emerald"} casing="lower" />
            ))}
          </div>
        ) : (
          <Empty label="no casting round yet" />
        )}
      </div>
    );
  }
  const round = entry.rounds.find((r) => r.id === current) ?? entry.rounds[0];
  const role = round === undefined ? undefined : entry.production.roles.find((r) => r.id === round.roleId);
  return (
    <div className={s.block}>
      <CapsHeading text="casting round" variant="section" tally={{ value: entry.rounds.length, label: entry.rounds.length === 1 ? "round" : "rounds" }} />
      {entry.rounds.length > 1 && (
        <Seg label="role" options={entry.rounds.map((r) => ({ value: r.id, label: entry.production.roles.find((x) => x.id === r.roleId)?.name ?? r.roleId }))} value={round?.id ?? ""} onChange={setCurrent} />
      )}
      {round !== undefined && role !== undefined && <RoundBlock round={round} role={role} script={script} dispatch={dispatch} />}
      {stage === "casting" && <Button label="All roles cast: move to audio" size="sm" tone="cyan" onPress={() => dispatch({ type: "move", id: entry.production.id, from: "casting", to: "audio" })} />}
    </div>
  );
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

type Section = "start" | "takes" | "casting" | "audio" | "cut" | "lessons" | "venture";

const CURRENT: Readonly<Record<ProductionStage, readonly Section[]>> = {
  accepted: ["start"],
  hero: ["takes"],
  rough: ["takes"],
  proven: ["takes", "venture"],
  casting: ["casting"],
  audio: ["audio"],
  cutting: ["cut"],
  done: ["lessons", "venture"],
  dropped: ["start", "takes"],
};
const WHOLE: readonly (readonly [Section, ProductionStage])[] = [
  ["start", "accepted"],
  ["takes", "hero"],
  ["casting", "casting"],
  ["audio", "audio"],
  ["cut", "cutting"],
  ["lessons", "done"],
  ["venture", "proven"],
];

function SectionOf({ section, props }: { readonly section: Section; readonly props: SectionProps }) {
  switch (section) {
    case "start":
      return <StartBlock {...props} />;
    case "takes":
      return <TakesBlock {...props} />;
    case "casting":
      return <CastingBlock {...props} />;
    case "audio":
      return <AudioBlock {...props} />;
    case "cut":
      return <CutBlock {...props} />;
    case "lessons":
      return <LessonsBlock {...props} />;
    case "venture":
      return <VentureBlock {...props} />;
  }
}

/** `current`: what the concept's present stage asks of the operator. `whole`: the journey down one page. */
export function Journey({ scope, ...props }: SectionProps & { readonly scope: "current" | "whole" }) {
  const stage = stageOf(props.entry, props.script);
  if (scope === "current") {
    return (
      <div className={s.journey}>
        {CURRENT[stage].map((x) => (
          <SectionOf key={x} section={x} props={props} />
        ))}
      </div>
    );
  }
  return (
    <div className={s.journey}>
      {WHOLE.map(([section, at]) => {
        const live = section === "start" ? true : section === "takes" ? stage !== "accepted" : reached(stage, at);
        return live ? (
          <SectionOf key={section} section={section} props={props} />
        ) : (
          <div key={section} className={s.block} data-reached="no">
            <CapsHeading text={section === "cut" ? "final cut" : section} variant="section" />
            <Empty label="not reached yet" />
          </div>
        );
      })}
    </div>
  );
}
