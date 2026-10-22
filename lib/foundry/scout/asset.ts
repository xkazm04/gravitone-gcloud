import { driveAsset, launchAsset, LIVE_ASSET_ENGINES } from "../../producers/scoutAsset.ts";
import type { AssetEngines } from "../../producers/scoutAssetActs.ts";
import { techniquesFor } from "../mesh/cli-acts.ts";
import { readAsset } from "../mesh/store.ts";
import type { MeshAsset } from "../mesh/types.ts";
import { budgetLine, launchable, money, overBudget, Refusal, setCandidate, worstOf, type ActContext } from "./acts.ts";
import { parseBrief } from "./concept.ts";
import { mutateNight, nextCandidateId, readNight } from "./store.ts";
import { DEFAULT_ASSET_CAP, type Asset3dCandidate, type Night, type NightId } from "./types.ts";

// THE NIGHT'S GAME ASSET - what `pipeline/scout.mts asset <night> --brief <file|->` does
// (spark game-3d-assets WP4). The skill writes a brief in craft words - `{class, subject, style?,
// kind?, techniques?}` - and this act turns it into ONE `asset3d` candidate and the scout-asset job
// that draws its concepts (lib/producers/scoutAsset.ts). The night's rules are the other
// launches' (./acts.ts): refused when the night is not open or past its deadline, refused when
// the receipt's worst case is over what the night has left, the job's ceiling that remainder -
// and one of its own:
//
//   THE ASSET CAP. A night briefs at most `assetCap` assets (DEFAULT_ASSET_CAP while the engines
//   are being profiled). An asset counts once it may reach the GPU: pending, or handed off to a
//   mesh asset. One whose concepts were refused by the input gate, or whose job failed before the
//   hand-off, spent no GPU minute and does not count. The check and the candidate's row are one
//   write under the night's lock, so two launches at once cannot both take the last place.
//
// The concepts are drawn here (the job is driven in this process unless --detach), the hand-off
// writes the mesh asset and QUEUES its mesh job - and that is where this act stops. TRELLIS.2 and
// the Blender finish are the worker's, admitted by measured resources, so a night's discovery
// carries on while a mesh renders.

export type AssetResult = { readonly candidate: Asset3dCandidate; readonly outcome?: string; readonly asset?: MeshAsset };

/** Asset candidates that took one of the night's places: pending, or handed off. */
export const assetsUsed = (n: Pick<Night, "candidates">): number => n.candidates.filter((c) => c.kind === "asset3d" && (c.status === "pending" || c.assetId !== undefined)).length;

export const assetCapOf = (n: Pick<Night, "assetCap">): number => n.assetCap ?? DEFAULT_ASSET_CAP;

export async function assetAct(ctx: ActContext, id: NightId, raw: unknown, engines: Partial<AssetEngines> = {}): Promise<AssetResult> {
  const parsed = parseBrief(raw);
  if (!parsed.ok) throw new Refusal(parsed.error.message);
  const { brief } = parsed.value;
  const techniques = techniquesFor(brief.class, parsed.value.techniques, brief.rig !== undefined);
  if (!techniques.ok) throw new Refusal(techniques.error.message);
  const { night, mode } = await launchable(ctx, id);
  const b = money(ctx, night);
  if (b.remainingUsd <= 0) throw new Refusal(`asset "${brief.subject}": the night has nothing left - ${budgetLine(b)}; nothing launched`);

  let made: Asset3dCandidate | undefined;
  let full: string | undefined;
  await mutateNight(id, (n) => {
    const used = assetsUsed(n);
    if (used >= assetCapOf(n)) {
      full = `night ${id} has briefed ${used} of its ${assetCapOf(n)} game assets; "${brief.subject}" was not launched`;
      return n;
    }
    made = { id: nextCandidateId(n), kind: "asset3d", sourceIds: [], status: "pending", brief, concepts: [] };
    return { ...n, candidates: [...n.candidates, made] };
  });
  if (full !== undefined) throw new Refusal(full);
  if (made === undefined) throw new Error(`night ${id}: the asset candidate was not written`);
  let c: Asset3dCandidate = made;
  const fail = async (why: string): Promise<never> => {
    await setCandidate(id, { ...c, status: "failed", error: why });
    throw new Refusal(why);
  };

  const target = { nightId: id, candidateId: c.id };
  const opts = { mode, ceilingUsd: b.remainingUsd, techniques: techniques.value, actor: ctx.actor, dryOnly: ctx.dryOnly };
  const r0 = await launchAsset(ctx.store, target, opts);
  if (!r0.ok) return fail(r0.error.message);
  if (r0.value.kind !== "receipt") return fail(`asset launch answered ${r0.value.kind} before its receipt`);
  const rc = r0.value.receipt;
  const refused = overBudget(`asset ${c.id} "${brief.subject}"`, worstOf(rc), b);
  if (refused !== null) return fail(refused.message);
  ctx.say(`receipt (${rc.mode}): asset ${c.id} ${brief.class} · ${techniques.value.join(",")} · worst case $${worstOf(rc).toFixed(2)} · ceiling $${b.remainingUsd.toFixed(2)}`);
  const r1 = await launchAsset(ctx.store, target, { ...opts, token: rc.token });
  if (!r1.ok) return fail(r1.error.message);
  if (r1.value.kind !== "launched") return fail(`the receipt moved while it was confirmed (${r1.value.kind}); nothing launched`);
  const jobId = r1.value.jobId;
  const now = (await readNight(id)).candidates.find((x) => x.id === c.id);
  c = { ...(now?.kind === "asset3d" ? now : c), jobId };
  await setCandidate(id, c, jobId);
  ctx.say(`launched ${c.id} as ${jobId}`);
  if (ctx.detach) return { candidate: c, outcome: "detached" };

  const r = await driveAsset(ctx.store, ctx.location, jobId, { dryOnly: ctx.dryOnly, engines: { generate: engines.generate ?? LIVE_ASSET_ENGINES.generate, ...(engines.decode === undefined ? {} : { decode: engines.decode }) } });
  const after = (await readNight(id)).candidates.find((x) => x.id === c.id);
  const settled = after?.kind === "asset3d" ? after : c;
  const asset = settled.assetId === undefined ? undefined : await readAsset(settled.assetId).catch(() => undefined);
  return { candidate: settled, outcome: r.ok ? r.value.outcome : r.error.message, ...(asset === undefined ? {} : { asset }) };
}
