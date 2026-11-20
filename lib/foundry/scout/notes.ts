// THE OPERATOR'S NOTES FOR THE NEXT SCOUTING - server only (docs/scout-canvas-port.md, owner case b). A note is pinned
// on the scout canvas where the operator right-clicked: a basin, an audience, a channel, a genre's river, a stage of a
// river, one node. It says how to approach ideas there next time: a stance (more, a new angle, fewer, stop) and/or
// words. The round's GOAL (words, and episodes to make per channel) is kept beside them. The next night's brief carries
// both (`notesBrief`, read by pipeline/scout.mts into taste.md under `## Operator notes`).
//
// `<scoutRoot>/scout-notes.json` = `{ notes, goal }`, one file. Every write is a read-modify-write under the scout
// root's lock (../verdictLog withRunLock - a lock FILE, so it holds across processes) and an atomic write. The file is
// parsed at the door; a damaged one throws with its path - it never reads as "no notes", because the operator's
// direction silently vanishing from the next brief is the one failure this store exists to prevent. Nothing here spends.

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseAt, parseJsonAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";

import { writeJsonAtomic } from "../runStore";
import { withRunLock } from "../verdictLog";
import { scoutRoot } from "./store";

export const NOTE_KINDS = ["basin", "audience", "channels", "channel", "genre", "nights", "stage", "node"] as const;
export const NOTE_STANCES = ["more", "turn", "less", "stop", ""] as const;
const STANCE_WORD: Readonly<Record<(typeof NOTE_STANCES)[number], string>> = { more: "more", turn: "a new angle", less: "fewer", stop: "stop", "": "" };

const noteSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(NOTE_KINDS),
  key: z.string().min(1).max(300),
  name: z.string().min(1).max(200),
  text: z.string().max(2000),
  stance: z.enum(NOTE_STANCES),
  at: z.string().min(1).max(40),
  by: z.string().min(1).max(120),
});
const goalSchema = z.object({
  text: z.string().max(2000),
  targets: z.array(z.object({ channel: z.string().min(1).max(16), n: z.number().int().min(0).max(20) })).max(20),
});
const fileSchema = z.object({ notes: z.array(noteSchema).max(500), goal: goalSchema });

export type ScoutNoteRow = z.infer<typeof noteSchema>;
export type RoundGoalRow = z.infer<typeof goalSchema>;
export type NotesFile = z.infer<typeof fileSchema>;
export type NoteDraft = Pick<ScoutNoteRow, "kind" | "key" | "name" | "text" | "stance">;

export const EMPTY_NOTES: NotesFile = { notes: [], goal: { text: "", targets: [] } };
const NOTES_FILE = "scout-notes.json";
export const notesFile = (): string => path.join(scoutRoot(), NOTES_FILE);

export async function readNotes(): Promise<NotesFile> {
  let text: string;
  try {
    text = await readFile(notesFile(), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return EMPTY_NOTES;
    throw e;
  }
  const r = parseJsonAt(`scout notes ${notesFile()}`, fileSchema, text);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

async function mutate(fn: (f: NotesFile) => Result<NotesFile>): Promise<Result<NotesFile>> {
  await mkdir(scoutRoot(), { recursive: true });
  return withRunLock(scoutRoot(), async () => {
    const before = await readNotes();
    const after = fn(before);
    if (after.ok && after.value !== before) await writeJsonAtomic(notesFile(), after.value);
    return after;
  });
}

let seq = 0;
const newId = (now: Date): string => `n-${now.getTime().toString(36)}-${(seq++).toString(36)}`;

export async function addNote(draft: NoteDraft, by: string, now: Date = new Date()): Promise<Result<NotesFile>> {
  if (draft.text.trim() === "" && draft.stance === "") return err("invalid", "a note says something: words, a stance, or both");
  const row = parseAt("scout note", noteSchema, { ...draft, text: draft.text.trim(), id: newId(now), at: now.toISOString(), by });
  if (!row.ok) return row;
  return mutate((f) => ok({ ...f, notes: [...f.notes, row.value] }));
}

export async function removeNote(id: string): Promise<Result<NotesFile>> {
  return mutate((f) => (f.notes.some((n) => n.id === id) ? ok({ ...f, notes: f.notes.filter((n) => n.id !== id) }) : err("not-found", `no note ${id}`)));
}

export async function setRoundGoal(goal: RoundGoalRow): Promise<Result<NotesFile>> {
  const g = parseAt("round goal", goalSchema, goal);
  if (!g.ok) return g;
  return mutate((f) => ok({ ...f, goal: g.value }));
}

/** The section the next night's taste.md carries: the goal, then every note by where it was pinned. Empty: none. */
export function notesBrief(f: NotesFile): string {
  const lines: string[] = [];
  const goal = f.goal.text.trim();
  const targets = f.goal.targets.filter((t) => t.n > 0);
  if (goal !== "" || targets.length > 0) {
    lines.push("### Goal for this round", "");
    if (goal !== "") lines.push(goal);
    for (const t of targets) lines.push(`- ${t.channel}: ${t.n} ${t.n === 1 ? "episode" : "episodes"}`);
    lines.push("");
  }
  if (f.notes.length > 0) {
    lines.push("### Notes pinned on the map", "");
    for (const n of f.notes) {
      const stance = STANCE_WORD[n.stance];
      lines.push(`- ${n.kind} **${n.name}**${stance !== "" ? ` — ${stance}` : ""}${n.text !== "" ? `: ${n.text}` : ""}`);
    }
  }
  return lines.length === 0 ? "" : ["## Operator notes", "", ...lines].join("\n").trimEnd();
}
