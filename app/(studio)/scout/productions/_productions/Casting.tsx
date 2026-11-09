"use client";

// THE CASTING PANEL (spark concept-casting-stages S4): a production's roles and, per role, one round of 5 faces and 5
// voices. Every act goes through the port and every refusal is the door's sentence, verbatim. A pick stays locked until
// its preview has played to its end; that moment is reported to the server as the preview's `heardAt`.

import { useRef, useState } from "react";

import type { Receipt as ReceiptValue, ReceiptMode } from "@gt/domain/produce";
import type { CastJob, CastRound, CharacterCandidate, ProductionId, ProductionRole, VoiceCandidate } from "@gt/domain/production";
import { voicePickRefusal } from "@gt/domain/production.machine";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate } from "@gt/ui/components/desk/Plate.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Field, TextArea } from "@gt/ui/components/field/Field.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Receipt } from "@gt/ui/components/produce/Receipt.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import type { ActionResult } from "../../../../_server/actionCore.ts";
import type { CastLaunchInput, ProductionEntry, ProductionsPort, ProductionsView } from "../_port/contract.ts";
import s from "./productions.module.css";

type Act = (run: () => Promise<ActionResult<ProductionsView>>) => Promise<string | undefined>;

const CREDIT_WORDS: Readonly<Record<CastRound["creditsRead"], string>> = {
  "character-cost-header": "read from the character-cost header",
  "subscription-delta": "read from the subscription delta",
  unread: "not read: the API gave no figure",
};

const inFlight = (j: CastJob | undefined): boolean => j?.state === "queued" || j?.state === "running";
const failedJob = (j: CastJob | undefined): boolean => j?.state === "failed" || j?.state === "interrupted";

function jobWords(j: CastJob): string {
  if (j.state === "queued") return "queued";
  if (j.state === "running") return `${j.step ?? "running"} · ${j.done}/${j.total || "?"}`;
  return j.state;
}

function JobLine({ label, job }: { readonly label: string; readonly job: CastJob }) {
  return (
    <div className={s.row} data-job-state={job.state}>
      <EntryPill entry={inFlight(job) ? { look: "running", label: jobWords(job) } : failedJob(job) ? { look: "failed", label: job.state } : { look: "done", label: job.state }} />
      <span className={s.meta}>{label}</span>
      {job.error !== undefined && <ErrorLine message={job.error} />}
    </div>
  );
}

