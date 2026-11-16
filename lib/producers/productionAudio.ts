import { createHash } from "node:crypto";

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import type { ModelOption, Receipt, ReceiptMode } from "@gt/domain/produce";
import type { Production, ProductionId } from "@gt/domain/production";
import { armLive, DRY } from "@gt/kernel/dryrun";
import { append } from "@gt/kernel/events";
import { enqueueIn } from "@gt/kernel/job";
import { decideAudioIn, productionVoiceRouteOf, voiceProofOf, type AudioInput } from "@gt/kernel/productions/audio";
import { readCharacter } from "@gt/kernel/characters/store";
import { roundOf } from "@gt/kernel/productions/cast";
import { appendTake, readProduction, refusalOfTake } from "@gt/kernel/productions/store";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import type { Reader, Store } from "@gt/kernel/store";
import { PRODUCTION_TAKE, TAKE_REQUEST, type TakeRequest } from "@gt/producers/production-take/define";

import { H3_FRAMES, H3_FPS } from "../imaging/video/comfyH3.ts";
import { H3_REF_ENGINE, speakingPrompt } from "../imaging/video/comfyH3Ref.ts";
import { blobRootOf, kernel } from "../kernelProcess.ts";
import { PRODUCTION_TAKE_LANE, takeJobId, takeSeed } from "./production.ts";
import { blobOfAddress, previewBlob } from "./productionCut.ts";

// THE AUDIO STAGE'S DOORS (spark concept-casting-stages S5): the operator's decision, and the speaking take behind the
// voice proof.
//
// `productionVoiceRoute` is the switch: `dub` until a stored proof says ref-audios drove the picture (`recordVoiceProofIn`,
// set by the Director after the banked proof). The speaking take is refused until then, whatever the actor.

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/** The dialogue route the box offers now, and the proof behind it. */
export function productionVoiceRoute(store: Store): Result<{ readonly route: "ref-audio" | "dub"; readonly proof?: NonNullable<ReturnType<typeof voiceProofOf>> }> {
  return store.read((r) => {
    const proof = voiceProofOf(r);
    return { route: productionVoiceRouteOf(r), ...(proof === undefined ? {} : { proof }) };
  });
}

export function decideAudio(input: { readonly id: ProductionId; readonly decision: AudioInput; readonly actor: Actor }): Result<Production> {
  const s = processStore();
  if (!s.ok) return s;
  return s.value.tx((t) => decideAudioIn(t, input.id, input.decision, input.actor));
}

/* ── The speaking take ────────────────────────────────────────────────────── */

export type SpeakingLaunchInput = { readonly id: ProductionId; readonly roleId: string; readonly mode: ReceiptMode; readonly by: string; readonly actor: Actor; readonly dryOnly: boolean; readonly token?: string; readonly now?: number };
export type SpeakingLaunch = { readonly kind: "receipt"; readonly receipt: Receipt } | { readonly kind: "stale"; readonly fresh: Receipt } | { readonly kind: "launched"; readonly jobId: string; readonly takeId: string; readonly receipt: Receipt };

/** Wall seconds for a 3 s ref2va clip measured on this box (pipeline/video/README.md), scaled to the clip's length. Unmeasured for voice-referenced ref2va. */
const SPEAK_SECONDS = Math.round((3780 * (H3_FRAMES / H3_FPS)) / 3);
const SPEAK_LINE_OPTION: ModelOption = {
  key: "production-take/comfyui/h3-ref2va-voice",
  lane: PRODUCTION_TAKE_LANE,
  provider: "comfyui",
  model: H3_REF_ENGINE,
  label: "speaking clip · ref2va with a voice reference · local",
  secondsPerUnit: SPEAK_SECONDS,
  usdPerUnit: 0,
  src: "illustrative",
  basis: { seconds: { src: "illustrative", note: "scaled from the measured ~63 min per 3 s H3 ref2va clip (pipeline/video/README.md); a voice-referenced ref2va clip has not been measured" }, usd: { src: "real", note: "free: a local model" } },
};

type SpeakPlan = { readonly clip: TakeRequest["clips"][number]; readonly line: string };

