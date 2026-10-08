"use client";

// THE POSTER, WATCHED RATHER THAN AWAITED — the music-video poster is a SERVER
// WORK KIND (lib/turns/kinds/poster.ts, operator T1: "keep what is paid for").
//
// The image is generated and billed by the server whether or not a tab is
// listening. This store lives ABOVE REACT, in module scope, for the reason
// research/run/live.ts gives: leaving the step must not drop the landing, and a
// reload must still find the image. It only WATCHES the turn, and lands what it
// settles to:
//
//   decode the base64  →  putUploads  →  patch MUSIC_VIDEO_SOURCE with the
//   poster asset id, and the seed and effect parameters ONLY IF UNSET.
//
// THE SEED AND THE EFFECT PARAMS ARE SET ONCE, on the FIRST poster a composition
// ever gets, and never again. A re-generated poster keeps the existing seed:
// re-rolling it on every generation would be indistinguishable from the
// determinism bug the acceptance test exists to catch — two renders of "the same"
// composition producing different pixels because one input quietly moved. The
// check runs inside the record's own transaction (`patchRecord`), against the
// record as stored, not against what a mounted hook last saw.
//
// LANDS AT MOST ONCE PER TURN ID. The id this project last took is kept here and
// on the record itself (`posterTurn`), so the landing a watcher makes, the one a
// later mount makes and the one a reload makes are one landing.
//
// NO STOP. The turn's record says `uncancellable`: the imaging router takes no
// signal, so nothing below it can abort the vendor call.

import { assetFromUpload, putUploads } from "@/lib/assets";
import { getTurn, isLiveTurn, resumeTurn, startTurn, type TurnRecord, type TurnSummary } from "@/lib/turns/client";

import { patchRecord } from "../../_shared/records/patch";
import type { MusicVideoSourceStepData } from "../../_shared/stepStore";
import { MUSIC_VIDEO_SOURCE } from "../../research/records";
import { DEFAULT_EFFECT_PARAMS } from "./compositor";

export const POSTER_KIND = "poster-generate";

export type PosterStatus = "idle" | "generating" | "error";

/** What a landing wrote, handed to a mounted hook so it need not re-read. */
export interface Landed {
  posterAssetId: string;
  seed: number;
  effectParams: Record<string, unknown>;
}

export interface PosterState {
  status: PosterStatus;
  error: string | null;
  provider: string | null;
  landed: Landed | null;
}

const IDLE: PosterState = { status: "idle", error: null, provider: null, landed: null };

const states = new Map<string, PosterState>();
const subs = new Map<string, Set<() => void>>();
type Watch = { turnId: string; timer?: ReturnType<typeof setTimeout> };
const watching = new Map<string, Watch>();
/** The last turn per project whose answer was taken. Mirrored on the record. */
const consumed = new Map<string, string>();
/** Who the poster belongs to (the asset's owner). A landing needs it. */
const owners = new Map<string, string>();

const LOOK_MS = 1500;

export const readPoster = (projectId: string): PosterState => states.get(projectId) ?? IDLE;

function write(projectId: string, next: PosterState) {
  states.set(projectId, next);
  subs.get(projectId)?.forEach((f) => f());
}

export function subscribePoster(projectId: string, f: () => void) {
  let set = subs.get(projectId);
  if (!set) {
    set = new Set();
    subs.set(projectId, set);
  }
  set.add(f);
  return () => void set!.delete(f);
}

/** A hydrated record: what turn it last took, and a clean slate for `landed`
 *  (the record just read already carries whatever a landing wrote). */
export function adoptPoster(projectId: string, saved: MusicVideoSourceStepData | undefined) {
  if (saved?.posterTurn && !consumed.has(projectId)) consumed.set(projectId, saved.posterTurn);
  const cur = readPoster(projectId);
  if (cur.landed) write(projectId, { ...cur, landed: null });
}

/** A 32-bit seed. Drawn once per landing; used only when the record has none. */
function makeSeed(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 0xffffffff);
}

function base64ToFile(base64: string, mime: string, name: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

function unwatch(projectId: string) {
  const w = watching.get(projectId);
  if (w?.timer) clearTimeout(w.timer);
  watching.delete(projectId);
}

function watch(projectId: string, turnId: string) {
  if (watching.get(projectId)?.turnId === turnId) return;
  unwatch(projectId);
  const w: Watch = { turnId };
  watching.set(projectId, w);
  write(projectId, { ...readPoster(projectId), status: "generating", error: null });

  const look = () => {
    w.timer = setTimeout(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return look();
      void getTurn(turnId)
        .then((rec) => {
          if (watching.get(projectId) !== w) return;
          if (!rec) {
            unwatch(projectId);
            write(projectId, {
              ...readPoster(projectId),
              status: "error",
              error: "The studio no longer has a record of this poster, so it cannot be read.",
            });
            return;
          }
          if (isLiveTurn(rec.status)) return look();
          void landPoster(projectId, rec);
        })
        .catch(() => {
          // Offline for a moment is not an ending: the poster is made on the server.
          if (watching.get(projectId) === w) look();
        });
    }, LOOK_MS);
  };
  look();
}

