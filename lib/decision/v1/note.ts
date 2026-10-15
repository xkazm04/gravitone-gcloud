// REASONS CARRIED IN A FREE-TEXT NOTE - v1's spelling, moved here from
// lib/board/verdicts.ts (wave B ruling 11) because the decision adapters are
// now its readers of record and lib/board/** retires with v1's Board.
//
// v1's cull VerdictRecord (lib/foundry/types.ts) and an article's reject note
// have a `note` and no reasons field, and both stores keep the note verbatim.
// v1's Board therefore wrote a reject's axes as a leading `reasons: style,
// subject` line, so the record stays readable by a human opening the file and
// the reasons can be read back. The forge adapter decodes it when it imports
// v1's verdicts and encodes it when it applies the kernel's; the article
// adapter encodes a reject's note the same way. Pure, client-safe.

const REASONS_LINE = /^reasons:\s*([^\n]*)\n?/;

/** A reasons line, then the operator's words; undefined when both are empty. */
export function encodeNote(reasons: readonly string[], note: string | null): string | undefined {
  const head = reasons.length > 0 ? `reasons: ${reasons.join(", ")}` : "";
  const body = note?.trim() ?? "";
  const out = [head, body].filter(Boolean).join("\n");
  return out === "" ? undefined : out;
}

/** The inverse: the reasons line split off, and what remains (null when nothing does). */
export function decodeNote(note: string | undefined | null): { reasons: string[]; note: string | null } {
  if (note === undefined || note === null || note === "") return { reasons: [], note: null };
  const m = REASONS_LINE.exec(note);
  if (m === null) return { reasons: [], note };
  const reasons = (m[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rest = note.slice(m[0].length).trim();
  return { reasons, note: rest === "" ? null : rest };
}
