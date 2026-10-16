// THE TEAM'S HAND ON THE VOCABULARY - prefer / avoid and the phrasing a term becomes in a
// prompt, per term id (lib/sound/vocabulary.ts `termId`). Server-only (node:fs).
//
//   <sound store root>/hands.json   { version: 1, hands: { "<facet>:<term>": { stance?, phrase? } } }
//
// v1 kept these in the browser (app/library/audio/bookStore.ts, one localStorage key per
// account) and called them "the team's hand" - but a hand typed on one machine was invisible on
// the other, and nothing on the server could read it, so an agent's or the Floor's Suno prompt
// never saw the phrasing the team had settled on. It lives beside the takes now, written under
// the sound store's one lock (as suno.json is, ./suno/store.ts "ONE LOCK, NOT TWO") with the
// same tmp+rename write. The term's EVIDENCE is still never stored: it is derived from the
// ledger on every read (lib/sound/vocabulary.ts `deriveVocabulary`).
//
// A corrupt file throws rather than reading as empty: an empty read would let the next write
// erase every hand the team set.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { SoundError, storeRoot, withStore, writeJsonAtomic } from "./store";
import type { Hand, Stance } from "./vocabulary";

export const handsFile = (): string => path.join(storeRoot(), "hands.json");

const PHRASE_MAX = 80;
const ID = /^(genre|mood|instrument):[^\n]{1,120}$/;

function handOf(v: unknown): Hand | null {
  if (v === null || typeof v !== "object") return null;
  const o = v as { stance?: unknown; phrase?: unknown };
  const stance: Stance | null = o.stance === "prefer" || o.stance === "avoid" ? o.stance : null;
  const phrase = typeof o.phrase === "string" ? o.phrase.trim().slice(0, PHRASE_MAX) : "";
  return stance === null && phrase === "" ? null : { ...(stance === null ? {} : { stance }), ...(phrase === "" ? {} : { phrase }) };
}

export async function readHands(): Promise<Record<string, Hand>> {
  let raw: string;
  try {
    raw = await readFile(handsFile(), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new SoundError(`${path.basename(handsFile())} is not valid JSON; fix or remove it - it was not replaced`, 500);
  }
  const hands = doc !== null && typeof doc === "object" ? (doc as { hands?: unknown }).hands : undefined;
  if (hands === null || typeof hands !== "object") throw new SoundError(`${path.basename(handsFile())} has no hands map; fix or remove it - it was not replaced`, 500);
  const out: Record<string, Hand> = {};
  for (const [id, v] of Object.entries(hands)) {
    const h = handOf(v);
    if (h !== null && ID.test(id)) out[id] = h;
  }
  return out;
}

/** Set one term's hand; a hand with no stance and no phrase is removed. Returns the whole map. */
export async function setHand(id: string, hand: Hand): Promise<Record<string, Hand>> {
  if (!ID.test(id)) throw new SoundError(`${JSON.stringify(id).slice(0, 90)} is not a term id a hand can sit on (genre:, mood: or instrument:)`, 400);
  return withStore(async () => {
    const hands = await readHands();
    const h = handOf(hand);
    if (h === null) delete hands[id];
    else hands[id] = h;
    await writeJsonAtomic(handsFile(), { version: 1, hands });
    return hands;
  });
}
