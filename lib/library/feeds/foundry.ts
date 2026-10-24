import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { errorMessage } from "@gt/domain/errors";
import type { LibraryState } from "@gt/domain/library";
import type { StyleFacets } from "@gt/kernel/library/core";

import { foundryFile } from "../../foundry/runStore.ts";
import { getExtractRun, listExtractRuns, resolveInExtract } from "../../foundry/extract/store.ts";
import { getCatalogue, getRun, listRuns, resolveInRun } from "../../foundry/store.ts";
import { getStripRun, listStripRuns, stripRunDir } from "../../foundry/strips/store.ts";
import { getCycle, listCycles, resolveInCycle } from "../../foundry/training/store.ts";
import { dayOf, isoOf, mimeOf, words, type Feed, type FeedCtx, type FeedItem, type FeedRead } from "./types.ts";

/** The origins a v1 Library theme arrives with; the importer brought it, not the forge. */
const V1_THEME_ORIGINS: ReadonlySet<string> = new Set(["preset", "plate", "foundry"]);

// THE FOUNDRY, AS LIBRARY ITEMS - the catalogue's styles, the forge's plates and
// source frames, Extract's sources, replicas and transfers, the Dojo's lesson
// thumbnails, and Strips' posters and clips (scout-library.md §3), each read
// through v1's own reader. A plate is drawn by a run and judged by the cull; its
// state is the verdict (keep -> ratified, reject -> rejected, none -> unjudged).
// A run's source frames are references. Every run reader is bounded (newest
// RUN_CAP), as the ledger's are (lib/ledger/v1/sources/forge.ts FORGE_READ_CAP).

const RUN_CAP = 200;

const stateOf = (v: string | null | undefined): LibraryState => (v === "keep" || v === "approve" ? "ratified" : v === "reject" || v === "drop" ? "rejected" : "unjudged");
const src = (ctx: FeedCtx): "real" | "fixture" => ctx.universe;
const rights = { use: "reference-only" as const };

/** A file the item's media is, when it has a type the Library draws. */
function fileOf(abs: string): FeedItem["file"] {
  const mime = mimeOf(abs);
  return mime === undefined ? undefined : { abs, mime };
}

const withFile = (file: FeedItem["file"]): { file?: NonNullable<FeedItem["file"]> } => (file === undefined ? {} : { file });

type Aspect = "16:9" | "3:2" | "4:3" | "1:1";
const isAspect = (a: string): a is Aspect => a === "16:9" || a === "3:2" || a === "4:3" || a === "1:1";

/** A style's swatch colours, when its record carries the Style table's palette (L48);
 *  a v1 catalogue style has none, and its tile draws the designed face without one. */
const paletteRecord = z.object({ palette: z.array(z.object({ hex: z.string() })).optional() });
function paletteOf(style: unknown): string[] {
  const p = paletteRecord.safeParse(style);
  return p.success ? (p.data.palette ?? []).map((c) => c.hex) : [];
}

/** The catalogue's styles, and the facets a plate reads through them. */
export const stylesFeed: Feed = {
  id: "styles",
  async read(ctx): Promise<FeedRead> {
    const cat = await getCatalogue();
    const styles = new Map<string, StyleFacets>();
    const items: FeedItem[] = [];
    for (const s of cat.styles) {
      styles.set(s.id, { name: s.name, family: s.family, observables: s.observables });
      const status: string = s.status;
      const first = isoOf(s.evidence[0]?.at);
      const palette = paletteOf(s);
      items.push({
        item: {
          kind: "style",
          id: `style:${s.id}`,
          title: s.name,
          state: status === "candidate" ? "candidate" : "ratified",
          collections: [],
          origin: s.origin.kind === "extracted" ? "extract" : V1_THEME_ORIGINS.has(s.origin.kind) ? "import" : "forge",
          rights: { use: "publishable" },
          source: src(ctx),
          lineage: [],
          vocabulary: { styleId: s.id, derivation: s.origin.kind },
          ...(first === undefined ? {} : { at: first }),
        },
        meta: `${s.family} · ${status}`,
        extras: {
          ...(palette.length === 0 ? {} : { palette }),
          prompt: s.recipe,
          negative: s.negative,
          observables: s.observables,
          evidence: s.evidence.map((e) => ({ run: e.run, scene: e.scene, mechanism: e.mechanism, verdict: e.verdict, by: e.by === "model" ? "agent" : "operator", at: e.at })),
          ...(s.origin.source === undefined ? {} : { run: { id: s.origin.source } }),
        },
      });
    }
    return { items, skipped: [], styles };
  },
};

