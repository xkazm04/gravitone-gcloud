import "server-only";

import { stat } from "node:fs/promises";

import type { CoverRecord } from "@gt/domain/cover";
import type { LibraryItemInput } from "@gt/domain/libraryItem";

import { probeDurationS } from "../../sound/cover/cut.ts";
import { coverFileHref, coverFileOf, SECTION_FILE, type CoverFileName } from "../../sound/cover/href.ts";
import { coverRights } from "../../sound/cover/rights.ts";
import { coverFileAbs, listCovers } from "../../sound/cover/store.ts";
import { isoOf, type Feed, type FeedItem, type FeedRead } from "./types.ts";

// THE COVERS, AS LIBRARY REFERENCES (spark track-mirror-studio, WP2). A cover with a winner is up to three audio
// items: the section it covered (`:source`; the cut section.wav, or the uploaded song while the job has not cut
// one), the picked take exported as mp3 (`:winner`), and the remix brought back from Suno (`:remix`). Every one
// is `reference`, never a candidate for a cut: their rights are coverRights()'s, the one place that computes
// them, and it never answers publishable (the takes come from CC BY-NC weights). Lineage runs back a step each:
// the remix to the winner, the winner to the source. A cover with no winner projects nothing yet.
//
// A reference is re-read from the cover store on every sync, so the sync's prune keeps it only as long as the
// cover holds it (lib/library/project.ts pruneFeed): this feed IS the reference's home.
//
// The record holds no remix length (@gt/domain/cover CoverRecord.remix), and an audio item must carry one, so the
// remix is measured here by ffprobe, once per file version in this process.

type Role = "source" | "winner" | "remix";

const measured = new Map<string, number>();

/** The remix's length: ffprobe, remembered by path, size and mtime. Undefined when it cannot be read. */
async function remixLength(abs: string): Promise<number | undefined> {
  let key: string;
  try {
    const s = await stat(abs);
    key = `${abs}|${s.size}|${Math.floor(s.mtimeMs)}`;
  } catch {
    return undefined;
  }
  const held = measured.get(key);
  if (held !== undefined) return held;
  const d = await probeDurationS(abs);
  if (!d.ok) return undefined;
  measured.set(key, d.value);
  return d.value;
}

const exists = async (abs: string): Promise<boolean> => {
  try {
    return (await stat(abs)).isFile();
  } catch {
    return false;
  }
};

export const coverItemId = (id: string, role: Role): string => `audio:cover:${id}:${role}`;

function itemOf(c: CoverRecord, role: Role, fixture: boolean, durationS: number, served: CoverFileName, prompt: string, provider: "local" | "suno", lineage: readonly Role[]): FeedItem | undefined {
  const file = coverFileOf(c, served);
  if (file === undefined) return undefined;
  const at = isoOf(c.createdAt);
  const item: LibraryItemInput = {
    kind: "audio",
    id: coverItemId(c.id, role),
    title: `${c.title} · ${role}`,
    state: "reference",
    collections: [],
    origin: "cover",
    rights: coverRights(c.rights, c.holder, c.note),
    source: fixture ? "fixture" : "real",
    lineage: lineage.map((r) => ({ kind: "library-item" as const, id: coverItemId(c.id, r) })),
    vocabulary: { type: "music", genre: [], mood: [], instrument: [], provider, durationS },
    ...(at === undefined ? {} : { at }),
  };
  return {
    item,
    meta: [`${Math.round(durationS)} s`, c.rights].join(" · "),
    extras: {
      audio: {
        prompt,
        reasons: [],
        facts: { asked: { tempoBpm: null, key: null, durationS }, measured: null },
        peaks: [],
        src: coverFileHref(c.id, served),
      },
    },
    file: { abs: coverFileAbs(c.id, file.rel), mime: file.mime },
  };
}

export const coversFeed: Feed = {
  id: "covers",
  async read(ctx): Promise<FeedRead> {
    const items: FeedItem[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const held: string[] = [];
    const fixture = ctx.universe === "fixture";
    for (const c of await listCovers()) {
      if (c.exportFile === undefined || c.winnerSeed === undefined) continue;
      const sectionS = c.section.endS - c.section.startS;
      const cut = await exists(coverFileAbs(c.id, SECTION_FILE));
      const source = cut ? itemOf(c, "source", fixture, sectionS, "section", c.sourceStyle ?? "", "local", []) : itemOf(c, "source", fixture, c.source.durationS, "source", c.sourceStyle ?? "", "local", []);
      const winner = itemOf(c, "winner", fixture, sectionS, "winner", c.style, "local", ["source"]);
      for (const it of [source, winner]) if (it !== undefined) items.push(it);
      if (c.remix === undefined) continue;
      const len = await remixLength(coverFileAbs(c.id, c.remix.file));
      if (len === undefined || len <= 0) {
        // Held, not pruned: a process that cannot run ffprobe this time has not seen the remix go.
        skipped.push({ id: coverItemId(c.id, "remix"), reason: "the remix's length could not be read" });
        held.push(coverItemId(c.id, "remix"));
        continue;
      }
      const remix = itemOf(c, "remix", fixture, len, "remix", c.remix.style, "suno", ["winner"]);
      if (remix !== undefined) items.push(remix);
    }
    return { items, skipped, ...(held.length === 0 ? {} : { held }) };
  },
};
