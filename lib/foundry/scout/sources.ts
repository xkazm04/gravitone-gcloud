import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";

import { BlockedUrlError, assertFetchable, type Resolver } from "../../imaging/safeUrl";
import { developedOf, fromIdeaOf, IDEA_REF_RE, keptIdea, type KeptIdea } from "./direction";
import { STEP_NAME_RE, STEP_RULE, TEMPLATE_NAME_RE, TEMPLATE_RULE, knowledgeRoot, templateProblem } from "./knowledge";
import { listNights, mutateNight, mutateNightWith, nextCandidateId, nextSourceId, readArchiveNights, readNight, resolveInNight } from "./store";
import {
  CLAIM_MAX,
  MAX_SOURCES_PER_NIGHT,
  QUOTE_MAX,
  SOURCE_ID_RE,
  SOURCE_KINDS,
  WHY_MAX,
  type FindingCandidate,
  type Night,
  type NightId,
  type ScoutSource,
  type WatchCandidate,
} from "./types";
import { wingRunId } from "./wing";
import { activeWing } from "./wingScope";

// WHAT THE SKILL ADDS TO A NIGHT, AT ONE DOOR - sources it found, findings it
// wrote, watchlist lines it proposes. The skill is a reader with a web browser;
// everything it hands the CLI is untrusted until it has passed here:
//
//   - a source URL is http or https and passes `assertFetchable` NOW (scheme,
//     literal address, resolved address: lib/imaging/safeUrl.ts), so a video URL
//     yt-dlp will fetch is held to the rule safeFetch holds a picture's to;
//   - a URL an EARLIER night made a candidate from is skipped and reported - the
//     same thing is never scouted twice (a YouTube video by its id, whatever its
//     URL). A source a night held and launched nothing from was never scouted:
//     a paused night (2026-10-23, closed past its deadline with 14 sources and no
//     run from any) hands its sources to the next night instead of burying them;
//   - a finding names a knowledge template that exists and a step in the
//     `NN-name` form (the Board's apply creates the step's PATTERNS.md when the
//     finding is kept; most templates have only 01-script today);
//   - lengths are the wire's (./types.ts), so a paragraph cannot pass as a claim;
//   - a KEPT IDEA comes in as `{fromIdea: "<night>/<c-id>", why?}` (spark scout-idea-artboards
//     WP-I4a): its artboard is copied from that night into `sources/s-NN/` - ours, so no fetch and no
//     ingest - as an `image` source, `found: idea`, `rights: ours`. Refused, with the whole batch and
//     before anything is written: an idea that night did not keep, a dry night's, and one any night
//     already develops (./direction.ts) - a kept idea is developed once. The idea's `fromSeed` is copied
//     onto the source, so every candidate made over it carries the seed too (spark scout-decision-graph).

const text = (max: number) => z.string().trim().min(1).max(max);

const sourceSchema = z
  .object({
    url: z.string().trim().min(1).max(2048),
    kind: z.enum(SOURCE_KINDS),
    title: text(200),
    channel: text(120).optional(),
    why: text(WHY_MAX),
    found: z.enum(["watchlist", "search"]),
    watch: text(300).optional(),
    /** The source teaches a whole mechanism: the skill's line on what (a keep from it queues a `source-rich` lead). */
    rich: text(WHY_MAX).optional(),
  })
  .strict()
  .refine((s) => s.found !== "watchlist" || s.watch !== undefined, { message: "a source found from the watchlist quotes its watchlist line in `watch`" });
const ideaSourceSchema = z.object({ fromIdea: z.string().trim().regex(IDEA_REF_RE, "a kept idea's <night>/<c-id>"), why: text(WHY_MAX).optional() }).strict();
const batchSchema = z.array(z.unknown()).min(1).max(MAX_SOURCES_PER_NIGHT);

export type SourceInput = z.output<typeof sourceSchema>;
type Planned = { readonly url: SourceInput } | { readonly idea: KeptIdea; readonly ref: string; readonly why?: string };