export const forgeFeed: Feed = {
  id: "forge",
  async read(ctx): Promise<FeedRead> {
    const items: FeedItem[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const held: string[] = [];
    for (const summary of (await listRuns()).slice(0, RUN_CAP)) {
      let detail;
      try {
        detail = await getRun(summary.id);
      } catch (e) {
        skipped.push({ id: summary.id, reason: errorMessage(e) });
        held.push(`image:forge:${summary.id}:`, `plate:forge:${summary.id}:`);
        continue;
      }
      const { run, verdicts } = detail;
      const at = isoOf(run.created) ?? dayOf(run.id);
      const sourceId = (scene: string): string => `image:forge:${run.id}:${scene}`;
      for (const scene of run.scenes) {
        items.push({
          item: {
            kind: "image",
            id: sourceId(scene.id),
            title: `${words(scene.id)} · source`,
            state: "reference",
            collections: [{ kind: "run", id: run.id }],
            origin: "forge",
            rights,
            source: src(ctx),
            lineage: [{ kind: "run", id: run.id }],
            vocabulary: { set: run.plan.id, scene: scene.id, styles: Object.keys(run.styles) },
            ...(at === undefined ? {} : { at }),
          },
          meta: `forge · ${scene.frame}`,
          extras: { run: { id: run.id, stage: run.status } },
          ...withFile(fileOf(resolveInRun(run.id, scene.source))),
        });
      }
      for (const c of run.candidates) {
        if (c.deleted === true || c.status === "failed") continue;
        const name = run.styles[c.style]?.name ?? words(c.style);
        const file = fileOf(resolveInRun(run.id, c.file));
        items.push({
          item: {
            kind: "plate",
            id: `plate:forge:${run.id}:${c.id}`,
            title: `${name} · ${words(c.scene)}`,
            state: stateOf(verdicts[c.id]?.verdict),
            collections: [{ kind: "run", id: run.id }],
            origin: "forge",
            rights,
            source: src(ctx),
            lineage: [
              { kind: "library-item", id: sourceId(c.scene) },
              { kind: "run", id: run.id },
              { kind: "style", id: c.style },
            ],
            vocabulary: { station: "forge", styleId: c.style, scene: c.scene, mechanism: c.mechanism },
            ...(at === undefined ? {} : { at }),
          },
          meta: `${c.mechanism} · s${c.seed}`,
          extras: { ...(c.prompt === undefined ? {} : { prompt: c.prompt }), run: { id: run.id, stage: run.status } },
          ...(file === undefined ? {} : { file }),
        });
      }
    }
    return { items, skipped, held };
  },
};

export const extractFeed: Feed = {
  id: "extract",
  async read(ctx): Promise<FeedRead> {
    const items: FeedItem[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const held: string[] = [];
    for (const summary of (await listExtractRuns()).slice(0, RUN_CAP)) {
      let detail;
      try {
        detail = await getExtractRun(summary.id);
      } catch (e) {
        skipped.push({ id: summary.id, reason: errorMessage(e) });
        held.push(`image:extract:${summary.id}:`, `plate:extract:${summary.id}:`);
        continue;
      }
      const { run, verdicts } = detail;
      const at = isoOf(run.created) ?? dayOf(run.id);
      const sourceId = (sid: string): string => `image:extract:${run.id}:${sid}`;
      for (const s of run.sources) {
        const file = fileOf(resolveInExtract(run.id, s.file));
        const aspect = isAspect(s.aspect) ? s.aspect : s.height > s.width ? ("portrait" as const) : undefined;
        items.push({
          item: {
            kind: "image",
            id: sourceId(s.id),
            title: s.name,
            state: "reference",
            collections: [{ kind: "run", id: run.id }],
            origin: "extract",
            rights,
            source: src(ctx),
            lineage: [{ kind: "run", id: run.id }],
            vocabulary: { set: run.slug, styles: run.styles.filter((st) => st.members.includes(s.id)).map((st) => st.id), ...(aspect === undefined ? {} : { aspect }) },
            ...(at === undefined ? {} : { at }),
          },
          meta: `extract · ${run.slug}`,
          extras: { file: { w: s.width, h: s.height }, run: { id: run.id, stage: run.status } },
          ...(file === undefined ? {} : { file }),
        });
      }
      for (const st of run.styles) {
        const state = stateOf(verdicts[st.id]?.verdict);
        const plate = (id: string, title: string, rel: string | null, role: "replica" | "transfer", from: string | undefined, prompt: string): FeedItem => {
          const file = rel === null ? undefined : fileOf(resolveInExtract(run.id, rel));
          return {
            item: {
              kind: "plate",
              id,
              title,
              state,
              collections: [{ kind: "run", id: run.id }],
              origin: "extract",
              rights,
              source: src(ctx),
              lineage: [...(from === undefined ? [] : [{ kind: "library-item" as const, id: from }]), { kind: "run", id: run.id }, { kind: "style", id: st.id }],
              vocabulary: { station: "extract", styleId: st.id, role },
              ...(at === undefined ? {} : { at }),
            },
            meta: `${role} · ${run.slug}`,
            extras: { prompt, run: { id: run.id, stage: run.status } },
            ...(file === undefined ? {} : { file }),
          };
        };
        for (const r of st.replicas) {
          const last = [...r.rounds].reverse().find((x) => x.file !== null);
          if (last !== undefined) items.push(plate(`plate:extract:${run.id}:${st.id}:${r.source}`, `${st.name} · ${r.source}`, last.file, "replica", sourceId(r.source), last.prompt));
        }
        for (const [i, t] of st.transfers.entries()) {
          if (t.file !== null) items.push(plate(`plate:extract:${run.id}:${st.id}:t${i + 1}`, `${st.name} · ${t.brief.slice(0, 60)}`, t.file, "transfer", undefined, t.prompt));
        }
      }
    }
    return { items, skipped, held };
  },
};

export const dojoFeed: Feed = {
  id: "dojo",
  async read(ctx): Promise<FeedRead> {
    const items: FeedItem[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const held: string[] = [];
    for (const summary of (await listCycles()).slice(0, RUN_CAP)) {
      let detail;
      try {
        detail = await getCycle(summary.id);
      } catch (e) {
        skipped.push({ id: summary.id, reason: errorMessage(e) });
        held.push(`plate:dojo:${summary.id}:`);
        continue;
      }
      const { cycle, verdicts } = detail;
      const at = isoOf(cycle.at) ?? dayOf(cycle.id);
      for (const imp of cycle.improvements) {
        if (imp.thumbnail === undefined) continue;
        // A committed keeper's thumbnail is copied to the catalogue's thumbs
        // (lib/foundry/training/store.ts commitCycle) and the cycle's pairs may
        // then go; the copy is the one that lasts. The cycle's resolver serves
        // images only; a video thumbnail is reported and drawn as missing.
        const kept = foundryFile(path.join("training", "thumbs", `${cycle.id}--${imp.id}${path.extname(imp.thumbnail).toLowerCase()}`));
        let file: FeedItem["file"];
        try {
          file = fileOf(existsSync(kept) ? kept : resolveInCycle(cycle.id, imp.thumbnail));
        } catch (e) {
          skipped.push({ id: `${cycle.id}/${imp.id}`, reason: `thumbnail ${imp.thumbnail}: ${errorMessage(e)}` });
        }
        items.push({
          item: {
            kind: "plate",
            id: `plate:dojo:${cycle.id}:${imp.id}`,
            title: `${words(imp.technique)} · ${words(cycle.subject)}`,
            state: stateOf(verdicts[imp.id] ?? null),
            collections: [{ kind: "run", id: cycle.id }],
            origin: "dojo",
            rights,
            source: src(ctx),
            lineage: [{ kind: "run", id: cycle.id }],
            vocabulary: { station: "dojo", lesson: cycle.subject },
            ...(at === undefined ? {} : { at }),
          },
          meta: `${cycle.dimension} · ${imp.technique}`,
          extras: { prompt: imp.claim, run: { id: cycle.id, stage: cycle.status } },
          ...(file === undefined ? {} : { file }),
        });
      }
    }
    return { items, skipped, held };
  },
};

export const stripsFeed: Feed = {
  id: "strips",
  async read(ctx): Promise<FeedRead> {
    const items: FeedItem[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const held: string[] = [];
    for (const summary of (await listStripRuns()).slice(0, RUN_CAP)) {
      let detail;
      try {
        detail = await getStripRun(summary.id);
      } catch (e) {
        skipped.push({ id: summary.id, reason: errorMessage(e) });
        held.push(`motion:strips:${summary.id}:`);
        continue;
      }
      const { run, verdicts } = detail;
      const at = isoOf(run.at) ?? dayOf(run.id);
      for (const card of run.cards) {
        const state = stateOf(verdicts[card.id]?.verdict);
        for (const format of ["poster", "clip"] as const) {
          const rel = format === "poster" ? card.files.poster : (card.files.mp4 ?? card.files.webm);
          if (rel === undefined) continue;
          const file = fileOf(path.join(stripRunDir(run.id), card.id, rel));
          const sibling = `motion:strips:${run.id}:${card.id}:${format === "poster" ? "clip" : "poster"}`;
          items.push({
            item: {
              kind: "motion",
              id: `motion:strips:${run.id}:${card.id}:${format}`,
              title: `${words(card.case)} · ${card.approach}`,
              state,
              collections: [{ kind: "run", id: run.id }],
              origin: "strips",
              rights: { use: "publishable" },
              source: src(ctx),
              lineage: [{ kind: "run", id: run.id }, ...(format === "clip" && card.files.poster !== undefined ? [{ kind: "library-item" as const, id: sibling }] : [])],
              vocabulary: { subject: card.case, format },
              ...(at === undefined ? {} : { at }),
            },
            meta: `${format} · ${card.lane}-${card.case}`,
            extras: { run: { id: run.id, stage: run.status } },
            ...(file === undefined ? {} : { file }),
          });
        }
      }
    }
    return { items, skipped, held };
  },
};
