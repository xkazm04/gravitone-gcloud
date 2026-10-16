import "server-only";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { RECIPES } from "@gt/catalog/recipes";
import { parseJsonAt, type Parsed } from "@gt/domain/door";
import type { MediaLane } from "@gt/domain/lane";

import { listStylesIn } from "@gt/kernel/styles/driver";

import { RegistryUnreachableError, resolveRegistryDir } from "../../../../lib/articles/registryRead.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { foundryFile } from "../../../../lib/foundry/runStore.ts";
import { loadApproaches } from "../../../../lib/foundry/strips/cards.ts";
import { storeRoot } from "../../../../lib/sound/store.ts";
import type { Choice, ComposeChoices, ComposerChoices } from "./contract.ts";

// WHAT THE COMPOSERS AND COMPOSE OFFER, read from where each list lives today - the forge's
// style catalogue (the style store, proven and candidate), the registry's subjects (an article topic
// is `bundle/slug`, the address lib/articles resolves a subject by), the strips approaches (a
// subject is a case: every approach card written for it), and the Library's kept takes. The
// fixture held hand lists of each (./fixtureData.ts); the screens never did.
//
// SYNCHRONOUS ON PURPOSE. A Server Component reads these without awaiting (the Floor page, the
// Plan page, Runs' loader), and the four sources are small files on this machine. Each read is
// bounded, and a source that cannot be read answers an empty list rather than taking the other
// three down: a registry that is not checked out on this box empties the topic select, nothing
// else (lib/articles/registryRead.ts names where it looked).

const styleRow = z.object({ id: z.string().min(1), name: z.string().min(1), status: z.string().optional() });
const stylesDoc = z.object({ styles: z.array(styleRow) });
const sweepDoc = z.object({ styles: z.array(z.unknown()) });
const takeRow = z.object({ id: z.string().min(1), kind: z.string(), title: z.string(), verdict: z.string(), durationS: z.number().nullable().optional() });
const takesDoc = z.object({ takes: z.array(takeRow) });
const indexDoc = z.object({ subjects: z.record(z.string(), z.object({ file: z.string().optional() })).optional() });

/** A registry carries a few hundred subjects; a select past this many is a search, not a list. */
export const TOPIC_CAP = 400;
/** Bounded like every other list read (registry bounded-enumeration). */
export const TAKE_CAP = 200;

function readDoc<S extends z.ZodType>(file: string, schema: S): Parsed<z.output<S>> | undefined {
  if (!existsSync(file)) return undefined;
  const r = parseJsonAt(file, schema, readFileSync(file, "utf8"));
  return r.ok ? r.value : undefined;
}

type Style = { readonly id: string; readonly name: string; readonly proven: boolean };

/** The style store (Phase 5: the truth), read synchronously. A store that cannot open or holds
 *  no style yet - its first touch imports the catalogue, and this read never waits for one - is
 *  answered from styles.json, which is the store's export or, before the first import, v1's
 *  catalogue itself: either is a real list, where an empty select would be a lie. A locked
 *  style is proven to a composer (the lock only narrows what may change). */
function styles(): readonly Style[] {
  const k = kernel();
  const rows = k.ok ? k.value.store.read(listStylesIn) : null;
  if (rows?.ok && rows.value.length > 0) return rows.value.map(({ style: s }) => ({ id: s.id, name: s.name, proven: s.status !== "candidate" }));
  const doc = readDoc(foundryFile("styles.json"), stylesDoc);
  return (doc?.styles ?? []).map((s) => ({ id: s.id, name: s.name, proven: s.status === "proven" || s.status === "locked" }));
}

/** The forge's own sweep (pipeline/foundry/plans/sweep-01.json): how many styles a sweep runs. */
function sweepStyles(cwd: string, fallback: number): number {
  const doc = readDoc(path.join(cwd, "pipeline", "foundry", "plans", "sweep-01.json"), sweepDoc);
  return doc?.styles.length ?? fallback;
}

