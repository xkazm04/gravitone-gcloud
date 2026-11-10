"use client";

// THE AUDIO AND FINAL-CUT PANELS (spark concept-casting-stages S5). The audio decision is the operator's, one record per
// production; the ref-audio route stays shut until a held proof is stored, and the panel says which. The final cut is a
// receipt, one job on box.render, a video and a Board gate. Every refusal is the door's sentence, verbatim.

import { useState } from "react";

import type { Receipt as ReceiptValue, ReceiptMode } from "@gt/domain/produce";
import { cutFormatOf, MUSIC_ROUTES, SOUND_ROUTES, type MusicRoute, type SoundRoute, type VoiceRoute } from "@gt/domain/production.machine";
import type { ProductionCut, ProductionId } from "@gt/domain/production";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Receipt } from "@gt/ui/components/produce/Receipt.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import type { StatusEntry } from "@gt/ui/components/status/status.ts";

import { boardFor } from "../../../_shell/links.ts";
import type { ActionResult } from "../../../../_server/actionCore.ts";
import type { CutLaunchInput, ProductionEntry, ProductionsPort, ProductionsView } from "../_port/contract.ts";
import s from "./productions.module.css";

type Act = (run: () => Promise<ActionResult<ProductionsView>>) => Promise<string | undefined>;

const VOICE_WORDS: Readonly<Record<VoiceRoute, string>> = { "ref-audio": "voice in the picture (reference audio)", dub: "dub over the picture", none: "no dialogue" };
const MUSIC_WORDS: Readonly<Record<MusicRoute, string>> = { score: "a score bed", track: "a song track (music-clip)", none: "no music" };
const SOUND_WORDS: Readonly<Record<SoundRoute, string>> = { native: "keep the picture's own sound", none: "silence the picture's own sound" };

const decidable = (stage: string): boolean => stage === "audio";

