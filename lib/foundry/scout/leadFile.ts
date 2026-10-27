// FILING A QUEUED LEAD - server only. `scout.mts leads` lists what the Board's commits queued
// (./leads.ts); `scout.mts lead <key> --json <file>` takes the claim the next night's step 0
// phrased for one event and appends ONE line to `<repo>/.ai/registry-leads.jsonl`, the ledger
// the ai-registry's scripts/leads-collect.mjs folds into its inbox:
//
//   {"ts","bundle":"media-generation","nearest"?,"kind","claim","because":"<evidence> [scout:<key>]","confidence","from":"scout@<version>"}
//
// The registry is PUBLIC: every filed claim is published at the next drain's pull request.
// So the door refuses before it writes - an unknown key, a claim outside CLAIM_MIN..CLAIM_MAX,
// a `nearest` that is not a subject of the registry's media-generation index (or any
// `nearest` when no registry resolves here), and, for an event from a MATURE genre, a claim
// that names a word of the genre's name or use: what cannot be said without the content is
// not filed.
//
// ONCE. A filed key is reported and nothing is written. A crash between the append and the
// mark is caught on the retry: a ledger that already carries the key's `[scout:<key>]` is not
// appended to again, only marked. The ledger is appended to, never rewritten.

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { resolveRegistry } from "./registry";
import { FoundryError } from "../runStore";
import { GENRE_LINE, USE_LINE } from "./leadEvents";
import { CLAIM_MAX, CLAIM_MIN, LEAD_BUNDLE, LEAD_CONFIDENCE, LEAD_KINDS, leadMark, markFiled, pendingOf, readQueue, type LeadEvent } from "./leads";

export const LEADS_LEDGER_REL = ".ai/registry-leads.jsonl";

const inputSchema = z
  .object({
    claim: z.string().trim().min(CLAIM_MIN).max(CLAIM_MAX),
    kind: z.enum(LEAD_KINDS),
    nearest: z.string().regex(/^[a-z0-9-]+$/, "nearest is a registry subject slug").optional(),
    confidence: z.enum(LEAD_CONFIDENCE),
  })
  .strict();

export type LeadFileOptions = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly now?: Date;
};

/** SCOUT_REPO_DIR, else the cwd: the repo whose .ai/ the ledger is in. */
export const repoDir = (env: LeadFileOptions["env"]): string => path.resolve(env["SCOUT_REPO_DIR"]?.trim() || process.cwd());

/** `scout@<version>` from the skill's frontmatter `version:`, else `scout@1`. */
export function scoutVersion(repo: string): string {
  let text = "";
  try {
    text = readFileSync(path.join(repo, ".claude", "skills", "scout", "SKILL.md"), "utf8");
  } catch {
    /* no skill file here: the first version */
  }
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const v = /^version:\s*["']?([^"'\s]+)["']?\s*$/m.exec(front)?.[1];
  return `scout@${v ?? "1"}`;
}

/** The words a mature event's claim may not carry: the genre's name and use, past the small words. */
const SMALL = new Set(["with", "from", "that", "this", "into", "over", "under", "about", "their", "your", "for", "and", "the"]);
export function refusedWords(e: LeadEvent): string[] {
  const of = (prefix: string): string => e.evidence.find((l) => l.startsWith(prefix))?.slice(prefix.length) ?? "";
  const words = `${of(GENRE_LINE)} ${of(USE_LINE)}`.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return [...new Set(words.filter((w) => w.length >= 3 && !SMALL.has(w)))];
}

/** One pending event as the night reads it. */
export function leadText(e: LeadEvent): string {
  return [`${e.key}  (${e.kind}, night ${e.night}${e.mature === true ? ", MATURE: craft only" : ""})`, ...e.refs.map((r) => `  ref: ${r}`), ...e.evidence.map((l) => `  ${l}`)].join("\n");
}

export async function pendingLeads(): Promise<LeadEvent[]> {
  return pendingOf(await readQueue());
}

