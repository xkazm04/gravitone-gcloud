"use server";

// A NEW REEL FROM THE IDEA FORM (spark reel-studio WP4): the folder and its reel.json, nothing else. The idea's
// rules are lib/reel/state.ts `parseIdea`'s, and its refusal sentence reaches the form verbatim; the slug's are
// lib/reel/store.ts `isReelSlug`'s. Nothing is launched here: the data step's launch is receipt-first.
import { z } from "zod";

import type { Result } from "@gt/domain/errors";
import { ok } from "@gt/domain/errors";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { createReel } from "../../../../lib/reel/studio.ts";

// The door holds the shape and the outer bounds; the idea's own rules answer in parseIdea's words.
const createInput = z.strictObject({ slug: z.string().min(1).max(80), title: z.string().max(200), hook: z.string().max(200), path: z.string().max(4000) });

const create = action("reel create", createInput, async (i): Promise<Result<{ readonly slug: string }>> => {
  const made = await createReel(i.slug, { title: i.title, hook: i.hook, path: i.path });
  return made.ok ? ok({ slug: made.value.slug }) : made;
});

export async function createReelAction(input: { readonly slug: string; readonly title: string; readonly hook: string; readonly path: string }): Promise<ActionResult<{ readonly slug: string }>> {
  return create(input);
}