export function AudioPanel({ entry, view, port, act, onView }: { readonly entry: ProductionEntry; readonly view: ProductionsView; readonly port: ProductionsPort; readonly act: Act; readonly onView: (v: ProductionsView) => void }) {
  const p = entry.production;
  const id = p.id as ProductionId;
  const stage = p.stage;
  const open = decidable(stage);
  const audio = p.audio;
  const proofHeld = view.voiceRoute === "ref-audio";
  const routes: readonly VoiceRoute[] = proofHeld ? ["dub", "ref-audio", "none"] : ["dub", "none"];
  const [voice, setVoice] = useState<VoiceRoute>(audio?.voice ?? "dub");
  const [music, setMusic] = useState<MusicRoute>(audio?.music ?? "score");
  const [sound, setSound] = useState<SoundRoute>(audio?.sound ?? "native");
  const [musicRef, setMusicRef] = useState(audio?.musicRef ?? "");
  const [note, setNote] = useState(audio?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [launching, setLaunching] = useState<{ readonly input: CutLaunchInput; readonly receipt: ReceiptValue } | undefined>();
  const [ceiling, setCeiling] = useState("");
  const [mode, setMode] = useState<ReceiptMode>("dry");

  if (!open && audio === undefined) return null;

  const decide = (): void => {
    setBusy(true);
    setError(undefined);
    void act(() => port.decideAudio({ id, voice, music, sound, ...(musicRef.trim() === "" ? {} : { musicRef: musicRef.trim() }), ...(note.trim() === "" ? {} : { note: note.trim() }) })).then((m) => {
      setBusy(false);
      setError(m);
    });
  };

  const toCut = (): void => {
    setBusy(true);
    setError(undefined);
    void act(() => port.move({ id, to: "cutting" })).then((m) => {
      setBusy(false);
      setError(m);
    });
  };

  const speak = (roleId: string): void => void ask({ kind: "speak", id, roleId, mode });
  const ask = async (input: CutLaunchInput): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const r = await port.cutLaunch(input);
    setBusy(false);
    if (!r.ok) {
      setError(r.error.error);
      return;
    }
    onView(r.value.view);
    setLaunching(r.value.launch.kind === "launched" ? undefined : { input, receipt: r.value.launch.receipt });
  };

  const speakers = open && proofHeld && audio?.voice === "ref-audio" ? p.roles.filter((r) => r.cast !== undefined && r.auditionScript !== undefined) : [];
  const proofWords = view.voiceProof === undefined ? "ref-audio is off: its GPU proof has not been run, so voices are dubbed in the cut" : view.voiceProof.outcome === "held" ? `the voice proof held (${view.voiceProof.at.slice(0, 10)})` : `ref-audio stays off: the proof did not hold${view.voiceProof.note === undefined ? "" : ` (${view.voiceProof.note})`}`;

  return (
    <div className={s.block} data-panel="audio" data-voice-route={view.voiceRoute}>
      <CapsHeading text="audio decision" variant="section" />
      {open ? (
        <>
          <div className={s.row}>
            <Select label="dialogue route" options={routes.map((value) => ({ value, label: VOICE_WORDS[value] }))} value={voice} onChange={(v) => setVoice(v as VoiceRoute)} />
            <Select label="music" options={MUSIC_ROUTES.map((value) => ({ value, label: MUSIC_WORDS[value] }))} value={music} onChange={(v) => setMusic(v as MusicRoute)} />
            <Select label="picture sound" options={SOUND_ROUTES.map((value) => ({ value, label: SOUND_WORDS[value] }))} value={sound} onChange={(v) => setSound(v as SoundRoute)} />
          </div>
          {music !== "none" && <Field label="music source reference" value={musicRef} onChange={setMusicRef} placeholder="a Library track's address or sha256" />}
          <TextArea label="note (optional)" value={note} rows={2} onChange={setNote} />
          <span className={s.note} data-voice-note={view.voiceRoute}>
            {proofWords}
          </span>
          <span className={s.note}>{music === "track" ? "a song track cuts as a music clip, to its beat" : "cuts as a trailer on the picture's own sound"}</span>
          <div className={s.row}>
            <Button label={busy ? "Saving" : audio === undefined ? "Decide" : "Update decision"} size="sm" tone="cyan" disabled={busy} onPress={decide} />
            {audio !== undefined && <Button label="Go to final cut" size="sm" tone="emerald" disabled={busy} onPress={toCut} />}
          </div>
          {speakers.length > 0 && (
            <div className={s.block} data-speaking="offered">
              <CapsHeading text="speaking take" variant="section" />
              <Seg label="mode" options={[{ value: "dry", label: "dry" }, { value: "live", label: "live" }]} value={mode} onChange={(m) => setMode(m as ReceiptMode)} />
              {speakers.map((r) => (
                <div className={s.row} key={r.id}>
                  <span className={s.name}>{r.name}</span>
                  <Button label={busy ? "Reading receipt" : "Render speaking take"} size="sm" disabled={busy || launching !== undefined} onPress={() => speak(r.id)} />
                </div>
              ))}
            </div>
          )}
          {launching !== undefined && (
            <div className={s.block}>
              <Receipt receipt={launching.receipt} ceiling={ceiling} onCeiling={setCeiling} onConfirm={() => void ask({ ...launching.input, token: launching.receipt.token })} busy={busy} nowMs={Date.parse(launching.receipt.readAt)} />
              <Button label="Back" size="sm" disabled={busy} onPress={() => setLaunching(undefined)} />
            </div>
          )}
        </>
      ) : audio !== undefined ? (
        <>
          <Facts facts={[{ term: "dialogue", value: VOICE_WORDS[audio.voice] }, { term: "music", value: MUSIC_WORDS[audio.music] }, { term: "picture sound", value: SOUND_WORDS[audio.sound ?? "native"] }, ...(audio.musicRef === undefined ? [] : [{ term: "music source", value: audio.musicRef }]), { term: "decided by", value: `${audio.decidedBy}, ${audio.decidedAt.slice(0, 10)}` }]} />
          <span className={s.note}>{proofWords}</span>
        </>
      ) : (
        <Empty label="no audio decision yet" />
      )}
      {error !== undefined && <ErrorLine message={error} live />}
    </div>
  );
}

const CUT_PILL: Readonly<Record<ProductionCut["state"], StatusEntry>> = {
  assembling: { look: "running", label: "assembling" },
  "on-board": { look: "awaiting", label: "on the Board" },
  approved: { look: "done", label: "approved" },
  returned: { look: "idle", label: "returned" },
  failed: { look: "failed", label: "failed" },
  rehearsed: { look: "idle", label: "dry rehearsal" },
};

