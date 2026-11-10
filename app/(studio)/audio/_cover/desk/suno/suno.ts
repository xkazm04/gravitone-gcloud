// THE SUNO STATION'S SMALL VOCABULARY (spark suno-covers): the plan a form makes, the five steps of a send read off
// its record, the words a take wears. Pure. The record is the only source: nothing here polls, the desk re-reads.
import {
  SUNO_COVER_DURATION_MAX_S,
  SUNO_COVER_DURATION_MIN_S,
  SUNO_COVER_MODEL_DEFAULT,
  type CoverSuno,
  type CoverSunoPlan,
  type CoverSunoSend,
  type CoverSunoSendState,
  type CoverSunoTake,
  type CoverSunoTakeState,
  type SunoCoverControls,
  type SunoCoverModel,
  type SunoCoverVariety,
} from "@gt/domain/cover.suno";
import type { CoverRecord } from "@gt/domain/cover";
import type { Tone } from "@gt/ui/components/chip/tone.ts";

/** The form's values. A control left `undefined` is untouched and is NOT sent: Suno's own default stands. */
export type SunoForm = {
  readonly style: string;
  readonly lyrics: string;
  readonly model: SunoCoverModel;
  /** Whole percents, 0-100. */
  readonly audioInfluence?: number;
  readonly styleInfluence?: number;
  readonly weirdness?: number;
  readonly variety?: SunoCoverVariety;
  readonly negativeStyle: string;
  /** Text as typed: empty is no target. */
  readonly duration: string;
};

/** What the form starts from: the remix's style, else the cover's; the cover's lyrics; the default model. */
export const formOf = (r: CoverRecord): SunoForm => ({ style: r.remix?.style ?? r.style, lyrics: r.lyrics, model: SUNO_COVER_MODEL_DEFAULT, negativeStyle: "", duration: "" });

/** The target length the field holds: undefined for none, NaN for a value outside Suno's bounds. */
export function durationOf(text: string): number | undefined {
  const t = text.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isInteger(n) && n >= SUNO_COVER_DURATION_MIN_S && n <= SUNO_COVER_DURATION_MAX_S ? n : Number.NaN;
}

export const durationBad = (f: SunoForm): boolean => Number.isNaN(durationOf(f.duration));

/** A send can go: a style, and a target length that is either absent or in Suno's bounds. */
export const sendable = (f: SunoForm): boolean => f.style.trim() !== "" && !durationBad(f);

/** The plan: an untouched control and an empty optional are omitted keys, never null. */
export function planOf(id: string, f: SunoForm): CoverSunoPlan {
  const d = durationOf(f.duration);
  const controls: SunoCoverControls = {
    ...(f.audioInfluence === undefined ? {} : { audioInfluence: f.audioInfluence / 100 }),
    ...(f.styleInfluence === undefined ? {} : { styleInfluence: f.styleInfluence / 100 }),
    ...(f.weirdness === undefined ? {} : { weirdness: f.weirdness / 100 }),
    ...(f.variety === undefined ? {} : { variety: f.variety }),
  };
  return {
    id,
    style: f.style.trim(),
    lyrics: f.lyrics,
    model: f.model,
    ...(f.negativeStyle.trim() === "" ? {} : { negativeStyle: f.negativeStyle.trim() }),
    ...(d === undefined || Number.isNaN(d) ? {} : { durationS: d }),
    ...(Object.keys(controls).length === 0 ? {} : { controls }),
  };
}

export const VARIETY_LABEL: Readonly<Record<SunoCoverVariety, string>> = { 0: "Off", 1: "Normal", 2: "High", 3: "Extra", 4: "Max" };

/** A send's plan as chips: the model and each control it carried, in whole percents. */
export function planFacts(p: CoverSunoSend["plan"]): readonly { readonly label: string; readonly value?: string }[] {
  const c = p.controls;
  return [
    { label: p.model },
    ...(c?.audioInfluence === undefined ? [] : [{ label: "audio", value: `${Math.round(c.audioInfluence * 100)} %` }]),
    ...(c?.styleInfluence === undefined ? [] : [{ label: "style", value: `${Math.round(c.styleInfluence * 100)} %` }]),
    ...(c?.weirdness === undefined ? [] : [{ label: "weirdness", value: `${Math.round(c.weirdness * 100)} %` }]),
    ...(c?.variety === undefined ? [] : [{ label: "variety", value: VARIETY_LABEL[c.variety] }]),
    ...(p.durationS === undefined ? [] : [{ label: "target", value: clockS(p.durationS) }]),
    ...(p.negativeStyle === undefined ? [] : [{ label: "not", value: p.negativeStyle }]),
    ...(p.lyrics.trim() === "" ? [{ label: "instrumental" }] : []),
  ];
}

export function clockS(s: number): string {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Newest send first. */
export const newestFirst = (s: CoverSuno | undefined): readonly CoverSunoSend[] => [...(s?.sends ?? [])].sort((a, b) => b.n - a.n);

export const SEND_TONE: Readonly<Record<CoverSunoSendState, Tone>> = { queued: "cyan", running: "cyan", done: "emerald", failed: "rose" };
export const TAKE_TONE: Readonly<Record<CoverSunoTakeState, Tone>> = { pending: "neutral", streaming: "cyan", complete: "emerald", failed: "rose" };

export type StepKey = "upload" | "cover 1" | "cover 2" | "read 1" | "read 2";
export type StepState = "done" | "running" | "pending" | "failed";
export type Step = { readonly key: StepKey; readonly state: StepState };
export const STEP_TONE: Readonly<Record<StepState, Tone>> = { done: "emerald", running: "cyan", pending: "neutral", failed: "rose" };

const takeOf = (s: CoverSunoSend, n: 1 | 2): CoverSunoTake | undefined => s.takes.find((t) => t.take === n);

/** The five steps of a send and which is done, read off the record: the upload, a cover and a free read per take.
 *  The first step still to do is the one running while the send is. */
export function stepsOf(send: CoverSunoSend, uploadClipId: string | undefined): readonly Step[] {
  const live = send.state === "running";
  const failed = send.state === "failed";
  const raw: readonly { readonly key: StepKey; readonly done: boolean; readonly broke: boolean }[] = [
    { key: "upload", done: uploadClipId !== undefined, broke: false },
    ...([1, 2] as const).map((n) => {
      const t = takeOf(send, n);
      return { key: `cover ${n}` as StepKey, done: t?.state === "complete", broke: t?.state === "failed" };
    }),
    ...([1, 2] as const).map((n) => {
      const t = takeOf(send, n);
      return { key: `read ${n}` as StepKey, done: t !== undefined && (t.read !== undefined || t.readRefused !== undefined), broke: false };
    }),
  ];
  // Reads follow covers; the first not-done step of the order upload, cover 1, cover 2, read 1, read 2 is the live one.
  const first = raw.findIndex((x) => !x.done);
  return raw.map((x, i): Step => {
    if (x.done) return { key: x.key, state: "done" };
    if (x.broke || (failed && i === first)) return { key: x.key, state: "failed" };
    return { key: x.key, state: live && i === first ? "running" : "pending" };
  });
}

export const stepsDone = (steps: readonly Step[]): number => steps.filter((s) => s.state === "done").length;

/** How long since `at`, coarse: minutes under an hour, hours under a day, days after. */
export function ago(at: string, nowMs: number): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return "";
  const m = Math.max(0, Math.round((nowMs - t) / 60_000));
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`;
}
