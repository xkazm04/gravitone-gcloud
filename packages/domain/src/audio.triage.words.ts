import { EXPERIMENTAL_CHECKS, type Finding, type Triage } from "./audio.triage.ts";

// A triage as the Board's one line of work facts - only what flagged, each in its own unit and
// at its place in the file: "clipped run 12 · true peak +0.8 dBTP · dead air 3.1 s at 41.0 s".
// Pure and zod-free (audio.fx.label.ts's reason): a client cell may import it.

const n1 = (v: number): string => (Math.round(v * 10) / 10).toFixed(1);
const at = (f: Finding): string => (f.atS === undefined ? "" : ` at ${n1(f.atS)} s`);
const signed = (v: number): string => `${v > 0 ? "+" : ""}${n1(v)}`;

function said(f: Finding): string {
  const v = f.value;
  switch (f.check) {
    case "clipping":
      return `clipped run ${v ?? "?"}${at(f)}`;
    case "true-peak-over":
      return `true peak ${v === null ? "?" : signed(v)} dBTP`;
    case "loudness-range":
      return v === null ? "loudness not measured" : `loudness ${n1(v)} LUFS`;
    case "dead-air":
      return `dead air ${v === null ? "?" : n1(v)} s${at(f)}`;
    case "duration":
      return `length off ${v === null ? "?" : Math.round(v * 100)}%`;
    case "broken-ending":
      return f.note ?? `cut at end (${v === null ? "?" : signed(v)} dB)`;
    case "tempo-instability":
      return `tempo drift ${v === null ? "?" : n1(v)} bpm`;
    case "section-boundary":
      return `section off ${v === null ? "?" : n1(v)} s${at(f)}`;
    case "loop-seam":
      return `loop seam ${v === null ? "?" : n1(v)} dB`;
    case "mono-fold":
      return `mono ${v === null ? "?" : signed(-v)} dB`;
  }
}

/** The flagged findings as one line, or null when nothing flagged. An experimental check
 *  (audio.triage.ts EXPERIMENTAL_CHECKS) is stored but never said here. */
export function triageWords(t: Triage): string | null {
  const flagged = t.findings.filter((f) => f.verdict === "flag" && !EXPERIMENTAL_CHECKS.has(f.check)).map(said);
  return flagged.length === 0 ? null : flagged.join(" · ");
}