export function CutPanel({ entry, port, act, onView }: { readonly entry: ProductionEntry; readonly port: ProductionsPort; readonly act: Act; readonly onView: (v: ProductionsView) => void }) {
  const p = entry.production;
  const id = p.id as ProductionId;
  const stage = p.stage;
  const cut = p.cut;
  const usable = p.takes.filter((t) => t.state === "ready" && t.stale !== true && t.dry !== true);
  const [chosen, setChosen] = useState<readonly string[]>(usable.filter((t) => t.provenAt !== undefined).map((t) => t.id).slice(0, 1));
  const [mode, setMode] = useState<ReceiptMode>("dry");
  const [launching, setLaunching] = useState<{ readonly input: CutLaunchInput; readonly receipt: ReceiptValue } | undefined>();
  const [ceiling, setCeiling] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (stage !== "cutting" && stage !== "done" && cut === undefined) return null;

  const toggle = (takeId: string): void => setChosen((cur) => (cur.includes(takeId) ? cur.filter((x) => x !== takeId) : [...cur, takeId]));

  const ask = async (input: CutLaunchInput): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const r = await port.cutLaunch(input);
    setBusy(false);
    if (!r.ok) {
      setError(r.error.error);
      return;
    }
    onView(r.value.view);
    setLaunching(r.value.launch.kind === "launched" ? undefined : { input, receipt: r.value.launch.receipt });
  };

  const back = (): void => {
    setBusy(true);
    setError(undefined);
    void act(() => port.move({ id, to: "audio" })).then((m) => {
      setBusy(false);
      setError(m);
    });
  };

  const openCut = cut?.state === "assembling" || cut?.state === "on-board";
  const launchable = stage === "cutting" && !openCut;
  const format = p.audio === undefined ? undefined : cutFormatOf(p.audio.music);

  return (
    <div className={s.block} data-panel="cut">
      <CapsHeading text="final cut" variant="section" />
      {launchable && (
        <>
          <span className={s.meta}>{format === undefined ? "no audio decision" : format === "music-clip" ? "music clip: the track is the timeline" : "trailer: the picture's own sound, with the voices laid over it"}</span>
          {usable.length === 0 ? (
            <Empty label="no finished take to cut" />
          ) : (
            <div className={s.frames}>
              {usable.map((t) => {
                const at = chosen.indexOf(t.id);
                return (
                  <button type="button" key={t.id} className={s.frame} aria-pressed={at !== -1} disabled={busy || launching !== undefined} onClick={() => toggle(t.id)} data-cut-take={t.id}>
                    <span className={s.meta}>
                      {t.id} · {t.kind === "hero" ? "hero" : "rough cut"} · {t.durationS === undefined ? "?" : `${t.durationS.toFixed(1)} s`}
                      {t.speaking !== undefined ? " · speaking" : ""}
                    </span>
                    {at !== -1 && <Chip label={`in cut, ${at + 1}`} tone="cyan" casing="lower" />}
                  </button>
                );
              })}
            </div>
          )}
          <div className={s.row}>
            <Seg label="mode" options={[{ value: "dry", label: "dry" }, { value: "live", label: "live" }]} value={mode} onChange={(m) => setMode(m as ReceiptMode)} />
            <Button label={busy ? "Reading receipt" : "Assemble final cut"} size="sm" tone="cyan" disabled={busy || chosen.length === 0 || launching !== undefined} onPress={() => void ask({ kind: "cut", id, takes: chosen, mode })} />
            <Button label="Back to audio" size="sm" disabled={busy} onPress={back} />
          </div>
          {launching !== undefined && (
            <div className={s.block}>
              <Receipt receipt={launching.receipt} ceiling={ceiling} onCeiling={setCeiling} onConfirm={() => void ask({ ...launching.input, token: launching.receipt.token })} busy={busy} nowMs={Date.parse(launching.receipt.readAt)} />
              <Button label="Back" size="sm" disabled={busy} onPress={() => setLaunching(undefined)} />
            </div>
          )}
        </>
      )}
      {cut === undefined ? (
        !launchable && <Empty label="no cut assembled yet" />
      ) : (
        <div className={s.take} data-cut={cut.id} data-cut-state={cut.state}>
          {cut.video !== undefined && <video className={s.plate} src={cut.video} controls preload="metadata" />}
          <div className={s.row}>
            <Chip label={cut.id} casing="lower" />
            <EntryPill entry={CUT_PILL[cut.state]} />
            {cut.dry === true && <Chip label="dry stand-in" ghost casing="lower" name="dry run: no video exists" />}
            {cut.packetId !== undefined && <Button label="Open on Board" size="sm" glyphAfter="chevR" href={boardFor(cut.packetId)} />}
          </div>
          {cut.state === "assembling" && <span className={s.meta}>{entry.cutJob === undefined ? "the job is not readable yet" : entry.cutJob.jobState === "queued" ? "queued for the worker on box.render" : `${entry.cutJob.step ?? entry.cutJob.jobState} · ${entry.cutJob.done}/${entry.cutJob.total || "?"}`}</span>}
          <Facts facts={[{ term: "format", value: cut.format }, { term: "takes", value: cut.takes.join(", ") }, ...(cut.durationS === undefined ? [] : [{ term: "length", value: `${cut.durationS.toFixed(1)} s` }]), ...(cut.receipt === undefined ? [] : [{ term: "receipt", value: cut.receipt.slice(0, 12) }])]} />
          {cut.note !== undefined && <span className={s.note}>{cut.note}</span>}
          {cut.error !== undefined && <ErrorLine message={cut.error} />}
          {cut.state === "returned" && <span className={s.note}>returned from the Board; launch another cut or go back to audio</span>}
          {cut.state === "rehearsed" && <span className={s.note}>a dry rehearsal: nothing was assembled and nothing reaches the Board</span>}
        </div>
      )}
      {error !== undefined && <ErrorLine message={error} live />}
    </div>
  );
}
