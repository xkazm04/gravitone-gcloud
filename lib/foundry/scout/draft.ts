import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";

import type { TurnClass } from "../../text/types.ts";
import { nightDir } from "./store.ts";
import { IDEA_TITLE_MAX, type NightId } from "./types.ts";

// A NIGHT'S DRAFT (spark scout-vision S6) - a `draft` plan item: a prompt and a title in, one markdown file out at
// `<night>/drafts/<pl-NN>.md`, written by the text router's `draft` turn (local Ollama first, the Claude seat after:
// lib/text/router.ts). A draft is NEVER a candidate and never on the Board: it is raw material the next night's
// seat reads (the taste brief's `## Drafts from the night`, ./tasteDrafts.ts) and may build on or drop.
//
// THE LANE. lane.capacity.ts has no local-text lane, so a draft waits for `seat.text` (its Claude fallback's lane, four
// slots). Not gpu.local: on 2026-10-26 the GPU lane held ~36 queued Flux jobs all night, so a draft queued there would
// never have run; and the card had room - ComfyUI read 59 of 110 GB VRAM free with Flux loaded, qwen3.8:27b is 17 GB.
// Measure that night's load before narrowing this again.

export const DRAFT_TURN: TurnClass = "draft";
export const DRAFT_LANE: ResourceLane = "seat.text";
/** A draft's prompt: room for a brief and its context, not a corpus. */
export const DRAFT_PROMPT_MAX = 8_000;
/** How long one draft may take before the tick gives up on it (a 27B model on this box, a long answer). */
export const DRAFT_TIMEOUT_MS = 8 * 60_000;

const draftSchema = z
  .object({
    prompt: z.string().trim().min(1).max(DRAFT_PROMPT_MAX),
    title: z
      .string()
      .trim()
      .min(1)
      .max(IDEA_TITLE_MAX)
      .refine((s) => !/[\r\n]/.test(s), { message: "one line" }),
  })
  .strict();

export type Draft = z.output<typeof draftSchema>;

/** A draft item's payload `{prompt, title}`, or the door's reason. */
export const draftOf = (raw: unknown): Result<Draft> => parseAt("draft", draftSchema, raw);

/** One draft turn: the answer's text and who served it. A test hands a fake. */
export type DraftText = (prompt: string, signal?: AbortSignal) => Promise<{ readonly text: string; readonly served?: string }>;

/** The text router's `draft` turn. Imported when called: the router reaches the providers, a plan's parse never needs it. */
export const routerDraft: DraftText = async (prompt, signal) => {
  const { reason } = await import("../../text/router.ts");
  const r = await reason({ prompt, turn: DRAFT_TURN, timeoutMs: DRAFT_TIMEOUT_MS, ...(signal === undefined ? {} : { signal }) });
  return { text: r.text, served: `${r.provenance.provider} ${r.provenance.model}` };
};

/** `drafts/<pl-NN>.md`, relative to the night. */
export const draftRel = (itemId: string): string => `drafts/${itemId}.md`;

/** Write the draft for plan item `itemId` (tmp + rename): `# <title>`, the answer, and one line naming the item and who served it. */
export async function writeDraft(id: NightId, itemId: string, d: Draft, o: { readonly text?: DraftText; readonly signal?: AbortSignal; readonly now?: Date } = {}): Promise<string> {
  const got = await (o.text ?? routerDraft)(d.prompt, o.signal);
  const body = got.text.trim();
  if (body === "") throw new Error(`draft ${itemId}: the ${DRAFT_TURN} turn answered nothing`);
  const file = path.join(nightDir(id), draftRel(itemId));
  await mkdir(path.dirname(file), { recursive: true });
  const at = (o.now ?? new Date()).toISOString();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `# ${d.title}\n\n${body}\n\n---\n${itemId} · ${got.served ?? "text router"} · ${at}\n`, "utf8");
  await rename(tmp, file);
  return file;
}