/**
 * Take a settled poster turn into the project — AT MOST ONCE PER TURN ID. The
 * consumed id is checked and set in one synchronous block, so two pick-ups of
 * one turn cannot both write.
 */
export async function landPoster(projectId: string, rec: TurnRecord): Promise<void> {
  if (watching.get(projectId)?.turnId === rec.id) unwatch(projectId);
  if (consumed.get(projectId) === rec.id) return;
  consumed.set(projectId, rec.id);
  const before = readPoster(projectId);

  if (rec.status !== "done") {
    write(projectId, {
      ...before,
      status: "error",
      error:
        rec.error?.message ||
        (rec.status === "orphaned"
          ? "The server stopped before the poster finished, so nothing was generated."
          : "The poster failed and said nothing about why."),
    });
    // The failed turn is taken too, so it is not shown again on every mount.
    void patchRecord(MUSIC_VIDEO_SOURCE, projectId, (cur) => ({ ...cur, posterTurn: rec.id }));
    return;
  }

  const uid = owners.get(projectId);
  const result = (rec.result ?? {}) as { base64?: string; mime?: string; provider?: string };
  try {
    if (!uid) throw new Error("No signed-in owner to file the poster under.");
    if (!result.base64 || !result.mime) throw new Error("The poster record carries no image.");
    const pair = assetFromUpload(uid, base64ToFile(result.base64, result.mime, "poster.png"), ["music-video", "poster"], "image");
    await putUploads([pair]);

    const freshSeed = makeSeed();
    let landed: Landed | null = null;
    const out = await patchRecord(MUSIC_VIDEO_SOURCE, projectId, (cur) => {
      const seed = cur?.seed ?? freshSeed;
      const effectParams = cur?.effectParams ?? ({ ...DEFAULT_EFFECT_PARAMS } as unknown as Record<string, unknown>);
      landed = { posterAssetId: pair.asset.id, seed, effectParams };
      return { ...cur, posterAssetId: pair.asset.id, seed, effectParams, posterTurn: rec.id };
    });
    if (!out.ok || !landed) throw new Error(!out.ok && "detail" in out ? out.detail : "The poster could not be saved to the project.");
    write(projectId, { status: "idle", error: null, provider: result.provider ?? null, landed });
  } catch (e) {
    // Nothing of this turn was kept: a later mount may try it again.
    if (consumed.get(projectId) === rec.id) consumed.delete(projectId);
    write(projectId, { ...before, status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Ask the server for a poster. Resolves to the turn id the caller should track
 * in the jobs provider — the new one's or, when another tab already holds this
 * project's slot, THAT one's, which is watched instead. `null` when nothing runs.
 */
export async function startPoster(projectId: string, uid: string, style: string): Promise<string | null> {
  if (readPoster(projectId).status === "generating") return null;
  owners.set(projectId, uid);
  write(projectId, { ...readPoster(projectId), status: "generating", error: null });
  try {
    const out = await startTurn(POSTER_KIND, projectId, { style });
    if (out.ok) {
      watch(projectId, out.turnId);
      return out.turnId;
    }
    if (out.status === 409 && out.holder) {
      watch(projectId, out.holder);
      return out.holder;
    }
    write(projectId, { ...readPoster(projectId), status: "error", error: out.detail || "The poster could not be started." });
  } catch {
    write(projectId, {
      ...readPoster(projectId),
      status: "error",
      error: "The studio could not be reached, so no poster was made.",
    });
  }
  return null;
}

/** What a mount does about this project's newest poster turn: a live one is
 *  watched (and returned, to be tracked), a settled one not yet taken is landed. */
export async function resumePoster(projectId: string, uid: string): Promise<TurnSummary | null> {
  owners.set(projectId, uid);
  if (watching.has(projectId)) return null;
  const l = await resumeTurn(projectId, POSTER_KIND, consumed.get(projectId) ?? null);
  if (l.action === "watch") {
    if (!watching.has(projectId)) watch(projectId, l.turn.id);
    return l.turn;
  }
  if (l.action === "land") await landPoster(projectId, l.turn);
  return null;
}

/** Forget everything this module holds, as a reload does. For probes. */
export function __forgetPoster() {
  for (const p of [...watching.keys()]) unwatch(p);
  states.clear();
  consumed.clear();
  owners.clear();
}