/**
 * What makes two URLs the same thing: a YouTube video by its id, anything else by
 * its URL without the fragment, the host lower-cased and a trailing slash dropped.
 */
export function urlKey(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  if (host === "youtu.be") return `youtube:${u.pathname.slice(1).split("/")[0] ?? ""}`;
  if (host === "youtube.com" || host === "music.youtube.com") {
    const v = u.searchParams.get("v");
    if (v !== null && v !== "") return `youtube:${v}`;
    const m = /^\/(shorts|embed|live)\/([^/]+)/.exec(u.pathname);
    if (m?.[2] !== undefined) return `youtube:${m[2]}`;
  }
  u.hash = "";
  const href = `${u.protocol}//${host}${u.port === "" ? "" : `:${u.port}`}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  return href;
}

/** Every URL key earlier nights made a candidate from - failed ones included, a launch was tried - with
 *  where. A night whose manifest cannot be read is skipped. The muse ARCHIVE's nights count too (spark scout-vision S3:
 *  one loop), named by their run id `muse:<night>/s-NN` - their ids collide with scout nights. */
export async function seenElsewhere(except: NightId): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const s of await listNights()) {
    if (s.id === except) continue;
    try {
      const n = await readNight(s.id);
      const used = new Set(n.candidates.flatMap((c) => c.sourceIds));
      for (const src of n.sources) if (used.has(src.id) && !out.has(urlKey(src.url))) out.set(urlKey(src.url), `${s.id}/${src.id}`);
    } catch {
      /* unreadable: it cannot vouch for or against a URL */
    }
  }
  if (activeWing() !== "scout") return out;
  for (const n of await readArchiveNights()) {
    const used = new Set(n.candidates.flatMap((c) => c.sourceIds));
    for (const src of n.sources) if (used.has(src.id) && !out.has(urlKey(src.url))) out.set(urlKey(src.url), `${wingRunId("muse", n.id)}/${src.id}`);
  }
  return out;
}

export type Skipped = { readonly url: string; readonly why: string };
export type AddedSources = { readonly added: readonly ScoutSource[]; readonly skipped: readonly Skipped[] };

/** Every night on disk that can be read, newest first. */
async function allNights(): Promise<Night[]> {
  const out: Night[] = [];
  for (const s of await listNights()) {
    const n = await readNight(s.id).catch(() => undefined);
    if (n !== undefined) out.push(n);
  }
  return out;
}

/** The URL a kept idea's source is recorded under: never fetchable, and one per idea. */
export const ideaUrl = (ref: string): string => `idea:${ref}`;

/** Validate and append sources. Err when the batch itself is malformed, the night is not open, or a kept idea it names cannot be brought in. */
export async function addSources(nightId: NightId, raw: unknown, opts: { readonly resolve?: Resolver } = {}): Promise<Result<AddedSources>> {
  const batch = parseAt("scout sources", batchSchema, raw);
  if (!batch.ok) return batch;
  const night = await readNight(nightId);
  if (night.state !== "open") return err("refused", `night ${nightId} is ${night.state}; it takes no more sources`);
  const items: (SourceInput | { readonly fromIdea: string; readonly why?: string })[] = [];
  for (const [i, item] of batch.value.entries()) {
    const ideaShaped = typeof item === "object" && item !== null && "fromIdea" in item;
    const p = ideaShaped ? parseAt(`source ${i + 1}`, ideaSourceSchema, item) : parseAt(`source ${i + 1}`, sourceSchema, item);
    if (!p.ok) return p;
    items.push(p.value);
  }
  const developed = items.some((s) => "fromIdea" in s) ? developedOf(await allNights()) : new Map<string, string>();
  const seen = await seenElsewhere(nightId);
  const skipped: Skipped[] = [];
  const planned: Planned[] = [];
  for (const [i, s] of items.entries()) {
    if ("fromIdea" in s) {
      const where = developed.get(s.fromIdea);
      if (where !== undefined) return err("refused", `source ${i + 1}: idea ${s.fromIdea} is already developed as ${where}; a kept idea is brought in once`);
      const k = await keptIdea(s.fromIdea);
      if (!k.ok) return err(k.error.code, `source ${i + 1}: ${k.error.message}`);
      const held = await stat(resolveInNight(k.value.night.id, k.value.idea.image)).catch(() => null);
      if (held?.isFile() !== true) return err("invalid", `source ${i + 1}: idea ${s.fromIdea}'s artboard ${k.value.idea.image} is not on disk`);
      developed.set(s.fromIdea, `source ${i + 1} of this batch`);
      planned.push({ idea: k.value, ref: s.fromIdea, ...(s.why === undefined ? {} : { why: s.why }) });
      continue;
    }
    const earlier = seen.get(urlKey(s.url));
    if (earlier !== undefined) {
      skipped.push({ url: s.url, why: `already scouted as ${earlier}` });
      continue;
    }
    try {
      await assertFetchable(s.url, opts.resolve);
      planned.push({ url: s });
    } catch (e) {
      if (!(e instanceof BlockedUrlError)) throw e;
      skipped.push({ url: s.url, why: e.why });
    }
  }
  const added: ScoutSource[] = [];
  await mutateNightWith(nightId, async (n) => {
    let next: Night = n;
    for (const p of planned) {
      const url = "url" in p ? p.url.url : ideaUrl(p.ref);
      if (next.sources.some((x) => urlKey(x.url) === urlKey(url) || ("ref" in p && x.fromIdea === p.ref))) {
        skipped.push({ url, why: "already in this night" });
        continue;
      }
      if (next.sources.length >= MAX_SOURCES_PER_NIGHT) {
        skipped.push({ url, why: `the night holds at most ${MAX_SOURCES_PER_NIGHT} sources` });
        continue;
      }
      const id = nextSourceId(next);
      const src = "url" in p ? urlSource(id, p.url) : await ideaSource(nightId, id, p);
      next = { ...next, sources: [...next.sources, src] };
      added.push(src);
    }
    return added.length === 0 ? n : next;
  });
  return ok({ added, skipped });
}

