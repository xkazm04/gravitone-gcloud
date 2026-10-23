import "server-only";

import { errorMessage } from "@gt/domain/errors";
import { MODEL_MIME, type LibraryState, type ModelExtras } from "@gt/domain/library";

import { listAssets, resolveInAsset } from "../../foundry/mesh/store.ts";
import { TECHNIQUE_LABEL, type MeshAsset, type MeshVariant } from "../../foundry/mesh/types.ts";
import { isoOf, type Feed, type FeedItem, type FeedRead } from "./types.ts";

// THE GAME ASSETS, AS LIBRARY ITEMS (spark game-3d-assets WP3) - foundry-out/mesh/<asset>/asset.json
// (lib/foundry/mesh/store.ts), read through the mesh store's own readers.
//
// Every FINISHED variant of every asset is one `model` item: its media the finished glb (the
// rigged one when the variant was rigged - that is the character a game imports), its cover the
// poster render, served by the file route (a glb has no picture for the cover query to draw).
// A variant still pending or generated is not a model yet; a failed one says why on the Board,
// not here. The state is the operator's verdict on the variant: kept is ratified, rejected is
// rejected, undecided a candidate. Rights are publishable: a mesh is made from OUR concept image,
// never from a found source (lib/foundry/mesh/types.ts MeshAsset.rights).

export const MESH_ASSET_CAP = 400;

const STATE: { readonly [V in NonNullable<MeshVariant["verdict"]> | "open"]: LibraryState } = { kept: "ratified", rejected: "rejected", open: "candidate" };

/** The file route that serves an asset's file (app/api/foundry/file `kind=mesh`). */
export const meshFileUrl = (asset: string, rel: string): string => `/api/foundry/file?kind=mesh&run=${encodeURIComponent(asset)}&path=${encodeURIComponent(rel)}`;

/** The Library item id of a variant. */
export const modelItemId = (asset: string, variant: string): string => `model:mesh:${asset}:${variant}`;

/** Pure: an asset's finished variants as feed items, and the ones it could not shelve, said. */
export function shelveAsset(a: MeshAsset, universe: "real" | "fixture"): FeedRead {
  const items: FeedItem[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const at = isoOf(a.createdAt);
  for (const v of a.variants) {
    if (v.status !== "finished") continue;
    const glb = v.files.rigged ?? v.files.glb;
    if (glb === undefined) {
      skipped.push({ id: `${a.id}/${v.id}`, reason: "finished, but the manifest names no glb" });
      continue;
    }
    let abs: string;
    try {
      abs = resolveInAsset(a.id, glb);
    } catch (e) {
      skipped.push({ id: `${a.id}/${v.id}`, reason: `${glb}: ${errorMessage(e)}` });
      continue;
    }
    const rigged = v.files.rigged !== undefined;
    const model: ModelExtras = {
      asset: a.id,
      variant: v.id,
      class: a.brief.class,
      technique: v.technique,
      ...(v.approach === undefined ? {} : { approach: v.approach }),
      budgetTris: a.brief.budgetTris,
      ...(rigged && a.brief.rig !== undefined ? { rig: a.brief.rig } : {}),
      ...(v.files.poster === undefined ? {} : { poster: meshFileUrl(a.id, v.files.poster) }),
      gates: v.gates.map((g) => ({ name: g.name, verdict: g.verdict, ...(g.score === undefined ? {} : { score: g.score }), fails: [...g.fails], warns: [...g.warns] })),
      limitations: [...v.limitations],
    };
    items.push({
      item: {
        kind: "model",
        id: modelItemId(a.id, v.id),
        title: `${a.brief.subject} · ${v.technique}`,
        state: STATE[v.verdict ?? "open"],
        collections: a.night === undefined ? [] : [{ kind: "run", id: a.night }],
        origin: "mesh",
        rights: { use: "publishable" },
        source: universe,
        lineage: [...(a.night === undefined ? [] : [{ kind: "run" as const, id: a.night }]), ...v.jobs.map((id) => ({ kind: "job" as const, id }))],
        vocabulary: { class: a.brief.class, technique: v.technique, rigged, ...(v.tris === undefined ? {} : { tris: v.tris }) },
        ...(at === undefined ? {} : { at }),
      },
      meta: [a.brief.class, v.tris === undefined ? undefined : `${v.tris.toLocaleString("en-US")} tris`, TECHNIQUE_LABEL[v.technique]].filter((x) => x !== undefined).join(" · "),
      extras: { model, ...(a.brief.style === undefined ? {} : { prompt: a.brief.style }) },
      file: { abs, mime: MODEL_MIME },
    });
  }
  return { items, skipped };
}

export const meshFeed: Feed = {
  id: "mesh",
  async read(ctx): Promise<FeedRead> {
    const items: FeedItem[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const a of (await listAssets()).slice(0, MESH_ASSET_CAP)) {
      if (a.dry) continue;
      const r = shelveAsset(a, ctx.universe);
      items.push(...r.items);
      skipped.push(...r.skipped);
    }
    return { items, skipped };
  },
};