/** What a speaking take would render, or why it may not. Async: the character's and the voice's bytes are read from the blob store. */
async function speakPlan(store: Store, id: ProductionId, roleId: string): Promise<Result<{ readonly production: Production; readonly plan: SpeakPlan }>> {
  const held = store.read((r) => ({ production: readProduction(r, id), route: productionVoiceRouteOf(r) }));
  if (!held.ok) return held;
  const { production: p, route } = held.value;
  if (p === undefined) return err("not-found", `production: no ${id}`);
  if (route !== "ref-audio") return err("refused", "production: a speaking take needs the ref-audios proof to have held; the dialogue route is dub");
  const why = refusalOfTake(p, "hero", true);
  if (why !== undefined) return err("refused", why);
  const role = p.roles.find((r) => r.id === roleId);
  if (role?.cast === undefined) return err("refused", `production: ${roleId} is not cast yet`);
  if (role.auditionScript === undefined) return err("refused", `production: ${role.name} has no line to speak`);
  const stored = store.read((r) => ({ character: readCharacter(r, role.cast?.characterId ?? ""), round: roundOf(r, p.id, role.cast?.roundId ?? "") }));
  if (!stored.ok) return stored;
  const still = stored.value.character?.images[0];
  if (still === undefined) return err("not-found", `production: ${role.name}'s character has no picture`);
  const root = blobRootOf(store);
  const image = await blobOfAddress(root, still, "image/png");
  if (image === undefined) return err("not-found", `production: ${role.name}'s picture is not in the blob store`);
  if (stored.value.round?.pickVoice === undefined) return err("not-found", `production: ${role.name}'s voice pick is gone`);
  const voice = previewBlob(store, stored.value.round.voiceJobId, stored.value.round.pickVoice);
  if (!voice.ok) return voice;
  const line = role.auditionScript;
  return ok({ production: p, plan: { line, clip: { k: 1, beat: `${role.name} speaks`, first: image, prompt: speakingPrompt(line), speaking: { voice: voice.value } } } });
}

function speakReceipt(r: Reader, key: string, mode: ReceiptMode, now: number): Receipt {
  const line: PlanLine = { key, label: "speaking clip", lane: PRODUCTION_TAKE_LANE as ResourceLane, units: 1, option: SPEAK_LINE_OPTION, after: [], order: 0, status: "pending" };
  return receiptFor({ subject: { kind: "run", lane: "video" }, lines: [line], plan: [line], queue: readQueue(r), capacity: LANE_CAPACITY, now, mode });
}

/** The speaking take's receipt or confirm. Gated by `productionVoiceRoute`: refused while the route is dub, by anyone. */
export async function requestSpeakingTake(store: Store, input: SpeakingLaunchInput): Promise<Result<SpeakingLaunch>> {
  const now = input.now ?? Date.now();
  const planned = await speakPlan(store, input.id, input.roleId);
  if (!planned.ok) return planned;
  const { plan, production } = planned.value;
  const key = `take:${production.id}/${input.roleId}@${createHash("sha256").update(JSON.stringify(plan.clip)).digest("hex").slice(0, 12)}`;
  const first = store.read((r) => speakReceipt(r, key, input.mode, now));
  if (!first.ok) return first;
  if (input.token === undefined) return ok({ kind: "receipt", receipt: first.value });
  const token = input.token;
  const n = production.takes.length + 1;
  const out = store.tx((t): Result<SpeakingLaunch> => {
    const receipt = speakReceipt(t, key, input.mode, now);
    if (receipt.token !== token) return ok({ kind: "stale", fresh: receipt });
    const mode = input.mode === "dry" ? ok(DRY) : armLive(input.actor, t.at, `speaking receipt ${token.slice(0, 12)} confirmed`, { dryOnly: input.dryOnly });
    if (!mode.ok) return mode;
    const jobId = takeJobId(input.id, n);
    const takeId = `take-${n}`;
    const seed = takeSeed(input.id, n);
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `production:${input.id}/${takeId}` }, producer: PRODUCTION_TAKE, lane: PRODUCTION_TAKE_LANE, mode: mode.value }, input.actor);
    appendTake(t, input.id, { kind: "hero", beats: [plan.clip.beat], frames: ["voice-ref"], prompt: plan.clip.prompt, seed, engine: H3_REF_ENGINE, jobId, dry: input.mode === "dry", speaking: { roleId: input.roleId } }, input.actor);
    const request: Omit<TakeRequest, "by"> = {
      productionId: input.id,
      takeId,
      kind: "hero",
      aspect: production.board.aspect === "9:16" ? "9:16" : "16:9",
      seed,
      clips: [plan.clip],
      estimates: { clip: { seconds: SPEAK_SECONDS, usd: 0 }, cut: { seconds: 0, usd: 0 } },
    };
    append(t, { actor: input.actor, type: TAKE_REQUEST, subject: { kind: "job", id: jobId }, data: JSON.parse(JSON.stringify({ ...request, by: input.by })) });
    return ok({ kind: "launched", jobId, takeId, receipt });
  });
  if (!out.ok) return out;
  return out.value;
}