function FaceTile({ c, picked, onPick, locked }: { readonly c: CharacterCandidate; readonly picked: boolean; readonly onPick: () => void; readonly locked: boolean }) {
  const pic = c.images[0];
  const state = c.origin === "new" ? (c.state ?? (pic === undefined ? "pending" : "ready")) : "ready";
  return (
    <div className={s.candidate} data-picked={picked} data-candidate={c.id} data-state={state}>
      {pic !== undefined ? <Plate src={pic} alt={`${c.card.name}: ${c.card.look}`} className={s.portrait} lazy /> : <div className={s.noPicture}>{state === "failed" ? "not drawn" : state === "refused" ? "refused" : "design rendering"}</div>}
      <strong className={s.name}>{c.card.name}</strong>
      <span className={s.meta}>{c.card.look}</span>
      {c.origin === "reused" ? (
        <>
          <Chip label="reused" tone="cyan" casing="lower" name="reused from the character library" />
          {c.match !== undefined && <span className={s.meta}>{c.match}</span>}
          <ul className={s.used}>
            {c.usedBefore.map((u) => (
              <li key={`${u.at}/${u.label}`}>{u.label}</li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <Chip label="new" tone="violet" casing="lower" name="new, designed for this round" />
          <span className={s.meta}>{c.card.personality}</span>
        </>
      )}
      {c.origin === "new" && c.error !== undefined && <span className={s.locked} data-refusal={state}>{c.error}</span>}
      <Button label={picked ? "Picked" : "Pick"} size="sm" tone={picked ? "emerald" : "neutral"} onPress={onPick} disabled={state !== "ready" || pic === undefined || locked} />
    </div>
  );
}

function VoiceTile({ v, picked, playing, onPlay, onPick, locked }: { readonly v: VoiceCandidate; readonly picked: boolean; readonly playing: boolean; readonly onPlay: () => void; readonly onPick: () => void; readonly locked: boolean }) {
  const refusal = voicePickRefusal(v);
  const heard = v.heardAt !== undefined;
  return (
    <div className={s.candidate} data-picked={picked} data-voice={v.id}>
      <strong className={s.name}>{v.label}</strong>
      <span className={s.meta}>{v.design}</span>
      {v.preview === undefined ? (
        <span className={s.locked}>no preview yet</span>
      ) : (
        <>
          <div className={s.row}>
            <Button label={playing ? "Stop" : heard ? "Replay" : "Play preview"} size="sm" tone="cyan" onPress={onPlay} />
            <span className={s.note}>{v.preview.lufs} LUFS</span>
          </div>
          {heard && <Chip label="heard" tone="emerald" dot casing="lower" />}
          <Button label={picked ? "Picked" : "Pick voice"} size="sm" tone={picked ? "emerald" : "neutral"} disabled={refusal !== undefined || locked} onPress={onPick} />
          {refusal !== undefined && <span className={s.locked}>{refusal}</span>}
        </>
      )}
    </div>
  );
}

type Launching = { readonly receipt: ReceiptValue; readonly input: CastLaunchInput };

function RoundPanel({ round, role, port, act, id, stage, launchAsk }: { readonly round: CastRound; readonly role: ProductionRole; readonly port: ProductionsPort; readonly act: Act; readonly id: ProductionId; readonly stage: string; readonly launchAsk: (i: CastLaunchInput) => void }) {
  const [character, setCharacter] = useState<string | undefined>(round.picks.character);
  const [voice, setVoice] = useState<string | undefined>(round.picks.voice);
  const [save, setSave] = useState(round.saveToLibrary === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [playing, setPlaying] = useState<string | undefined>();
  const audio = useRef<HTMLAudioElement>(null);
  const cast = role.cast;
  const locked = cast !== undefined || stage !== "casting";
  const waiting = cast === undefined && round.createJob !== undefined && inFlight(round.createJob);
  const canLock = character !== undefined && voice !== undefined && !locked && !waiting && !busy;
  const missing = round.characters.filter((c) => c.origin === "new" && (c.state === "failed" || c.state === "refused")).length;

  const run = (f: () => Promise<ActionResult<ProductionsView>>): void => {
    setBusy(true);
    setError(undefined);
    void act(f).then((m) => {
      setBusy(false);
      setError(m);
    });
  };

  const play = (v: VoiceCandidate): void => {
    const el = audio.current;
    if (el === null || v.preview === undefined) return;
    if (playing === v.id) {
      el.pause();
      setPlaying(undefined);
      return;
    }
    el.src = v.preview.url;
    void el.play().then(() => setPlaying(v.id), (e: unknown) => setError(`the preview would not play: ${e instanceof Error ? e.message : String(e)}`));
  };

  const heard = (): void => {
    const v = playing;
    setPlaying(undefined);
    if (v === undefined) return;
    void act(() => port.heard({ id, roundId: round.id, voiceId: v, at: new Date().toISOString() })).then((m) => setError(m));
  };

  const lock = (): void => {
    if (character === undefined || voice === undefined) return;
    run(() => port.pick({ id, roundId: round.id, character, voice, saveToLibrary: save }));
  };

  return (
    <div className={s.round} data-round={round.id}>
      <audio ref={audio} onEnded={heard} preload="none" />
      <div className={s.row}>
        <span className={s.words}>{role.brief}</span>
      </div>
      <div className={s.row} data-credits={round.creditsRead}>
        <Chip label="credits used" value={round.creditsUsed} casing="lower" name={`${round.creditsUsed} ElevenLabs credits used by this round`} />
        <span className={s.meta}>{CREDIT_WORDS[round.creditsRead]}</span>
        {round.unreadCalls !== undefined && <span className={s.meta}>{round.unreadCalls} call{round.unreadCalls === 1 ? "" : "s"} not read</span>}
        {round.dry === true && <Chip label="dry stand-ins" ghost casing="lower" name="dry round: no vendor was called" />}
      </div>
      {role.auditionScript !== undefined && <span className={s.script}>audition: {role.auditionScript}</span>}
      {error !== undefined && <ErrorLine message={error} live />}
      {round.drawJob !== undefined && (inFlight(round.drawJob) || failedJob(round.drawJob)) && <JobLine label="new designs" job={round.drawJob} />}
      {missing > 0 && !locked && <Button label={`Draw ${missing} again`} size="sm" tone="cyan" onPress={() => launchAsk({ kind: "retry", id, roundId: round.id, mode: round.dry === true ? "dry" : "live" })} />}
      <CapsHeading text="5 characters" variant="section" level={4} />
      <div className={s.five}>
        {round.characters.map((c) => (
          <FaceTile key={c.id} c={c} picked={character === c.id} locked={locked} onPick={() => setCharacter(c.id)} />
        ))}
      </div>
      <CapsHeading text="5 voices" variant="section" level={4} />
      {round.voiceJob !== undefined && (inFlight(round.voiceJob) || failedJob(round.voiceJob)) && (
        <div className={s.row}>
          <JobLine label="voice design" job={round.voiceJob} />
          {failedJob(round.voiceJob) && !locked && <Button label="Retry voices" size="sm" tone="cyan" disabled={busy} onPress={() => run(() => port.retryVoices({ id, roundId: round.id }))} />}
        </div>
      )}
      <div className={s.five}>
        {round.voices.map((v) => (
          <VoiceTile key={v.id} v={v} picked={voice === v.id} playing={playing === v.id} locked={locked} onPlay={() => play(v)} onPick={() => setVoice(v.id)} />
        ))}
      </div>
      <div className={s.row}>
        <Toggle label="save this character to the library" on={save} onToggle={setSave} />
        <Button label={busy ? "Locking" : cast !== undefined ? "Cast locked" : waiting ? "Creating the voice" : "Lock this cast"} size="sm" tone="emerald" disabled={!canLock} onPress={lock} />
        {!locked && (character === undefined || voice === undefined) && <span className={s.note}>pick one character and one voice</span>}
        {cast !== undefined && <Button label="Re-cast" size="sm" tone="rose" disabled={busy} onPress={() => run(() => port.recast({ id, roleId: role.id }))} />}
      </div>
      {round.createJob !== undefined && failedJob(round.createJob) && cast === undefined && (
        <div className={s.row}>
          <JobLine label="creating the voice" job={round.createJob} />
          <Button label="Retry the voice" size="sm" tone="cyan" disabled={busy} onPress={() => run(() => port.retryCreate({ id, roundId: round.id }))} />
        </div>
      )}
      {cast !== undefined && (
        <div className={s.row} data-cast={cast.characterId}>
          <Chip label="cast" value={cast.voiceId} tone="emerald" casing="lower" name={`voice ${cast.voiceId}`} />
          {cast.dry === true && <Chip label="dry" ghost casing="lower" name="a dry round: this cast cannot go to audio" />}
        </div>
      )}
    </div>
  );
}

type RoleDraft = { readonly id?: string; readonly name: string; readonly brief: string; readonly auditionScript: string };

const toDraft = (r: ProductionRole): RoleDraft => ({ id: r.id, name: r.name, brief: r.brief, auditionScript: r.auditionScript ?? "" });

function RolesEditor({ entry, id, port, act, launchAsk }: { readonly entry: ProductionEntry; readonly id: ProductionId; readonly port: ProductionsPort; readonly act: Act; readonly launchAsk: (i: CastLaunchInput) => void }) {
  const roles = entry.production.roles;
  const [drafts, setDrafts] = useState<readonly RoleDraft[]>(roles.map(toDraft));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const update = (i: number, patch: Partial<RoleDraft>): void => {
    setDirty(true);
    setDrafts((cur) => cur.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  };
  const save = (): void => {
    setBusy(true);
    setError(undefined);
    const list = drafts.filter((d) => d.name.trim() !== "" || d.brief.trim() !== "").map((d) => ({ ...(d.id === undefined ? {} : { id: d.id }), name: d.name.trim(), brief: d.brief.trim(), ...(d.auditionScript.trim() === "" ? {} : { auditionScript: d.auditionScript.trim() }) }));
    void act(() => port.saveRoles({ id, roles: list })).then((m) => {
      setBusy(false);
      setError(m);
      if (m === undefined) setDirty(false);
    });
  };
  const rolesJob = entry.castJobs["roles"];
  return (
    <div className={s.block} data-roles={drafts.length}>
      <CapsHeading text="roles" variant="section" tally={{ value: drafts.length, label: drafts.length === 1 ? "role" : "roles" }} />
      {drafts.length === 0 && <Empty label="no roles yet" />}
      {drafts.map((d, i) => (
        <div className={s.round} key={d.id ?? `new-${i}`}>
          <Field label="role" value={d.name} onChange={(name) => update(i, { name })} />
          <TextArea label="brief: who they are, how they look and sound" value={d.brief} rows={2} onChange={(brief) => update(i, { brief })} />
          <TextArea label="audition line (100+ characters; one line every voice reads)" value={d.auditionScript} rows={2} onChange={(auditionScript) => update(i, { auditionScript })} />
          {d.id !== undefined && <Button label="Write this role's line" size="sm" tone="neutral" disabled={inFlight(entry.castJobs[`audition:${d.id}`])} onPress={() => launchAsk({ kind: "audition", id, roleId: d.id ?? "", mode: "live" })} />}
        </div>
      ))}
      <div className={s.row}>
        <Button label="Add a role" size="sm" tone="neutral" onPress={() => { setDirty(true); setDrafts((cur) => [...cur, { name: "", brief: "", auditionScript: "" }]); }} />
        <Button label={busy ? "Saving" : "Save roles"} size="sm" tone="cyan" disabled={busy || !dirty} onPress={save} />
        <Button label="Propose roles" size="sm" tone="neutral" disabled={roles.length > 0 || inFlight(rolesJob)} onPress={() => launchAsk({ kind: "roles", id, mode: "live" })} />
        {roles.length > 0 && <span className={s.note}>proposing is for a production with no roles yet</span>}
      </div>
      {rolesJob !== undefined && (inFlight(rolesJob) || failedJob(rolesJob)) && <JobLine label="proposing roles" job={rolesJob} />}
      {error !== undefined && <ErrorLine message={error} live />}
    </div>
  );
}

export function CastingPanel({ entry, port, act, onView }: { readonly entry: ProductionEntry; readonly port: ProductionsPort; readonly act: Act; readonly onView: (v: ProductionsView) => void }) {
  const p = entry.production;
  const id = p.id as ProductionId;
  const stage = p.stage;
  const [current, setCurrent] = useState<string | undefined>(p.roles[0]?.id);
  const [mode, setMode] = useState<ReceiptMode>("dry");
  const [launching, setLaunching] = useState<Launching | undefined>();
  const [ceiling, setCeiling] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (stage !== "casting" && stage !== "audio" && stage !== "cutting" && stage !== "done" && p.roles.length === 0) return null;

  const role = p.roles.find((r) => r.id === current) ?? p.roles[0];
  const round = role === undefined ? undefined : [...entry.rounds].filter((r) => r.roleId === role.id).at(-1);
  const editable = stage === "casting";
  const allCast = p.roles.length > 0 && p.roles.every((r) => r.cast !== undefined);
  const dryCast = p.roles.some((r) => r.cast?.dry === true);

  const launchAsk = (input: CastLaunchInput): void => {
    const next: CastLaunchInput = { ...input, mode };
    setBusy(true);
    setError(undefined);
    void port.castLaunch(next).then((r) => {
      setBusy(false);
      if (!r.ok) {
        setError(r.error.error);
        return;
      }
      onView(r.value.view);
      if (r.value.launch.kind === "launched") setLaunching(undefined);
      else setLaunching({ receipt: r.value.launch.receipt, input: next });
    });
  };

  const confirm = (): void => {
    if (launching === undefined) return;
    launchAsk({ ...launching.input, token: launching.receipt.token });
  };

  const advance = (): void => {
    setBusy(true);
    setError(undefined);
    void act(() => port.move({ id, to: "audio" })).then((m) => {
      setBusy(false);
      setError(m);
    });
  };

  return (
    <div className={s.block} data-casting={stage}>
      <CapsHeading text="casting" variant="section" tally={{ value: p.roles.filter((r) => r.cast !== undefined).length, label: `of ${p.roles.length} cast` }} />
      {editable && <RolesEditor key={p.roles.map((r) => `${r.id}:${r.name}:${r.auditionScript?.length ?? 0}:${r.cast === undefined ? 0 : 1}`).join("|")} entry={entry} id={id} port={port} act={act} launchAsk={launchAsk} />}
      {error !== undefined && <ErrorLine message={error} live />}
      {editable && (
        <div className={s.row}>
          <Seg label="mode" options={[{ value: "dry", label: "dry" }, { value: "live", label: "live" }]} value={mode} onChange={(m) => setMode(m as ReceiptMode)} />
          <span className={s.note}>dry draws stand-ins and calls no vendor</span>
        </div>
      )}
      {launching !== undefined && (
        <div className={s.block}>
          <Receipt receipt={launching.receipt} ceiling={ceiling} onCeiling={setCeiling} onConfirm={confirm} busy={busy} nowMs={Date.parse(launching.receipt.readAt)} />
          <Button label="Back" size="sm" disabled={busy} onPress={() => setLaunching(undefined)} />
        </div>
      )}
      {p.roles.length > 1 && (
        <Seg label="role" options={p.roles.map((r) => ({ value: r.id, label: `${r.name}${r.cast === undefined ? "" : " (cast)"}` }))} value={role?.id ?? ""} onChange={setCurrent} />
      )}
      {role !== undefined &&
        (round === undefined ? (
          <div className={s.block} data-round="none">
            <span className={s.words}>{role.brief}</span>
            {role.auditionScript === undefined && editable && <span className={s.note}>this role needs an audition line before a round can open</span>}
            <Empty label="no casting round yet" />
            {editable && role.cast === undefined && <Button label={busy ? "Reading receipt" : "Open round"} size="sm" tone="cyan" disabled={busy || launching !== undefined || role.auditionScript === undefined} onPress={() => launchAsk({ kind: "round", id, roleId: role.id, mode })} />}
          </div>
        ) : (
          <RoundPanel key={round.id} round={round} role={role} port={port} act={act} id={id} stage={stage} launchAsk={launchAsk} />
        ))}
      {role !== undefined && round !== undefined && editable && role.cast === undefined && <Button label="New round for this role" size="sm" disabled={busy || launching !== undefined || inFlight(round.drawJob) || inFlight(round.voiceJob)} onPress={() => launchAsk({ kind: "round", id, roleId: role.id, mode })} />}
      {stage === "casting" && p.roles.length > 0 && (
        <div className={s.row}>
          <Button label="All roles cast: move to audio" size="sm" tone="emerald" disabled={busy || !allCast || dryCast} onPress={advance} />
          {!allCast && <span className={s.note}>every role needs a character and a voice</span>}
          {allCast && dryCast && <span className={s.note}>a dry cast cannot go to audio</span>}
        </div>
      )}
    </div>
  );
}
