// THE SUNO VOCABULARY'S ARITHMETIC, pure (spark suno-advisor). The shapes in this directory draw it:
//   SunoPromptCard  what Copy all puts on the clipboard, each field's count against SUNO_LIMITS, and
//                   the confirmed `dislike` taste lines merged into `exclude` at copy time
//   VerdictBar      the verdict a press composes, its words when the dock's draft is empty, and
//                   whether a picked file is a take at all
//   TakeFacts       measured rows, where a listener's tempo or key disagrees with the measurement
//                   (the measured value stands), and the Listen button's state
// Values only from @gt/domain/audio.suno (zod-free); @gt/domain/audio.studio is imported for TYPES only,
// so a client island loads none of the schemas.
import type { StudioTurn } from "@gt/domain/audio.studio";
import type { StudioMeasured, StudioListen, StudioTakeFacts, StudioTasteLine, VerdictClip, VerdictOff } from "@gt/domain/audio.suno";
import { SUNO_FIELDS, SUNO_LIMITS, VERDICT_OFF } from "@gt/domain/audio.suno";

/** suno.com's create form. The studio only ever opens it in a new tab; it never drives it. */
export const SUNO_CREATE_URL = "https://suno.com/create";
/** The window features Open Suno passes: the new tab gets no handle back to this page and no referrer. */
export const NEW_TAB_FEATURES = "noopener,noreferrer";

/** The three fields the person pastes, as Copy all labels them, in SUNO_FIELDS order. */
export const COPY_FIELDS = ["style", "lyrics", "exclude"] as const;
export type CopyField = (typeof COPY_FIELDS)[number];
export const COPY_LABEL: Readonly<Record<CopyField, string>> = { style: "Style", lyrics: "Lyrics", exclude: "Exclude" };

export type FieldCount = { readonly n: number; readonly limit: number; readonly over: boolean };

/** A field's length against its cap (UTF-16 units: the door's `max` counts the same way). */
export const countOf = (text: string, field: CopyField): FieldCount => {
  const limit = SUNO_LIMITS[field];
  return { n: text.length, limit, over: text.length > limit };
};

const term = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

/** The confirmed dislikes not already fenced out by the prompt's own `exclude`, each once, in profile order. */
export function tasteExcludes(taste: readonly StudioTasteLine[], exclude: string | undefined): readonly string[] {
  const have = new Set((exclude ?? "").split(",").map(term).filter((t) => t !== ""));
  const out: string[] = [];
  for (const t of taste) {
    if (t.lean !== "dislike") continue;
    const k = term(t.line);
    if (k === "" || have.has(k)) continue;
    have.add(k);
    out.push(t.line.trim());
  }
  return out;
}

/** The exclude text a copy carries: the prompt's own, then each taste line still in, comma-separated. */
export function mergedExclude(exclude: string | undefined, kept: readonly string[]): string {
  return [...(exclude ?? "").split(",").map((s) => s.trim()), ...kept].filter((s) => s !== "").join(", ");
}

export type CopyFields = { readonly style: string; readonly lyrics?: string; readonly exclude?: string };

/** Copy all: each present field under its label, in Suno's field order, a blank line between. */
export function copyAllText(f: CopyFields): string {
  const order = SUNO_FIELDS.filter((x): x is CopyField => (COPY_FIELDS as readonly string[]).includes(x));
  return order
    .map((k) => ({ k, text: (f[k] ?? "").trim() }))
    .filter((x) => x.text !== "")
    .map((x) => `${COPY_LABEL[x.k]}:\n${x.text}`)
    .join("\n\n");
}

/** A user turn's verdict, as the door holds it (type only: the schema stays on the server). */
export type Verdict = NonNullable<StudioTurn["verdict"]>;

/** The verdict a press composes: `keep` omitted when undecided, `off` omitted when empty, in VERDICT_OFF order. */
export function verdictOf(promptId: string, clip: VerdictClip, keep: boolean | undefined, off: ReadonlySet<VerdictOff>): Verdict {
  const axes = VERDICT_OFF.filter((o) => off.has(o));
  return { promptId, clip, ...(keep !== undefined ? { keep } : {}), ...(axes.length > 0 ? { off: axes } : {}) };
}

/** The message's words: the dock's draft when there is one, else the verdict said plainly. */
export function verdictText(v: Verdict, draft: string): string {
  const typed = draft.trim();
  if (typed !== "") return typed;
  const which = v.clip === "both" ? "both takes" : `take ${v.clip}`;
  const call = v.keep === undefined ? "" : v.keep ? ", keep" : ", drop";
  const off = v.off === undefined ? "" : `; off: ${v.off.join(", ")}`;
  return `${which}${call}${off}`;
}

const AUDIO_EXT = /\.(mp3|wav|m4a|flac|ogg|oga|aac|opus)$/i;