function urlSource(id: string, s: SourceInput): ScoutSource {
  return {
    id,
    url: s.url,
    kind: s.kind,
    title: s.title,
    ...(s.channel === undefined ? {} : { channel: s.channel }),
    why: s.why,
    found: s.found,
    ...(s.watch === undefined ? {} : { watch: s.watch }),
    ...(s.rich === undefined ? {} : { rich: s.rich }),
    rights: "reference-only",
    status: "pending",
    files: [],
  };
}

/** A kept idea's artboard, copied into this night under the night's lock: ingested as it lands, ours. */
async function ideaSource(nightId: NightId, id: string, p: Extract<Planned, { ref: string }>): Promise<ScoutSource> {
  const { night, idea } = p.idea;
  const file = `sources/${id}/${path.basename(idea.image)}`;
  const to = resolveInNight(nightId, file);
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(resolveInNight(night.id, idea.image), to);
  // The idea's seed rides with it (spark scout-decision-graph): what develops this source inherits the branch.
  return { id, url: ideaUrl(p.ref), kind: "image", title: idea.title, why: p.why ?? `kept idea ${p.ref}: ${idea.target}`, found: "idea", rights: "ours", fromIdea: p.ref, ...(idea.fromSeed === undefined ? {} : { fromSeed: idea.fromSeed }), status: "ingested", files: [file] };
}

/* ── Findings and watch lines ─────────────────────────────────────────────── */

const findingSchema = z
  .object({
    sourceIds: z.array(z.string().regex(SOURCE_ID_RE)).min(1).max(12),
    template: z.string().regex(TEMPLATE_NAME_RE, TEMPLATE_RULE),
    step: z.string().regex(STEP_NAME_RE, STEP_RULE),
    claim: text(CLAIM_MAX),
    quote: text(QUOTE_MAX),
    /** `<night>/<candidate>` of a finding an earlier night holds, said again here from another source. */
    restates: z.string().regex(/^\d{4}-\d{2}-\d{2}(-\d{1,2})?\/c-\d{2,3}$/, "restates names an earlier night's finding as <night>/<candidate>").optional(),
  })
  .strict();
