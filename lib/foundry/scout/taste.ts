import { listNights, readNight } from "./store";
import { CANDIDATE_KINDS, parseCellId, type Candidate, type CandidateKind, type Night } from "./types";

// THE TASTE BRIEF - the operator's last verdicts, written into each new night as
// taste.md for the skill to read before it searches (spark media-training-loop:
// "rejections and their reasons are read back each night"). Terse on purpose: a
// reader that has to wade through it will skim it.
//
// Read from the last TASTE_NIGHTS nights whose packet was COMMITTED and that were
// not dry (a dry night's verdicts were triaged over stand-ins and teach nothing
// about the work). Per night: what was kept and thrown per candidate kind; each
// throw with its reasons (the `scout` source's words) and the operator's note,
// verbatim; and the channels behind what was kept and what was thrown, so a
// channel thrown twice stops being searched.
//
// GAME ASSETS are tallied across the same nights by class and technique - kept, thrown, and the
// reasons each was thrown for - because the question the 3D rounds left open is a comparison
// (operator, 2026-10-22: does T1's budget generation or T2's game-camera design make the better
// hero?), and a comparison is only readable as counts side by side. A cell `c-05/t2` is the
// variant whose id is its technique (lib/producers/scoutAssetActs.ts `plannedVariants`).

export const TASTE_NIGHTS = 7;

type Verdict = "kept" | "rejected";

/** Which candidate a cell belongs to, and that candidate. */
function candidateOf(n: Night, cell: string): Candidate | undefined {
  const p = parseCellId(cell);
  return p === null ? undefined : n.candidates.find((c) => c.id === p.candidate);
}

function label(n: Night, c: Candidate): string {
  const src = c.sourceIds.map((id) => n.sources.find((s) => s.id === id)).filter((s) => s !== undefined);
  const from = src.map((s) => `${s.title}${s.channel === undefined ? "" : ` (${s.channel})`}`).join("; ");
  switch (c.kind) {
    case "finding":
      return `"${c.claim}" [${c.template}/${c.step}]${from === "" ? "" : ` from ${from}`}`;
    case "watch":
      return `"${c.entry}"`;
    case "asset3d":
      return `"${c.brief.subject}" [${c.brief.class}]`;
    default:
      return `${from === "" ? c.id : from}${c.use === undefined ? "" : ` - for ${c.use}`}`;
  }
}

function channelsOf(n: Night, cells: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  const seen = new Set<string>();
  for (const cell of cells) {
    const c = candidateOf(n, cell);
    if (c === undefined || seen.has(c.id)) continue;
    seen.add(c.id);
    for (const id of c.sourceIds) {
      const ch = n.sources.find((s) => s.id === id)?.channel;
      if (ch !== undefined) out.set(ch, (out.get(ch) ?? 0) + 1);
    }
  }
  return out;
}

type Tally = { kept: number; thrown: number; reasons: Map<string, number> };

/** `## Game assets`: kept and thrown by class and technique, each row's throw reasons counted. Empty when no asset was judged. */
export function assetTally(nights: readonly Night[]): string[] {
  const rows = new Map<string, Tally>();
  for (const n of nights) {
    const c = n.committed;
    if (c === undefined) continue;
    for (const [v, cells] of [["kept", c.kept], ["rejected", c.rejected]] as const) {
      for (const cell of cells) {
        const cand = candidateOf(n, cell);
        // The technique leads the variant id (`t2`, a hand-made `t2-a`).
        const technique = /^[tm]\d/i.exec(parseCellId(cell)?.part ?? "")?.[0]?.toUpperCase();
        if (cand?.kind !== "asset3d" || technique === undefined) continue;
        const key = `${cand.brief.class} ${technique}`;
        const t = rows.get(key) ?? { kept: 0, thrown: 0, reasons: new Map<string, number>() };
        if (v === "kept") t.kept += 1;
        else {
          t.thrown += 1;
          for (const r of c.reasons[cell] ?? []) t.reasons.set(r, (t.reasons.get(r) ?? 0) + 1);
        }
        rows.set(key, t);
      }
    }
  }
  if (rows.size === 0) return [];
  const out = ["## Game assets", ""];
  for (const [key, t] of [...rows].sort((a, b) => a[0].localeCompare(b[0]))) {
    const why = [...t.reasons].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([r, k]) => `${r} ${k}`).join(", ");
    out.push(`- ${key}: kept ${t.kept} · thrown ${t.thrown}${why === "" ? "" : ` (${why})`}`);
  }
  out.push("");
  return out;
}

