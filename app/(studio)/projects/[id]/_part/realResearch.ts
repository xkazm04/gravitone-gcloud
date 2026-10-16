import "server-only";

import type { Notebook } from "@/lib/notebook/types";
import { sourceOf, type NotebookSource } from "@/lib/notebook/source";
import type { AdBrief, AdIdea } from "@/lib/ads/types";
import type { BeatSlot } from "@/lib/research/beats";

import { emptyBrief } from "./fixtureAds.ts";
import type { ResearchRec } from "./fixtureResearch.ts";
import { obj, str, written, type Obj, type Recs } from "./realRecs.ts";

// THE RESEARCH PART ON THE REAL SIDE (L36; split out of ./real.ts by L43): the step records the
// kernel holds (research, research-notebook, -scope, -beats, ads-brief, ads-ideas) to and from
// the working record L38's ./fixtureResearch.ts reasons in.

type SourceMeta = { readonly kind: NotebookSource["kind"]; readonly conclusions: NotebookSource["conclusions"]; readonly dimensions: NotebookSource["dimensions"]; readonly tags: NotebookSource["tags"]; readonly digest: string };

/** A stored notebook as its source. The digest is restored, not recomputed: the store keeps JSON
 *  canonically (keys sorted) and v1's digest hashes key order, so a recomputed one would orphan
 *  every scope decided on this notebook (lib/research/scopeDigest.ts) after a reload. */
function sourceFrom(nb: Obj): NotebookSource | null {
  const notebook = obj(nb["notebook"]);
  if (notebook === undefined) return null;
  const meta = obj(nb["source"]) === undefined ? undefined : written<SourceMeta>(nb["source"]);
  const src = sourceOf(written<Notebook>(notebook), meta === undefined ? { kind: "researched" } : { kind: meta.kind, conclusions: meta.conclusions, dimensions: meta.dimensions, tags: meta.tags });
  return meta === undefined ? src : { ...src, digest: meta.digest };
}

export function researchOf(project: { readonly title: string }, recs: Recs): ResearchRec {
  const nb = recs.get("research-notebook");
  const scope = recs.get("research-scope");
  const beats = recs.get("research-beats");
  const ideas = recs.get("ads-ideas");
  const engine = obj(nb?.["engine"]);
  const adsEngine = obj(ideas?.["engine"]);
  const digest = str(scope?.["digest"]);
  return {
    choice: beats?.["mode"] === "facts" ? "notebook" : "beats",
    topic: str(recs.get("research")?.["topic"]) ?? str(nb?.["topic"]) ?? project.title,
    base: nb === undefined ? null : sourceFrom(nb),
    ...(engine === undefined ? {} : { engine: written<NonNullable<ResearchRec["engine"]>>(engine) }),
    scope: written<ResearchRec["scope"]>(scope?.["scope"] ?? {}),
    confirmed: written<ResearchRec["confirmed"]>(scope?.["confirmed"] ?? null),
    ...(digest === undefined ? {} : { scopeDigest: digest }),
    followUps: written<ResearchRec["followUps"]>(nb?.["followUps"] ?? []),
    revisions: written<ResearchRec["revisions"]>(nb?.["revisions"] ?? []),
    slots: written<readonly BeatSlot[] | null>(beats?.["slots"] ?? null),
    picks: written<ResearchRec["picks"]>(beats?.["picks"] ?? {}),
    spine: written<ResearchRec["spine"]>(beats?.["confirmed"] ?? null),
    brief: obj(recs.get("ads-brief")?.["brief"]) === undefined ? emptyBrief() : written<AdBrief>(recs.get("ads-brief")?.["brief"]),
    ideas: written<readonly AdIdea[]>(ideas?.["options"] ?? []),
    ideasDigest: str(ideas?.["briefDigest"]) ?? null,
    picked: str(ideas?.["pickedId"]) ?? null,
    ...(adsEngine === undefined ? {} : { adsEngine: written<NonNullable<ResearchRec["adsEngine"]>>(adsEngine) }),
  };
}

export function researchRecords(r: ResearchRec): Record<string, Obj> {
  const b = r.base;
  return {
    research: { topic: r.topic, researched: r.confirmed !== null || r.spine !== null || r.picked !== null },
    "research-notebook": {
      topic: r.topic,
      notebook: b?.notebook ?? null,
      engine: r.engine ?? null,
      followUps: r.followUps,
      revisions: r.revisions,
      ...(b === null ? {} : { source: { kind: b.kind, conclusions: b.conclusions, dimensions: b.dimensions, tags: b.tags, digest: b.digest } }),
    },
    "research-scope": { scope: r.scope, confirmed: r.confirmed, ...(r.scopeDigest === undefined ? {} : { digest: r.scopeDigest }) },
    "research-beats": { mode: r.choice === "notebook" ? "facts" : "beats", picks: r.picks, confirmed: r.spine, slots: r.slots },
    "ads-brief": { brief: r.brief },
    "ads-ideas": { briefDigest: r.ideasDigest, options: r.ideas, pickedId: r.picked, engine: r.adsEngine ?? null },
  };
}
