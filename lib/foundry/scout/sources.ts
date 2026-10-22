import { stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";

import { BlockedUrlError, assertFetchable, type Resolver } from "../../imaging/safeUrl";
import { listNights, mutateNight, nextCandidateId, nextSourceId, readNight } from "./store";
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

// WHAT THE SKILL ADDS TO A NIGHT, AT ONE DOOR - sources it found, findings it
// wrote, watchlist lines it proposes. The skill is a reader with a web browser;
// everything it hands the CLI is untrusted until it has passed here:
//
//   - a source URL is http or https and passes `assertFetchable` NOW (scheme,
//     literal address, resolved address: lib/imaging/safeUrl.ts), so a video URL
//     yt-dlp will fetch is held to the rule safeFetch holds a picture's to;
//   - a URL any EARLIER night already holds is skipped and reported - the same
//     thing is never scouted twice (a YouTube video by its id, whatever its URL);
//   - a finding names a knowledge template that exists and a step in the
//     `NN-name` form (the Board's apply creates the step's PATTERNS.md when the
//     finding is kept; most templates have only 01-script today);
//   - lengths are the wire's (./types.ts), so a paragraph cannot pass as a claim.

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
const sourcesSchema = z.array(sourceSchema).min(1).max(MAX_SOURCES_PER_NIGHT);

export type SourceInput = z.output<typeof sourceSchema>;

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

/** Every URL key earlier nights hold, with where. A night whose manifest cannot be read is skipped. */
export async function seenElsewhere(except: NightId): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const s of await listNights()) {
    if (s.id === except) continue;
    try {
      for (const src of (await readNight(s.id)).sources) if (!out.has(urlKey(src.url))) out.set(urlKey(src.url), `${s.id}/${src.id}`);
    } catch {
      /* unreadable: it cannot vouch for or against a URL */
    }
  }
  return out;
}

export type Skipped = { readonly url: string; readonly why: string };
export type AddedSources = { readonly added: readonly ScoutSource[]; readonly skipped: readonly Skipped[] };

/** Validate and append sources. Err only when the batch itself is malformed or the night is not open. */
export async function addSources(nightId: NightId, raw: unknown, opts: { readonly resolve?: Resolver } = {}): Promise<Result<AddedSources>> {
  const parsed = parseAt("scout sources", sourcesSchema, raw);
  if (!parsed.ok) return parsed;
  const night = await readNight(nightId);
  if (night.state !== "open") return err("refused", `night ${nightId} is ${night.state}; it takes no more sources`);
  const seen = await seenElsewhere(nightId);
  const skipped: Skipped[] = [];
  const fetchable: SourceInput[] = [];
  for (const s of parsed.value) {
    const earlier = seen.get(urlKey(s.url));
    if (earlier !== undefined) {
      skipped.push({ url: s.url, why: `already scouted as ${earlier}` });
      continue;
    }
    try {
      await assertFetchable(s.url, opts.resolve);
      fetchable.push(s);
    } catch (e) {
      if (!(e instanceof BlockedUrlError)) throw e;
      skipped.push({ url: s.url, why: e.why });
    }
  }
  const added: ScoutSource[] = [];
  await mutateNight(nightId, (n) => {
    let next: Night = n;
    for (const s of fetchable) {
      if (next.sources.some((x) => urlKey(x.url) === urlKey(s.url))) {
        skipped.push({ url: s.url, why: "already in this night" });
        continue;
      }
      if (next.sources.length >= MAX_SOURCES_PER_NIGHT) {
        skipped.push({ url: s.url, why: `the night holds at most ${MAX_SOURCES_PER_NIGHT} sources` });
        continue;
      }
      const src: ScoutSource = {
        id: nextSourceId(next),
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
      next = { ...next, sources: [...next.sources, src] };
      added.push(src);
    }
    return added.length === 0 ? n : next;
  });
  return ok({ added, skipped });
}

/* ── Findings and watch lines ─────────────────────────────────────────────── */

const findingSchema = z
  .object({
    sourceIds: z.array(z.string().regex(SOURCE_ID_RE)).min(1).max(12),
    template: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "a template is a knowledge/templates directory name"),
    step: z.string().regex(/^\d{2}-[a-z][a-z-]*$/, "a step is NN-name (02-frames, 05-cut)"),
    claim: text(CLAIM_MAX),
    quote: text(QUOTE_MAX),
    /** `<night>/<candidate>` of a finding an earlier night holds, said again here from another source. */
    restates: z.string().regex(/^\d{4}-\d{2}-\d{2}(-\d{1,2})?\/c-\d{2,3}$/, "restates names an earlier night's finding as <night>/<candidate>").optional(),
  })
  .strict();
const findingsSchema = z.array(findingSchema).min(1).max(MAX_SOURCES_PER_NIGHT);

/** SCOUT_KNOWLEDGE_DIR, else `<cwd>/knowledge` - the same root the knowledge writer appends to (./knowledge.ts). */
export const knowledgeRoot = (): string => process.env["SCOUT_KNOWLEDGE_DIR"]?.trim() || path.join(process.cwd(), "knowledge");

/** Append findings, each `rendered`: a finding is written, not rendered, and is whole once it passes here. */
export async function addFindings(nightId: NightId, raw: unknown, opts: { readonly knowledge?: string } = {}): Promise<Result<readonly FindingCandidate[]>> {
  const parsed = parseAt("scout findings", findingsSchema, raw);
  if (!parsed.ok) return parsed;
  const night = await readNight(nightId);
  if (night.state !== "open") return err("refused", `night ${nightId} is ${night.state}; it takes no more findings`);
  const root = opts.knowledge ?? knowledgeRoot();
  for (const [i, f] of parsed.value.entries()) {
    const dir = path.join(root, "templates", f.template);
    if ((await stat(dir).catch(() => null))?.isDirectory() !== true) return err("invalid", `finding ${i + 1}: there is no knowledge/templates/${f.template}/`);
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
      const c: FindingCandidate = { id: nextCandidateId(next), kind: "finding", sourceIds: f.sourceIds, status: "rendered", template: f.template, step: f.step, claim: f.claim, quote: f.quote, ...(f.restates === undefined ? {} : { restates: f.restates }) };
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
    made = { id: nextCandidateId(n), kind: "watch", sourceIds: parsed.value.sourceIds, status: "rendered", entry: parsed.value.entry, why: parsed.value.why };
    return { ...n, candidates: [...n.candidates, made] };
  });
  if (made === undefined) return err("internal", "the watch line was not written");
  return ok(made);
}