/** The brief for nights already read (pure; `tasteBrief` reads them). */
export function tasteOf(nights: readonly Night[]): string {
  const judged = nights.filter((n) => n.committed !== undefined && !n.dry && !n.committed.dry).slice(0, TASTE_NIGHTS);
  const lines = ["# Taste", ""];
  if (judged.length === 0) return [...lines, "No committed live night yet: nothing kept or thrown to learn from.", ""].join("\n");
  const kept = new Map<string, number>();
  const thrown = new Map<string, number>();
  for (const n of judged) {
    const c = n.committed;
    if (c === undefined) continue;
    lines.push(`## ${n.id} (committed ${c.at.slice(0, 10)} by ${c.by})`, "");
    const counts = (cells: readonly string[]): Record<CandidateKind, number> => {
      const by = Object.fromEntries(CANDIDATE_KINDS.map((k) => [k, 0])) as Record<CandidateKind, number>;
      for (const cell of cells) {
        const cand = candidateOf(n, cell);
        if (cand !== undefined) by[cand.kind] += 1;
      }
      return by;
    };
    for (const [v, cells] of [["kept", c.kept], ["rejected", c.rejected]] as const satisfies readonly (readonly [Verdict, readonly string[]])[]) {
      const by = counts(cells);
      lines.push(`- ${v}: ${CANDIDATE_KINDS.filter((k) => by[k] > 0).map((k) => `${by[k]} ${k}`).join(", ") || "none"}`);
    }
    for (const cell of c.kept) {
      const note = c.notes[cell];
      const cand = candidateOf(n, cell);
      if (note !== undefined && cand !== undefined) lines.push(`  - kept ${cand.kind} ${cell} ${label(n, cand)} - note: ${note}`);
    }
    for (const cell of c.rejected) {
      const cand = candidateOf(n, cell);
      if (cand === undefined) continue;
      const reasons = c.reasons[cell] ?? [];
      const note = c.notes[cell];
      lines.push(`  - threw ${cand.kind} ${cell} ${label(n, cand)}: ${reasons.length > 0 ? reasons.join(", ") : "no reason given"}${note === undefined ? "" : ` - note: ${note}`}`);
    }
    for (const [ch, k] of channelsOf(n, c.kept)) kept.set(ch, (kept.get(ch) ?? 0) + k);
    for (const [ch, k] of channelsOf(n, c.rejected)) thrown.set(ch, (thrown.get(ch) ?? 0) + k);
    lines.push("");
  }
  const list = (m: Map<string, number>): string =>
    [...m]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([ch, k]) => `${ch} ${k}`)
      .join(", ") || "none";
  // The uses the operator kept, and the ones refused AS uses (the `use case` reason): a direction
  // refused that way is not tried again until something new makes it worth it.
  const uses = (pred: (n: Night, cell: string) => boolean): string[] => [
    ...new Set(
      nights.flatMap((n) => {
        const c = n.committed;
        if (c === undefined || c.dry) return [];
        return [...c.kept, ...c.rejected].filter((cell) => pred(n, cell)).flatMap((cell) => {
          const u = candidateOf(n, cell)?.use;
          return u === undefined ? [] : [u];
        });
      }),
    ),
  ];
  const keptUses = uses((n, cell) => n.committed?.kept.includes(cell) === true);
  const refusedUses = uses((n, cell) => (n.committed?.reasons[cell] ?? []).includes("use case"));
  lines.push("## Uses", "", `- kept: ${keptUses.join("; ") || "none"}`, `- refused as a use: ${refusedUses.join("; ") || "none"}`, "");
  lines.push(...assetTally(judged));
  lines.push("## Channels", "", `- kept: ${list(kept)}`, `- thrown: ${list(thrown)}`);
  const twice = [...thrown].filter(([ch, k]) => k >= 2 && !kept.has(ch)).map(([ch]) => ch);
  if (twice.length > 0) lines.push(`- thrown twice or more, never kept: ${twice.join(", ")}`);
  lines.push("");
  return lines.join("\n");
}

/** Read every night on disk, newest first, and write the brief. An unreadable night is skipped. */
export async function tasteBrief(except?: string): Promise<string> {
  const nights: Night[] = [];
  for (const s of await listNights()) {
    if (s.id === except || s.state !== "committed") continue;
    try {
      nights.push(await readNight(s.id));
    } catch {
      /* a manifest mid-write or damaged: its verdicts wait for the next night */
    }
  }
  return tasteOf(nights);
}