/** Why a picked file is not a take (null when it is one): audio by its type or, when the browser gave none, its name. */
export function attachFault(f: { readonly name: string; readonly type: string; readonly size: number }): string | null {
  const audio = f.type !== "" ? f.type.startsWith("audio/") : AUDIO_EXT.test(f.name);
  if (!audio) return `${f.name} is not an audio file`;
  if (f.size === 0) return `${f.name} is empty`;
  return null;
}

/** A file's size the way a person reads it: 812 KB, 4.2 MB. */
export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** m:ss. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A listen's price: sub-cent figures keep four places, so $0.0042 never reads as $0.00. */
export const usd = (n: number): string => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/** The beat tracker's octave neighbours: "or 48 / 192"; null when it found none. */
export function bpmAltWords(alt: readonly number[] | undefined): string | null {
  if (alt === undefined || alt.length === 0) return null;
  return `or ${alt.map((b) => String(Math.round(b))).join(" / ")}`;
}

const PITCH: Readonly<Record<string, number>> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** A key name as pitch class + mode ("F# minor", "Gbm", "A min", "C"); null when it does not read as one. */
export function keyClass(key: string): { readonly pc: number; readonly minor: boolean } | null {
  const m = /^\s*([a-g])\s*([#b♯♭]?)\s*(.*)$/i.exec(key);
  if (m === null) return null;
  const base = PITCH[(m[1] ?? "").toLowerCase()];
  if (base === undefined) return null;
  const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] === "b" || m[2] === "♭" ? -1 : 0;
  const rest = (m[3] ?? "").trim().toLowerCase();
  const minor = /^(m|min|minor)\b/.test(rest) && !/^maj/.test(rest);
  if (rest !== "" && !minor && !/^(maj|major)\b/.test(rest)) return null;
  return { pc: (base + acc + 12) % 12, minor };
}

/** A tempo within 4% of the measured one is the same tempo heard. */
export const BPM_AGREE = 0.04;

/** Where the listener's read disagrees with what was measured; the measured value stands either way. */
export function disagreement(measured: StudioMeasured, listened: StudioListen): { readonly bpm: boolean; readonly key: boolean } {
  const bpm = measured.bpm !== undefined && listened.bpm !== undefined && Math.abs(listened.bpm - measured.bpm) / measured.bpm > BPM_AGREE;
  let key = false;
  if (measured.key !== undefined && listened.key !== undefined) {
    const a = keyClass(measured.key);
    const b = keyClass(listened.key);
    key = a === null || b === null ? term(measured.key) !== term(listened.key) : a.pc !== b.pc || a.minor !== b.minor;
  }
  return { bpm, key };
}

export type MeasuredRow = { readonly term: string; readonly value: string; readonly aside?: string };

const signed = (n: number, digits: number): string => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;

/** The measured rows, each only when it was measured; length always (the take's file has one). */
export function measuredRows(f: Pick<StudioTakeFacts, "measured" | "durationS">): readonly MeasuredRow[] {
  const m = f.measured;
  const alt = bpmAltWords(m.bpmAlt);
  return [
    ...(m.bpm !== undefined ? [{ term: "bpm", value: String(Math.round(m.bpm)), ...(alt !== null ? { aside: alt } : {}) }] : []),
    ...(m.key !== undefined ? [{ term: "key", value: m.key, ...(m.keyStrength !== undefined ? { aside: `strength ${m.keyStrength.toFixed(2)}` } : {}) }] : []),
    ...(m.lufs !== undefined ? [{ term: "loudness", value: `${m.lufs.toFixed(1)} LUFS` }] : []),
    ...(m.truePeakDb !== undefined ? [{ term: "true peak", value: `${signed(m.truePeakDb, 1)} dBTP` }] : []),
    ...(m.lra !== undefined ? [{ term: "range", value: `${m.lra.toFixed(1)} LU` }] : []),
    { term: "length", value: clock(f.durationS) },
  ];
}

/** The Listen press as the page holds it between a press and the read that answers it. */
export type ListenPress = { readonly kind: "idle" } | { readonly kind: "working" } | { readonly kind: "refused"; readonly reason: string };

/** What the Listen control shows: the read done, a press on its way, or a priced / unpriced button. */
export type ListenView = "done" | "working" | "priced" | "unpriced";

export function listenView(f: Pick<StudioTakeFacts, "listened" | "listenUsd">, press: ListenPress): ListenView {
  if (f.listened !== undefined) return "done";
  if (press.kind === "working") return "working";
  return f.listenUsd === undefined ? "unpriced" : "priced";
}

/** An ISO time as `YYYY-MM-DD HH:MM` (UTC as written): the same text on the server and in the browser. */
export const stamp = (iso: string): string => iso.slice(0, 16).replace("T", " ");
