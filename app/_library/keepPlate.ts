// KEEP A PLATE — the client IO behind the Library's keep control. A kept plate
// is a COPY of its bytes in a lib/assets upload row (assetFromKeptPlate), never
// a pointer: a plate's `src` is a data: URL inside a step record or a public
// path, and both can be rewritten or deleted under a pointer.

import { assetFromKeptPlate, putUploads, type Asset } from "@/lib/assets";
import { getProject } from "@/lib/projects";

import type { Output } from "./projectOutputs";

/** Only a ready image with something to copy. */
export const keepable = (o: Output): boolean => o.kind === "image" && !!o.src && o.state !== "missing";

/** A data: URL is decoded in place; anything else is fetched once. A non-OK
 *  response throws with its own status line. */
export async function plateBlob(src: string, fetchImpl: typeof fetch = fetch): Promise<Blob> {
  const m = /^data:([^,;]*)((?:;[^,;]*)*),([\s\S]*)$/.exec(src);
  if (m) {
    const mime = m[1] || "application/octet-stream";
    if (/;base64/i.test(m[2])) {
      const bin = atob(m[3]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(m[3])], { type: mime });
  }
  const res = await fetchImpl(src);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());
  return await res.blob();
}

async function digestOf(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The SHA-256 hex of a plate's bytes. */
export async function plateDigest(src: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  return digestOf(await plateBlob(src, fetchImpl));
}

/** Copy this plate's bytes onto the shelf. Throws the store's own error, with
 *  nothing written: the asset row and its bytes share one transaction. */
export async function keepPlate(
  uid: string,
  projectId: string,
  o: Output,
  put: typeof putUploads = putUploads,
): Promise<void> {
  if (!keepable(o)) throw new Error("this output has no plate to keep");
  const project = await getProject(projectId);
  const blob = await plateBlob(o.src!);
  const digest = await digestOf(blob);
  await put([
    assetFromKeptPlate(uid, {
      blob,
      mime: blob.type,
      digest,
      projectTitle: project?.title ?? projectId,
      projectId,
      outputId: o.id,
      name: o.title,
      renderId: o.provenance.run,
      model: o.provenance.model,
      costUsd: o.provenance.costUsd,
    }),
  ]);
}

/** Output id → digest of the newest plate kept for it. */
export function keptIndex(assets: readonly Asset[]): Map<string, string> {
  const newest = new Map<string, Asset>();
  for (const a of assets) {
    const id = a.meta?.kept === "plate" ? a.meta.outputId : undefined;
    if (typeof id !== "string" || typeof a.meta?.digest !== "string") continue;
    const prev = newest.get(id);
    if (!prev || a.createdAt >= prev.createdAt) newest.set(id, a);
  }
  return new Map([...newest].map(([id, a]) => [id, a.meta!.digest as string]));
}
