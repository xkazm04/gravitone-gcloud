// THE LANES' KNOW-HOW, AS RECORDS (spark device-metadata-sync, KS1) - what each graph lane learned, cut into one record
// per piece so the stream is append-only and a merge is a union: the core-to-scene experiment's findings (each top-level
// bullet under a `## ` heading of FINDINGS.md), the director's bible (one record), the dated bullets of the music-clip
// and scout skills' LESSONS.md, and the operator's accepted production lessons from the kernel. The files are READ only.
//
// A record's id is `<lane>:<kind>:<sha1 of its text, 12 hex>`, so the same words always land on the same file; an edited
// lesson is a new record beside the old one, never a rewrite. Only ACCEPTED kernel lessons travel: a proposal is the
// seat's draft until the operator takes it, and a `nothing` or dry row carries no know-how.

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { DeviceId, KnowhowLaneRecord, LaneRecordKind } from "@gt/domain/knowhow";
import type { ProductionLesson } from "@gt/domain/production";

import { productionFixtureRoot } from "../foundry/production/files.ts";

const sha12 = (text: string): string => createHash("sha1").update(text).digest("hex").slice(0, 12);

export const laneRecordId = (lane: string, kind: LaneRecordKind, text: string): string => `${lane}:${kind}:${sha12(text)}`;

const DATE_RE = /\b(20\d\d-\d\d-\d\d)\b/;
const dayAt = (d: string): string => `${d}T00:00:00.000Z`;

/** A record before it is owned: the text, where it came from, and its instant. */
export type LaneDraft = { readonly lane: string; readonly kind: LaneRecordKind; readonly text: string; readonly evidence?: string; readonly at: string };

export const toRecord = (d: LaneDraft, owner: DeviceId): KnowhowLaneRecord => ({
  v: 1,
  id: laneRecordId(d.lane, d.kind, d.text),
  lane: d.lane,
  kind: d.kind,
  text: d.text,
  ...(d.evidence === undefined ? {} : { evidence: d.evidence }),
  owner,
  at: d.at,
});

type Section = { readonly heading: string; readonly bullets: readonly string[] };

/** A markdown file's `## ` sections and their top-level bullets (continuation and nested lines kept with their bullet). */
export function sectionsOf(md: string): readonly Section[] {
  const out: { heading: string; bullets: string[] }[] = [];
  let cur: { heading: string; bullets: string[] } | null = null;
  let open: string[] | null = null;
  const close = (): void => {
    if (cur !== null && open !== null) cur.bullets.push(open.join("\n").trimEnd());
    open = null;
  };
  for (const line of md.split(/\r?\n/)) {
    if (/^#{1,2} /.test(line)) {
      close();
      cur = line.startsWith("## ") ? { heading: line.slice(3).trim(), bullets: [] } : null;
      if (cur !== null) out.push(cur);
      continue;
    }
    if (cur === null) continue;
    if (line.startsWith("- ")) {
      close();
      open = [line.slice(2).trim()];
    } else if (open !== null && /^\s+\S/.test(line)) {
      open.push(line.replace(/^ {2}/, ""));
    } else if (open !== null) {
      close();
    }
  }
  close();
  return out;
}

const read = (file: string): string | null => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

const mtimeAt = (file: string): string => {
  try {
    return statSync(file).mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
};

/** Sections that list files, not findings. */
const NOT_FINDINGS = new Set(["files"]);

/** The core-to-scene experiment's findings: one record per bullet, lane `music-clip`. */
export function findingDrafts(root: string = productionFixtureRoot()): readonly LaneDraft[] {
  const file = path.join(root, "experiment", "FINDINGS.md");
  const md = read(file);
  if (md === null) return [];
  const day = DATE_RE.exec(md)?.[1];
  const at = day === undefined ? mtimeAt(file) : dayAt(day);
  return sectionsOf(md)
    .filter((s) => !NOT_FINDINGS.has(s.heading.toLowerCase()))
    .flatMap((s) => s.bullets.map((text): LaneDraft => ({ lane: "music-clip", kind: "finding", text, evidence: `core-to-scene experiment FINDINGS, ${s.heading}`, at })));
}

/** The director's bible, whole: one record, lane `music-clip`. */
export function bibleDrafts(root: string = productionFixtureRoot()): readonly LaneDraft[] {
  const file = path.join(root, "experiment", "director", "bible.md");
  const md = read(file);
  if (md === null || md.trim() === "") return [];
  return [{ lane: "music-clip", kind: "bible", text: md.trim(), evidence: "core-to-scene experiment, director bible", at: mtimeAt(file) }];
}

/** `.claude/skills` under the working directory. */
export const skillsDir = (): string => path.join(process.cwd(), ".claude", "skills");

/** The skills whose LESSONS.md travel; the lane is the skill's name. */
export const LESSON_SKILLS = ["music-clip", "scout"] as const;

/** A skill's dated bullets: a bullet that opens with a date, or sits under a heading that carries one. */
export function lessonDrafts(skill: string, skills: string = skillsDir()): readonly LaneDraft[] {
  const md = read(path.join(skills, skill, "LESSONS.md"));
  if (md === null) return [];
  return sectionsOf(md).flatMap((s) =>
    s.bullets.flatMap((text): LaneDraft[] => {
      const day = /^\**(20\d\d-\d\d-\d\d)/.exec(text)?.[1] ?? DATE_RE.exec(s.heading)?.[1];
      return day === undefined ? [] : [{ lane: skill, kind: "lesson", text, evidence: `${skill} LESSONS, ${s.heading.replace(/`[^`]*`/g, "").replace(/\s+·\s*·/g, " ·").trim()}`, at: dayAt(day) }];
    }),
  );
}

/** An accepted production lesson from the kernel, lane `production`. */
export function kernelLessonDraft(l: ProductionLesson): LaneDraft | null {
  if (l.state !== "accepted" || l.dry === true) return null;
  const from = l.drawnFrom.map((d) => d.ref).join(", ");
  return { lane: "production", kind: "lesson", text: l.text, evidence: `${l.productionId} ${l.dimension}${from === "" ? "" : `; drawn from ${from}`}`, at: l.acceptedAt ?? l.proposedAt };
}

/** Every file-backed draft: what an export can fill without opening any store. */
export function fileDrafts(skills: string = skillsDir()): readonly LaneDraft[] {
  return [...findingDrafts(), ...bibleDrafts(), ...LESSON_SKILLS.flatMap((s) => lessonDrafts(s, skills))];
}
