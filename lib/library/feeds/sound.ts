import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import type { LibraryState } from "@gt/domain/library";

import { resolveRegistryDir } from "../../articles/registryRead.ts";
import { mvFileOf, readMv } from "../../sound/mv/store.ts";
import { filePathAbs } from "../../sound/store.ts";
import { listTakes } from "../../sound/takes.ts";
import { isoOf, words, type Feed, type FeedItem, type FeedRead } from "./types.ts";

// THE SOUND STORE, THE MUSIC VIDEOS AND THE REGISTRY, AS LIBRARY ITEMS.
//
// Takes are the Library's audio (Owner ruling 2026-10-17: kept takes are Library
// audio items; the Recipe Book's keep/reject retires into the Board's audio
// triage, so the take's verdict is read here, never written). A take's extras
// are the shape L52's audio detail takes whole (@gt/domain/library AudioExtras).
// A finished music video is a video item over its mp4. A registry subject is a
// document: the article pipeline's topic, by bundle.

const TAKE_STATE: Readonly<Record<string, LibraryState>> = { kept: "ratified", rejected: "rejected", unjudged: "unjudged" };

export const takesFeed: Feed = {
  id: "takes",
  async read(ctx): Promise<FeedRead> {
    const items: FeedItem[] = [];
    for (const t of await listTakes()) {
      const durationS = t.measured?.durationS ?? t.durationS;
      if (durationS === null || durationS <= 0) continue;
      const fixture = ctx.universe === "fixture" || t.origin === "fixture";
      const at = isoOf(t.createdAt);
      const group = t.group ?? t.terms.sfxCategory ?? undefined;
      items.push({
        item: {
          kind: "audio",
          id: `audio:${t.id}`,
          title: t.label ?? t.title,
          state: TAKE_STATE[t.verdict] ?? "unjudged",
          collections: [...(t.huntId === null ? [] : [{ kind: "hunt" as const, id: t.huntId }]), ...(t.projectId === null ? [] : [{ kind: "project" as const, id: t.projectId }])],
          origin: t.provider === "suno" ? "suno" : t.provider === "elevenlabs" ? "elevenlabs" : "studio",
          rights: { use: "publishable" },
          source: fixture ? "fixture" : "real",
          lineage: t.parentId === null ? [] : [{ kind: "library-item", id: `audio:${t.parentId}` }],
          vocabulary: {
            type: t.kind,
            genre: t.terms.genre,
            mood: t.terms.mood,
            instrument: t.terms.instrument,
            provider: t.provider,
            durationS,
            ...(t.tempoBpm === null ? {} : { tempoBpm: t.tempoBpm }),
            ...(t.key === null ? {} : { key: t.key }),
            ...(group === undefined ? {} : { group }),
            ...(t.stage === null ? {} : { stage: t.stage }),
          },
          ...(at === undefined ? {} : { at }),
        },
        meta: [t.tempoBpm === null ? null : `${t.tempoBpm} bpm`, t.key, `${Math.round(durationS)} s`].filter((x) => x !== null).join(" · "),
        extras: {
          audio: {
            prompt: t.prompt,
            ...(t.negative === null ? {} : { negative: t.negative }),
            reasons: [...t.reasons],
            facts: {
              asked: { tempoBpm: t.tempoBpm, key: t.key, durationS: t.durationS },
              measured:
                t.measured === null
                  ? null
                  : { tempoBpm: t.measured.tempoBpm, key: t.measured.key, durationS: t.measured.durationS, lufs: t.measured.lufs, truePeakDb: t.measured.truePeakDb, energy: t.measured.energy },
            },
            peaks: (t.peaks ?? []).map((p) => Math.max(0, Math.min(1, p))),
            src: t.file === null ? null : `/api/sound/takes/${encodeURIComponent(t.id)}/file`,
          },
        },
        ...(t.file === null ? {} : { file: { abs: filePathAbs(t.file.path), mime: t.file.mime } }),
      });
    }
    return { items, skipped: [] };
  },
};

export const mvFeed: Feed = {
  id: "mv",
  async read(ctx): Promise<FeedRead> {
    const items: FeedItem[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const j of (await readMv()).jobs) {
      if (j.state !== "done" || j.files.video === undefined) continue;
      let file: { abs: string; mime: string } | undefined;
      try {
        file = await mvFileOf(j.id, "video");
      } catch (e) {
        skipped.push({ id: j.id, reason: e instanceof Error ? e.message : String(e) });
      }
      const at = new Date(j.endedAt ?? j.enqueuedAt).toISOString();
      const parent = j.source.kind === "take" ? [{ kind: "library-item" as const, id: `audio:${j.source.id}` }] : [];
      items.push({
        item: {
          kind: "video",
          id: `video:mv:${j.id}`,
          title: j.metadata?.title ?? j.source.title,
          state: j.verdict === "keep" ? "ratified" : j.verdict === "drop" ? "rejected" : "unjudged",
          collections: [],
          origin: "studio",
          rights: { use: "publishable" },
          source: ctx.universe,
          lineage: parent,
          vocabulary: { format: "music-video", captions: "none" },
          at,
        },
        meta: `music video · ${j.source.title}`,
        extras: { ...(j.metadata === undefined ? {} : { prompt: j.metadata.description }) },
        ...(file === undefined ? {} : { file }),
      });
    }
    return { items, skipped };
  },
};

const indexSchema = z.object({
  subjects: z.record(z.string(), z.object({ file: z.string().optional(), category: z.string().optional(), techniques: z.array(z.unknown()).optional() })).optional(),
});

/** Bundles the article pipeline draws topics from. */
const BUNDLES = ["software-engineering", "media-generation", "localization"];

export const registryFeed: Feed = {
  id: "registry",
  async read(ctx): Promise<FeedRead> {
    const dir = resolveRegistryDir().dir;
    const items: FeedItem[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const bundle of BUNDLES) {
      let text: string;
      try {
        text = await readFile(path.join(dir, "knowledge", bundle, "index.json"), "utf8");
      } catch (e) {
        skipped.push({ id: bundle, reason: e instanceof Error ? e.message : String(e) });
        continue;
      }
      const index = parseJsonAt(`knowledge/${bundle}/index.json`, indexSchema, text);
      if (!index.ok) {
        skipped.push({ id: bundle, reason: index.error.message });
        continue;
      }
      for (const [slug, row] of Object.entries(index.value.subjects ?? {})) {
        if (row === undefined) continue;
        const techniques = row.techniques?.length ?? 0;
        items.push({
          item: {
            kind: "doc",
            id: `doc:${bundle}:${slug}`,
            title: words(slug).replace(/^\w/, (c) => c.toUpperCase()),
            state: "reference",
            collections: [],
            origin: "registry",
            rights: { use: "reference-only" },
            source: ctx.universe,
            lineage: [],
            vocabulary: { bundle, subject: slug, techniques },
          },
          meta: `${bundle} · ${techniques} techniques`,
          extras: {},
        });
      }
    }
    return { items, skipped };
  },
};
