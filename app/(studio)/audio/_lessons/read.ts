import "server-only";

import type { LessonRow } from "@gt/ui/components/audio/LessonList.tsx";

import { listLessons } from "../../../../lib/sound/lessons.ts";
import { readHunts } from "../../../../lib/sound/store.ts";
import type { Kind } from "../_audio/desk.ts";
import type { Read } from "../_audio/read.ts";

// THE LESSONS SECTION, READ ON THE SERVER (Phase 6, L65): the confirmed lessons of one kind from
// the git-tracked ledger (lib/sound/lessons.ts `listLessons`, through the store seam), newest
// first, each with the hunt it came from when it came from one - the idea, so a row names the
// problem the lesson answered, and the link back to the map. Nothing pending is read: there is
// nothing pending to read (an engine draft is never stored).

export type LessonsView = { readonly kind: Kind; readonly lessons: Read<readonly LessonRow[]> };

export async function readLessons(kind: Kind): Promise<LessonsView> {
  const [l, h] = await Promise.all([listLessons(kind), readHunts().then((f) => ({ ok: true as const, value: f.hunts }), (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }))]);
  if (!l.ok) return { kind, lessons: { ok: false, error: l.error.message } };
  const ideas = new Map(h.ok ? h.value.map((x) => [x.id, x.idea] as const) : []);
  return {
    kind,
    lessons: {
      ok: true,
      value: l.value.map((x) => ({
        id: x.id,
        claim: x.claim,
        source: x.source,
        provider: x.provider,
        technique: [...x.technique],
        n: x.evidence.n,
        keepRate: x.evidence.keepRate,
        meanScore: x.evidence.meanScore,
        confirmedAt: x.confirmedAt,
        ...(x.huntId === null ? {} : { hunt: { id: x.huntId, idea: ideas.get(x.huntId) ?? null } }),
      })),
    },
  };
}