const findingsSchema = z.array(findingSchema).min(1).max(MAX_SOURCES_PER_NIGHT);

/** Append findings, each `rendered`: a finding is written, not rendered, and is whole once it passes here. */
export async function addFindings(nightId: NightId, raw: unknown, opts: { readonly knowledge?: string } = {}): Promise<Result<readonly FindingCandidate[]>> {
  const parsed = parseAt("scout findings", findingsSchema, raw);
  if (!parsed.ok) return parsed;
  const night = await readNight(nightId);
  if (night.state !== "open") return err("refused", `night ${nightId} is ${night.state}; it takes no more findings`);
  // The root the knowledge writer appends to (./knowledge.ts), so a finding is checked where it would land.
  const root = opts.knowledge ?? knowledgeRoot();
  for (const [i, f] of parsed.value.entries()) {
    // A muse finding lands in knowledge/scout-muse/techniques.md (knowledge.ts findingRelOf): it serves no template step.
    const nowhere = await templateProblem(f.template, root);
    if (nowhere !== undefined) return err("invalid", `finding ${i + 1}: ${nowhere}`);
    const missing = f.sourceIds.find((id) => !night.sources.some((s) => s.id === id));
    if (missing !== undefined) return err("invalid", `finding ${i + 1}: night ${nightId} has no source ${missing}`);
    if (f.restates !== undefined) {
      const [was, cid] = f.restates.split("/");
      if (was === nightId) return err("invalid", `finding ${i + 1}: restates names this night; it names a finding an earlier night holds`);
      const earlier = await readNight(was ?? "").then((n) => n, (e: unknown) => errorMessage(e));
      if (typeof earlier === "string") return err("invalid", `finding ${i + 1}: restates ${f.restates}: ${earlier}`);
      if (earlier.candidates.find((c) => c.id === cid)?.kind !== "finding") return err("invalid", `finding ${i + 1}: night ${was ?? ""} has no finding ${cid ?? ""}`);
    }
  }
  const made: FindingCandidate[] = [];
  await mutateNight(nightId, (n) => {
    let next = n;
    for (const f of parsed.value) {
      const c: FindingCandidate = { id: nextCandidateId(next), kind: "finding", sourceIds: f.sourceIds, status: "rendered", template: f.template, step: f.step, claim: f.claim, quote: f.quote, ...(f.restates === undefined ? {} : { restates: f.restates }), ...fromIdeaOf(next, f.sourceIds) };
      next = { ...next, candidates: [...next.candidates, c] };
      made.push(c);
    }
    return next;
  });
  return ok(made);
}

const watchSchema = z.object({ entry: text(300), why: text(WHY_MAX), sourceIds: z.array(z.string().regex(SOURCE_ID_RE)).max(12) }).strict();

/** Append one proposed watchlist line, `rendered`. */
export async function addWatch(nightId: NightId, raw: unknown): Promise<Result<WatchCandidate>> {
  const parsed = parseAt("scout watch line", watchSchema, raw);
  if (!parsed.ok) return parsed;
  const night = await readNight(nightId);
  if (night.state !== "open") return err("refused", `night ${nightId} is ${night.state}; it takes no more watch lines`);
  const missing = parsed.value.sourceIds.find((id) => !night.sources.some((s) => s.id === id));
  if (missing !== undefined) return err("invalid", `night ${nightId} has no source ${missing}`);
  let made: WatchCandidate | undefined;
  await mutateNight(nightId, (n) => {
    made = { id: nextCandidateId(n), kind: "watch", sourceIds: parsed.value.sourceIds, status: "rendered", entry: parsed.value.entry, why: parsed.value.why, ...fromIdeaOf(n, parsed.value.sourceIds) };
    return { ...n, candidates: [...n.candidates, made] };
  });
  if (made === undefined) return err("internal", "the watch line was not written");
  return ok(made);
}