export type Filed = { readonly key: string; readonly filed: boolean; readonly ledger: string; readonly line?: Record<string, unknown>; readonly already?: { readonly at: string; readonly claim: string } };

/** File one queued event's claim into the ledger, once. A refusal throws a FoundryError with the reason. */
export async function fileLead(key: string, raw: unknown, o: LeadFileOptions): Promise<Filed> {
  const repo = repoDir(o.env);
  const ledger = path.join(repo, ...LEADS_LEDGER_REL.split("/"));
  const e = (await readQueue()).events.find((x) => x.key === key);
  if (e === undefined) throw new FoundryError(`There is no queued lead ${key}; \`scout.mts leads\` lists the pending ones.`, 404);
  if (e.filed !== undefined) return { key, filed: false, ledger, already: e.filed };
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new FoundryError(`The lead for ${key} is refused: ${i?.path.join(".") || "input"} - ${i?.message ?? "malformed"} (a claim is ${CLAIM_MIN} to ${CLAIM_MAX} characters, kind is ${LEAD_KINDS.join("|")}, confidence ${LEAD_CONFIDENCE.join("|")}).`, 400);
  }
  const lead = parsed.data;
  if (lead.nearest !== undefined) {
    // One resolver for the digest and the ledger (registry.ts): the option, AI_REGISTRY_DIR, the manifest.
    const reg = await resolveRegistry({ repoDir: repo, env: o.env });
    if (!("dir" in reg)) throw new FoundryError(`No registry resolves here (${reg.why}), so nearest "${lead.nearest}" cannot be checked; omit it.`, 400);
    if (!Object.hasOwn(reg.index.subjects, lead.nearest)) throw new FoundryError(`"${lead.nearest}" is not a subject of the ${LEAD_BUNDLE} index in ${reg.dir}; name one it holds, or omit nearest.`, 400);
  }
  if (e.mature === true) {
    const claimWords = new Set(lead.claim.toLowerCase().split(/[^\p{L}\p{N}]+/u));
    const named = refusedWords(e).filter((w) => claimWords.has(w));
    if (named.length > 0) throw new FoundryError(`The lead for ${key} comes from a mature genre and its claim names it (${named.join(", ")}); say the craft without the genre's name or use.`, 400);
  }
  const mark = leadMark(key);
  const line = {
    ts: (o.now ?? new Date()).toISOString(),
    bundle: LEAD_BUNDLE,
    ...(lead.nearest === undefined ? {} : { nearest: lead.nearest }),
    kind: lead.kind,
    claim: lead.claim,
    because: `${e.evidence.join("; ")} ${mark}`,
    confidence: lead.confidence,
    from: scoutVersion(repo),
  };
  const before = await readFile(ledger, "utf8").catch((err: unknown) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  });
  // A crash after the append and before the mark: the line is out already, only the mark is owed.
  if (!before.includes(mark)) {
    const sep = before === "" || before.endsWith("\n") ? "" : "\n";
    await mkdir(path.dirname(ledger), { recursive: true });
    await appendFile(ledger,`${sep}${JSON.stringify(line)}\n`, "utf8");
  }
  await markFiled(key, lead.claim, o.now);
  return { key, filed: true, ledger, line };
}

/** The CLI's two verbs: `leads` (no lead) lists what is pending, `lead` files one claim. */
export async function leadsCommand(lead: { readonly key: string; readonly input: unknown } | undefined, o: LeadFileOptions): Promise<{ readonly lines: string[]; readonly doc: Record<string, unknown> }> {
  if (lead === undefined) {
    const pending = await pendingLeads();
    return { lines: pending.length === 0 ? ["no pending leads"] : pending.map(leadText), doc: { ok: true, pending } };
  }
  const r = await fileLead(lead.key, lead.input, o);
  return { lines: [r.filed ? `filed ${r.key} into ${r.ledger}` : `${r.key} was filed already (${r.already?.at ?? "?"}, "${r.already?.claim ?? ""}"); nothing written`], doc: { ok: true, ...r } };
}