const words = (slug: string): string => {
  const s = slug.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export type Topic = Choice & { readonly bundle: string };

/** Every subject of every bundle the registry holds, as `bundle/slug`; empty when no registry is reachable. */
export function registryTopics(env: Readonly<Record<string, string | undefined>>, cwd: string): readonly Topic[] {
  let dir: string;
  try {
    dir = resolveRegistryDir({ ...env }, cwd).dir;
  } catch (e) {
    // No registry on this machine: the topic select is empty, and the article lane says so.
    if (e instanceof RegistryUnreachableError) return [];
    throw e;
  }
  const root = path.join(dir, "knowledge");
  const bundles = existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  const out: Topic[] = [];
  for (const bundle of bundles) {
    const doc = readDoc(path.join(root, bundle, "index.json"), indexDoc);
    for (const slug of Object.keys(doc?.subjects ?? {}).sort()) {
      if (out.length >= TOPIC_CAP) return out;
      out.push({ value: `${bundle}/${slug}`, label: words(slug), bundle });
    }
  }
  return out;
}

/** A strips subject is a case: the approach cards written for it, by lane. */
export type StripCase = { readonly id: string; readonly lane: "edu" | "stat"; readonly approaches: readonly string[] };

export function stripCases(cwd: string): readonly StripCase[] {
  if (!existsSync(path.join(cwd, "pipeline", "strips", "approaches.json"))) return [];
  const by = new Map<string, { lane: "edu" | "stat"; approaches: string[] }>();
  for (const a of loadApproaches(cwd)) {
    const c = by.get(a.case) ?? { lane: a.lane, approaches: [] };
    c.approaches.push(a.id);
    by.set(a.case, c);
  }
  return [...by.entries()].map(([id, c]) => ({ id, lane: c.lane, approaches: c.approaches })).sort((a, b) => a.lane.localeCompare(b.lane) || a.id.localeCompare(b.id));
}

type Take = { readonly id: string; readonly title: string; readonly durationS: number | null };

/** The Library's kept music takes (lib/sound/store.ts takes.json), newest last as the file holds them. */
export function keptTakes(): readonly Take[] {
  const doc = readDoc(path.join(storeRoot(), "takes.json"), takesDoc);
  return (doc?.takes ?? [])
    .filter((t) => t.kind === "music" && t.verdict === "kept")
    .slice(-TAKE_CAP)
    .map((t) => ({ id: t.id, title: t.title, durationS: t.durationS ?? null }));
}

export function composerChoices(env: Readonly<Record<string, string | undefined>>, cwd: string): ComposerChoices {
  const all = styles();
  return {
    image: {
      candidates: all.filter((s) => !s.proven).map((s) => ({ value: s.id, label: s.name })),
      proven: all.filter((s) => s.proven).map((s) => ({ value: s.id, label: s.name })),
      sweep: sweepStyles(cwd, all.length),
    },
    article: { topics: registryTopics(env, cwd) },
    video: { subjects: stripCases(cwd).map((c) => ({ value: c.id, label: `Strip · ${c.id}` })) },
  };
}

const ICONS: Readonly<Record<string, MediaLane>> = { video: "video", audio: "audio", article: "article", image: "image" };

/** Compose's offer. `used` names the takes a project already scores: the first other one is preselected. */
export function composeChoices(env: Readonly<Record<string, string | undefined>>, cwd: string, used: ReadonlySet<string>): ComposeChoices {
  const takes = keptTakes();
  const fresh = takes.find((t) => !used.has(t.id));
  return {
    recipes: RECIPES.map((r) => ({ id: r.id, label: r.label, sub: r.sub, icon: ICONS[r.icon] ?? "video" })),
    styles: styles()
      .filter((s) => s.proven)
      .map((s) => ({ value: s.id, label: s.name })),
    takes: takes.map((t) => ({ value: t.id, label: t.title })),
    topics: registryTopics(env, cwd).map((t) => ({ value: t.value, label: t.label })),
    ...(fresh === undefined ? {} : { freshTake: fresh.id }),
  };
}
